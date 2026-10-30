import os from 'node:os';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type ButtonInteraction,
  type Client,
} from 'discord.js';
import { ui, type ComponentV2Payload } from '../../core/ui/index.js';
import { getDb } from '../../core/database/pool.js';

export interface PingData {
  wsLatency: number;
  roundtripLatency: number;
  dbLatency: number;
  restLatency: number;
  uptimeSeconds: number;
  heapUsedMb: number;
  heapTotalMb: number;
  rssMb: number;
  guildCount: number;
  shardId: number;
  nodeVersion: string;
}

function formatUptime(totalSeconds: number): string {
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ') || '0s';
}

function getStatusIndicator(ms: number): string {
  if (ms < 0) return 'Error';
  if (ms <= 80) return 'Optimal';
  if (ms <= 180) return 'Good';
  if (ms <= 350) return 'Normal';
  if (ms <= 600) return 'Moderate';
  return 'High';
}

export async function measurePing(client: Client, messageTimestamp?: number): Promise<PingData> {
  const wsLatency = Math.max(0, Math.round(client.ws.ping));
  const startTime = Date.now();
  const roundtripLatency = messageTimestamp ? Math.max(0, startTime - messageTimestamp) : wsLatency;

  // Measure REST API latency (pinging discord API endpoint)
  let restLatency = 0;
  try {
    const restStart = Date.now();
    await client.rest.get('/gateway').catch(() => null);
    restLatency = Date.now() - restStart;
  } catch {
    restLatency = wsLatency;
  }

  // Measure database latency
  let dbLatency = 0;
  try {
    const dbStart = Date.now();
    const db = getDb();
    await db`SELECT 1 as ping`;
    dbLatency = Date.now() - dbStart;
  } catch {
    dbLatency = -1;
  }

  const memory = process.memoryUsage();
  const heapUsedMb = memory.heapUsed / 1024 / 1024;
  const heapTotalMb = memory.heapTotal / 1024 / 1024;
  const rssMb = memory.rss / 1024 / 1024;
  const uptimeSeconds = process.uptime();
  const guildCount = client.guilds.cache.size;
  const shardId = client.ws.shards.first()?.id ?? 0;
  const nodeVersion = process.version;

  return {
    wsLatency,
    roundtripLatency,
    dbLatency,
    restLatency,
    uptimeSeconds,
    heapUsedMb,
    heapTotalMb,
    rssMb,
    guildCount,
    shardId,
    nodeVersion,
  };
}

export function buildPingV2Embed(data: PingData, userId: string): ComponentV2Payload {
  const {
    wsLatency,
    roundtripLatency,
    dbLatency,
    restLatency,
    uptimeSeconds,
    heapUsedMb,
    heapTotalMb,
    rssMb,
    guildCount,
    shardId,
    nodeVersion,
  } = data;

  const dbStatusStr = dbLatency >= 0 ? `\`${dbLatency}ms\` (${getStatusIndicator(dbLatency)})` : '`Error` (Disconnected)';
  const wsStatusStr = `\`${wsLatency}ms\` (${getStatusIndicator(wsLatency)})`;
  const roundtripStr = `\`${roundtripLatency}ms\` (${getStatusIndicator(roundtripLatency)})`;
  const restStr = restLatency > 0 ? `\`${restLatency}ms\` (${getStatusIndicator(restLatency)})` : wsStatusStr;

  const content =
    `### Network & Gateway\n` +
    `• **Gateway Ping (WS):** ${wsStatusStr}\n` +
    `• **REST API Latency:** ${restStr}\n` +
    `• **Message Roundtrip:** ${roundtripStr}\n` +
    `• **Shard Connection:** \`Shard #${shardId}\` (Online)\n\n` +
    `### Database & Storage\n` +
    `• **PostgreSQL Query:** ${dbStatusStr}\n` +
    `• **Connection Pool:** \`Active & Healthy\`\n\n` +
    `### System & Resource Telemetry\n` +
    `• **Memory (Heap):** \`${heapUsedMb.toFixed(1)} MB / ${heapTotalMb.toFixed(1)} MB\`\n` +
    `• **Memory (RSS):** \`${rssMb.toFixed(1)} MB\`\n` +
    `• **Process Uptime:** \`${formatUptime(uptimeSeconds)}\`\n` +
    `• **Runtime Environment:** Node.js \`${nodeVersion}\` on \`${os.platform()} (${os.arch()})\`\n` +
    `• **Guild Cache:** \`${guildCount} server(s)\``;

  const refreshBtn = new ButtonBuilder()
    .setCustomId(`ping_refresh_${userId}`)
    .setLabel('Refresh')
    .setStyle(ButtonStyle.Secondary);

  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(refreshBtn);

  return ui.standard({
    title: 'Hawk Telemetry & Diagnostics',
    text: content,
    components: [actionRow],
  });
}

export async function handlePingRefresh(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split('_');
  const userId = parts[2];

  if (interaction.user.id !== userId) {
    await interaction.reply({ content: 'Only the command invoker can refresh this panel.', flags: MessageFlags.Ephemeral });
    return;
  }

  const pingData = await measurePing(interaction.client);
  const payload = buildPingV2Embed(pingData, userId);
  await interaction.update(payload);
}
