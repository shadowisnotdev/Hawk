import type { ButtonInteraction, ModalSubmitInteraction } from 'discord.js';
import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
  PermissionsBitField,
} from 'discord.js';
import { getStateAnyUser, deleteState } from '../../core/interactions/InteractionState.js';
import { ui } from '../../core/ui/index.js';
import { consoleLog } from '../../core/logging/ConsoleLogger.js';
import { logEvent } from '../../core/logging/WebhookLogger.js';
import { isSafeMediaUrl } from './steal.js';

export interface StealStateData {
  mediaUrl: string;
  defaultName: string;
  invokerId: string;
  guildId: string;
}

export async function handleStealButton(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;
  if (!customId.startsWith('steal_btn_') || interaction.replied || interaction.deferred) return;

  const parts = customId.split('_'); // ['steal', 'btn', 'emoji'|'sticker', ...stateIdParts]
  const action = parts[2]; // 'emoji' or 'sticker'
  const stateId = parts.slice(3).join('_');

  const state = getStateAnyUser<StealStateData>(`steal_${stateId}`);
  if (!state) {
    await interaction.reply({
      content: 'This steal session has expired. Please run the `steal` command again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.user.id !== state.invokerId) {
    await interaction.reply({
      content: 'Only the user who initiated this steal command can use these controls.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const isEmoji = action === 'emoji';
  const modalCustomId = `steal_modal_${action}_${stateId}`;
  const title = isEmoji ? 'Add as Emoji' : 'Add as Sticker';
  const label = isEmoji ? 'Emoji Name' : 'Sticker Name';
  const placeholder = isEmoji ? 'e.g. happy_cat' : 'e.g. Happy Cat';

  const modal = new ModalBuilder()
    .setCustomId(modalCustomId)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('steal_name_input')
          .setLabel(label)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(placeholder)
          .setValue(state.defaultName.slice(0, 32))
          .setRequired(true)
          .setMinLength(2)
          .setMaxLength(32),
      ),
    );

  await interaction.showModal(modal);
}

export async function handleStealModal(interaction: ModalSubmitInteraction): Promise<void> {
  const customId = interaction.customId;
  if (!customId.startsWith('steal_modal_') || interaction.replied || interaction.deferred) return;

  const parts = customId.split('_'); // ['steal', 'modal', 'emoji'|'sticker', ...stateIdParts]
  const action = parts[2]; // 'emoji' or 'sticker'
  const stateId = parts.slice(3).join('_');
  const fullStateKey = `steal_${stateId}`;

  const state = getStateAnyUser<StealStateData>(fullStateKey);
  if (!state) {
    await interaction.reply({
      content: 'This steal session has expired. Please try again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const rawName = interaction.fields.getTextInputValue('steal_name_input').trim();
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: 'Guild not found.', flags: MessageFlags.Ephemeral });
    return;
  }

  const botMember = guild.members.me;
  if (!botMember || !botMember.permissions.has(PermissionsBitField.Flags.ManageGuildExpressions)) {
    await interaction.reply({
      content: 'I am missing the `Manage Emojis and Stickers` permission in this server.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferUpdate();

  try {
    if (!isSafeMediaUrl(state.mediaUrl)) {
      deleteState(fullStateKey);
      await interaction.editReply({
        content: 'The media URL is invalid or points to a restricted address.',
        components: [],
      });
      return;
    }

    if (action === 'emoji') {
      let cleanName = rawName.replace(/[^a-zA-Z0-9_]/g, '_');
      if (cleanName.length < 2) cleanName = `emoji_${cleanName}`;
      cleanName = cleanName.slice(0, 32);

      const createdEmoji = await guild.emojis.create({
        attachment: state.mediaUrl,
        name: cleanName,
        reason: `Stolen by ${interaction.user.tag}`,
      });

      deleteState(fullStateKey);

      const successPayload = ui.standard({
        title: 'Successfully Added Emoji',
        text: `• Name: \`:${createdEmoji.name}:\`\n• Preview: ${createdEmoji}`,
        components: [],
      });

      await interaction.editReply(successPayload);

      // Auto-delete success notification after 7s
      setTimeout(() => {
        interaction.deleteReply().catch(() => {});
      }, 7000);

      logEvent('info', 'command_execution', `Emoji stolen by ${interaction.user.tag}`, {
        user: interaction.user.tag,
        guild: guild.name,
        emojiName: createdEmoji.name,
        emojiId: createdEmoji.id,
      });
    } else if (action === 'sticker') {
      let cleanName = rawName.slice(0, 30);
      if (cleanName.length < 2) cleanName = `Sticker ${cleanName}`;

      const createdSticker = await guild.stickers.create({
        file: state.mediaUrl,
        name: cleanName,
        tags: cleanName.replace(/\s+/g, ',').slice(0, 200) || 'sticker',
        reason: `Stolen by ${interaction.user.tag}`,
      });

      deleteState(fullStateKey);

      const successPayload = ui.standard({
        title: 'Successfully Added Sticker',
        text: `• Name: **${createdSticker.name}**`,
        components: [],
      });

      await interaction.editReply(successPayload);

      // Auto-delete success notification after 7s
      setTimeout(() => {
        interaction.deleteReply().catch(() => {});
      }, 7000);

      logEvent('info', 'command_execution', `Sticker stolen by ${interaction.user.tag}`, {
        user: interaction.user.tag,
        guild: guild.name,
        stickerName: createdSticker.name,
        stickerId: createdSticker.id,
      });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    consoleLog('error', 'command_failure', `steal: failed to create ${action}`, { error: msg });

    const failPayload = ui.standard({
      title: `Failed to Add ${action.toUpperCase()}`,
      text: msg,
      components: [],
    });

    await interaction.editReply(failPayload).catch(() => {});

    // Auto-delete failure notification after 7s
    setTimeout(() => {
      interaction.deleteReply().catch(() => {});
    }, 7000);
  }
}
