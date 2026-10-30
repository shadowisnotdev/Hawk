import { PermissionsBitField } from 'discord.js';
import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import { resolveUser } from '../../core/resolver/UserResolver.js';
import { resolveRole } from '../../core/resolver/RoleResolver.js';
import { resolveCommand, getModules } from '../../core/commands/CommandRegistry.js';
import {
  addPermit,
  removePermit,
  getPermitsForGuild,
  deletePermitsByIds,
} from '../../core/database/repositories/permissionRepo.js';
import { sanitize } from '../../core/utils/validators.js';
import { logEvent } from '../../core/logging/WebhookLogger.js';
import { logAuditAction } from '../../core/logging/AuditLogger.js';
import { getAuthorityLevel } from '../../core/permissions/PermissionChecker.js';
import { AuthorityLevel } from '../../types/permission.js';
import { mentionRole } from '../../core/utils/formatters.js';
import { buildAccessListPayload } from './_accessHandler.js';

interface ResolvedTarget {
  targetType: 'user' | 'role';
  targetId: string;
  targetDisplay: string;
}

interface ParsedScope {
  commandName: string | null;
  moduleName: string | null;
  scopeDisplay: string;
}

/**
 * Prunes orphaned or invalid permits (deleted roles, non-existent commands/modules).
 */
async function handleFixSubcommand(ctx: CommandContext): Promise<void> {
  const { guild, member, respond } = ctx;
  const permits = await getPermitsForGuild(guild.id);
  if (permits.length === 0) {
    await respond.info('No permits exist in this server to clean.');
    return;
  }

  const availableModules = getModules(false, true);
  const ghostIds: number[] = [];
  let invalidCmdCount = 0;
  let deletedRoleCount = 0;
  let invalidModCount = 0;

  for (const p of permits) {
    let isGhost = false;

    if (p.targetType === 'role') {
      if (!guild.roles.cache.has(p.targetId)) {
        isGhost = true;
        deletedRoleCount++;
      }
    }

    if (!isGhost && p.commandName) {
      const cmd = resolveCommand(p.commandName);
      if (!cmd) {
        isGhost = true;
        invalidCmdCount++;
      }
    }

    if (!isGhost && p.moduleName) {
      if (!availableModules.includes(p.moduleName.toLowerCase())) {
        isGhost = true;
        invalidModCount++;
      }
    }

    if (isGhost) {
      ghostIds.push(p.id);
    }
  }

  if (ghostIds.length === 0) {
    await respond.success('All active permits are clean and valid. No ghost permits found.');
    return;
  }

  const deletedCount = await deletePermitsByIds(guild.id, ghostIds);
  const summary = `Cleaned **${deletedCount}** ghost permit(s) [Invalid commands: **${invalidCmdCount}** | Deleted roles: **${deletedRoleCount}** | Invalid modules: **${invalidModCount}**].`;
  await respond.transientSuccess(summary, 8000);

  logAuditAction({
    guild,
    action: 'Access Ghost Permits Cleaned',
    executor: member,
    details: [
      `• **Total Removed:** ${deletedCount}`,
      `• **Non-existent Commands:** ${invalidCmdCount}`,
      `• **Deleted Roles:** ${deletedRoleCount}`,
      `• **Invalid Modules:** ${invalidModCount}`,
    ],
  });

  logEvent('info', 'command_execution', `Ghost permits fixed by ${member.user.tag}`, {
    executor: member.user.tag,
    guild: guild.name,
    cleanedCount: deletedCount,
    invalidCmdCount,
    deletedRoleCount,
    invalidModCount,
  });
}

/**
 * Lists active server permits.
 */
async function handleListSubcommand(ctx: CommandContext): Promise<void> {
  const { guild, respond } = ctx;

  const listData = await buildAccessListPayload(guild, 0);
  if (!listData) {
    await respond.info('No custom permits have been granted in this server.');
    return;
  }

  await respond.raw({
    components: listData.components,
    flags: listData.payload.flags as any,
  });
}

/**
 * Resolves a raw target string to a user or role.
 */
async function resolveTarget(targetArg: string, guild: any): Promise<ResolvedTarget | null> {
  if (targetArg === '?all' || targetArg === 'everyone' || targetArg === '@everyone') {
    return {
      targetType: 'role',
      targetId: guild.id,
      targetDisplay: '@everyone',
    };
  }

  const user = await resolveUser(targetArg, guild);
  if (user.success) {
    return {
      targetType: 'user',
      targetId: user.value.id,
      targetDisplay: `<@${user.value.id}>`,
    };
  }

  const role = resolveRole(targetArg, guild);
  if (role.success) {
    return {
      targetType: 'role',
      targetId: role.value.id,
      targetDisplay: mentionRole(role.value.id, guild),
    };
  }

  return null;
}

/**
 * Parses scope input into command, module, or all.
 */
