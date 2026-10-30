import { PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { GuildMember } from 'discord.js';
import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import { resolveUser } from '../../core/resolver/UserResolver.js';
import { mentionUser } from '../../core/utils/formatters.js';
import { setState } from '../../core/interactions/InteractionState.js';
import { checkVoiceAccess } from './vconfigEvaluator.js';

export interface RmvRequest {
  requesterId: string;
  targetId: string;
  guildId: string;
  messageId: string;
  timeoutId?: NodeJS.Timeout | number;
}

const RMV_TTL = 60_000; // 1 minute

export default defineCommand({
  name: 'rmv',
  aliases: ['request-move', 'reqmove', 'requestmove'],
  module: 'voice',
  description: 'Request a user to be moved into your voice channel (requires their consent).',
  usage: 'rmv <user>',
  examples: ['rmv @User'],
  permissions: [],
  botPermissions: [PermissionsBitField.Flags.MoveMembers],
  cooldown: 10,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, guild, member, respond, message, replyTarget } = ctx;

    let targetMember: GuildMember;

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
    } else {
      await respond.error('Specify a user to request to move, or reply to their message.');
      return;
    }

    if (targetMember.id === member.id) {
      await respond.error('You cannot request to move yourself.');
      return;
    }

    if (targetMember.user.bot) {
      await respond.error('You cannot use this command on a bot.');
      return;
    }

    if (!member.voice.channel) {
      await respond.error('You must be in a voice channel to use this command.');
      return;
    }

    if (!targetMember.voice.channel) {
      await respond.error(`${mentionUser(targetMember.id)} is not in a voice channel.`);
      return;
    }

    if (member.voice.channelId === targetMember.voice.channelId) {
      await respond.info('You are already in the same voice channel.');
      return;
    }

    const authorVc = member.voice.channel;

    // Voice Access Evaluation against author's voice channel
    const access = await checkVoiceAccess(guild.id, member, 'rmv', authorVc.id);
    if (!access.allowed) {
      await respond.denied(access.reason || 'Voice command access denied.');
      return;
    }

    // Create unique key for this request
    const stateKey = `rmv_${message.id}`;

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`rmv_approve_${message.id}`)
        .setLabel('Approve')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`rmv_deny_${message.id}`)
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger),
    );

    const sentMessage = await respond.raw({
      content: `${mentionUser(targetMember.id)}, ${mentionUser(member.id)} is requesting to move you into **${authorVc.name}**. You have 60 seconds to respond.`,
      components: [row],
    });

    // Store the request state
    const request: RmvRequest = {
      requesterId: member.id,
      targetId: targetMember.id,
      guildId: guild.id,
      messageId: sentMessage.id,
    };

    const timeoutId = setTimeout(async () => {
      try {
        const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`rmv_approve_${message.id}`)
            .setLabel('Approve')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`rmv_deny_${message.id}`)
            .setLabel('Deny')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true),
        );
        await sentMessage.edit({
          content: `Move request from ${mentionUser(member.id)} to ${mentionUser(targetMember.id)} has expired.`,
          components: [disabledRow],
        });
        // Auto-clean expired request after 7 seconds
        setTimeout(() => {
          sentMessage.delete().catch(() => {});
        }, 7000);
      } catch {
        // Message may have been deleted
      }
    }, RMV_TTL);

    request.timeoutId = timeoutId;
    setState(stateKey, member.id, request, RMV_TTL);
  },
});
