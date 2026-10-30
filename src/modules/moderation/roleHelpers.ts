import type { Guild, GuildMember, Role } from 'discord.js';
import { getAuthorityLevel } from '../../core/permissions/PermissionChecker.js';
import { AuthorityLevel } from '../../types/permission.js';

export function canExecutorManage(
  guild: Guild,
  executor: GuildMember,
  targetRole?: Role,
  targetMember?: GuildMember,
): boolean {
  const authority = getAuthorityLevel(executor.id, guild.ownerId, executor);

  // Server Owner, Bot Owner, and Bot Admin bypass EXECUTOR role hierarchy checks (still bounded by Bot's role hierarchy)
  if (executor.id === guild.ownerId || authority >= AuthorityLevel.BotAdmin) {
    return true;
  }

  const executorHighest = executor.roles.highest;

  if (targetRole && executorHighest.position <= targetRole.position) {
    return false;
  }

  if (targetMember && executor.id !== targetMember.id && executorHighest.position <= targetMember.roles.highest.position) {
    return false;
  }

  return true;
}

export function isRoleManageable(guild: Guild, role: Role, executor?: GuildMember): boolean {
  if (role.managed) return false;
  if (role.id === guild.id) return false; // @everyone

  const botMember = guild.members.me;
  if (!botMember) return false;

  const botHighest = botMember.roles.highest;
  if (botHighest.position <= role.position) return false;

  if (executor && !canExecutorManage(guild, executor, role, undefined)) {
    return false;
  }

  return true;
}

export function isMemberManageable(guild: Guild, member: GuildMember, executor?: GuildMember): boolean {
  // Non-owners cannot manage Server Owner, but Server Owner can manage themselves
  if (member.id === guild.ownerId && executor?.id !== guild.ownerId) return false;

  const botMember = guild.members.me;
  if (!botMember) return false;

  const botHighest = botMember.roles.highest;
  const targetHighest = member.roles.highest;

  // Bot role hierarchy check
  if (botHighest.position <= targetHighest.position && member.id !== botMember.id && executor?.id !== guild.ownerId) {
    return false;
  }

  if (executor && !canExecutorManage(guild, executor, undefined, member)) {
    return false;
  }

  return true;
}

export async function toggleRoleForMember(
  guild: Guild,
  member: GuildMember,
  role: Role,
  executor?: GuildMember,
): Promise<'added' | 'removed' | 'skipped'> {
  if (!isRoleManageable(guild, role, executor) || !isMemberManageable(guild, member, executor)) {
    return 'skipped';
  }

  try {
    if (member.roles.cache.has(role.id)) {
      await member.roles.remove(role);
      return 'removed';
    } else {
      await member.roles.add(role);
      return 'added';
    }
  } catch {
    return 'skipped';
  }
}

export async function addRoleToMember(
  guild: Guild,
  member: GuildMember,
  role: Role,
  executor?: GuildMember,
): Promise<'added' | 'skipped'> {
  if (!isRoleManageable(guild, role, executor) || !isMemberManageable(guild, member, executor)) {
    return 'skipped';
  }

  if (member.roles.cache.has(role.id)) {
    return 'skipped';
  }

  try {
    await member.roles.add(role);
    return 'added';
  } catch {
    return 'skipped';
  }
}

export async function removeRoleFromMember(
  guild: Guild,
  member: GuildMember,
  role: Role,
  executor?: GuildMember,
): Promise<'removed' | 'skipped'> {
  if (!isRoleManageable(guild, role, executor) || !isMemberManageable(guild, member, executor)) {
    return 'skipped';
  }

  if (!member.roles.cache.has(role.id)) {
    return 'skipped';
  }

  try {
    await member.roles.remove(role);
    return 'removed';
  } catch {
    return 'skipped';
  }
}
