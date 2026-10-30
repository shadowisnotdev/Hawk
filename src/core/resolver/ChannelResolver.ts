import type { Guild } from 'discord.js';
import { ChannelType } from 'discord.js';
import type { ResolvedChannel, ResolutionResult } from '../../types/resolver.js';
import { isSnowflake } from '../utils/validators.js';
import { layeredMatch } from './LayeredMatcher.js';
import type { MatchItem } from './LayeredMatcher.js';

interface ChannelItem extends MatchItem {
  id: string;
  name: string;
}

export function resolveChannel(input: string, guild: Guild): ResolutionResult<ResolvedChannel> {
  const trimmed = input.trim();
  if (!trimmed) return { success: false, error: 'No channel specified.' };

  // Mention or snowflake ID
  const mentionMatch = /^<#(\d{17,20})>$/.exec(trimmed);
  const idInput = mentionMatch ? mentionMatch[1] : trimmed;

  if (isSnowflake(idInput)) {
    const channel = guild.channels.cache.get(idInput);
    if (channel && channel.type !== ChannelType.GuildCategory) {
      return { success: true, value: { id: channel.id, name: channel.name, channel } };
    }
    return { success: false, error: `Could not find channel with ID \`${idInput}\`.` };
  }

  // Collect non-category channels
  const channels: ChannelItem[] = [];
  for (const [id, channel] of guild.channels.cache) {
    if (channel.type !== ChannelType.GuildCategory) {
      channels.push({ id, name: channel.name });
    }
  }

  if (channels.length === 0) {
    return { success: false, error: 'This server has no channels.' };
  }

  const result = layeredMatch(channels, trimmed);

  switch (result.outcome) {
    case 'resolved': {
      const ch = guild.channels.cache.get(result.item.id);
      if (!ch || ch.type === ChannelType.GuildCategory) {
        return { success: false, error: `Could not find a channel matching \`${trimmed}\`.` };
      }
      return { success: true, value: { id: ch.id, name: ch.name, channel: ch } };
    }

    case 'ambiguous': {
      const list = result.candidates
        .slice(0, 5)
        .map(c => `• ${c.name}`)
        .join('\n');
      return {
        success: false,
        error: `Multiple channels match \`${trimmed}\`. Please be more specific:\n${list}`,
      };
    }

    case 'not_found':
      return { success: false, error: `Could not find a channel matching \`${trimmed}\`.` };
  }
}
