import { getAfk, markAfkNickname, type CachedAfk } from '../../core/database/repositories/afkRepo.js';
/**
 * Strictly sanitizes an AFK reason to guarantee it can NEVER produce a Discord ping.
 */
export function sanitizeAfkReason(reason: string): string {
  if (!reason || !reason.trim()) return 'AFK';

  let sanitized = reason.trim();

  // 1. Break all @ symbols so @everyone, @here, @user, @role cannot ping
  sanitized = sanitized.replace(/@/g, '@\u200b');

  // 2. Break Discord mention syntax <@..., <@&..., <#...
  sanitized = sanitized.replace(/<([@#&!])/g, '<\u200b$1');

  // 3. Break raw snowflake IDs (17-20 digits) so Discord doesn't resolve them
  sanitized = sanitized.replace(/(\d{6})(\d+)/g, '$1\u200b$2');

  // 4. Truncate to maximum 200 characters to prevent spam
  if (sanitized.length > 200) {
    sanitized = sanitized.slice(0, 197) + '...';
  }

  return sanitized;
}

/**
 * Formats elapsed milliseconds into a clean human-readable duration string.
 * Example: 81000ms -> "1 minute, 21 seconds"
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds === 0) return '0 seconds';

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  }
  if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  }
  if (minutes > 0) {
    parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  }
  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds} ${seconds === 1 ? 'second' : 'seconds'}`);
  }

  return parts.join(', ');
}

import { PermissionsBitField } from 'discord.js';
import type { GuildMember } from 'discord.js';
import { consoleLog } from '../../core/logging/ConsoleLogger.js';

export async function applyAfkNickname(member: GuildMember): Promise<{ success: boolean; reason?: string }> {
  try {
    const guild = member.guild;
    const botMember = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
    if (!botMember) {
      return { success: false, reason: 'bot_member_not_found' };
    }
    if (!botMember.permissions.has(PermissionsBitField.Flags.ManageNicknames) && !botMember.permissions.has(PermissionsBitField.Flags.Administrator)) {
      consoleLog('warning', 'afk', `Cannot change AFK nickname for ${member.user.tag}: Bot lacks ManageNicknames permission`);
      return { success: false, reason: 'missing_manage_nicknames' };
    }
    if (member.id === guild.ownerId) {
      consoleLog('info', 'afk', `Skipping AFK nickname for ${member.user.tag}: User is Server Owner (Discord API forbids modifying server owner nickname)`);
      return { success: false, reason: 'server_owner' };
    }
    if (botMember.roles.highest.position <= member.roles.highest.position) {
      consoleLog('warning', 'afk', `Cannot change AFK nickname for ${member.user.tag}: User role hierarchy (${member.roles.highest.name} pos ${member.roles.highest.position}) >= Bot role (${botMember.roles.highest.name} pos ${botMember.roles.highest.position})`);
      return { success: false, reason: 'hierarchy_restricted' };
    }

    const currentName = member.displayName;
    if (currentName.startsWith('[AFK] ')) {
      return { success: true };
    }

    const newName = `[AFK] ${currentName}`.slice(0, 32);
    const originalNickname = member.nickname;
    await member.setNickname(newName, 'User set AFK status');
    await markAfkNickname(guild.id, member.id, originalNickname, newName);
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    consoleLog('warning', 'afk', `Failed to set AFK nickname for ${member.user.tag}: ${msg}`);
    return { success: false, reason: msg };
  }
}

export async function removeAfkNickname(member: GuildMember, record: CachedAfk | null = getAfk(member.guild.id, member.id)): Promise<{ success: boolean; reason?: string }> {
  if (!record?.nicknameSet || !record.afkNickname || member.nickname !== record.afkNickname) return { success: true };
  try {
    const guild = member.guild;
    const botMember = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
    if (!botMember) return { success: false, reason: 'bot_member_not_found' };
    if (!botMember.permissions.has(PermissionsBitField.Flags.ManageNicknames) && !botMember.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return { success: false, reason: 'missing_manage_nicknames' };
    }
    if (member.id === guild.ownerId) return { success: false, reason: 'server_owner' };
    if (botMember.roles.highest.position <= member.roles.highest.position) {
      return { success: false, reason: 'hierarchy_restricted' };
    }

    await member.setNickname(record.originalNickname ?? null, 'User returned from AFK / AFK status cleared');
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    consoleLog('warning', 'afk', `Failed to restore nickname for ${member.user.tag}: ${msg}`);
    return { success: false, reason: msg };
  }
}

