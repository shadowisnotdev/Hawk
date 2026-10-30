import type { Guild, GuildTextBasedChannel, GuildMember, User, Client } from 'discord.js';
import { getLogChannel } from '../database/repositories/guildConfigRepo.js';
import { ui } from '../ui/index.js';
import { formatUser } from '../utils/formatters.js';
import { getEmoji } from '../config/branding.js';
import type { CommandLogEvent } from '../../types/logging.js';
import { truncate } from '../utils/validators.js';

export interface AuditLogOptions {
  guild: Guild;
  action: string;
  executor: GuildMember | User | string;
  target?: string;
  channelName?: string;
  details?: string | string[];
}

function getOutcomeEmoji(outcome: string): string {
  switch (outcome.toLowerCase()) {
    case 'success':
      return getEmoji('success');
    case 'fail':
    case 'error':
    case 'denied':
      return getEmoji('error') || getEmoji('denied');
    case 'warning':
    case 'cooldown':
    case 'maintenance':
      return getEmoji('warning');
    case 'info':
    case 'ignored':
    case 'unknown':
    default:
      return getEmoji('info');
  }
}

export async function logAuditAction(options: AuditLogOptions): Promise<void> {
  const { guild, action, executor, target, channelName, details } = options;

  try {
    const logChannelId = await getLogChannel(guild.id);
    if (!logChannelId) return;

    const channel = (guild.channels.cache.get(logChannelId) ??
      (await guild.channels.fetch(logChannelId).catch(() => null))) as GuildTextBasedChannel | null;

    if (!channel || !('send' in channel)) return;

    const executorDisplay = formatUser(executor, guild);
    const unixNow = Math.floor(Date.now() / 1000);
    const modEmoji = getEmoji('moderation') || getEmoji('success');
    const modPrefix = modEmoji ? `${modEmoji} ` : '';

    const sections: string[] = [
      `• **Action:** ${action}\n` +
      `• **Moderator:** ${executorDisplay}\n` +
      `• **Time:** <t:${unixNow}:F> (<t:${unixNow}:R>)` +
      (channelName ? `\n• **Channel:** ${channelName}` : '') +
      (target ? `\n• **Target:** ${target}` : ''),
    ];

    if (details) {
      if (Array.isArray(details)) {
        sections.push(details.join('\n'));
      } else {
        sections.push(details);
      }
    }

    const payload = ui.standard({
      title: `${modPrefix}Audit Log | ${action}`,
      sections,
    });

    await channel.send({
      components: payload.components,
      flags: payload.flags as any,
      allowedMentions: { parse: [], roles: [], users: [] },
    }).catch(() => {});
  } catch {
    // Non-blocking: fail quietly if logging fails
  }
}

export async function logCommandAudit(client: Client, event: CommandLogEvent): Promise<void> {
  try {
    const logChannelId = await getLogChannel(event.guildId);
    if (!logChannelId) return;

    const guild = client.guilds.cache.get(event.guildId) ??
      await client.guilds.fetch(event.guildId).catch(() => null);
    if (!guild) return;

    const channel = (guild.channels.cache.get(logChannelId) ??
      (await guild.channels.fetch(logChannelId).catch(() => null))) as GuildTextBasedChannel | null;

    if (!channel || !('send' in channel)) return;

    const outcomeKey = event.outcome || (event.success ? 'success' : 'fail');
    const unixNow = Math.floor(Date.now() / 1000);
    const statusEmoji = getOutcomeEmoji(outcomeKey);
    const statusPrefix = statusEmoji ? `${statusEmoji} ` : '';

    const sections: string[] = [
      `• **User:** ${event.userTag} (<@${event.userId}>)\n` +
      `• **Channel:** #${event.channelName} (<#${event.channelId}>)\n` +
      `• **Command:** \`${event.commandName}\`${event.aliasUsed !== event.commandName ? ` (alias: \`${event.aliasUsed}\`)` : ''}\n` +
      `• **Content:** \`${truncate(event.rawContent, 300)}\`\n` +
      `• **Status:** ${statusPrefix}\`${outcomeKey.toUpperCase()}\`\n` +
      `• **Time:** <t:${unixNow}:T> (<t:${unixNow}:R>)`,
    ];

    if (event.responseSnippet) {
      sections.push(`• **Response:** \`${truncate(event.responseSnippet, 200)}\``);
    }
    if (event.error) {
      sections.push(`• **Error / Reason:** ${event.error}`);
    }
    if (event.resolvedTargets && event.resolvedTargets.length > 0) {
      sections.push(`• **Targets:** ${event.resolvedTargets.join(', ')}`);
    }

    const payload = ui.standard({
      title: `${statusPrefix}Command Log | ${event.commandName} [${outcomeKey.toUpperCase()}]`,
      sections,
    });

    await channel.send({
      components: payload.components,
      flags: payload.flags as any,
      allowedMentions: { parse: [], roles: [], users: [] },
    }).catch(() => {});
  } catch {
    // Non-blocking
  }
}

export async function logInteractionAudit(
  client: Client,
  data: {
    guildId?: string;
    channelId?: string;
    channelName?: string;
    userId: string;
    userTag: string;
    type: string;
    customId: string;
    details?: string;
  },
): Promise<void> {
  if (!data.guildId) return;

  try {
    const logChannelId = await getLogChannel(data.guildId);
    if (!logChannelId) return;

    const guild = client.guilds.cache.get(data.guildId) ??
      await client.guilds.fetch(data.guildId).catch(() => null);
    if (!guild) return;

    const channel = (guild.channels.cache.get(logChannelId) ??
      (await guild.channels.fetch(logChannelId).catch(() => null))) as GuildTextBasedChannel | null;

    if (!channel || !('send' in channel)) return;

    const unixNow = Math.floor(Date.now() / 1000);
    const infoEmoji = getEmoji('info');
    const infoPrefix = infoEmoji ? `${infoEmoji} ` : '';

    const sections: string[] = [
      `• **User:** ${data.userTag} (<@${data.userId}>)\n` +
      `• **Channel:** #${data.channelName ?? 'unknown'}` + (data.channelId ? ` (<#${data.channelId}>)` : '') + `\n` +
      `• **Type:** \`${data.type.toUpperCase()}\`\n` +
      `• **Custom ID:** \`${data.customId}\`\n` +
      `• **Time:** <t:${unixNow}:T> (<t:${unixNow}:R>)`,
    ];

    if (data.details) {
      sections.push(`• **Details:** ${data.details}`);
    }

    const payload = ui.standard({
      title: `${infoPrefix}Interaction Log | ${data.type.toUpperCase()}`,
      sections,
    });

    await channel.send({
      components: payload.components,
      flags: payload.flags as any,
      allowedMentions: { parse: [], roles: [], users: [] },
    }).catch(() => {});
  } catch {
    // Non-blocking
  }
}
