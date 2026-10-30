import type { ButtonInteraction, VoiceState, Message } from 'discord.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import type { DragmeRequest } from './dragme.js';
import { getStateAnyUser, deleteState } from '../../core/interactions/InteractionState.js';
import { mentionUser } from '../../core/utils/formatters.js';
import { consoleLog } from '../../core/logging/ConsoleLogger.js';
import { logEvent } from '../../core/logging/WebhookLogger.js';

interface PendingDragme {
  stateKey: string;
  request: DragmeRequest;
  message: Message;
}

const pendingByTarget = new Map<string, PendingDragme[]>(); // targetId -> PendingDragme[]
const pendingByKey = new Map<string, PendingDragme>(); // stateKey -> PendingDragme

export function registerPendingDragme(stateKey: string, request: DragmeRequest, message: Message): void {
  const item: PendingDragme = { stateKey, request, message };
  pendingByKey.set(stateKey, item);

  const existing = pendingByTarget.get(request.targetId) || [];
  existing.push(item);
  pendingByTarget.set(request.targetId, existing);
}

export function clearPendingDragme(stateKey: string): void {
  const item = pendingByKey.get(stateKey);
  if (!item) return;

  pendingByKey.delete(stateKey);
  const list = pendingByTarget.get(item.request.targetId);
  if (list) {
    const filtered = list.filter((p) => p.stateKey !== stateKey);
    if (filtered.length === 0) {
      pendingByTarget.delete(item.request.targetId);
    } else {
      pendingByTarget.set(item.request.targetId, filtered);
    }
  }
}

export async function handleDragmeVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
  // If user leaves voice before accepting: invalidate prompt and notify author
  if (oldState.channelId && !newState.channelId) {
    const targetId = newState.id;
    const items = pendingByTarget.get(targetId);
    if (!items || items.length === 0) return;

    for (const item of [...items]) {
      clearPendingDragme(item.stateKey);
      deleteState(item.stateKey);
      if (item.request.timeoutId) clearTimeout(item.request.timeoutId);

      try {
        const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`dragme_approve_${item.request.messageId}`)
            .setLabel('Approve')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`dragme_deny_${item.request.messageId}`)
            .setLabel('Target Left Voice')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true),
        );

        await item.message.edit({
          content: `> **Request Invalidated:** ${mentionUser(item.request.targetId)} left their voice channel before responding to the drag request from ${mentionUser(item.request.requesterId)}.`,
          components: [disabledRow],
        });

        setTimeout(() => {
          item.message.delete().catch(() => {});
        }, 7000);
      } catch {
        // Message could be deleted
      }
    }
  }
}

export async function handleDragmeInteraction(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;
  if (interaction.replied || interaction.deferred) return;

  const parts = customId.split('_');
  if (parts.length < 3) {
    await interaction.reply({ content: 'Invalid interaction.', flags: MessageFlags.Ephemeral });
    return;
  }

  const action = parts[1]; // 'approve' or 'deny'
  const originalMessageId = parts.slice(2).join('_');
  const stateKey = `dragme_${originalMessageId}`;

  const request = getStateAnyUser<DragmeRequest>(stateKey);
  if (!request) {
    await interaction.reply({ content: 'This request has expired or was invalidated.', flags: MessageFlags.Ephemeral });
    return;
  }

  // SECURITY: Only the target user can interact
  if (interaction.user.id !== request.targetId) {
    await interaction.reply({ content: 'Only the requested user can respond to this.', flags: MessageFlags.Ephemeral });
    return;
  }

  clearPendingDragme(stateKey);
  deleteState(stateKey);
  if (request.timeoutId) clearTimeout(request.timeoutId);

  if (action === 'deny') {
    const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`dragme_approve_${originalMessageId}`)
        .setLabel('Approve')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`dragme_deny_${originalMessageId}`)
        .setLabel('Denied')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true),
    );

    await interaction.update({
      content: `${mentionUser(request.targetId)} denied the drag request from ${mentionUser(request.requesterId)}.`,
      components: [disabledRow],
    });

    setTimeout(() => {
      interaction.message.delete().catch(() => {});
    }, 7000);
    return;
  }

  if (action === 'approve') {
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

    const destVc = targetMember.voice.channel;
    const botMember = guild.members.me;
    if (!botMember || !botMember.permissions.has('MoveMembers')) {
      await interaction.reply({ content: 'I no longer have permission to move members.', flags: MessageFlags.Ephemeral });
      return;
    }

    const movingPermissions = destVc.permissionsFor(requesterMember);
    const botPermissions = destVc.permissionsFor(botMember);
    if (!movingPermissions?.has(['ViewChannel', 'Connect']) || !botPermissions?.has(['ViewChannel', 'Connect', 'MoveMembers'])) {
      await interaction.reply({ content: 'The destination channel does not allow this move.', flags: MessageFlags.Ephemeral });
      return;
    }

    try {
      await requesterMember.voice.setChannel(destVc);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      consoleLog('error', 'command_failure', `dragme: failed to move ${request.requesterId}`, { error: msg });
      await interaction.reply({ content: 'Could not complete the move.', flags: MessageFlags.Ephemeral });
      return;
    }

    const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`dragme_approve_${originalMessageId}`)
        .setLabel('Approved')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`dragme_deny_${originalMessageId}`)
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true),
    );

    await interaction.update({
      content: `${mentionUser(request.targetId)} approved. ${mentionUser(request.requesterId)} has been moved to **${destVc.name}**.`,
      components: [disabledRow],
    });

    setTimeout(() => {
      interaction.message.delete().catch(() => {});
    }, 7000);

    logEvent('info', 'command_execution', `dragme: ${request.requesterId} dragged to ${destVc.name} by ${request.targetId}`);
  }
}
