import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { Message } from 'discord.js';
import type { SuggestionRecord } from '../../types/suggestion.js';
import { ui, type ComponentV2Payload } from '../../core/ui/index.js';
import { getSuggestionByNumber, getSuggestionByMessageId } from '../../core/database/repositories/suggestionRepo.js';

import { formatUser } from '../../core/utils/formatters.js';


export function buildSuggestionPayload(
  suggestion: SuggestionRecord,
  authorTag?: string,
  reason?: string,
): ComponentV2Payload {
  const authorDisplay = authorTag ? `**${authorTag}**` : formatUser(suggestion.authorId);

  let statusHeader = `Suggestion #${suggestion.number}`;
  if (suggestion.status === 'accepted') {
    statusHeader += ' · Accepted';
  } else if (suggestion.status === 'considered') {
    statusHeader += ' · Under Consideration';
  } else if (suggestion.status === 'denied') {
    statusHeader += ' · Denied';
  }

  const sections: string[] = [
    suggestion.content,
    `Suggested by ${authorDisplay}`,
  ];

  if (suggestion.status !== 'pending') {
    let statusNote = `**Status:** ${suggestion.status.toUpperCase()}`;
    if (reason) {
      statusNote += `\n**Reason:** ${reason}`;
    }
    sections.push(statusNote);
  }

  return ui.standard({
    title: statusHeader,
    sections,
  });
}

export function buildSuggestionPanelPayload(): ComponentV2Payload {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('suggest_open_modal')
      .setLabel('Submit Suggestion')
      .setStyle(ButtonStyle.Secondary),
  );

  return ui.standard({
    title: 'Server Suggestions',
    text: 'Have feedback or an idea for the server? Tap the button below to submit a suggestion.',
    components: [row],
  });
}

export async function resolveSuggestionTarget(
  input: string,
  guildId: string,
  message?: Message,
): Promise<SuggestionRecord | null> {
  // 1. Message Reply Reference
  if (message?.reference?.messageId) {
    const byRef = await getSuggestionByMessageId(guildId, message.reference.messageId);
    if (byRef) return byRef;
  }

  const cleanInput = input ? input.trim() : '';
  if (!cleanInput) return null;

  // 2. Message URL: https://discord.com/channels/guildId/channelId/messageId
  const urlMatch = /\/channels\/\d+\/\d+\/(\d{17,20})$/.exec(cleanInput);
  if (urlMatch) {
    return await getSuggestionByMessageId(guildId, urlMatch[1]);
  }

  // 3. Suggestion number: #42 or 42
  const numMatch = /^#?(\d{1,6})$/.exec(cleanInput);
  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    const byNum = await getSuggestionByNumber(guildId, num);
    if (byNum) return byNum;
  }

  // 4. Raw Snowflake Message ID: 123456789012345678
  if (/^\d{17,20}$/.test(cleanInput)) {
    return await getSuggestionByMessageId(guildId, cleanInput);
  }

  return null;
}
