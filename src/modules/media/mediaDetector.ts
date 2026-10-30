import type { Message } from 'discord.js';

const MEDIA_MIME_PREFIXES = ['image/', 'video/'];
const MEDIA_EXTENSIONS_RE = /\.(png|jpg|jpeg|webp|gif|avif|mp4|webm|mov)(\?\S*)?$/i;
const DIRECT_MEDIA_URL_RE = /https?:\/\/\S+\.(png|jpg|jpeg|webp|gif|avif|mp4|webm|mov)(\?\S*)?/i;

export function isMediaMessage(message: Message): boolean {
  // 1. Check attachments for valid media (image, video, GIF)
  if (message.attachments.size > 0) {
    for (const [, attachment] of message.attachments) {
      if (attachment.contentType) {
        if (MEDIA_MIME_PREFIXES.some(prefix => attachment.contentType!.startsWith(prefix))) {
          return true;
        }
      }
      if (attachment.name && MEDIA_EXTENSIONS_RE.test(attachment.name)) {
        return true;
      }
      if (attachment.url && MEDIA_EXTENSIONS_RE.test(attachment.url)) {
        return true;
      }
    }
  }

  // 2. Check text content for direct media URLs
  if (message.content && DIRECT_MEDIA_URL_RE.test(message.content)) {
    return true;
  }

  // 3. Check Discord embeds for image/video media payloads
  if (message.embeds.length > 0) {
    for (const embed of message.embeds) {
      if (embed.image || embed.video || embed.thumbnail) {
        return true;
      }
      const embedType = (embed.data as any).type;
      if (embedType === 'image' || embedType === 'video' || embedType === 'gifv') {
        return true;
      }
    }
  }

  // No valid media found (stickers, custom emojis, text, or plain emojis alone are INVALID)
  return false;
}
