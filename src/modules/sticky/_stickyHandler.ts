import type { Message, GuildTextBasedChannel } from 'discord.js';
import { getSticky, updateStickyMessageId } from '../../core/database/repositories/stickyRepo.js';
import { consoleLog } from '../../core/logging/ConsoleLogger.js';

interface DebounceState {
  timer: NodeJS.Timeout;
  lastMessage: Message;
}

const channelDebounceMap = new Map<string, DebounceState>();
const resurfacingChannels = new Set<string>();

const DEBOUNCE_DELAY_MS = 2500;

async function executeStickyResurface(message: Message): Promise<void> {
  const guildId = message.guild?.id;
  const channelId = message.channel.id;
  if (!guildId) return;

  if (resurfacingChannels.has(channelId)) return;
  resurfacingChannels.add(channelId);

  try {
    const sticky = await getSticky(guildId, channelId);
    if (!sticky) return;

    // Do not resurface if the message is the sticky itself
    if (message.id === sticky.messageId) return;

    const textChannel = message.channel as GuildTextBasedChannel;

    // 1. Delete previous sticky message safely
    try {
      const prevMsg = await textChannel.messages.fetch(sticky.messageId).catch(() => null);
      if (prevMsg) {
        await prevMsg.delete().catch(() => {});
      }
    } catch {
      // Ignore stale message deletion errors
    }

    // 2. Repost sticky message at bottom of channel
    try {
      const newStickyMsg = await textChannel.send({
        content: sticky.content,
        allowedMentions: {
          parse: [],
          roles: [],
          users: [],
        },
      });

      // 3. Update active message ID in database
      await updateStickyMessageId(guildId, channelId, newStickyMsg.id);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      consoleLog('warning', 'command_execution', `Failed to resurface sticky in ${channelId}`, { error: msg });
    }
  } finally {
    resurfacingChannels.delete(channelId);
  }
}

export async function handleStickyResurface(message: Message): Promise<void> {
  if (message.author.bot) return;
  if (!message.guild) return;

  const channelId = message.channel.id;

  // Clear existing debounce timer for this channel
  const existing = channelDebounceMap.get(channelId);
  if (existing) {
    clearTimeout(existing.timer);
  }

  // Schedule delayed execution to smooth high-velocity chat bursts
  const timer = setTimeout(() => {
    channelDebounceMap.delete(channelId);
    executeStickyResurface(message).catch(() => {});
  }, DEBOUNCE_DELAY_MS);

  channelDebounceMap.set(channelId, { timer, lastMessage: message });
}
