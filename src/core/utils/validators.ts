import type { Guild } from 'discord.js';

const SNOWFLAKE_RE = /^\d{17,20}$/;
const URL_RE = /^https?:\/\/\S+$/i;

export function isSnowflake(value: string): boolean {
  return SNOWFLAKE_RE.test(value);
}

export function isUrl(value: string): boolean {
  return URL_RE.test(value);
}

export function sanitize(text: string, guild?: Guild | null): string {
  if (!text) return text;
  let result = text
    .replace(/@everyone/g, '**everyone**')
    .replace(/@here/g, '**here**');

  result = result.replace(/<@&(\d{17,20})>/g, (_match, roleId) => {
    if (guild && roleId === guild.id) return '`everyone`';
    const role = guild?.roles.cache.get(roleId);
    if (role) return `\`${role.name}\``;

    const client = guild?.client ?? (globalThis as any).hawkClient;
    if (client) {
      for (const g of client.guilds.cache.values()) {
        const r = g.roles.cache.get(roleId);
        if (r) return `\`${r.name}\``;
      }
    }
    return `\`${roleId}\``;
  });

  result = result.replace(/<@!?(\d{17,20})>/g, (_match, userId) => {
    const member = guild?.members.cache.get(userId);
    if (member) return `**${member.displayName}**`;

    const client = guild?.client ?? (globalThis as any).hawkClient;
    const user = client?.users?.cache.get(userId);
    if (user) return `**${user.displayName || user.globalName || user.username}**`;

    return `**${userId}**`;
  });

  return result;
}

export async function sanitizeAsync(text: string, guild?: Guild | null): Promise<string> {
  if (!text) return text;
  let result = text
    .replace(/@everyone/g, '**everyone**')
    .replace(/@here/g, '**here**');

  result = result.replace(/<@&(\d{17,20})>/g, (_match, roleId) => {
    if (guild && roleId === guild.id) return '`everyone`';
    const role = guild?.roles.cache.get(roleId);
    if (role) return `\`${role.name}\``;
    return `\`${roleId}\``;
  });

  const userMatches = Array.from(text.matchAll(/<@!?(\d{17,20})>/g));
  if (userMatches.length > 0 && guild) {
    const userIds = Array.from(new Set(userMatches.map(m => m[1])));
    const nameMap = new Map<string, string>();

    await Promise.all(
      userIds.map(async (userId) => {
        const cached = guild.members.cache.get(userId);
        if (cached) {
          nameMap.set(userId, cached.displayName || cached.user.username);
          return;
        }
        const fetchedMember = await guild.members.fetch(userId).catch(() => null);
        if (fetchedMember) {
          nameMap.set(userId, fetchedMember.displayName || fetchedMember.user.username);
          return;
        }
        const fetchedUser = await guild.client.users.fetch(userId).catch(() => null);
        if (fetchedUser) {
          nameMap.set(userId, fetchedUser.username);
          return;
        }
        nameMap.set(userId, userId);
      })
    );

    result = result.replace(/<@!?(\d{17,20})>/g, (_match, userId) => {
      const name = nameMap.get(userId) || userId;
      return `**${name}**`;
    });
  } else {
    result = result.replace(/<@!?(\d{17,20})>/g, (_match, userId) => {
      const member = guild?.members.cache.get(userId);
      const name = member ? (member.displayName || member.user.username) : userId;
      return `**${name}**`;
    });
  }

  return result;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}
