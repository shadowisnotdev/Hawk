import { PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { GuildMember, Message } from 'discord.js';
import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import { resolveUser } from '../../core/resolver/UserResolver.js';
import { mentionUser } from '../../core/utils/formatters.js';
import { setState } from '../../core/interactions/InteractionState.js';
import { checkVoiceAccess } from './vconfigEvaluator.js';
import { registerPendingDragme, clearPendingDragme } from './_dragmeHandler.js';

export interface DragmeRequest {
  requesterId: string;
  targetId: string;
  guildId: string;
  messageId: string;
  timeoutId?: NodeJS.Timeout | number;
}

const DRAGME_TTL = 60_000; // 1 minute consent window

export default defineCommand({
  name: 'dragme',
  aliases: ['dmv', 'pullme', 'drag'],
  module: 'voice',
  description: 'Public consent-based self-drag command asking a user for permission to move into their voice channel.',
  usage: 'dragme <user>',
  examples: ['dragme @User', 'dmv @User', 'pullme @User', 'drag @User'],
  permissions: [],
  botPermissions: [PermissionsBitField.Flags.MoveMembers],
  cooldown: 5,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, guild, member, respond, message, replyTarget } = ctx;

    let targetMember: GuildMember | null = null;

    if (parsed.args.length > 0) {
      const result = await resolveUser(parsed.args.join(' '), guild);
      if (!result.success) {
        await respond.error(result.error);
        return;
      }
      if (!result.value.member) {
        await respond.error('That user is not a member of this server.');
        return;
      }
      targetMember = result.value.member;
    } else if (replyTarget) {
      targetMember = replyTarget;
    }

    if (!targetMember) {
      await respond.error('Specify a user to request a drag from, or reply to their message.');
      return;
    }

    if (targetMember.id === member.id) {
      await respond.error('You cannot drag yourself.');
      return;
    }

    if (!targetMember.voice.channel) {
      await respond.error(`${mentionUser(targetMember.id)} is not in a voice channel.`);
      return;
    }

    if (!member.voice.channel) {
      await respond.error('You must be in a voice channel to use this command.');
      return;
    }

    if (member.voice.channelId === targetMember.voice.channelId) {
      await respond.info('You are already in the same voice channel.');
      return;
    }

    const access = await checkVoiceAccess(guild.id, member, 'dragme', targetMember.voice.channelId);
    if (!access.allowed) {
      await respond.denied(access.reason || 'Voice command access denied.');
      return;
    }

    const stateKey = `dragme_${message.id}`;

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`dragme_approve_${message.id}`)
        .setLabel('Approve')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`dragme_deny_${message.id}`)
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger),
    );

    const sentMessage = (await respond.raw({
      content: `${mentionUser(targetMember.id)}, ${mentionUser(member.id)} wants to be dragged into your voice channel. You have 1 minute to respond.`,
      components: [row],
    })) as Message;

    const request: DragmeRequest = {
      requesterId: member.id,
      targetId: targetMember.id,
      guildId: guild.id,
      messageId: sentMessage.id,
    };

    const timeoutId = setTimeout(async () => {
      clearPendingDragme(stateKey);
      try {
        const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`dragme_approve_${message.id}`)
            .setLabel('Approve')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`dragme_deny_${message.id}`)
            .setLabel('Deny')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true),
        );
        await sentMessage.edit({
          content: `Drag request from ${mentionUser(member.id)} to ${mentionUser(targetMember.id)} has expired.`,
          components: [disabledRow],
        });
        setTimeout(() => {
          sentMessage.delete().catch(() => {});
        }, 7000);
      } catch {
        // Message may have been deleted
      }
    }, DRAGME_TTL);

    request.timeoutId = timeoutId;
    setState(stateKey, member.id, request, DRAGME_TTL);
    registerPendingDragme(stateKey, request, sentMessage);
  },
});
