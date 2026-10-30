import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionsBitField,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  type ButtonInteraction,
  type GuildTextBasedChannel,
  type Interaction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type TextChannel,
  type UserSelectMenuInteraction,
} from 'discord.js';
import * as discordTranscripts from 'discord-html-transcripts';
import {
  getTicketPanelById,
  getNextTicketNumber,
  createTicket,
  getTicketByChannel,
  closeTicket,
  reopenTicket,
  deleteTicket,
  updateTicketClaim,
} from '../../core/database/repositories/ticketRepo.js';
import { getLogChannel } from '../../core/database/repositories/guildConfigRepo.js';
import { getAuthorityLevel } from '../../core/permissions/PermissionChecker.js';
import { AuthorityLevel } from '../../types/permission.js';

/**
 * Handles all ticket button, select menu, and modal interactions
 */
export async function handleTicketInteraction(interaction: Interaction): Promise<boolean> {
  const { customId } = interaction as any;
  if (!customId || typeof customId !== 'string') return false;

  // 1. Open Ticket Button on Panel
  if (customId.startsWith('ticket_open_')) {
    if (!interaction.isButton()) return false;
    await handleOpenTicketButton(interaction);
    return true;
  }

  // 2. Category Select Menu
  if (customId.startsWith('ticket_sel_cat_')) {
    if (!interaction.isStringSelectMenu()) return false;
    await handleCategorySelect(interaction);
    return true;
  }

  // 3. Reward Type Select Menu
  if (customId.startsWith('ticket_sel_rew_')) {
    if (!interaction.isStringSelectMenu()) return false;
    await handleRewardTypeSelect(interaction);
    return true;
  }

  // 4. Report User Select Menu
  if (customId.startsWith('ticket_sel_usr_')) {
    if (!interaction.isUserSelectMenu()) return false;
    await handleReportUserSelect(interaction);
    return true;
  }

  // 5. Modal Submissions for ticket creation
  if (customId.startsWith('ticket_modal_')) {
    if (!interaction.isModalSubmit()) return false;
    await handleTicketModalSubmit(interaction);
    return true;
  }

  // 6. In-Ticket Controls
  if (customId.startsWith('ticket_btn_close_') || customId.startsWith('ticket_close_')) {
    if (!interaction.isButton()) return false;
    await handleTicketCloseButton(interaction);
    return true;
  }

  if (customId.startsWith('ticket_modal_close_')) {
    if (!interaction.isModalSubmit()) return false;
    await handleTicketCloseModalSubmit(interaction);
    return true;
  }

  if (customId.startsWith('ticket_claim_')) {
    if (!interaction.isButton()) return false;
    await handleTicketClaimButton(interaction);
    return true;
  }

  if (customId.startsWith('ticket_cmdguide_')) {
    if (!interaction.isButton()) return false;
    await handleTicketCmdGuide(interaction);
    return true;
  }

  if (customId.startsWith('ticket_reopen_')) {
    if (!interaction.isButton()) return false;
    await handleTicketReopenButton(interaction);
    return true;
  }

  if (customId.startsWith('ticket_delete_')) {
    if (!interaction.isButton()) return false;
    await handleTicketDeleteButton(interaction);
    return true;
  }

  return false;
}

async function handleOpenTicketButton(interaction: ButtonInteraction): Promise<void> {
  const panelId = parseInt(interaction.customId.replace('ticket_open_', ''), 10);
  const panel = await getTicketPanelById(panelId);

  if (!panel || panel.guildId !== interaction.guildId) {
    await interaction.reply({ content: 'Ticket panel could not be found.', ephemeral: true });
    return;
  }

  // Initial Trigger: Prompts select menu with 3 options
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`ticket_sel_cat_${panel.id}`)
    .setPlaceholder('Select your ticket category...')
    .addOptions([
      {
        label: 'General Support',
        description: 'Questions, general inquiries, or server assistance',
        emoji: '🛠️',
        value: 'general',
      },
      {
        label: 'Reward Claim',
        description: 'Claim prizes won from server giveaways or events',
        emoji: '🎁',
        value: 'reward',
      },
      {
        label: 'Report User/Staff',
        description: 'Report rule violations or staff misconduct',
        emoji: '🚨',
        value: 'report',
      },
    ]);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  await interaction.reply({
    content: '**Please select the category that best describes your request:**',
    components: [row],
    ephemeral: true,
  });
}

