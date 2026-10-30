import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type TextChannel,
  type GuildTextBasedChannel,
} from 'discord.js';
import * as discordTranscripts from 'discord-html-transcripts';
import { defineCommand, type CommandContext } from '../../types/command.js';
import {
  getTicketByChannel,
  getTicketPanelById,
  closeTicket,
  reopenTicket,
  deleteTicket,
  updateTicketClaim,
} from '../../core/database/repositories/ticketRepo.js';
import { getLogChannel } from '../../core/database/repositories/guildConfigRepo.js';
import { resolveUser } from '../../core/resolver/UserResolver.js';
import { getAuthorityLevel } from '../../core/permissions/PermissionChecker.js';
import { AuthorityLevel } from '../../types/permission.js';
import { mentionUser } from '../../core/utils/formatters.js';

export default defineCommand({
  name: 'ticket',
  aliases: ['t'],
  module: 'ticket',
  description: 'Manage active support tickets (close, delete, add, remove, claim, reopen).',
  usage: 'ticket close [reason] | ticket delete | ticket add <@user> | ticket remove <@user> | ticket claim | ticket reopen',
  examples: [
    'ticket close Resolved issue',
    'ticket add @Alex',
    'ticket remove @Alex',
    'ticket claim',
    'ticket reopen',
    'ticket delete',
  ],
  cooldown: 2,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, guild, member, channel, respond, replyTarget } = ctx;

    const ticket = await getTicketByChannel(channel.id);
    if (!ticket) {
      await respond.error('This command can only be executed inside an active ticket channel.');
      return;
    }

    if (parsed.args.length === 0) {
      await respond.info(
        `**Ticket Controls:**\n` +
        `• \`${parsed.prefix}ticket close [reason]\` — Close ticket & generate HTML transcript\n` +
        `• \`${parsed.prefix}ticket add <@user>\` — Grant user access to this ticket\n` +
        `• \`${parsed.prefix}ticket remove <@user>\` — Remove user from ticket\n` +
        `• \`${parsed.prefix}ticket claim\` — Assign ticket to yourself\n` +
        `• \`${parsed.prefix}ticket reopen\` — Reopen closed ticket *(Admin only)*\n` +
        `• \`${parsed.prefix}ticket delete\` — Permanently delete channel *(Admin only)*`
      );
      return;
    }

    const sub = parsed.args[0].toLowerCase();
    const authority = getAuthorityLevel(member.id, guild.ownerId, member);
    const panel = ticket.panelId ? await getTicketPanelById(ticket.panelId) : null;
    const isStaff = panel ? member.roles.cache.has(panel.staffRoleId) : false;
    const hasStaffAccess = isStaff || authority >= AuthorityLevel.ServerAdmin;

    // ── Subcommand: close ──
    if (sub === 'close') {
      if (!hasStaffAccess && member.id !== ticket.userId) {
        await respond.denied('You do not have permission to close this ticket.');
        return;
      }

      const reason = parsed.args.slice(1).join(' ').trim() || 'No specific reason provided';

      await respond.info('Closing ticket and compiling HTML transcript...');

      const textChan = channel as TextChannel;

      // 1. Remove opener view permission
      await textChan.permissionOverwrites.edit(ticket.userId, {
        ViewChannel: false,
      });

      // 2. Mark closed in DB
      await closeTicket(channel.id, member.id, reason);

      // 3. Generate HTML Transcript
      let transcriptAttachment: any = null;
      try {
        transcriptAttachment = await discordTranscripts.createTranscript(textChan as any, {
          limit: -1,
          returnType: discordTranscripts.ExportReturnType.Attachment,
          filename: `transcript-ticket-${ticket.ticketNumber}.html`,
          saveImages: false,
          poweredBy: false,
        });
      } catch {
        // Fallback if transcript generation fails
      }

      // 4. Send Transcript to Server Log Channel
      const logChannelId = await getLogChannel(guild.id);
      if (logChannelId) {
        const logChan = guild.channels.cache.get(logChannelId) as GuildTextBasedChannel | undefined;
        if (logChan && 'send' in logChan) {
          const logEmbed = new EmbedBuilder()
            .setColor(0xef4444)
            .setTitle(`Ticket #${ticket.ticketNumber} Closed`)
            .addFields(
              { name: 'Opener', value: `<@${ticket.userId}>`, inline: true },
              { name: 'Closed By', value: `<@${member.id}>`, inline: true },
              { name: 'Category', value: ticket.category, inline: true },
              { name: 'Reason', value: reason },
            )
            .setTimestamp();

          await logChan.send({
            embeds: [logEmbed],
            files: transcriptAttachment ? [transcriptAttachment] : [],
          }).catch(() => {});
        }
      }

      // 5. Send Transcript directly to Opener DM
      const opener = await guild.client.users.fetch(ticket.userId).catch(() => null);
      if (opener) {
        const dmEmbed = new EmbedBuilder()
          .setColor(0x10b981)
          .setTitle(`Your Ticket #${ticket.ticketNumber} Has Been Closed`)
          .setDescription(
            `Your support ticket in **${guild.name}** has been closed.\n\n` +
            `**Close Reason:** ${reason}\n` +
            `**Closed By:** ${member.user.tag}`
          )
          .setFooter({ text: 'A copy of your ticket transcript is attached.' })
          .setTimestamp();

        await opener.send({
          embeds: [dmEmbed],
          files: transcriptAttachment ? [transcriptAttachment] : [],
        }).catch(() => {});
      }

      // 6. In-channel Closed Controls
      const closedEmbed = new EmbedBuilder()
        .setColor(0xef4444)
        .setTitle(`Ticket Closed`)
        .setDescription(
          `Ticket closed by ${mentionUser(member.id)}.\n` +
          `**Reason:** ${reason}\n\n` +
          `Admins can permanently delete or reopen this ticket below.`
        );

      const adminRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_reopen_${ticket.id}`)
          .setLabel('Reopen')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`ticket_delete_${ticket.id}`)
          .setLabel('Delete')
          .setStyle(ButtonStyle.Danger),
      );

      await ctx.channel.send({ embeds: [closedEmbed], components: [adminRow] });
      return;
    }

    // ── Subcommand: claim ──
    if (sub === 'claim') {
      if (!hasStaffAccess) {
        await respond.denied('Only designated staff members can claim tickets.');
        return;
      }

      await updateTicketClaim(channel.id, member.id);
      const textChan = channel as TextChannel;
      await textChan.setTopic(`${textChan.topic || ''} | Claimed by: ${member.user.tag}`).catch(() => {});

      await respond.success(`🛡️ ${mentionUser(member.id)} has claimed this ticket.`);
      return;
    }

    // ── Subcommand: add ──
    if (sub === 'add') {
      if (!hasStaffAccess) {
        await respond.denied('Only staff members can add users to this ticket.');
        return;
      }

      let targetId = '';
      if (parsed.args[1]) {
        const uRes = await resolveUser(parsed.args.slice(1).join(' '), guild);
        if (uRes.success) targetId = uRes.value.id;
      } else if (replyTarget) {
        targetId = replyTarget.id;
      }

      if (!targetId) {
        await respond.error(`Please mention a user to add.\nUsage: \`${parsed.prefix}ticket add @user\``);
        return;
      }

      const textChan = channel as TextChannel;
      await textChan.permissionOverwrites.edit(targetId, {
        ViewChannel: true,
        SendMessages: true,
        AttachFiles: true,
        EmbedLinks: true,
        ReadMessageHistory: true,
      });

      await respond.success(`Added ${mentionUser(targetId)} to this ticket.`);
      return;
    }

    // ── Subcommand: remove ──
    if (sub === 'remove') {
      if (!hasStaffAccess) {
        await respond.denied('Only staff members can remove users from this ticket.');
        return;
      }

      let targetId = '';
      if (parsed.args[1]) {
        const uRes = await resolveUser(parsed.args.slice(1).join(' '), guild);
        if (uRes.success) targetId = uRes.value.id;
      } else if (replyTarget) {
        targetId = replyTarget.id;
      }

      if (!targetId) {
        await respond.error(`Please mention a user to remove.\nUsage: \`${parsed.prefix}ticket remove @user\``);
        return;
      }

      if (targetId === ticket.userId) {
        await respond.error('Cannot remove the ticket opener from their own ticket. Use `ticket close` instead.');
        return;
      }

      const textChan = channel as TextChannel;
      await textChan.permissionOverwrites.delete(targetId);

      await respond.success(`Removed ${mentionUser(targetId)} from this ticket.`);
      return;
    }

    // ── Subcommand: reopen (Admins & above only) ──
    if (sub === 'reopen') {
      if (authority < AuthorityLevel.ServerAdmin) {
        await respond.denied('Only administrators can reopen a closed ticket. Staff must request an admin override.');
        return;
      }

      await reopenTicket(channel.id);
      const textChan = channel as TextChannel;

      // Restore opener permissions
      await textChan.permissionOverwrites.edit(ticket.userId, {
        ViewChannel: true,
        SendMessages: true,
        AttachFiles: true,
        EmbedLinks: true,
        ReadMessageHistory: true,
      });

      await respond.success(`🔓 Ticket reopened by ${mentionUser(member.id)}. Access restored for ${mentionUser(ticket.userId)}.`);
      return;
    }

    // ── Subcommand: delete (Admins & above only) ──
    if (sub === 'delete') {
      if (authority < AuthorityLevel.ServerAdmin) {
        await respond.denied('Only administrators can permanently delete tickets.');
        return;
      }

      await respond.info('Deleting ticket channel in 5 seconds...');
      await deleteTicket(channel.id);

      setTimeout(async () => {
        const textChan = channel as TextChannel;
        await textChan.delete('Ticket deleted by admin').catch(() => {});
      }, 5000);
      return;
    }

    await respond.error(`Unknown ticket subcommand: \`${sub}\`.\nUsage: \`${parsed.prefix}ticket close|claim|add|remove|reopen|delete\``);
  },
});

