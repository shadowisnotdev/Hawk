import type { Guild, GuildMember, User, BaseMessageOptions } from 'discord.js';
import type { VariableContext } from '../../types/welcome.js';

export function buildVariableContext(guild: Guild, userOrMember: User | GuildMember): VariableContext {
  const user = 'user' in userOrMember ? userOrMember.user : userOrMember;

  const membersArray = guild.members?.cache ? Array.from(guild.members.cache.values()) : [];
  const humanMembers = membersArray.filter(m => !m.user?.bot);
  const humanCount = humanMembers.length || Math.max(1, (guild.memberCount ?? 1) - membersArray.filter(m => m.user?.bot).length);

  const eligibleRandomHumans = humanMembers.filter(m => m.id !== user.id);
  let randomUserMention = `<@${user.id}>`;
  if (eligibleRandomHumans.length > 0) {
    const randomIndex = Math.floor(Math.random() * eligibleRandomHumans.length);
    randomUserMention = `<@${eligibleRandomHumans[randomIndex].id}>`;
  }

  return {
    username: user.username,
    usermention: `<@${user.id}>`,
    usertag: user.tag ?? user.username,
    useravatar: (typeof user.displayAvatarURL === 'function' ? user.displayAvatarURL({ size: 512 }) : null) ?? '',
    servername: guild.name,
    servermember: humanCount,
    serveravatar: (typeof guild.iconURL === 'function' ? guild.iconURL({ size: 512 }) : null) ?? '',
    randomuser: randomUserMention,
  };
}

const VAR_MAP: Record<string, keyof VariableContext> = {
  user: 'usermention',
  username: 'username',
  usermention: 'usermention',
  usertag: 'usertag',
  useravatar: 'useravatar',
  'user.avatar': 'useravatar',
  server: 'servername',
  servername: 'servername',
  'server.name': 'servername',
  servermember: 'servermember',
  servercount: 'servermember',
  'server.count': 'servermember',
  serveravatar: 'serveravatar',
  'server.avatar': 'serveravatar',
  'server.icon': 'serveravatar',
  randomuser: 'randomuser',
};

const VAR_REGEX = /\{(user|username|usermention|usertag|useravatar|user\.avatar|server|servername|server\.name|servermember|servercount|server\.count|serveravatar|server\.avatar|server\.icon|randomuser)\}/gi;

export function substituteVariables(text: string, ctx: VariableContext): string {
  if (!text) return text;
  return text.replace(VAR_REGEX, (match, p1) => {
    const key = VAR_MAP[p1.toLowerCase()];
    if (key && ctx[key] !== undefined) {
      return String(ctx[key]);
    }
    return match;
  });
}

export function renderWelcomePayload(rawPayload: string, ctx: VariableContext): BaseMessageOptions {
  const trimmed = rawPayload.trim();
  let text = trimmed;

  // If previous payload was stored in Discohook/JSON format, extract plain text cleanly
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed.content === 'string' && parsed.content) {
        text = parsed.content;
      } else if (Array.isArray(parsed.embeds) && parsed.embeds.length > 0) {
        const first = parsed.embeds[0];
        const parts = [first.title, first.description].filter(Boolean);
        text = parts.join('\n');
      } else if (parsed.description) {
        text = String(parsed.description);
      }
    } catch {
      // Fallback to raw text
    }
  }

  // Substitute variables in the plain text
  const replacedText = substituteVariables(text, ctx);

  return {
    content: replacedText.slice(0, 2000),
    allowedMentions: {
      parse: ['users'],
      roles: [],
    },
  };
}

export const WELCOME_VARIABLES_GUIDE =
  '**Available Variables:**\n' +
  '• `{user}` / `{usermention}` — Member mention\n' +
  '• `{username}` / `{usertag}` — Member username\n' +
  '• `{user.avatar}` / `{useravatar}` — Member avatar URL\n' +
  '• `{server}` / `{servername}` / `{server.name}` — Server name\n' +
  '• `{servermember}` / `{server.count}` / `{servercount}` — Human member count\n' +
  '• `{server.icon}` / `{serveravatar}` / `{server.avatar}` — Server icon URL\n' +
  '• `{randomuser}` — Random human member mention';
