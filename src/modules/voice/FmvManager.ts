import type { Message, VoiceState, GuildMember } from 'discord.js';
import { logEvent } from '../../core/logging/WebhookLogger.js';
import { formatUser } from '../../core/utils/formatters.js';

export type FmvStatus = 'COUNTDOWN' | 'WAITING_FOR_VC' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED' | 'FAILED';

export interface FmvState {
  id: string; // `${guildId}_${targetId}`
  guildId: string;
  authorId: string;
  targetId: string;
  destinationChannelId: string;
  requestMessage: Message;
  status: FmvStatus;
  createdAt: number;
  expiresAt: number;
  countdownTimer: NodeJS.Timeout | null;
  expireTimer: NodeJS.Timeout | null;
}

const activeRequests = new Map<string, FmvState>(); // id -> FmvState
const FMV_TTL = 60_000; // 60 seconds

function scheduleMessageDeletion(msg: Message | undefined | null, delayMs = 5000): void {
  if (!msg || typeof msg.delete !== 'function') return;
  setTimeout(() => {
    msg.delete().catch(() => {});
  }, delayMs);
}

export function getActiveFmvRequest(guildId: string, targetId: string): FmvState | undefined {
  return activeRequests.get(`${guildId}_${targetId}`);
}

export function getAllActiveFmvRequests(): FmvState[] {
  return Array.from(activeRequests.values());
}

export function clearFmvStateCache(): void {
  for (const req of activeRequests.values()) {
    if (req.countdownTimer) clearTimeout(req.countdownTimer);
    if (req.expireTimer) clearTimeout(req.expireTimer);
  }
  activeRequests.clear();
}

export async function createFmvRequest(options: {
  guildId: string;
  authorId: string;
  targetMember: GuildMember;
  destinationChannelId: string;
  requestMessage: Message;
}): Promise<FmvState> {
  const { guildId, authorId, targetMember, destinationChannelId, requestMessage } = options;
  const id = `${guildId}_${targetMember.id}`;

  const existing = activeRequests.get(id);
  if (existing && existing.status !== 'COMPLETED' && existing.status !== 'CANCELLED' && existing.status !== 'EXPIRED' && existing.status !== 'FAILED') {
    throw new Error(`There is already an active FMV request for ${targetMember.user.tag} in this server.`);
  }

  const now = Date.now();
  const expiresAt = now + FMV_TTL;

  const state: FmvState = {
    id,
    guildId,
    authorId,
    targetId: targetMember.id,
    destinationChannelId,
    requestMessage,
    status: 'WAITING_FOR_VC',
    createdAt: now,
    expiresAt,
    countdownTimer: null,
    expireTimer: null,
  };

  // Expiration timer (60s)
  state.expireTimer = setTimeout(async () => {
    if (state.status === 'COMPLETED' || state.status === 'CANCELLED' || state.status === 'EXPIRED') return;
    state.status = 'EXPIRED';
    if (state.countdownTimer) clearTimeout(state.countdownTimer);
    activeRequests.delete(id);

    try {
      await state.requestMessage.edit({
        content: `> **Force Move Expired:** The force-move request for <@${state.targetId}> has expired.`,
        allowedMentions: { parse: [] },
      });
      scheduleMessageDeletion(state.requestMessage, 5000);
    } catch {
      // Message may have been deleted
    }

    logEvent('info', 'command_execution', `FMV request expired for target ${state.targetId}`, {
      guild: guildId,
      author: authorId,
      target: state.targetId,
    });
  }, FMV_TTL);

  activeRequests.set(id, state);

  // CASE A — Target is currently in a VC
  if (targetMember.voice.channelId) {
    state.status = 'COUNTDOWN';
    const countdownTimestamp = Math.floor((now + 5000) / 1000);

    const userMention = `<@${state.targetId}>`;
    await requestMessage.edit({
      content: `> **Force Move Scheduled:** ${userMention} will be moved to <#${destinationChannelId}> in <t:${countdownTimestamp}:R>.`,
      allowedMentions: { users: [state.targetId] },
    }).catch(() => {});

    logEvent('info', 'command_execution', `FMV countdown started for ${targetMember.user.tag}`, {
      guild: guildId,
      author: authorId,
      target: state.targetId,
      destination: destinationChannelId,
    });

    state.countdownTimer = setTimeout(async () => {
      if (state.status !== 'COUNTDOWN') return;

      // Re-fetch target's voice state
      const refreshedMember = await targetMember.guild.members.fetch(targetMember.id).catch(() => null);
      if (refreshedMember?.voice.channelId) {
        state.status = 'COMPLETED';
        if (state.expireTimer) clearTimeout(state.expireTimer);
        activeRequests.delete(id);

        try {
          await refreshedMember.voice.setChannel(destinationChannelId);
          await state.requestMessage.edit({
            content: `> **Force Move Completed:** ${userMention} was moved to <#${destinationChannelId}>.`,
            allowedMentions: { parse: [] },
          });
          scheduleMessageDeletion(state.requestMessage, 5000);
        } catch {
          state.status = 'FAILED';
          await state.requestMessage.edit({
            content: `> **Force Move Failed:** Failed to move ${userMention} to <#${destinationChannelId}>.`,
            allowedMentions: { parse: [] },
          }).catch(() => {});
          scheduleMessageDeletion(state.requestMessage, 5000);
        }

        logEvent('info', 'command_execution', `FMV executed for ${targetMember.user.tag}`, {
          guild: guildId,
          author: authorId,
          target: state.targetId,
          destination: destinationChannelId,
        });
      } else {
        // Target left VC during countdown -> transition to WAITING_FOR_VC
        state.status = 'WAITING_FOR_VC';
        await state.requestMessage.edit({
          content: `> **Force Move Waiting:** ${userMention}, join any voice channel to be moved to <#${destinationChannelId}>.`,
          allowedMentions: { users: [state.targetId] },
        }).catch(() => {});
      }
    }, 5000);
  } else {
    // CASE B — Target is NOT in a VC
    const userMention = `<@${state.targetId}>`;
    state.status = 'WAITING_FOR_VC';
    await requestMessage.edit({
      content: `> **Force Move Waiting:** ${userMention}, join any voice channel to be moved to <#${destinationChannelId}>.`,
      allowedMentions: { users: [state.targetId] },
    }).catch(() => {});

    logEvent('info', 'command_execution', `FMV waiting for target ${targetMember.user.tag} to join VC`, {
      guild: guildId,
      author: authorId,
      target: state.targetId,
      destination: destinationChannelId,
    });
  }

  return state;
}

