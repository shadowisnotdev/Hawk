import type { Guild, VoiceBasedChannel } from 'discord.js';
import { ChannelType } from 'discord.js';
import type { ResolutionResult } from '../../types/resolver.js';
import { isSnowflake } from '../utils/validators.js';
import { layeredMatch } from './LayeredMatcher.js';
import type { MatchItem } from './LayeredMatcher.js';

export interface ResolvedVoiceChannel {
  id: string;
  name: string;
  channel: VoiceBasedChannel;
}

const VOICE_TYPES = new Set([ChannelType.GuildVoice, ChannelType.GuildStageVoice]);

interface VoiceChannelItem extends MatchItem {
  id: string;
  name: string;
}

/**
 * Resolves a voice/stage channel from user input.
 *
 * Resolution order:
 *  0. Channel mention (<#ID>)
 *  1. Exact snowflake ID
 *  2-6. Layered matcher: exact name → starts-with → word-prefix → word-contains → normalized → fuzzy
 *
 * Only considers GuildVoice and GuildStageVoice channels.
 */
export function resolveVoiceChannel(input: string, guild: Guild): ResolutionResult<ResolvedVoiceChannel> {
  const trimmed = input.trim();
  if (!trimmed) return { success: false, error: 'No voice channel specified.' };

  // 0/1. Channel mention or snowflake ID
  const mentionMatch = /^<#(\d{17,20})>$/.exec(trimmed);
  const idInput = mentionMatch ? mentionMatch[1] : trimmed;

  if (isSnowflake(idInput)) {
    const channel = guild.channels.cache.get(idInput);
    if (channel && VOICE_TYPES.has(channel.type)) {
      const vc = channel as VoiceBasedChannel;
      return { success: true, value: { id: vc.id, name: vc.name, channel: vc } };
    }
    return { success: false, error: `Could not find voice channel with ID \`${idInput}\`.` };
  }

  // Collect voice/stage channels for matching
  const voiceChannels: VoiceChannelItem[] = [];
  for (const [id, channel] of guild.channels.cache) {
    if (VOICE_TYPES.has(channel.type)) {
      voiceChannels.push({ id, name: channel.name });
    }
  }

  if (voiceChannels.length === 0) {
    return { success: false, error: 'This server has no voice channels.' };
  }

  // 2-6. Layered matching
  const result = layeredMatch(voiceChannels, trimmed);

  switch (result.outcome) {
    case 'resolved': {
      const vc = guild.channels.cache.get(result.item.id) as VoiceBasedChannel | undefined;
      if (!vc) return { success: false, error: `Could not find a voice channel matching \`${trimmed}\`.` };
      return { success: true, value: { id: vc.id, name: vc.name, channel: vc } };
    }

    case 'ambiguous': {
      const list = result.candidates
        .slice(0, 5)
        .map(c => `• ${c.name}`)
        .join('\n');
      return {
        success: false,
        error: `Multiple voice channels match \`${trimmed}\`. Please be more specific:\n${list}`,
      };
    }

    case 'not_found':
      return { success: false, error: `Could not find a voice channel matching \`${trimmed}\`.` };
  }
}
