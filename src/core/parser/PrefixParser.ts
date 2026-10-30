import type { ParsedCommand } from '../../types/command.js';
import { tokenize } from './ArgumentTokenizer.js';

export function parseCommand(content: string, prefix: string): ParsedCommand | null {
  if (!content.toLowerCase().startsWith(prefix.toLowerCase())) return null;

  const withoutPrefix = content.slice(prefix.length).trim();
  if (!withoutPrefix) return null;

  const spaceIndex = withoutPrefix.indexOf(' ');
  const commandName = spaceIndex === -1
    ? withoutPrefix.toLowerCase()
    : withoutPrefix.slice(0, spaceIndex).toLowerCase();

  const rawArgs = spaceIndex === -1
    ? ''
    : withoutPrefix.slice(spaceIndex + 1).trim();

  const { args, tokens } = tokenize(rawArgs);

  return {
    prefix,
    commandName,
    aliasUsed: commandName,
    rawArgs,
    args,
    tokens,
  };
}
