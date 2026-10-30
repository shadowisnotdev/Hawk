import type { Message, PartialMessage } from 'discord.js';

export interface SnipeData {
  id?: string;
  content: string;
  authorTag: string;
  authorId: string;
  authorAvatar?: string;
  channelId: string;
  attachments: string[];
  deletedAt: Date;
}

export interface EditSnipeData {
  oldContent: string;
  newContent: string;
  authorTag: string;
  authorId: string;
  authorAvatar?: string;
  channelId: string;
  attachments: string[];
  editedAt: Date;
}

const SNIPE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours sliding-window circular buffer
const MAX_SNIPES_PER_CHANNEL = 50;        // Memory-capped up to 50 recent deleted messages per channel
const MAX_CHANNELS = 300;                 // Limit channel buckets in memory

const snipeCache = new Map<string, SnipeData[]>();
const editSnipeCache = new Map<string, EditSnipeData[]>();

/**
 * Filter out entries older than 30 minutes
 */
function pruneExpiredEntries<T extends { deletedAt?: Date; editedAt?: Date }>(entries: T[]): T[] {
  const now = Date.now();
  return entries.filter(e => {
    const timestamp = e.deletedAt?.getTime() ?? e.editedAt?.getTime() ?? 0;
    return now - timestamp <= SNIPE_TTL_MS;
  });
}

// Background cleanup interval running every 5 minutes to keep RAM & CPU near zero
setInterval(() => {
  const now = Date.now();

  for (const [channelId, entries] of snipeCache.entries()) {
    const valid = entries.filter(e => now - e.deletedAt.getTime() <= SNIPE_TTL_MS);
    if (valid.length === 0) {
      snipeCache.delete(channelId);
    } else if (valid.length !== entries.length) {
      snipeCache.set(channelId, valid);
    }
  }

  for (const [channelId, entries] of editSnipeCache.entries()) {
    const valid = entries.filter(e => now - e.editedAt.getTime() <= SNIPE_TTL_MS);
    if (valid.length === 0) {
      editSnipeCache.delete(channelId);
    } else if (valid.length !== entries.length) {
      editSnipeCache.set(channelId, valid);
    }
  }
}, 5 * 60 * 1000).unref();

export function recordDeletedMessage(message: Message | PartialMessage): void {
  // Only humans — strictly ignore bots and system accounts
  if (message.author?.bot || message.author?.system) return;
  if (!message.guild || !message.channel) return;

  const content = message.content || (message.attachments && message.attachments.size > 0 ? '[Attachment Only]' : '');
  const attachments = message.attachments ? Array.from(message.attachments.values()).map(a => a.url) : [];

  if (!content && attachments.length === 0) return;

  const channelId = message.channel.id;
  const existing = pruneExpiredEntries(snipeCache.get(channelId) ?? []);

  const newEntry: SnipeData = {
    id: message.id,
    content,
    authorTag: message.author?.tag ?? 'Unknown User',
    authorId: message.author?.id ?? '0',
    authorAvatar: message.author?.displayAvatarURL(),
    channelId,
    attachments,
    deletedAt: new Date(),
  };

  const updated = [newEntry, ...existing].slice(0, MAX_SNIPES_PER_CHANNEL);

  if (snipeCache.size >= MAX_CHANNELS && !snipeCache.has(channelId)) {
    const firstKey = snipeCache.keys().next().value;
    if (firstKey !== undefined) snipeCache.delete(firstKey);
  }

  snipeCache.set(channelId, updated);
}

export function recordEditedMessage(oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage): void {
  // Only humans
  if (newMessage.author?.bot || newMessage.author?.system) return;
  if (!newMessage.guild || !newMessage.channel) return;

  const oldContent = oldMessage.content || '';
  const newContent = newMessage.content || '';

  // Only record if text content changed
  if (!oldContent && !newContent) return;
  if (oldContent === newContent) return;

  const attachments = newMessage.attachments ? Array.from(newMessage.attachments.values()).map(a => a.url) : [];
  const channelId = newMessage.channel.id;
  const existing = pruneExpiredEntries(editSnipeCache.get(channelId) ?? []);

  const newEntry: EditSnipeData = {
    oldContent: oldContent || '[No Previous Text]',
    newContent: newContent || '[No New Text]',
    authorTag: newMessage.author?.tag ?? 'Unknown User',
    authorId: newMessage.author?.id ?? '0',
    authorAvatar: newMessage.author?.displayAvatarURL(),
    channelId,
    attachments,
    editedAt: new Date(),
  };

  const updated = [newEntry, ...existing].slice(0, MAX_SNIPES_PER_CHANNEL);

  if (editSnipeCache.size >= MAX_CHANNELS && !editSnipeCache.has(channelId)) {
    const firstKey = editSnipeCache.keys().next().value;
    if (firstKey !== undefined) editSnipeCache.delete(firstKey);
  }

  editSnipeCache.set(channelId, updated);
}

export function getSnipes(channelId: string): SnipeData[] {
  const entries = snipeCache.get(channelId);
  if (!entries || entries.length === 0) return [];
  const valid = pruneExpiredEntries(entries);
  if (valid.length !== entries.length) {
    if (valid.length === 0) snipeCache.delete(channelId);
    else snipeCache.set(channelId, valid);
  }
  return valid;
}

export function getSnipe(channelId: string, index = 1): SnipeData | null {
  const list = getSnipes(channelId);
  if (list.length === 0) return null;
  const targetIndex = Math.max(1, index) - 1;
  return list[targetIndex] ?? null;
}

export function getEditSnipes(channelId: string): EditSnipeData[] {
  const entries = editSnipeCache.get(channelId);
  if (!entries || entries.length === 0) return [];
  const valid = pruneExpiredEntries(entries);
  if (valid.length !== entries.length) {
    if (valid.length === 0) editSnipeCache.delete(channelId);
    else editSnipeCache.set(channelId, valid);
  }
  return valid;
}

export function getEditSnipe(channelId: string, index = 1): EditSnipeData | null {
  const list = getEditSnipes(channelId);
  if (list.length === 0) return null;
  const targetIndex = Math.max(1, index) - 1;
  return list[targetIndex] ?? null;
}

export function clearChannelSnipe(channelId: string): boolean {
  const hadSnipe = snipeCache.delete(channelId);
  const hadEditSnipe = editSnipeCache.delete(channelId);
  return hadSnipe || hadEditSnipe;
}

export function clearSnipeCache(): void {
  snipeCache.clear();
  editSnipeCache.clear();
}
