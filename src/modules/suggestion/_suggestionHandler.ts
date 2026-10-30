import type {
  ButtonInteraction,
  ModalSubmitInteraction,
  GuildTextBasedChannel,
  MessageReaction,
  User,
  PartialMessageReaction,
  PartialUser,
  Message,
  Client,
} from 'discord.js';
import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
} from 'discord.js';
import {
  getSuggestionChannel,
  getSuggestionConfig,
  setSuggestionPanelMessageId,
  getAllSuggestionConfigs,
  isBlacklisted,
  createSuggestion,
  castVote,
  removeVote,
  getSuggestionByMessageId,
  updateSuggestionMessageId,
} from '../../core/database/repositories/suggestionRepo.js';
import { buildSuggestionPayload, buildSuggestionPanelPayload } from './suggestionUI.js';
import { getEmoji } from '../../core/config/branding.js';
import { logEvent } from '../../core/logging/WebhookLogger.js';
import { consoleLog } from '../../core/logging/ConsoleLogger.js';

const activePanelMessages = new Map<string, string>(); // guildId -> messageId
const suggestionPanelChannels = new Set<string>(); // channelId
const suggestionPanelLocks = new Set<string>(); // channelId

export function registerSuggestionPanelChannel(channelId: string): void {
  suggestionPanelChannels.add(channelId);
}

function toReactableEmoji(emojiStr: string, fallback: string): string {
  if (!emojiStr) return fallback;
  const customMatch = /<a?:[^:]+:(\d+)>/.exec(emojiStr);
  if (customMatch) {
    return customMatch[1];
  }
  return emojiStr;
}

function isEmojiMatch(emoji: { id: string | null; name: string | null }, targetStr: string, fallback: string): boolean {
  const effectiveTarget = targetStr || fallback;
  const customMatch = /<a?:[^:]+:(\d+)>/.exec(effectiveTarget);
  if (customMatch) {
    return emoji.id === customMatch[1];
  }
  return emoji.name === effectiveTarget;
}

export async function handleSuggestionButton(interaction: ButtonInteraction): Promise<void> {
  const { customId, guild, user } = interaction;
  if (!guild || interaction.replied || interaction.deferred) return;

  if (customId === 'suggest_open_modal') {
    if (await isBlacklisted(guild.id, user.id)) {
      await interaction.reply({ content: 'You are blacklisted from submitting suggestions.', flags: MessageFlags.Ephemeral });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId('suggest_modal_submit')
      .setTitle('Submit a Suggestion')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('suggestion_content')
            .setLabel('Your Suggestion')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Type your suggestion here...')
            .setRequired(true)
            .setMaxLength(2000),
        ),
      );

    await interaction.showModal(modal);
  }
}

