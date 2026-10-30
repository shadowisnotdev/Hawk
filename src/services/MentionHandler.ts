import type { Message } from 'discord.js';

export enum MessageType {
  Normal = 'normal',
  PrefixCommand = 'prefix_command',
}

export function classifyMessage(message: Message, prefix: string): MessageType {
  const content = message.content.trim();
  if (content.toLowerCase().startsWith(prefix.toLowerCase())) return MessageType.PrefixCommand;
  return MessageType.Normal;
}
