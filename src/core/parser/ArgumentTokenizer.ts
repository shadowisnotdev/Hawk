import type { ArgumentToken, ArgumentTokenType } from '../../types/command.js';
import { isSnowflake, isUrl } from '../utils/validators.js';

const USER_MENTION_RE = /^<@!?(\d{17,20})>/;
const ROLE_MENTION_RE = /^<@&(\d{17,20})>/;
const CHANNEL_MENTION_RE = /^<#(\d{17,20})>/;

export interface TokenizeResult {
  args: string[];
  tokens: ArgumentToken[];
}

export function tokenize(raw: string): TokenizeResult {
  const args: string[] = [];
  const tokens: ArgumentToken[] = [];
  let remaining = raw.trim();

  while (remaining.length > 0) {
    remaining = remaining.trimStart();
    if (remaining.length === 0) break;

    let token: ArgumentToken | null = null;

    token = tryQuoted(remaining);
    if (token) { remaining = remaining.slice(token.raw.length); args.push(token.value); tokens.push(token); continue; }

    token = tryPattern(remaining, USER_MENTION_RE, 'mention_user');
    if (token) { remaining = remaining.slice(token.raw.length); args.push(token.value); tokens.push(token); continue; }

    token = tryPattern(remaining, ROLE_MENTION_RE, 'mention_role');
    if (token) { remaining = remaining.slice(token.raw.length); args.push(token.value); tokens.push(token); continue; }

    token = tryPattern(remaining, CHANNEL_MENTION_RE, 'mention_channel');
    if (token) { remaining = remaining.slice(token.raw.length); args.push(token.value); tokens.push(token); continue; }

    const spaceIdx = remaining.indexOf(' ');
    const word = spaceIdx === -1 ? remaining : remaining.slice(0, spaceIdx);
    remaining = spaceIdx === -1 ? '' : remaining.slice(spaceIdx);

    let type: ArgumentTokenType = 'text';
    if (isSnowflake(word)) type = 'snowflake';
    else if (isUrl(word)) type = 'url';

    args.push(word);
    tokens.push({ type, value: word, raw: word });
  }

  return { args, tokens };
}

function tryQuoted(input: string): ArgumentToken | null {
  const quoteChar = input[0];
  if (quoteChar !== '"' && quoteChar !== "'") return null;
  const endIdx = input.indexOf(quoteChar, 1);
  if (endIdx === -1) return null;
  const raw = input.slice(0, endIdx + 1);
  const value = input.slice(1, endIdx);
  return { type: 'quoted', value, raw };
}

function tryPattern(input: string, pattern: RegExp, type: ArgumentTokenType): ArgumentToken | null {
  const match = pattern.exec(input);
  if (!match) return null;
  return { type, value: match[1], raw: match[0] };
}