async function handleCategorySelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const panelId = parseInt(interaction.customId.replace('ticket_sel_cat_', ''), 10);
  const category = interaction.values[0];

  // Dynamic Branching
  if (category === 'general') {
    // Option 1: General Support -> Modal asking for reason
    const modal = new ModalBuilder()
      .setCustomId(`ticket_modal_gen_${panelId}`)
      .setTitle('General Support Ticket');

    const input = new TextInputBuilder()
      .setCustomId('ticket_reason')
      .setLabel('Reason for opening this ticket')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Please describe what you need assistance with...')
      .setRequired(true)
      .setMinLength(10)
      .setMaxLength(1000);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  if (category === 'reward') {
    // Option 2: Reward Claim -> Sub-select menu
    const subMenu = new StringSelectMenuBuilder()
      .setCustomId(`ticket_sel_rew_${panelId}`)
      .setPlaceholder('Which type of Reward?')
      .addOptions([
        {
          label: 'Giveaway Reward',
          description: 'Prizes won from server giveaways',
          emoji: '🎉',
          value: 'reward_giveaway',
        },
        {
          label: 'Event Reward',
          description: 'Prizes won from special server events',
          emoji: '🏆',
          value: 'reward_event',
        },
      ]);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(subMenu);
    await interaction.update({
      content: '**Please select the reward type you are claiming:**',
      components: [row],
    });
    return;
  }

  if (category === 'report') {
    // Option 3: Report User/Staff -> User picker
    const userSelect = new UserSelectMenuBuilder()
      .setCustomId(`ticket_sel_usr_${panelId}`)
      .setPlaceholder('Select the user or staff member to report...');

    const row = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(userSelect);
    await interaction.update({
      content: '**Select the member you wish to report below:**',
      components: [row],
    });
    return;
  }
}

async function handleRewardTypeSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const panelId = parseInt(interaction.customId.replace('ticket_sel_rew_', ''), 10);
  const rewardType = interaction.values[0];

  const modal = new ModalBuilder()
    .setCustomId(`ticket_modal_rew_${panelId}_${rewardType}`)
    .setTitle('Reward Claim Details');

  const input = new TextInputBuilder()
    .setCustomId('ticket_reason')
    .setLabel('Claim Details')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Provide the giveaway/event name, link, or details...')
    .setRequired(true)
    .setMinLength(5)
    .setMaxLength(1000);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
}

async function handleReportUserSelect(interaction: UserSelectMenuInteraction): Promise<void> {
  const panelId = parseInt(interaction.customId.replace('ticket_sel_usr_', ''), 10);
  const targetUserId = interaction.values[0];

  const modal = new ModalBuilder()
    .setCustomId(`ticket_modal_rep_${panelId}_${targetUserId}`)
    .setTitle('Report Context & Evidence');

  const input = new TextInputBuilder()
    .setCustomId('ticket_reason')
    .setLabel('Context for reporting')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Explain what occurred with relevant message links or context...')
    .setRequired(true)
    .setMinLength(10)
    .setMaxLength(1000);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
}

