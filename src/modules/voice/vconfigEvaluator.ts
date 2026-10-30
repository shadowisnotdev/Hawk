import type { GuildMember } from 'discord.js';
import { getAuthorityLevel } from '../../core/permissions/PermissionChecker.js';
import { AuthorityLevel } from '../../types/permission.js';
import { getVConfigRulesForGuild } from '../../core/database/repositories/vconfigRepo.js';
import { mentionRole } from '../../core/utils/formatters.js';

export interface VoiceAccessResult {
  allowed: boolean;
  reason?: string;
}

export async function checkVoiceAccess(
  guildId: string,
  member: GuildMember,
  commandName: string,
  channelId?: string | null,
  secondChannelId?: string | null,
): Promise<VoiceAccessResult> {
  if (!member) return { allowed: true };

  const ownerId = member.guild?.ownerId ?? '';
  const authority = getAuthorityLevel(member.id, ownerId, member);
  if (authority >= AuthorityLevel.ServerAdmin) return { allowed: true };

  const allRules = await getVConfigRulesForGuild(guildId);
  const commandRules = allRules.filter((r) => r.commandName === commandName || r.commandName === 'all' || r.commandName === '*');
  if (commandRules.length === 0) return { allowed: true };

  const memberRoles = member.roles?.cache ? Array.from(member.roles.cache.values()) : [];
  const memberRoleMap = new Map<string, number>(memberRoles.map((role) => [role.id, role.position]));

  const applicableRules = commandRules
    .filter((r) => memberRoleMap.has(r.roleId))
    .sort((a, b) => (memberRoleMap.get(b.roleId) ?? 0) - (memberRoleMap.get(a.roleId) ?? 0));

  if (applicableRules.length === 0) return { allowed: true };

  const highestPos = memberRoleMap.get(applicableRules[0].roleId) ?? 0;
  const highestRoleRules = applicableRules.filter((r) => (memberRoleMap.get(r.roleId) ?? 0) === highestPos);

  const targetChannels = [channelId, secondChannelId].filter(Boolean) as string[];
  if (targetChannels.length === 0) return { allowed: true };

  const isChannelMatch = (chans: string[], target: string) => chans.includes(target) || chans.includes('all') || chans.includes('*');

  // 1. Blacklist check
  for (const rule of highestRoleRules.filter((r) => r.mode === 'bl')) {
    for (const targetChan of targetChannels) {
      if (isChannelMatch(rule.channelIds, targetChan)) {
        return {
          allowed: false,
          reason: `Your role (${mentionRole(rule.roleId, member.guild)}) is blacklisted from using \`${commandName}\` in that voice channel.`,
        };
      }
    }
  }

  // 2. Whitelist check
  const wlRules = highestRoleRules.filter((r) => r.mode === 'wl');
  if (wlRules.length > 0) {
    for (const targetChan of targetChannels) {
      const isWhitelisted = wlRules.some((r) => isChannelMatch(r.channelIds, targetChan));
      if (!isWhitelisted) {
        return {
          allowed: false,
          reason: `Your role is restricted to specific voice channels for \`${commandName}\`. That voice channel is not whitelisted.`,
        };
      }
    }
  }

  return { allowed: true };
}
