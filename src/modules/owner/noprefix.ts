import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import { resolveUser } from '../../core/resolver/UserResolver.js';
import { toggleNoPrefix, setNoPrefix, getNoPrefixUsersForGuild } from '../../core/config/NoPrefixConfig.js';
import { mentionUser } from '../../core/utils/formatters.js';

export default defineCommand({
  name: 'noprefix',
  aliases: ['np'],
  module: 'owner',
  description: 'Toggle or set no-prefix command execution mode for a user, or list users with no-prefix mode enabled.',
  usage: 'noprefix <user> [on|off] | noprefix list',
  examples: ['noprefix @User', 'noprefix @User on', 'noprefix @User off', 'noprefix list'],
  ownerOnly: true,
  permissions: [],
  botPermissions: [],
  cooldown: 3,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, guild, respond } = ctx;

    if (parsed.args.length === 0) {
      await respond.error(`Usage: \`${parsed.prefix}noprefix <user> [on|off]\` or \`${parsed.prefix}noprefix list\``);
      return;
    }

    const sub = parsed.args[0].toLowerCase();

    // ── Subcommand: list ──
    if (sub === 'list' || sub === 'show') {
      const userIds = getNoPrefixUsersForGuild(guild.id);
      if (userIds.length === 0) {
        await respond.info('No users currently have no-prefix mode enabled in this server.');
        return;
      }

      const userList = userIds.map((id, index) => `${index + 1}. ${mentionUser(id, guild)} (\`${id}\`)`).join('\n');
      await respond.send(`**No-Prefix Mode Users (${userIds.length})**\n\n${userList}`);
      return;
    }

    const userResult = await resolveUser(parsed.args[0], guild);
    if (!userResult.success) {
      await respond.error(`User: ${userResult.error}`);
      return;
    }

    const targetUser = userResult.value.user;
    let enabled: boolean;

    if (parsed.args.length >= 2) {
      const modeArg = parsed.args[1].toLowerCase();
      if (modeArg === 'on' || modeArg === 'enable' || modeArg === 'true') {
        enabled = true;
        await setNoPrefix(guild.id, targetUser.id, true);
      } else if (modeArg === 'off' || modeArg === 'disable' || modeArg === 'false') {
        enabled = false;
        await setNoPrefix(guild.id, targetUser.id, false);
      } else {
        await respond.error('Invalid status. Use `on` or `off`.');
        return;
      }
    } else {
      enabled = await toggleNoPrefix(guild.id, targetUser.id);
    }

    if (enabled) {
      await respond.success(`No-prefix mode is now **enabled** for ${mentionUser(targetUser, guild)} in this server.`);
    } else {
      await respond.info(`No-prefix mode is now **disabled** for ${mentionUser(targetUser, guild)} in this server.`);
    }
  },
});
