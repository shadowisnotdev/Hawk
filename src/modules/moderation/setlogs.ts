import { PermissionsBitField } from 'discord.js';
import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import { resolveChannel } from '../../core/resolver/ChannelResolver.js';
import { getLogChannel, setLogChannel } from '../../core/database/repositories/guildConfigRepo.js';
import { mentionChannel } from '../../core/utils/formatters.js';
import { logEvent } from '../../core/logging/WebhookLogger.js';

export default defineCommand({
  name: 'setlogs',
  aliases: ['logchannel', 'auditlog', 'setauditlog', 'setlog'],
  module: 'moderation',
  description: 'Set or disable the server audit log channel for moderation and bot actions.',
  usage: 'setlogs <#channel|off|status>',
  examples: ['setlogs #mod-logs', 'setlogs off', 'setlogs status'],
  permissions: [PermissionsBitField.Flags.ManageGuild],
  botPermissions: [PermissionsBitField.Flags.SendMessages],
  cooldown: 3,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, guild, member, respond } = ctx;

    try {
      if (parsed.args.length === 0 || parsed.args[0].toLowerCase() === 'status') {
        const currentLogId = await getLogChannel(guild.id);
        if (currentLogId) {
          await respond.info(`Server audit logging is currently **enabled** in ${mentionChannel(currentLogId)}.`);
        } else {
          await respond.info(`Server audit logging is currently **disabled**. Use \`${parsed.prefix}setlogs <#channel>\` to set a log channel.`);
        }
        return;
      }

      const sub = parsed.args[0].toLowerCase();
      if (sub === 'off' || sub === 'disable' || sub === 'none' || sub === 'remove') {
        await setLogChannel(guild.id, null);
        await respond.success('Server audit logging has been **disabled**.');
        logEvent('info', 'command_execution', `Audit log disabled by ${member.user.tag}`, {
          guild: guild.name,
          executor: member.user.tag,
        });
        return;
      }

      const chanRes = resolveChannel(parsed.args[0], guild);
      if (!chanRes.success) {
        await respond.error(`Channel: ${chanRes.error}`);
        return;
      }

      const targetChannel = chanRes.value.channel;
      if (!targetChannel.isTextBased()) {
        await respond.error('The log channel must be a text-based channel.');
        return;
      }

      await setLogChannel(guild.id, targetChannel.id);
      await respond.success(`Server audit logging configured to ${mentionChannel(targetChannel.id)}.`);

      logEvent('info', 'command_execution', `Audit log channel set to ${targetChannel.name} by ${member.user.tag}`, {
        guild: guild.name,
        executor: member.user.tag,
        channel: targetChannel.name,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await respond.error(`Failed to configure audit logs: ${msg}`);
    }
  },
});
