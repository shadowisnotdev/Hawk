import { PermissionsBitField } from 'discord.js';
import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import { resolveRole } from '../../core/resolver/RoleResolver.js';
import { isRoleManageable } from './roleHelpers.js';
import { mentionRole } from '../../core/utils/formatters.js';
import { logEvent } from '../../core/logging/WebhookLogger.js';
import { logAuditAction } from '../../core/logging/AuditLogger.js';

export default defineCommand({
  name: 'purgerole',
  aliases: ['pr'],
  module: 'moderation',
  description: 'Mass-removes the specified role from all members currently holding it in the guild.',
  usage: 'purgerole <role>',
  examples: ['purgerole @Muted', 'purgerole Event Participant', 'pr @Role'],
  permissions: [PermissionsBitField.Flags.ManageRoles],
  botPermissions: [PermissionsBitField.Flags.ManageRoles],
  cooldown: 5,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, guild, member, respond } = ctx;

    if (parsed.args.length === 0) {
      await respond.error('Please specify a role to purge.\nUsage: `purgerole <role>`');
      return;
    }

    const roleQuery = parsed.args.join(' ');
    const roleRes = resolveRole(roleQuery, guild);
    if (!roleRes.success) {
      await respond.error(`Could not find role: ${roleRes.error}`);
      return;
    }

    const targetRole = roleRes.value.role;
    if (targetRole.id === guild.id) {
      await respond.error('Cannot purge the @everyone role.');
      return;
    }

    if (!isRoleManageable(guild, targetRole, member)) {
      await respond.denied('You cannot purge a role higher than or equal to your highest role, or the bot lacks hierarchy to manage it.');
      return;
    }

    // Fetch members to ensure cache is populated
    await guild.members.fetch().catch(() => {});
    const membersWithRole = Array.from(targetRole.members.values());

    if (membersWithRole.length === 0) {
      await respond.info(`No members in this server currently hold ${mentionRole(targetRole, guild)}.`);
      return;
    }

    const statusMsg = await respond.send(
      `> Purging ${mentionRole(targetRole, guild)} from **${membersWithRole.length}** member(s)...`
    );

    let removed = 0;
    let failed = 0;

    for (const m of membersWithRole) {
      try {
        await m.roles.remove(targetRole, `Purgerole requested by ${member.user.tag}`);
        removed++;
      } catch {
        failed++;
      }
    }

    logAuditAction({
      guild,
      action: 'Role Purged',
      executor: member,
      details: `• **Role:** \`${targetRole.name}\` (${targetRole.id})\n• **Members Stripped:** ${removed} (Failed: ${failed})`,
    });

    logEvent('info', 'command_execution', `Purged role ${targetRole.name} from ${removed} members`);

    if (failed === 0) {
      await statusMsg.edit({
        content: `Successfully purged ${mentionRole(targetRole, guild)} from all **${removed}** member(s).`,
      }).catch(() => {});
    } else {
      await statusMsg.edit({
        content: `Purged ${mentionRole(targetRole, guild)} from **${removed}** member(s) (${failed} failed).`,
      }).catch(() => {});
    }
  },
});

