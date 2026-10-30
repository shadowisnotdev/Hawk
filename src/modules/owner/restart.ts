import { PermissionsBitField } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import { getAuthorityLevel } from '../../core/permissions/PermissionChecker.js';
import { AuthorityLevel } from '../../types/permission.js';
import { closeDb } from '../../core/database/pool.js';
import { stopWebhookLogger } from '../../core/logging/WebhookLogger.js';
import { stopCooldownCleanup } from '../../core/cooldowns/CooldownManager.js';
import { logAuditAction } from '../../core/logging/AuditLogger.js';
import { logEvent } from '../../core/logging/WebhookLogger.js';

export default defineCommand({
  name: 'restart',
  aliases: ['reboot', 'shutdown'],
  module: 'owner',
  description: 'Gracefully restart the bot instance (Bot Owner only).',
  usage: 'restart',
  examples: ['restart', 'reboot'],
  ownerOnly: true,
  permissions: [],
  botPermissions: [PermissionsBitField.Flags.SendMessages],
  cooldown: 5,

  async execute(ctx: CommandContext): Promise<void> {
    const { member, guild, message, respond } = ctx;
    const authority = getAuthorityLevel(member.id, guild.ownerId, member);

    if (authority !== AuthorityLevel.Owner) {
      await respond.error('Only **Bot Owners** can restart the bot instance.');
      return;
    }

    const sentMsg = await respond.info('**Restarting bot instance...**');

    // Save restart state to file so bot can edit message upon restarting
    try {
      const state = {
        guildId: guild.id,
        channelId: message.channel.id,
        messageId: sentMsg.id,
        startTime: Date.now(),
        executorId: member.id,
      };
      await fs.writeFile(
        path.join(process.cwd(), '.restart_state.json'),
        JSON.stringify(state, null, 2),
        'utf-8',
      );
    } catch {
      // Non-fatal if file write fails
    }

    logAuditAction({
      guild,
      action: 'Bot Instance Restart Triggered',
      executor: member,
      details: [`• **Triggered in:** #${'name' in message.channel ? message.channel.name : 'Direct Channel'}`],
    });

    logEvent('warning', 'command_execution', `Bot restart triggered by ${member.user.tag}`, {
      executor: member.user.tag,
      executorId: member.id,
      guild: guild.name,
    });

    // Small delay to ensure the response and state file are completed before process terminates
    setTimeout(async () => {
      try {
        stopCooldownCleanup();
        await stopWebhookLogger().catch(() => {});
        await closeDb().catch(() => {});
        message.client.destroy();
      } catch {
        // Safe exit
      } finally {
        process.exit(0);
      }
    }, 1000);
  },
});