export async function cancelFmvRequest(options: {
  guildId: string;
  authorId: string;
  targetId?: string;
  isElevated?: boolean;
}): Promise<number> {
  const { guildId, authorId, targetId, isElevated } = options;
  let cancelledCount = 0;

  if (targetId) {
    const id = `${guildId}_${targetId}`;
    const req = activeRequests.get(id);
    if (req && (req.authorId === authorId || isElevated)) {
      if (req.countdownTimer) clearTimeout(req.countdownTimer);
      if (req.expireTimer) clearTimeout(req.expireTimer);
      req.status = 'CANCELLED';
      activeRequests.delete(id);

      try {
        await req.requestMessage.edit({
          content: `> **Force Move Cancelled:** The force-move request for <@${targetId}> was cancelled.`,
          allowedMentions: { parse: [] },
        });
        scheduleMessageDeletion(req.requestMessage, 5000);
      } catch {
        // Message deleted
      }

      logEvent('info', 'command_execution', `FMV request cancelled for ${targetId}`, {
        guild: guildId,
        cancelledBy: authorId,
        target: targetId,
      });

      cancelledCount++;
    }
  } else {
    // Cancel ALL pending requests created by this author in the guild
    for (const [id, req] of Array.from(activeRequests.entries())) {
      if (req.guildId === guildId && (req.authorId === authorId || isElevated)) {
        if (req.countdownTimer) clearTimeout(req.countdownTimer);
        if (req.expireTimer) clearTimeout(req.expireTimer);
        req.status = 'CANCELLED';
        activeRequests.delete(id);

        try {
          await req.requestMessage.edit({
            content: `> **Force Move Cancelled:** The force-move request for <@${req.targetId}> was cancelled.`,
            allowedMentions: { parse: [] },
          });
          scheduleMessageDeletion(req.requestMessage, 5000);
        } catch {
          // Message deleted
        }

        logEvent('info', 'command_execution', `FMV request cancelled for ${req.targetId}`, {
          guild: guildId,
          cancelledBy: authorId,
          target: req.targetId,
        });

        cancelledCount++;
      }
    }
  }

  return cancelledCount;
}

export async function handleFmvVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
  if (!newState.guild || !newState.member) return;

  // Trigger when target joins a voice channel (oldState.channelId !== newState.channelId and newState.channelId !== null)
  if (oldState.channelId === newState.channelId || !newState.channelId) return;

  const guildId = newState.guild.id;
  const targetId = newState.member.id;
  const id = `${guildId}_${targetId}`;

  const req = activeRequests.get(id);
  if (!req) return;

  if (req.status !== 'WAITING_FOR_VC' && req.status !== 'COUNTDOWN') return;

  // Atomic state transition to MOVING / COMPLETED to prevent race conditions
  req.status = 'COMPLETED';
  if (req.countdownTimer) clearTimeout(req.countdownTimer);
  if (req.expireTimer) clearTimeout(req.expireTimer);
  activeRequests.delete(id);

  try {
    const destChannel = await newState.guild.channels.fetch(req.destinationChannelId).catch(() => null);
    if (!destChannel || !destChannel.isVoiceBased()) {
      req.status = 'FAILED';
      await req.requestMessage.edit({
        content: `> **Force Move Failed:** Destination voice channel is no longer available.`,
        allowedMentions: { parse: [] },
      }).catch(() => {});
      scheduleMessageDeletion(req.requestMessage, 5000);
      return;
    }

    await newState.member.voice.setChannel(req.destinationChannelId);

    const userMention = `<@${req.targetId}>`;
    await req.requestMessage.edit({
      content: `> **Force Move Completed:** ${userMention} was moved to <#${req.destinationChannelId}>.`,
      allowedMentions: { parse: [] },
    }).catch(() => {});
    scheduleMessageDeletion(req.requestMessage, 5000);

    logEvent('info', 'command_execution', `FMV executed on voiceStateUpdate for ${newState.member.user.tag}`, {
      guild: guildId,
      author: req.authorId,
      target: req.targetId,
      destination: req.destinationChannelId,
    });
  } catch (error) {
    req.status = 'FAILED';
    const msg = error instanceof Error ? error.message : String(error);
    const userDisplay = formatUser(req.targetId);
    await req.requestMessage.edit({
      content: `> **Force Move Failed:** Could not move ${userDisplay} to destination.`,
      allowedMentions: { parse: [] },
    }).catch(() => {});
    scheduleMessageDeletion(req.requestMessage, 5000);

    logEvent('error', 'command_failure', `FMV failed on voiceStateUpdate for ${req.targetId}: ${msg}`, {
      guild: guildId,
      target: req.targetId,
      error: msg,
    });
  }
}
