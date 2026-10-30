import { PermissionsBitField } from 'discord.js';
import { defineCommand, type CommandContext } from '../../types/command.js';
import { getJailConfig, jailUser, getJailedUser } from '../../core/database/repositories/jailRepo.js';
import { resolveUser } from '../../core/resolver/UserResolver.js';
import { isMemberManageable } from './roleHelpers.js';
import { mentionUser, mentionRole } from '../../core/utils/formatters.js';
import { logAuditAction } from '../../core/logging/AuditLogger.js';

export default defineCommand({
  name: 'jail',
  aliases: ['quarantine'],
  module: 'moderation',
  description: 'Quarantine a user by stripping their roles and assigning the Jail role.',
  usage: 'jail <@user> [reason]',
  examples: ['jail @BadActor Breaking server rules', 'jail @Spammer'],
  permissions: [PermissionsBitField.Flags.ManageRoles],
  botPermissions: [PermissionsBitField.Flags.ManageRoles],
  cooldown: 3,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, guild, member, respond, replyTarget } = ctx;

    const jailConfig = await getJailConfig(guild.id);
    if (!jailConfig) {
      await respond.error(`The Jail role has not been configured yet. An administrator must run \`${parsed.prefix}setjail <@role>\` first.`);
      return;
    }

    const jailRole = guild.roles.cache.get(jailConfig.jailRoleId);
    if (!jailRole) {
      await respond.error('The configured Jail role no longer exists. Please reconfigure with `setjail`.');
      return;
    }

    const targetQuery = parsed.args[0];
    let reason = parsed.args.slice(1).join(' ').trim() || 'No reason provided';

    let targetMember: any = null;
    if (targetQuery) {
      const uRes = await resolveUser(targetQuery, guild);
      if (uRes.success && uRes.value.member) {
        targetMember = uRes.value.member;
      }
    } else if (replyTarget) {
      targetMember = replyTarget;
      reason = parsed.args.join(' ').trim() || 'No reason provided';
    }

    if (!targetMember) {
      await respond.error(`Please specify a member to jail.\nUsage: \`${parsed.prefix}jail <@user> [reason]\``);
      return;
    }

    if (targetMember.id === member.id) {
      await respond.error('You cannot jail yourself.');
      return;
    }

    if (!isMemberManageable(guild, targetMember, member)) {
      await respond.denied('You cannot jail this member due to role hierarchy.');
      return;
    }

    const alreadyJailed = await getJailedUser(guild.id, targetMember.id);
    if (alreadyJailed) {
      await respond.warning(`${mentionUser(targetMember.id)} is already jailed.`);
      return;
    }

    // Capture non-managed, non-everyone role IDs
    const originalRoleIds = targetMember.roles.cache
      .filter((r: any) => r.id !== guild.id && !r.managed && r.id !== jailRole.id)
      .map((r: any) => r.id);

    try {
      // 1. Save original roles to DB
      await jailUser(guild.id, targetMember.id, originalRoleIds, member.id, reason);

      // 2. Remove previous roles and assign Jail role
      await targetMember.roles.set([jailRole.id], `Jailed by ${member.user.tag}: ${reason}`);

      await respond.success(
        `🚨 Jailed ${mentionUser(targetMember.id)}.\n` +
        `• **Stripped Roles:** ${originalRoleIds.length}\n` +
        `• **Assigned Role:** ${mentionRole(jailRole.id, guild)}\n` +
        `• **Reason:** ${reason}`
      );

      logAuditAction({
        guild,
        action: 'Jail',
        executor: member,
        target: targetMember.user.tag,
        details: [
          `Target: <@${targetMember.id}>`,
          `Stripped Roles: ${originalRoleIds.length}`,
          `Reason: ${reason}`,
        ],
      });
    } catch (err: any) {
      await respond.error(`Failed to jail member: ${err?.message || String(err)}`);
    }
  },
});

