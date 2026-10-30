import { PermissionsBitField } from 'discord.js';
import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import { resolveRole } from '../../core/resolver/RoleResolver.js';
import { mentionRole } from '../../core/utils/formatters.js';
import { ui } from '../../core/ui/index.js';
import { logEvent } from '../../core/logging/WebhookLogger.js';

export default defineCommand({
  name: 'list',
  aliases: ['inrole', 'admin', 'admins', 'bot', 'bots', 'listrole', 'membersinrole'],
  module: 'moderation',
  description: 'List members in a role, human server administrators, or bot accounts.',
  usage: 'list <inrole <@role>|admin|bots>',
  examples: ['list inrole @Moderator', 'inrole @VIP', 'list admin', 'admins', 'list bots', 'bots'],
  permissions: [],
  botPermissions: [PermissionsBitField.Flags.SendMessages],
  cooldown: 3,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, guild, respond, member } = ctx;

    const firstArg = parsed.aliasUsed.toLowerCase();
    let mode = '';
    let targetRoleArg = '';

    if (firstArg === 'inrole' || firstArg === 'listrole' || firstArg === 'membersinrole') {
      mode = 'inrole';
      targetRoleArg = parsed.args.join(' ');
    } else if (firstArg === 'admin' || firstArg === 'admins') {
      mode = 'admin';
    } else if (firstArg === 'bot' || firstArg === 'bots') {
      mode = 'bots';
    } else {
      const sub = parsed.args[0]?.toLowerCase();
      if (sub === 'inrole' || sub === 'role') {
        mode = 'inrole';
        targetRoleArg = parsed.args.slice(1).join(' ');
      } else if (sub === 'admin' || sub === 'admins') {
        mode = 'admin';
      } else if (sub === 'bot' || sub === 'bots') {
        mode = 'bots';
      } else {
        await respond.error(`Usage: \`${parsed.prefix}list <inrole <@role>|admin|bots>\` or \`${parsed.prefix}inrole <@role>\`, \`${parsed.prefix}admins\`, \`${parsed.prefix}bots\`.`);
        return;
      }
    }

    // Fetch all guild members to ensure uncached members are loaded
    const allMembers = await guild.members.fetch().catch(() => guild.members.cache);

    if (mode === 'inrole') {
      if (!targetRoleArg) {
        await respond.error(`Usage: \`${parsed.prefix}inrole <@role>\` or \`${parsed.prefix}list inrole <@role>\`.`);
        return;
      }

      const roleRes = resolveRole(targetRoleArg, guild);
      if (!roleRes.success) {
        await respond.error(`Role: ${roleRes.error}`);
        return;
      }

      const targetRole = roleRes.value.role;
      const roleMembers = Array.from(allMembers.filter(m => m.roles.cache.has(targetRole.id)).values());
      const totalCount = roleMembers.length;

      if (totalCount === 0) {
        await respond.info(`No members currently possess the role ${mentionRole(targetRole, guild)}.`);
        return;
      }

      const memberLines = roleMembers.map(m => `• **${m.displayName}** (\`${m.user.tag}\`)`);

      await ui.paginated(ctx, {
        title: `Members with Role: ${targetRole.name}`,
        items: memberLines,
        pageSize: 10,
        emptyText: `No members currently possess the role ${mentionRole(targetRole, guild)}.`,
      });
    } else if (mode === 'admin') {
      const adminMembers = Array.from(
        allMembers.filter(m => {
          if (m.user.bot) return false;
          return m.id === guild.ownerId || m.permissions.has(PermissionsBitField.Flags.Administrator);
        }).values()
      );

      const totalCount = adminMembers.length;
      if (totalCount === 0) {
        await respond.info('No human administrator accounts found in this server.');
        return;
      }

      const adminLines = adminMembers.map(m => `• **${m.displayName}** (\`${m.user.tag}\`)${m.id === guild.ownerId ? ' *(Server Owner)*' : ''}`);

      await ui.paginated(ctx, {
        title: 'Server Administrators',
        items: adminLines,
        pageSize: 10,
        emptyText: 'No human administrator accounts found in this server.',
      });
    } else if (mode === 'bots') {
      const botMembers = Array.from(allMembers.filter(m => m.user.bot).values());
      const totalCount = botMembers.length;

      if (totalCount === 0) {
        await respond.info('No bot accounts found in this server.');
        return;
      }

      const botLines = botMembers.map(m => `• **${m.displayName}** (\`${m.user.tag}\`)`);

      await ui.paginated(ctx, {
        title: 'Server Bot Accounts',
        items: botLines,
        pageSize: 10,
        emptyText: 'No bot accounts found in this server.',
      });
    }

    logEvent('info', 'command_execution', `List (${mode}) by ${member.user.tag}`, {
      executor: member.user.tag,
      executorId: member.id,
      guild: guild.name,
      guildId: guild.id,
      mode,
    });
  },
});