export async function handleSuggestionModal(interaction: ModalSubmitInteraction): Promise<void> {
  const { customId, guild, user } = interaction;
  if (!guild || interaction.replied || interaction.deferred) return;

  if (customId !== 'suggest_modal_submit') return;

  if (await isBlacklisted(guild.id, user.id)) {
    await interaction.reply({ content: 'You are blacklisted from submitting suggestions.', flags: MessageFlags.Ephemeral });
    return;
  }

  const channelId = await getSuggestionChannel(guild.id);
  if (!channelId) {
    await interaction.reply({ content: 'Suggestions are not configured for this server yet.', flags: MessageFlags.Ephemeral });
    return;
  }

  const targetChannel = (await guild.channels.fetch(channelId).catch(() => null)) as GuildTextBasedChannel | null;
  if (!targetChannel) {
    await interaction.reply({ content: 'Configured suggestion channel no longer exists. Please notify staff.', flags: MessageFlags.Ephemeral });
    return;
  }

  const content = interaction.fields.getTextInputValue('suggestion_content').trim();
  if (!content) {
    await interaction.reply({ content: 'Suggestion content cannot be empty.', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const lockDeadline = Date.now() + 5000;
  while (suggestionPanelLocks.has(channelId)) {
    if (Date.now() >= lockDeadline) {
      await interaction.editReply({ content: 'This channel is busy. Please try again shortly.' });
      return;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  suggestionPanelLocks.add(channelId);

  try {
    // 1. Delete previous panel message
    const config = await getSuggestionConfig(guild.id);
    if (config && config.panelMessageId) {
      const prevMsg = await targetChannel.messages.fetch(config.panelMessageId).catch(() => null);
      if (prevMsg) {
        await prevMsg.delete().catch(() => {});
      }
    }

    // 2. Create DB record with sequential number
    const dummyMsgId = 'pending_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const suggestion = await createSuggestion(guild.id, user.id, content, targetChannel.id, dummyMsgId);

    // 3. Post user's suggestion message (Components V2 Container)
    const v2Payload = buildSuggestionPayload(suggestion, user.username);
    const suggestionMsg = await targetChannel.send(v2Payload);

    // Update DB record with real message ID
    try {
      await updateSuggestionMessageId(suggestion.id, suggestionMsg.id);
      suggestion.messageId = suggestionMsg.id;
    } catch (error) {
      consoleLog('error', 'database', `Failed to update suggestion message_id: ${error}`);
    }

    // 4. Add initial upvote/downvote reactions to suggestion message
    const upEmoji = toReactableEmoji(getEmoji('upvote'), '⬆️');
    const downEmoji = toReactableEmoji(getEmoji('downvote'), '⬇️');

    await suggestionMsg.react(upEmoji).catch(() => {});
    await suggestionMsg.react(downEmoji).catch(() => {});

    // 5. Post NEW panel message below the suggestion
    const panelPayload = buildSuggestionPanelPayload();
    const newPanelMsg = await targetChannel.send(panelPayload);

    // 6. Track new panel message ID in DB and memory
    activePanelMessages.set(guild.id, newPanelMsg.id);
    await setSuggestionPanelMessageId(guild.id, newPanelMsg.id);

    await interaction.editReply({ content: `Your suggestion **#${suggestion.number}** has been submitted to ${targetChannel}.` });

    logEvent('info', 'command_execution', `Suggestion #${suggestion.number} submitted by ${user.tag}`, {
      user: user.tag,
      userId: user.id,
      guild: guild.name,
      guildId: guild.id,
      number: suggestion.number,
      content,
      channelId: targetChannel.id,
      messageId: suggestionMsg.id,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    consoleLog('error', 'command_failure', `Failed to process suggestion modal for ${user.id}`, { error: msg });
    await interaction.editReply({ content: 'Failed to submit suggestion. Please try again later.' });
  } finally {
    suggestionPanelLocks.delete(channelId);
  }
}

export async function handleSuggestionReactionAdd(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
): Promise<void> {
  if (reaction.partial) {
    try { await reaction.fetch(); } catch { return; }
  }
  if (user.partial) {
    try { await user.fetch(); } catch { return; }
  }

  if (user.bot) return;
  if (!reaction.message.guild) return;

  const guildId = reaction.message.guild.id;
  const messageId = reaction.message.id;

  const suggestion = await getSuggestionByMessageId(guildId, messageId);
  if (!suggestion) return;

  const upEmojiRaw = getEmoji('upvote');
  const downEmojiRaw = getEmoji('downvote');

  const isUp = isEmojiMatch(reaction.emoji, upEmojiRaw, '⬆️');
  const isDown = isEmojiMatch(reaction.emoji, downEmojiRaw, '⬇️');

  if (!isUp && !isDown) return;

  const voteType = isUp ? 'up' : 'down';
  const result = await castVote(guildId, suggestion.id, user.id, voteType);

  if (result.previousVote && result.previousVote !== voteType) {
    const oldEmojiRaw = result.previousVote === 'up' ? upEmojiRaw : downEmojiRaw;
    const oldFallback = result.previousVote === 'up' ? '⬆️' : '⬇️';

    const oldReaction = reaction.message.reactions.cache.find(r => isEmojiMatch(r.emoji, oldEmojiRaw, oldFallback));
    if (oldReaction) {
      await oldReaction.users.remove(user.id).catch(() => {});
    }
  }

  logEvent('info', 'command_execution', `Suggestion #${suggestion.number} reaction vote (${voteType}) by ${user.tag}`, {
    user: user.tag,
    userId: user.id,
    guild: reaction.message.guild.name,
    guildId: reaction.message.guild.id,
    suggestionId: suggestion.id,
    number: suggestion.number,
    voteType,
    upvotes: result.counts.upvotes,
    downvotes: result.counts.downvotes,
  });
}

export async function handleSuggestionReactionRemove(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
): Promise<void> {
  if (reaction.partial) {
    try { await reaction.fetch(); } catch { return; }
  }
  if (user.partial) {
    try { await user.fetch(); } catch { return; }
  }

  if (user.bot) return;
  if (!reaction.message.guild) return;

  const guildId = reaction.message.guild.id;
  const messageId = reaction.message.id;

  const suggestion = await getSuggestionByMessageId(guildId, messageId);
  if (!suggestion) return;

  const upEmojiRaw = getEmoji('upvote');
  const downEmojiRaw = getEmoji('downvote');

  const isUp = isEmojiMatch(reaction.emoji, upEmojiRaw, '⬆️');
  const isDown = isEmojiMatch(reaction.emoji, downEmojiRaw, '⬇️');

  if (!isUp && !isDown) return;

  await removeVote(guildId, suggestion.id, user.id);
}

export async function handleSuggestionPanelResurface(_message: Message): Promise<void> {
  // Automatic resurfacing disabled per simple modal submission replacement flow
}

export async function initializeSuggestionPanels(client: Client): Promise<void> {
  try {
    const configs = await getAllSuggestionConfigs();
    suggestionPanelChannels.clear();
    for (const conf of configs) {
      if (!conf.channelId) continue;
      suggestionPanelChannels.add(conf.channelId);
      const channel = (await client.channels.fetch(conf.channelId).catch(() => null)) as GuildTextBasedChannel | null;
      if (!channel) continue;

      let validMessageExists = false;
      if (conf.panelMessageId) {
        const existingMsg = await channel.messages.fetch(conf.panelMessageId).catch(() => null);
        if (existingMsg) {
          validMessageExists = true;
          activePanelMessages.set(conf.guildId, existingMsg.id);
        }
      }

      if (!validMessageExists) {
        const payload = buildSuggestionPanelPayload();
        const newMsg = await channel.send(payload);
        activePanelMessages.set(conf.guildId, newMsg.id);
        await setSuggestionPanelMessageId(conf.guildId, newMsg.id);
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    consoleLog('error', 'startup', 'Failed to initialize suggestion panels on startup', { error: msg });
  }
}
