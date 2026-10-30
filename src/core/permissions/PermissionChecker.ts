import { PermissionFlagsBits } from 'discord.js';
import type { GuildMember, PermissionResolvable, GuildTextBasedChannel } from 'discord.js';
import type { CommandDefinition } from '../../types/command.js';
import type { PermissionCheckResult, PermissionContext } from '../../types/permission.js';
import { AuthorityLevel } from '../../types/permission.js';
import { env } from '../config/environment.js';
import * as permissionRepo from '../database/repositories/permissionRepo.js';
import { resolvePermitEffect } from './permitEffect.js';

export function getAuthorityLevel(userId: string, guildOwnerId?: string, member?: GuildMember): AuthorityLevel {
  if (env.botOwnerIds.includes(userId) || userId === env.botOwnerId) return AuthorityLevel.Owner;
  if (env.botAdminIds.includes(userId)) return AuthorityLevel.BotAdmin;
  if (guildOwnerId && userId === guildOwnerId) return AuthorityLevel.ServerAdmin;
  if (member?.permissions.has(PermissionFlagsBits.Administrator)) return AuthorityLevel.ServerAdmin;
  return AuthorityLevel.Normal;
}

export async function checkPermission(
  command: CommandDefinition,
  ctx: PermissionContext,
  member?: GuildMember,
): Promise<PermissionCheckResult> {
  const authority = getAuthorityLevel(ctx.userId, ctx.guildOwnerId, member);

  if (command.ownerOnly || command.module === 'owner') {
    const isOwner = authority === AuthorityLevel.Owner;
    return { allowed: isOwner, authority, reason: isOwner ? 'Bot owner bypass' : 'This command is owner-only.' };
  }

  if (command.botAdminOnly) {
    const isBotAdmin = authority >= AuthorityLevel.BotAdmin;
    return { allowed: isBotAdmin, authority, reason: isBotAdmin ? 'Bot admin bypass' : 'This command is restricted to bot administrators.' };
  }

  if (authority === AuthorityLevel.Owner) {
    return { allowed: true, authority, reason: 'Bot owner bypass' };
  }

  if (authority >= AuthorityLevel.ServerAdmin) {
    return { allowed: true, authority, reason: 'Server owner bypass' };
  }

  if (['help', 'afk', 'ping', 'info'].includes(command.name)) {
    return { allowed: true, authority: AuthorityLevel.Normal, reason: 'Global public command' };
  }

  const effect = resolvePermitEffect(await permissionRepo.getPermitsForGuild(ctx.guildId), ctx.userId, ctx.memberRoleIds, ctx.commandName, ctx.moduleName);
  if (effect === 'DENY') return { allowed: false, authority, reason: 'An explicit command access rule denies this command.' };
  if (effect === 'ALLOW') {
    return { allowed: true, authority: AuthorityLevel.Permitted, reason: 'Custom access override granted' };
  }

  const revocation = await permissionRepo.getLatestRevocation(
    ctx.guildId,
    ctx.userId,
    ctx.memberRoleIds,
    ctx.commandName,
    ctx.moduleName,
  );

  return {
    allowed: false,
    authority,
    reason: 'This bot is private. Commands require a custom permit granted by the owner.',
    revocationInfo: revocation ?? undefined,
  };
}

export function checkBotPermissions(botMember: GuildMember, required: PermissionResolvable[]): { hasAll: boolean; missing: string[] } {
  const missing = required.filter((perm) => !botMember.permissions.has(perm)).map(String);
  return { hasAll: missing.length === 0, missing };
}

export async function getUsableCommandsForMember(
  member: GuildMember,
  channel: GuildTextBasedChannel,
): Promise<{
  allCommands: CommandDefinition[];
  usableCommands: CommandDefinition[];
  usableSet: Set<string>;
  totalCount: number;
  usableCount: number;
}> {
  const { getAllCommands } = await import('../commands/CommandRegistry.js');
  const { checkRestrictions } = await import('../restrictions/RestrictionChecker.js');
  const { isIgnored } = await import('../ignore/IgnoreChecker.js');

  const guild = member.guild;
  const authority = getAuthorityLevel(member.id, guild.ownerId, member);
  const isOwner = authority === AuthorityLevel.Owner;
  const allCommands = getAllCommands(isOwner);
  const categoryId = ('parentId' in channel && channel.parentId) ? channel.parentId : null;
  const roleIds = Array.from(member.roles.cache.keys());

  const usableCommands: CommandDefinition[] = [];

  for (const cmd of allCommands) {
    if (!cmd.enabled) continue;

    const permCtx: PermissionContext = {
      userId: member.id,
      guildId: guild.id,
      guildOwnerId: guild.ownerId,
      memberRoleIds: roleIds,
      commandName: cmd.name,
      moduleName: cmd.module,
      channelId: channel.id,
      categoryId,
    };

    if (authority < AuthorityLevel.ServerAdmin) {
      const ignored = await isIgnored(
        guild.id,
        member.id,
        roleIds,
        channel.id,
        categoryId,
        cmd.name,
        cmd.module,
        member.roles.cache,
      );
      if (ignored) continue;
    }

    const permResult = await checkPermission(cmd, permCtx, member);
    if (!permResult.allowed) continue;

    const restrictResult = await checkRestrictions(permCtx, permResult.authority);
    if (!restrictResult.allowed) continue;

    usableCommands.push(cmd);
  }

  const usableSet = new Set(usableCommands.map(c => c.name));
  return {
    allCommands,
    usableCommands,
    usableSet,
    totalCount: allCommands.length,
    usableCount: usableCommands.length,
  };
}
