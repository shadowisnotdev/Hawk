import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type ButtonInteraction,
  type TextChannel,
  type NewsChannel,
  type VoiceChannel,
  type StageChannel,
  type ForumChannel,
} from 'discord.js';
import { ui } from '../../core/ui/index.js';
import { mentionUser } from '../../core/utils/formatters.js';
import { logEvent } from '../../core/logging/WebhookLogger.js';
import { logAuditAction } from '../../core/logging/AuditLogger.js';
import { getAuthorityLevel } from '../../core/permissions/PermissionChecker.js';
import { AuthorityLevel } from '../../types/permission.js';

export function buildNukeConfirmationPayload(channelId: string, authorId: string) {
  const confirmBtn = new ButtonBuilder()
    .setCustomId(`nuke_confirm_${channelId}_${authorId}`)
    .setLabel('Confirm Nuke')
    .setStyle(ButtonStyle.Danger);

  const cancelBtn = new ButtonBuilder()
    .setCustomId(`nuke_cancel_${channelId}_${authorId}`)
    .setLabel('Cancel')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(confirmBtn, cancelBtn);

  return ui.standard({
    title: 'Channel Nuke Confirmation',
    text:
      `Are you sure you want to nuke <#${channelId}>?\n\n` +
      `• **Target Channel:** <#${channelId}>\n` +
      `• **Consequence:** Clones the channel (retaining permissions, topic, and position) and **permanently deletes** all message history.`,
    components: [row],
  });
}

export async function handleNukeInteraction(interaction: ButtonInteraction): Promise<void> {
  const { customId, user, guild, channel } = interaction;
  if (!customId.startsWith('nuke_') || !guild || !channel) return;

  const parts = customId.split('_');
  const action = parts[1]; // 'confirm' or 'cancel'
  const invokerId = parts[3];

  if (user.id !== invokerId) {
    await interaction.reply({
      content: 'Only the command invoker can confirm or cancel this channel nuke request.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const authority = getAuthorityLevel(user.id, guild.ownerId);

  if (authority !== AuthorityLevel.Owner) {
    await interaction.reply({
      content: 'Only configured bot owners are authorized to execute a channel nuke.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === 'cancel') {
    const cancelPayload = ui.standard({
      title: 'Operation Cancelled',
      text: 'The channel nuke request was safely cancelled.',
    });
    await interaction.update(cancelPayload);
    setTimeout(() => {
      interaction.message.delete().catch(() => {});
    }, 5000);
    return;
  }

  if (action === 'confirm') {
    const targetChannel = channel as TextChannel | NewsChannel | VoiceChannel | StageChannel | ForumChannel;

    if (!targetChannel || typeof targetChannel.clone !== 'function') {
      await interaction.update({
        content: 'Failed to nuke channel: invalid or unsupported channel type.',
        components: [],
      });
      return;
    }

    try {
      const position = targetChannel.position;

      const clonedChannel = await targetChannel.clone({
        reason: `Channel nuked by ${user.tag} (${user.id})`,
      });

      await clonedChannel.setPosition(position).catch(() => {});

      const noticePayload = ui.standard({
        title: 'Channel Nuked',
        text:
          `This channel was recreated and cleared by ${mentionUser(user.id)}.\n\n` +
          `• All messages were wiped while retaining channel permissions, topic, and position.`,
      });

      if ('send' in clonedChannel && typeof (clonedChannel as any).send === 'function') {
        const noticeMsg = await (clonedChannel as any).send(noticePayload).catch(() => null);
        if (noticeMsg) {
          setTimeout(() => {
            noticeMsg.delete().catch(() => {});
          }, 10000);
        }
      }

      logAuditAction({
        guild,
        action: 'Channel Nuked (Recreated)',
        executor: interaction.member as any ?? user,
        channelName: clonedChannel.name,
        details: [
          `• **Old Channel ID:** \`${targetChannel.id}\``,
          `• **New Channel ID:** \`${clonedChannel.id}\``,
        ],
      });

      logEvent('info', 'command_execution', `Channel ${targetChannel.name} nuked by ${user.tag}`, {
        administrator: user.tag,
        adminId: user.id,
        guild: guild.name,
        guildId: guild.id,
        oldChannelId: targetChannel.id,
        newChannelId: clonedChannel.id,
      });

      await targetChannel.delete(`Channel nuked by ${user.tag} (${user.id})`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await interaction.followUp({
        content: `Failed to execute channel nuke: ${msg}`,
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  }
}
