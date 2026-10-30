import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type ButtonInteraction,
  type Client,
  type Guild,
} from 'discord.js';
import { ui, type ComponentV2Payload } from '../../core/ui/index.js';
import { getCommandCount } from '../../core/commands/CommandRegistry.js';
import { buildMainHelpEmbed } from './helpUI.js';
import { getPrefix } from '../../core/database/repositories/guildConfigRepo.js';
import { env } from '../../core/config/environment.js';

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

export async function buildInfoV2Embed(client: Client, _guild: Guild, prefix: string, userId: string): Promise<ComponentV2Payload> {
  const botUser = client.user;
  const botTag = botUser?.tag ?? 'Amo';
  const totalGuilds = client.guilds.cache.size;
  const totalUsers = client.guilds.cache.reduce((acc, g) => acc + (g.memberCount ?? 0), 0);
  const commandCount = getCommandCount();

  const memory = process.memoryUsage();
  const heapUsedMb = (memory.heapUsed / 1024 / 1024).toFixed(1);
  const uptimeStr = formatUptime(process.uptime());

  const ownerIds = env.botOwnerIds.length > 0 ? env.botOwnerIds : (env.botOwnerId ? [env.botOwnerId] : []);
  const developerTags: string[] = [];

  for (const id of ownerIds) {
    const user = client.users.cache.get(id) ?? await client.users.fetch(id).catch(() => null);
    if (user) {
      developerTags.push(`\`${user.username}\``);
    } else {
      developerTags.push(`\`${id}\``);
    }
  }

  const developersStr = developerTags.length > 0 ? developerTags.join(' ') : '`Anonymous`';

  const content =
    `• **Bot:** **${botUser?.username ?? 'Amo'}** (\`${botTag}\`)\n` +
    `• **Prefix:** \`${prefix}\` · **Commands:** \`${commandCount}\` active\n` +
    `• **Network:** \`${totalGuilds.toLocaleString()}\` servers · \`${totalUsers.toLocaleString()}\` users\n` +
    `• **Uptime:** \`${uptimeStr}\`\n` +
    `• **Memory:** \`${heapUsedMb} MB\` heap\n` +
    `• **Engine:** Node.js \`${process.version}\` · \`discord.js v14.18\`\n` +
    `• **Developers:** ${developersStr}`;

  const refreshBtn = new ButtonBuilder()
    .setCustomId(`info_refresh_${userId}`)
    .setLabel('Refresh')
    .setStyle(ButtonStyle.Secondary);

  const helpBtn = new ButtonBuilder()
    .setCustomId(`info_help_${userId}`)
    .setLabel('Help')
    .setStyle(ButtonStyle.Secondary);

  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(refreshBtn, helpBtn);

  return ui.standard({
    title: `${botUser?.username ?? 'Bot'} System Telemetry`,
    text: content,
    thumbnailUrl: botUser?.displayAvatarURL({ size: 128 }) || undefined,
    components: [actionRow],
  });
}

export async function handleInfoInteraction(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split('_');
  const action = parts[1]; // 'refresh' or 'help'
  const userId = parts[2];

  if (interaction.user.id !== userId) {
    await interaction.reply({ content: 'Only the command invoker can use these buttons.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (action === 'refresh') {
    if (!interaction.guild) return;
    const prefix = await getPrefix(interaction.guild.id);
    const payload = await buildInfoV2Embed(interaction.client, interaction.guild, prefix, userId);
    await interaction.update(payload);
  } else if (action === 'help') {
    const prefix = interaction.guild ? await getPrefix(interaction.guild.id) : '!';
    const payload = buildMainHelpEmbed(prefix, userId);
    await interaction.update(payload);
  }
}
