export interface StickyRecord {
  id: number;
  guildId: string;
  channelId: string;
  messageId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SetStickyInput {
  guildId: string;
  channelId: string;
  messageId: string;
  content: string;
}
