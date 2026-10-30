export interface MediaChannelRecord {
  id: number;
  guildId: string;
  channelId: string;
  createdAt: Date;
}

export interface MediaGuildConfig {
  guildId: string;
  autoThread: boolean;
  updatedAt: Date;
}