async function handleTicketModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const { customId, guild, user } = interaction;
  if (!guild) return;

  const reason = interaction.fields.getTextInputValue('ticket_reason').trim();

  let panelId = 0;
  let category = 'general';
  let targetUserId: string | null = null;

  if (customId.startsWith('ticket_modal_gen_')) {
    panelId = parseInt(customId.replace('ticket_modal_gen_', ''), 10);
    category = 'General Support';
  } else if (customId.startsWith('ticket_modal_rew_')) {
    const parts = customId.split('_');
    panelId = parseInt(parts[3], 10);
    category = parts[4] === 'event' ? 'Event Reward Claim' : 'Giveaway Reward Claim';
  } else if (customId.startsWith('ticket_modal_rep_')) {
    const parts = customId.split('_');
    panelId = parseInt(parts[3], 10);
    targetUserId = parts[4];
    category = 'User/Staff Report';
  }

  const panel = await getTicketPanelById(panelId);
  if (!panel) {
    await interaction.reply({ content: 'Ticket panel not found.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const ticketNumber = await getNextTicketNumber(guild.id);
  const formattedNumber = String(ticketNumber).padStart(4, '0');
  const channelName = `ticket-${formattedNumber}`;

  // Permission Overwrites
  const permissionOverwrites: any[] = [
    {
      id: guild.id, // @everyone
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    {
      id: user.id, // Ticket opener
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.EmbedLinks,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    },
    {
      id: panel.staffRoleId, // Configured staff role
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.EmbedLinks,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    },
  ];

  if (guild.members.me) {
    permissionOverwrites.push({
      id: guild.members.me.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.ManageMessages,
        PermissionsBitField.Flags.EmbedLinks,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    });
  }

  try {
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: panel.categoryId || undefined,
      permissionOverwrites,
      topic: `Ticket #${formattedNumber} | Opener: ${user.tag} (${user.id}) | Category: ${category}`,
    });

    const ticketRecord = await createTicket({
      guildId: guild.id,
      channelId: channel.id,
      panelId: panel.id,
      userId: user.id,
      ticketNumber,
      category,
      targetUserId,
      reason,
    });

    // OptiDesk Styled Initial Embed Layout
    const optideskEmbed = new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle('👋 Welcome!')
      .setDescription(
        `Thank you for making a support ticket. A support team member will help you shortly.\n\n` +
        `• Make sure to provide as much detail as possible. We're able to help you faster when we know everything up-front!\n` +
        `• Please don't ping any members of our support team in your ticket. If you need someone specific, make sure the claimee knows.`
      )
      .addFields({
        name: 'Ticket Details',
        value: `\`\`\`text\nCategory: ${category}\nReason: ${reason}\n${targetUserId ? `Reported User ID: ${targetUserId}\n` : ''}\`\`\``,
      })
      .setFooter({ text: `- Support, 2026` });

    if (panel.thumbnailUrl) {
      optideskEmbed.setImage(panel.thumbnailUrl);
    }

    // Ticket Controls (OptiDesk layout)
    const controlRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_close_${ticketRecord.id}`)
        .setLabel('Close')
        .setEmoji('✕')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`ticket_add_${ticketRecord.id}`)
        .setLabel('Add')
        .setEmoji('👤')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`ticket_remove_${ticketRecord.id}`)
        .setLabel('Remove')
        .setEmoji('👤')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`ticket_cmdguide_${ticketRecord.id}`)
        .setLabel('Commands')
        .setEmoji('‹›')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`ticket_claim_${ticketRecord.id}`)
        .setLabel('Staff')
        .setEmoji('⚙️')
        .setStyle(ButtonStyle.Secondary),
    );

    // Initial message pings opener and staff role
    await channel.send({
      content: `<@${user.id}> <@&${panel.staffRoleId}>`,
      embeds: [optideskEmbed],
      components: [controlRow],
    });

    await interaction.editReply({
      content: `Your ticket has been created: ${channel}`,
    });
  } catch (err: any) {
    await interaction.editReply({
      content: `Failed to create ticket channel: ${err?.message || String(err)}`,
    });
  }
}

async function handleTicketCloseButton(interaction: ButtonInteraction): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId(`ticket_modal_close_${interaction.channelId}`)
    .setTitle('Close Ticket');

  const input = new TextInputBuilder()
    .setCustomId('close_reason')
    .setLabel('Reason for closing')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('State the resolution or reason for closing...')
    .setRequired(true)
    .setMinLength(3)
    .setMaxLength(500);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
}

async function handleTicketCloseModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const channel = interaction.channel as TextChannel | null;
  if (!channel || !interaction.guild) return;

  const reason = interaction.fields.getTextInputValue('close_reason').trim();
  const ticket = await getTicketByChannel(channel.id);

  if (!ticket) {
    await interaction.reply({ content: 'This channel is not an active ticket.', ephemeral: true });
    return;
  }

  await interaction.deferReply();

  try {
    // 1. Remove opener view permission
    await channel.permissionOverwrites.edit(ticket.userId, {
      ViewChannel: false,
    });

    // 2. Mark closed in DB
    await closeTicket(channel.id, interaction.user.id, reason);

    // 3. Generate HTML Transcript
    let transcriptAttachment: any = null;
    try {
      transcriptAttachment = await discordTranscripts.createTranscript(channel as any, {
        limit: -1,
        returnType: discordTranscripts.ExportReturnType.Attachment,
        filename: `transcript-ticket-${ticket.ticketNumber}.html`,
        saveImages: false,
        poweredBy: false,
      });
    } catch {
      // Transcript generation error fallback
    }

    // 4. Send Transcript to Server Log Channel
    const logChannelId = await getLogChannel(interaction.guild.id);
    if (logChannelId) {
      const logChannel = interaction.guild.channels.cache.get(logChannelId) as GuildTextBasedChannel | undefined;
      if (logChannel && 'send' in logChannel) {
        const logEmbed = new EmbedBuilder()
          .setColor(0xef4444)
          .setTitle(`Ticket #${ticket.ticketNumber} Closed`)
          .addFields(
            { name: 'Opener', value: `<@${ticket.userId}>`, inline: true },
            { name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Category', value: ticket.category, inline: true },
            { name: 'Reason', value: reason },
          )
          .setTimestamp();

        await logChannel.send({
          embeds: [logEmbed],
          files: transcriptAttachment ? [transcriptAttachment] : [],
        }).catch(() => {});
      }
    }

    // 5. Send Transcript directly to Opener DM
    const opener = await interaction.client.users.fetch(ticket.userId).catch(() => null);
    if (opener) {
      const dmEmbed = new EmbedBuilder()
        .setColor(0x10b981)
        .setTitle(`Your Ticket #${ticket.ticketNumber} Has Been Closed`)
        .setDescription(
          `Your support ticket in **${interaction.guild.name}** has been resolved and closed.\n\n` +
          `**Close Reason:** ${reason}\n` +
          `**Closed By:** ${interaction.user.tag}`
        )
        .setFooter({ text: 'A copy of your ticket transcript is attached.' })
        .setTimestamp();

      await opener.send({
        embeds: [dmEmbed],
        files: transcriptAttachment ? [transcriptAttachment] : [],
      }).catch(() => {});
    }

    // 6. Post In-Channel Closed Notice with Admin-Only Reopen & Delete buttons
    const closedEmbed = new EmbedBuilder()
      .setColor(0xef4444)
      .setTitle(`Ticket Closed`)
      .setDescription(
        `Ticket closed by <@${interaction.user.id}>.\n` +
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

    await interaction.editReply({
      embeds: [closedEmbed],
      components: [adminRow],
    });
  } catch (err: any) {
    await interaction.editReply({
      content: `Failed to close ticket: ${err?.message || String(err)}`,
    });
  }
}

async function handleTicketClaimButton(interaction: ButtonInteraction): Promise<void> {
  const channel = interaction.channel as TextChannel | null;
  if (!channel || !interaction.guild || !interaction.member) return;

  const ticket = await getTicketByChannel(channel.id);
  if (!ticket) {
    await interaction.reply({ content: 'This channel is not an active ticket.', ephemeral: true });
    return;
  }

  const panel = ticket.panelId ? await getTicketPanelById(ticket.panelId) : null;
  const member = interaction.guild.members.cache.get(interaction.user.id);
  const isStaff = panel ? member?.roles.cache.has(panel.staffRoleId) : false;
  const authority = getAuthorityLevel(interaction.user.id, interaction.guild.ownerId, member);

  if (!isStaff && authority < AuthorityLevel.ServerAdmin) {
    await interaction.reply({ content: 'Only designated staff can claim this ticket.', ephemeral: true });
    return;
  }

  await updateTicketClaim(channel.id, interaction.user.id);
  await channel.setTopic(`${channel.topic || ''} | Claimed by: ${interaction.user.tag}`).catch(() => {});

  await interaction.reply({
    content: `🛡️ <@${interaction.user.id}> has claimed this ticket and will be assisting you.`,
  });
}

async function handleTicketCmdGuide(interaction: ButtonInteraction): Promise<void> {
  await interaction.reply({
    content:
      `**Ticket Staff Commands:**\n` +
      `• \`ticket close [reason]\` — Closes ticket and dispatches transcripts\n` +
      `• \`ticket add @user\` — Grants user access to ticket channel\n` +
      `• \`ticket remove @user\` — Revokes user access\n` +
      `• \`ticket claim\` — Claims ticket handling\n` +
      `• \`ticket reopen\` — Reopens closed ticket (Admin only)\n` +
      `• \`ticket delete\` — Permanently deletes ticket channel (Admin only)`,
    ephemeral: true,
  });
}

async function handleTicketReopenButton(interaction: ButtonInteraction): Promise<void> {
  const channel = interaction.channel as TextChannel | null;
  if (!channel || !interaction.guild) return;

  const member = interaction.guild.members.cache.get(interaction.user.id);
  const authority = getAuthorityLevel(interaction.user.id, interaction.guild.ownerId, member);

  // Admins & above exclusive right to reopen
  if (authority < AuthorityLevel.ServerAdmin) {
    await interaction.reply({
      content: 'Only administrators can reopen a closed ticket. Staff must request admin override.',
      ephemeral: true,
    });
    return;
  }

  const ticket = await getTicketByChannel(channel.id);
  if (!ticket) {
    await interaction.reply({ content: 'Ticket not found.', ephemeral: true });
    return;
  }

  await reopenTicket(channel.id);

  // Restore opener permissions
  await channel.permissionOverwrites.edit(ticket.userId, {
    ViewChannel: true,
    SendMessages: true,
    AttachFiles: true,
    EmbedLinks: true,
    ReadMessageHistory: true,
  });

  await interaction.reply({
    content: `🔓 Ticket reopened by <@${interaction.user.id}>. <@${ticket.userId}> has been granted access again.`,
  });
}

async function handleTicketDeleteButton(interaction: ButtonInteraction): Promise<void> {
  const channel = interaction.channel as TextChannel | null;
  if (!channel || !interaction.guild) return;

  const member = interaction.guild.members.cache.get(interaction.user.id);
  const authority = getAuthorityLevel(interaction.user.id, interaction.guild.ownerId, member);

  // Admins & above exclusive right to delete
  if (authority < AuthorityLevel.ServerAdmin) {
    await interaction.reply({
      content: 'Only administrators can permanently delete tickets.',
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({ content: 'Deleting ticket channel in 5 seconds...' });
  await deleteTicket(channel.id);

  setTimeout(async () => {
    await channel.delete('Ticket deleted by admin').catch(() => {});
  }, 5000);
}

