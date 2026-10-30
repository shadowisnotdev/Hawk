import type { Message } from 'discord.js';
import { isMediaChannel, getMediaAutoThread } from '../../core/database/repositories/mediaRepo.js';
import { isMediaMessage } from './mediaDetector.js';
import { logEvent } from '../../core/logging/WebhookLogger.js';
import { consoleLog } from '../../core/logging/ConsoleLogger.js';

export async function handleMediaFilter(message: Message): Promise<void> {
  if (message.author.bot) return;
  if (!message.guild) return;

  const guildId = message.guild.id;
  const channelId = message.channel.id;

  const configured = await isMediaChannel(guildId, channelId);
  if (!configured) return;

  const isValid = isMediaMessage(message);

  if (!isValid) {
    // Delete invalid message
    await message.delete().catch((err) => {
      const code = err?.code || (err as any)?.rawError?.code;
      if (code === 10008 || String(err?.message || '').includes('Unknown Message')) return;
      consoleLog('warning', 'command_execution', `Failed to delete invalid media message in ${channelId}`, { error: err instanceof Error ? err.message : String(err) });
    });

    logEvent('info', 'command_execution', `Media filter removed non-media message by ${message.author.tag}`, {
      author: message.author.tag,
      authorId: message.author.id,
      guild: message.guild.name,
      guildId: message.guild.id,
      channel: (message.channel as any).name ?? channelId,
      channelId,
      content: message.content,
      attachmentsCount: message.attachments.size,
      stickersCount: message.stickers.size,
      reason: 'No valid image, video, GIF attachment or direct media URL found',
    });
    return;
  }

  // Valid media message -> Check auto-threading
  const autoThread = await getMediaAutoThread(guildId);
  if (autoThread && typeof message.startThread === 'function' && !message.hasThread && !message.channel.isThread()) {
    try {
      await message.startThread({
        name: 'Media Discussion',
        autoArchiveDuration: 1440, // 24 hours
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      consoleLog('warning', 'command_execution', `Failed to auto-create media thread in ${channelId}`, { error: msg });
      logEvent('warning', 'command_execution', `Media thread creation failed in ${channelId}`, { error: msg });
    }
  }
}
