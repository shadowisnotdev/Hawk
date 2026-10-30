import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import { resolveUser } from '../../core/resolver/UserResolver.js';
import { resolveRole } from '../../core/resolver/RoleResolver.js';
import { resolveCommand, getModules } from '../../core/commands/CommandRegistry.js';
import { removePermit } from '../../core/database/repositories/permissionRepo.js';
import { mentionUser, mentionRole } from '../../core/utils/formatters.js';

import { getAuthorityLevel } from '../../core/permissions/PermissionChecker.js';
import { AuthorityLevel } from '../../types/permission.js';

export default defineCommand({
  name: 'restrict',
  module: 'owner',
  description: 'Revoke custom command/module permit from a user or role.',
  usage: 'restrict <target> <command|module:name>',
  examples: ['restrict @User wv', 'restrict @Role voice', 'restrict @User module:voice'],
  ownerOnly: true,
  permissions: [],

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, guild, member, respond } = ctx;
    const authority = getAuthorityLevel(member.id, guild.ownerId, member);
    if (authority !== AuthorityLevel.Owner) {
      await respond.error('Only **Bot Owners** can use `restrict`.');
      return;
    }

    if (parsed.args.length < 2) {
      await respond.error('Usage: `restrict <@user|@role|?all> <command|module:name>`');
      return;
    }

    const targetArg = parsed.args[0];
    const scopeArg = parsed.args.slice(1).join(' ').trim().toLowerCase();

    // 1. Resolve target (user or role)
    let targetType: 'user' | 'role';
    let targetId: string;
    let targetDisplay: string;

    const userResult = await resolveUser(targetArg, guild);
    if (userResult.success) {
      targetType = 'user';
      targetId = userResult.value.id;
      targetDisplay = mentionUser(userResult.value.member ?? userResult.value.user, guild);
    } else {
      const roleResult = resolveRole(targetArg, guild);
      if (roleResult.success) {
        targetType = 'role';
        targetId = roleResult.value.id;
        targetDisplay = mentionRole(roleResult.value.role, guild);
      } else {
        await respond.error(`Could not resolve user or role \`${targetArg}\`.`);
        return;
      }
    }

    // 2. Parse scope (module:name or command name)
    let commandName: string | null = null;
    let moduleName: string | null = null;

    if (scopeArg.startsWith('module:')) {
      const modName = scopeArg.slice(7).trim();
      const allModules = getModules(false, true);
      if (!allModules.includes(modName)) {
        await respond.error(`Unknown module \`${modName}\`. Available modules: ${allModules.join(', ')}`);
        return;
      }
      moduleName = modName;
    } else {
      const cmd = resolveCommand(scopeArg);
      if (cmd) {
        commandName = cmd.name;
        moduleName = cmd.module;
      } else {
        const allModules = getModules(false, true);
        if (allModules.includes(scopeArg)) {
          moduleName = scopeArg;
        } else {
          await respond.error(`Unknown command or module \`${scopeArg}\`.`);
          return;
        }
      }
    }

    // 3. Remove permit
    const removed = await removePermit(guild.id, targetType, targetId, commandName, moduleName);

    const scopeDisplay = commandName ? `command **${commandName}**` : `module **${moduleName}**`;
    if (removed) {
      await respond.success(`Revoked access to ${scopeDisplay} from ${targetDisplay}.`);
    } else {
      await respond.info(`No active permit found for ${targetDisplay} on ${scopeDisplay}.`);
    }
  },
});
