import type { VoiceState, GuildMember } from 'discord.js';
import { mentionUser, mentionChannel } from '../../core/utils/formatters.js';
import { logEvent } from '../../core/logging/WebhookLogger.js';

export interface MvaMonitor {
  id: string; // `${guildId}_${targetId}`
  guildId: string;
  authorId: string;
  initialVoiceChannelId: string;
  textChannelId: string;
  targetId: string;
  createdAt: number;
  expiresAt: number;
  timer: NodeJS.Timeout;
}

const activeMonitors = new Map<string, MvaMonitor>(); // id -> MvaMonitor
const MVA_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function getAuthorMonitors(guildId: string, authorId: string): MvaMonitor[] {
  return Array.from(activeMonitors.values()).filter(
    (m) => m.guildId === guildId && m.authorId === authorId,
  );
}

export function createMvaMonitor(options: {
  guildId: string;
  authorId: string;
  initialVoiceChannelId: string;
  textChannelId: string;
  targetMember: GuildMember;
  onExpire?: () => void;
}): MvaMonitor {
  const { guildId, authorId, initialVoiceChannelId, textChannelId, targetMember } = options;
  const id = `${guildId}_${targetMember.id}`;

  // If a monitor for this target already exists, clear its timer
  const existing = activeMonitors.get(id);
  if (existing) {
    clearTimeout(existing.timer);
    activeMonitors.delete(id);
  }

  const timer = setTimeout(() => {
    activeMonitors.delete(id);
    if (options.onExpire) options.onExpire();
  }, MVA_TIMEOUT_MS);

  const monitor: MvaMonitor = {
    id,
    guildId,
    authorId,
    initialVoiceChannelId,
    textChannelId,
    targetId: targetMember.id,
    createdAt: Date.now(),
    expiresAt: Date.now() + MVA_TIMEOUT_MS,
    timer,
  };

  activeMonitors.set(id, monitor);
  return monitor;
}

export function cancelMvaTarget(guildId: string, authorId: string, targetId: string): boolean {
  const id = `${guildId}_${targetId}`;
  const monitor = activeMonitors.get(id);
  if (monitor && monitor.authorId === authorId) {
    clearTimeout(monitor.timer);
    activeMonitors.delete(id);
    return true;
  }
  return false;
}

export function cancelAllMva(guildId: string, authorId: string): number {
  let count = 0;
  for (const [id, monitor] of activeMonitors) {
    if (monitor.guildId === guildId && monitor.authorId === authorId) {
      clearTimeout(monitor.timer);
      activeMonitors.delete(id);
      count++;
    }
  }
  return count;
}

export async function handleMvaVoiceStateUpdate(_oldState: VoiceState, newState: VoiceState): Promise<void> {
  // Check if member joined a voice channel
  const member = newState.member;
  if (!member || !newState.channelId) return;

  const id = `${newState.guild.id}_${member.id}`;
  const monitor = activeMonitors.get(id);
  if (!monitor) return;

  // Clear timer and remove from tracking
  clearTimeout(monitor.timer);
  activeMonitors.delete(id);

  const guild = newState.guild;
  let authorMember: GuildMember | null = null;
  try {
    authorMember = await guild.members.fetch(monitor.authorId);
  } catch {
    return;
  }

  let textChannel: any = null;
  try {
    const ch = await guild.channels.fetch(monitor.textChannelId);
    if (ch && ch.isTextBased() && 'send' in ch) textChannel = ch;
  } catch {
    // Channel might have been removed
  }

  // Author State Check Option A/B Handling:
  // If author is still in the initial voice channel, execute the drag.
  // If author has left or moved to any other channel, abort drag and reply notifying that author is no longer in original VC.
  const authorVc = authorMember?.voice?.channel;
  if (!authorVc || authorVc.id !== monitor.initialVoiceChannelId) {
    if (textChannel) {
      await textChannel.send({
        content: `> **Autodrag Aborted:** ${mentionUser(monitor.authorId)}, you are no longer in your original voice channel (${mentionChannel(monitor.initialVoiceChannelId)}). Drag for ${mentionUser(member.id)} cancelled.`,
        allowedMentions: { parse: ['users'] },
      }).catch(() => {});
    }
    return;
  }

  try {
    await member.voice.setChannel(authorVc);
    if (textChannel) {
      await textChannel.send({
        content: `> **Autodrag Triggered:** ${mentionUser(member.id)} joined voice and was dragged to **${authorVc.name}** for ${mentionUser(monitor.authorId)}.`,
        allowedMentions: { parse: ['users'] },
      }).catch(() => {});
    }
    logEvent('info', 'command_execution', `Autodrag moved ${member.id} to ${authorVc.name}`);
  } catch {
    if (textChannel) {
      await textChannel.send({
        content: `> **Autodrag Failed:** Could not move ${mentionUser(member.id)} to **${authorVc.name}**.`,
        allowedMentions: { parse: ['users'] },
      }).catch(() => {});
    }
  }
}

