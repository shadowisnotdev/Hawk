import type { BrandingConfig } from '../../types/config.js';

const UNICODE_FALLBACKS: Record<string, string> = {
  success: '',
  error: '',
  warning: '',
  info: '',
  denied: '',
};

export const branding: BrandingConfig = {
  footerText: 'Hawk | 2026',
  defaultColor: 0x1e1f22,
  emojis: {
    success: '',
    error: '',
    warning: '',
    info: '',
    loading: '',
    denied: '',
    upvote: '',
    downvote: '',
    accepted: '',
    considered: '',
    voice: '',
    gaming: '',
    suggestion: '',
    sticky: '',
    moderation: '',
    welcome: '',
    media: '',
    general: '',
    owner: '',
    specials: '',
    AFK_SUCCESS: '',
    AFK_WELCOME_BACK: '',
    AFK_NOTICE: '',
  },
};

export function getEmoji(key: string): string {
  if (key === 'AFK_SUCCESS') {
    return branding.emojis.AFK_SUCCESS ?? branding.emojis.success ?? '';
  }
  if (key === 'AFK_WELCOME_BACK') {
    return branding.emojis.AFK_WELCOME_BACK ?? '';
  }
  if (key === 'AFK_NOTICE') {
    return branding.emojis.AFK_NOTICE ?? '';
  }
  const custom = branding.emojis[key];
  if (custom) return custom;

  // Dynamic fallback: resolve by name from client.emojis.cache across mutual guilds
  const client = (globalThis as any).hawkClient;
  if (client?.emojis?.cache) {
    const found = client.emojis.cache.find((e: any) => e.name?.toLowerCase() === key.toLowerCase());
    if (found) {
      return found.toString();
    }
  }

  return UNICODE_FALLBACKS[key] ?? '';
}

export function toReactableEmoji(emojiStr: string, fallback = ''): string {
  if (!emojiStr) return fallback;
  const match = /^<a?:[^:]+:(\d+)>$/.exec(emojiStr);
  if (match) {
    return match[1];
  }
  return emojiStr || fallback;
}
