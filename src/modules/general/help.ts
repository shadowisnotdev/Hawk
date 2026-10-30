import type { GuildTextBasedChannel } from 'discord.js';
import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import { resolveCommand, getModules, getModuleCommands } from '../../core/commands/CommandRegistry.js';
import { getPrefix } from '../../core/database/repositories/guildConfigRepo.js';
import {
  buildMainHelpEmbed,
  buildCategoryHelpEmbed,
  buildCommandHelpEmbed,
} from './helpUI.js';

export default defineCommand({
  name: 'help',
  module: 'general',
  description: 'Display interactive bot help menu, category details, or specific command information.',
  usage: 'help [module|command]',
  examples: ['help', 'help voice', 'help gaming', 'help moderation', 'help mv', 'help lock'],
  permissions: [],
  botPermissions: [],
  cooldown: 2,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, guild, channel, respond, member } = ctx;
    const prefix = await getPrefix(guild.id);
    const { getUsableCommandsForMember } = await import('../../core/permissions/PermissionChecker.js');
    const { usableSet } = await getUsableCommandsForMember(member, channel as GuildTextBasedChannel);

    // Case A: No arguments -> Main Help View
    if (parsed.args.length === 0) {
      const payload = buildMainHelpEmbed(prefix, member.id, usableSet);
      await (channel as GuildTextBasedChannel).send(payload);
      return;
    }

    const target = parsed.args[0].toLowerCase();
    const { getAuthorityLevel } = await import('../../core/permissions/PermissionChecker.js');
    const { AuthorityLevel } = await import('../../types/permission.js');
    const authority = getAuthorityLevel(member.id, guild.ownerId, member);
    const isOwner = authority === AuthorityLevel.Owner;

    // Case B: Direct Command Lookup
    const matchedCmd = resolveCommand(target);
    if (matchedCmd && (isOwner || (!matchedCmd.hidden && !matchedCmd.ownerOnly && matchedCmd.module !== 'owner'))) {
      const payload = buildCommandHelpEmbed(matchedCmd, prefix);
      await respond.raw(payload);
      return;
    }

    // Case C: Direct Module / Category Lookup
    const activeModules = getModules().filter(m => getModuleCommands(m).length > 0);
    const matchedMod = activeModules.find(m => m.toLowerCase() === target);

    if (matchedMod) {
      const payload = buildCategoryHelpEmbed(matchedMod, prefix, member.id, 1, usableSet);
      await (channel as GuildTextBasedChannel).send(payload);
      return;
    }

    // Case D: Unknown Command / Module Target
    await respond.error(
      `Command or module \`${parsed.args[0]}\` could not be found.\nUse \`${prefix}help\` to browse available commands.`,
    );
  },
});
