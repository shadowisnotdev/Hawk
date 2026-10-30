import type { ButtonInteraction } from 'discord.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import type { RmvRequest } from './rmv.js';
import { getStateAnyUser, deleteState } from '../../core/interactions/InteractionState.js';
import { mentionUser } from '../../core/utils/formatters.js';
import { consoleLog } from '../../core/logging/ConsoleLogger.js';
import { logEvent } from '../../core/logging/WebhookLogger.js';

export async function handleRmvInteraction(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;
  if (interaction.replied || interaction.deferred) return;

  // Extract the original message ID from the custom ID
  // Format: rmv_approve_{messageId} or rmv_deny_{messageId}
  const parts = customId.split('_');
  if (parts.length < 3) {
    await interaction.reply({ content: 'Invalid interaction.', flags: MessageFlags.Ephemeral });
    return;
  }

  const action = parts[1]; // 'approve' or 'deny'
  const originalMessageId = parts.slice(2).join('_');
  const stateKey = `rmv_${originalMessageId}`;

  // Retrieve the request state
  const request = getStateAnyUser<RmvRequest>(stateKey);
  if (!request) {
    await interaction.reply({ content: 'This request has expired.', flags: MessageFlags.Ephemeral });
    return;
  }

  // SECURITY: Only the target user can interact
  if (interaction.user.id !== request.targetId) {
    await interaction.reply({ content: 'Only the requested user can respond to this.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (action === 'deny') {
    deleteState(stateKey);
    if (request.timeoutId) clearTimeout(request.timeoutId);

    // Disable buttons
    const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`rmv_approve_${originalMessageId}`)
        .setLabel('Approve')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`rmv_deny_${originalMessageId}`)
        .setLabel('Denied')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true),
    );

    await interaction.update({
      content: `${mentionUser(request.targetId)} denied the move request from ${mentionUser(request.requesterId)}.`,
      components: [disabledRow],
    });

    // Auto-clean resolved request message after 7s timeout
    setTimeout(() => {
      interaction.message.delete().catch(() => {});
    }, 7000);
    return;
  }

  if (action === 'approve') {
    deleteState(stateKey);
    if (request.timeoutId) clearTimeout(request.timeoutId);

    // Re-validate all conditions
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: 'Could not resolve the server.', flags: MessageFlags.Ephemeral });
      return;
    }

    let requesterMember;
    let targetMember;
    try {
      requesterMember = await guild.members.fetch(request.requesterId);
      targetMember = await guild.members.fetch(request.targetId);
    } catch {
      await interaction.reply({ content: 'Could not find one or both users.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (!requesterMember.voice.channel) {
      await interaction.reply({ content: `${mentionUser(request.requesterId)} is no longer in a voice channel.`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (!targetMember.voice.channel) {
      await interaction.reply({ content: 'You are no longer in a voice channel.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (requesterMember.voice.channelId === targetMember.voice.channelId) {
      await interaction.reply({ content: 'You are already in the same voice channel.', flags: MessageFlags.Ephemeral });
      return;
    }

    const destVc = requesterMember.voice.channel;

    // Check bot has permissions
    const botMember = guild.members.me;
    if (!botMember || !botMember.permissions.has('MoveMembers')) {
      await interaction.reply({ content: 'I no longer have permission to move members.', flags: MessageFlags.Ephemeral });
      return;
    }

    const movingPermissions = destVc.permissionsFor(targetMember);
    const botPermissions = destVc.permissionsFor(botMember);
    if (!movingPermissions?.has(['ViewChannel', 'Connect']) || !botPermissions?.has(['ViewChannel', 'Connect', 'MoveMembers'])) {
      await interaction.reply({ content: 'The destination channel does not allow this move. Check member access and bot voice permissions.', flags: MessageFlags.Ephemeral });
      return;
    }

    try {
      await targetMember.voice.setChannel(destVc);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      consoleLog('error', 'command_failure', `rmv: failed to move ${request.targetId}`, { error: msg });
      await interaction.reply({ content: 'Could not complete the move.', flags: MessageFlags.Ephemeral });
      return;
    }

    // Disable buttons and update
    const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`rmv_approve_${originalMessageId}`)
        .setLabel('Approved')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`rmv_deny_${originalMessageId}`)
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true),
    );

    await interaction.update({
      content: `${mentionUser(request.targetId)} approved. ${mentionUser(request.targetId)} has been moved to **${destVc.name}**.`,
      components: [disabledRow],
    });

    // Auto-clean resolved request message after 7s timeout
    setTimeout(() => {
      interaction.message.delete().catch(() => {});
    }, 7000);

    logEvent('info', 'command_execution', `rmv: ${request.targetId} moved to ${destVc.name} by request of ${request.requesterId}`, {
      requester: request.requesterId,
      target: request.targetId,
      channel: destVc.name,
      guild: guild.id,
    });
  }
}
