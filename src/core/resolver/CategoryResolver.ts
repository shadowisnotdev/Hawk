import type { Guild, CategoryChannel } from 'discord.js';
import { ChannelType } from 'discord.js';
import type { ResolvedCategory, ResolutionResult } from '../../types/resolver.js';
import { isSnowflake } from '../utils/validators.js';
import { layeredMatch } from './LayeredMatcher.js';
import type { MatchItem } from './LayeredMatcher.js';

interface CategoryItem extends MatchItem {
  id: string;
  name: string;
}

export function resolveCategory(input: string, guild: Guild): ResolutionResult<ResolvedCategory> {
  const trimmed = input.trim();
  if (!trimmed) return { success: false, error: 'No category specified.' };

  // Snowflake ID
  if (isSnowflake(trimmed)) {
    const channel = guild.channels.cache.get(trimmed);
    if (channel && channel.type === ChannelType.GuildCategory) {
      const cat = channel as CategoryChannel;
      return { success: true, value: { id: cat.id, name: cat.name, category: cat } };
    }
    return { success: false, error: `Could not find category with ID \`${trimmed}\`.` };
  }

  // Collect categories
  const categories: CategoryItem[] = [];
  for (const [id, channel] of guild.channels.cache) {
    if (channel.type === ChannelType.GuildCategory) {
      categories.push({ id, name: channel.name });
    }
  }

  if (categories.length === 0) {
    return { success: false, error: 'This server has no categories.' };
  }

  const result = layeredMatch(categories, trimmed);

  switch (result.outcome) {
    case 'resolved': {
      const cat = guild.channels.cache.get(result.item.id) as CategoryChannel | undefined;
      if (!cat) return { success: false, error: `Could not find a category matching \`${trimmed}\`.` };
      return { success: true, value: { id: cat.id, name: cat.name, category: cat } };
    }

    case 'ambiguous': {
      const list = result.candidates
        .slice(0, 5)
        .map(c => `• ${c.name}`)
        .join('\n');
      return {
        success: false,
        error: `Multiple categories match \`${trimmed}\`. Please be more specific:\n${list}`,
      };
    }

    case 'not_found':
      return { success: false, error: `Could not find a category matching \`${trimmed}\`.` };
  }
}
