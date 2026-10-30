export interface EnvironmentConfig {
  botToken: string;
  databaseUrl: string;
  devWebhookUrl: string;
  mainGuildId: string;
  testGuildId: string;
  emojiGuildId: string;
  botOwnerId: string;
  botOwnerIds: string[];
  botAdminIds: string[];
  nodeEnv: 'development' | 'production';
  enabledModules?: string[];
}

export interface GuildConfig {
  guildId: string;
  prefix: string;
  logChannelId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BrandingConfig {
  footerText: string;
  defaultColor: number;
  emojis: EmojiConfig;
}

export interface EmojiConfig {
  success: string;
  error: string;
  warning: string;
  info: string;
  loading: string;
  denied: string;
  upvote: string;
  downvote: string;
  accepted: string;
  considered: string;
  voice: string;
  gaming: string;
  suggestion: string;
  sticky: string;
  moderation: string;
  welcome: string;
  media: string;
  general: string;
  owner: string;
  [key: string]: string;
}

// ── Module Definition ───────────────────────────────────────

export interface ModuleDefinition {
  name: string;
  description: string;
  enabled: boolean;
}
