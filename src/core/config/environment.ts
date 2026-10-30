import 'dotenv/config';
import type { EnvironmentConfig } from '../../types/config.js';

function required(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    if (process.env.NODE_ENV === 'test' || process.argv.some(a => a.includes('test'))) {
      if (key === 'BOT_OWNER_ID') return '1021765669185925150,1493322410567401722';
      return `mock_${key.toLowerCase()}`;
    }
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key]?.trim() || fallback;
}

export const env: EnvironmentConfig = {
  botToken: required('BOT_TOKEN'),
  databaseUrl: required('DATABASE_URL'),
  devWebhookUrl: optional('DEV_WEBHOOK_URL', ''),
  mainGuildId: required('MAIN_GUILD_ID'),
  testGuildId: optional('TEST_GUILD_ID', '1493322410567401722'),
  emojiGuildId: optional('EMOJI_GUILD_ID', ''),
  botOwnerId: required('BOT_OWNER_ID').split(',')[0].trim(),
  botOwnerIds: required('BOT_OWNER_ID').split(',').map(id => id.trim()).filter(Boolean),
  botAdminIds: optional('BOT_ADMIN_IDS', '').split(',').map(id => id.trim()).filter(Boolean),
  nodeEnv: (optional('NODE_ENV', 'development') as 'development' | 'production'),
  enabledModules: process.env.ENABLED_MODULES ? process.env.ENABLED_MODULES.split(',').map(m => m.trim()).filter(Boolean) : undefined,
};

export function isDev(): boolean {
  return env.nodeEnv === 'development';
}

export function isProd(): boolean {
  return env.nodeEnv === 'production';
}