function parseScope(scopeArg: string, isRemoveMode: boolean): { error?: string; scope?: ParsedScope } {
  if (scopeArg === 'all' || scopeArg === '*') {
    if (!isRemoveMode) {
      return { error: 'Granting `all` permissions is restricted. Specify individual commands or modules.' };
    }
    return {
      scope: {
        commandName: null,
        moduleName: null,
        scopeDisplay: 'all permits',
      },
    };
  }

  const command = resolveCommand(scopeArg);
  if (command) {
    return {
      scope: {
        commandName: command.name,
        moduleName: null,
        scopeDisplay: `command \`${command.name}\``,
      },
    };
  }

  const availableModules = getModules(false, true);
  if (availableModules.includes(scopeArg)) {
    return {
      scope: {
        commandName: null,
        moduleName: scopeArg,
        scopeDisplay: `module \`${scopeArg}\``,
      },
    };
  }

  return { error: `Unknown command or module \`${scopeArg}\`.` };
}

/**
 * Handles granting or revoking command permits.
 */
async function handleGrantOrRevokeSubcommand(ctx: CommandContext, firstArg: string): Promise<void> {
  const { parsed, guild, member, respond } = ctx;

  let isRemoveMode = false;
  let targetIndex = 0;

  if (firstArg === 'remove' || firstArg === 'revoke' || firstArg === 'delete') {
    isRemoveMode = true;
    targetIndex = 1;
  } else if (firstArg === 'add' || firstArg === 'grant') {
    targetIndex = 1;
  }

  const remainingArgs = parsed.args.slice(targetIndex);
  if (remainingArgs.length < 2) {
    await respond.error(
      `Usage: \`access ${isRemoveMode ? 'remove' : 'add'} <@user|@role> <command|module|all>\``,
    );
    return;
  }

  const targetArg = remainingArgs[0];
  const scopeArg = remainingArgs.slice(1).join(' ').trim().toLowerCase();

  const target = await resolveTarget(targetArg, guild);
  if (!target) {
    await respond.error(`Could not resolve user or role \`${targetArg}\`.`);
    return;
  }

  // General scope parsing
  const parsedScopeResult = parseScope(scopeArg, isRemoveMode);
  if (parsedScopeResult.error || !parsedScopeResult.scope) {
    await respond.error(parsedScopeResult.error || 'Invalid scope.');
    return;
  }

  const { commandName, moduleName, scopeDisplay } = parsedScopeResult.scope;

  if (isRemoveMode) {
    const sanitizedStaffName = sanitize(member.displayName || member.user.tag);
    const removed = await removePermit(guild.id, target.targetType, target.targetId, commandName, moduleName, member.id, sanitizedStaffName);
    if (removed) {
      await respond.success(`Revoked ${target.targetDisplay} access to ${scopeDisplay}.`);
      logEvent('info', 'command_execution', `Permit removed by ${member.user.tag}`, {
        executor: member.user.tag,
        target: target.targetId,
        targetType: target.targetType,
        commandName,
        moduleName,
        guild: guild.name,
      });
    } else {
      await respond.info(`No active permit was found for ${target.targetDisplay} on ${scopeDisplay}.`);
    }
  } else {
    await addPermit(guild.id, target.targetType, target.targetId, commandName, moduleName);
    await respond.success(`Granted ${target.targetDisplay} access to ${scopeDisplay}.`);
    logEvent('info', 'command_execution', `Permit granted by ${member.user.tag}`, {
      executor: member.user.tag,
      target: target.targetId,
      targetType: target.targetType,
      commandName,
      moduleName,
      guild: guild.name,
    });
  }
}

export default defineCommand({
  name: 'access',
  aliases: ['permit'],
  module: 'owner',
  description: 'Manage custom permits for users or roles.',
  usage: 'access list | access fix | access add <target> <command|module|all> | access remove <target> <command|module|all>',
  examples: [
    'access list',
    'access fix',
    'access add @User wv',
    'access add @Role voice',
    'access add ?all voice',
    'access add @User all',
    'access remove @User wv',
  ],
  ownerOnly: true,
  permissions: [],
  botPermissions: [PermissionsBitField.Flags.SendMessages],
  cooldown: 3,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, guild, member, respond } = ctx;
    const authority = getAuthorityLevel(member.id, guild.ownerId, member);
    if (authority !== AuthorityLevel.Owner) {
      await respond.error('Only **Bot Owners** can manage command access and permits.');
      return;
    }

    if (parsed.args.length === 0) {
      await respond.error('Usage: `access list` | `access fix` | `access add <@user|@role|?all> <scope>` | `access remove <@user|@role|?all> <scope>`');
      return;
    }

    const firstArg = parsed.args[0].toLowerCase();

    if (firstArg === 'fix' || firstArg === 'clean' || firstArg === 'prune') {
      return handleFixSubcommand(ctx);
    }

    if (firstArg === 'list' || firstArg === 'show') {
      return handleListSubcommand(ctx);
    }

    return handleGrantOrRevokeSubcommand(ctx, firstArg);
  },
});
