import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionsBitField,
  type TextChannel,
} from 'discord.js';
import { defineCommand, type CommandContext } from '../../types/command.js';
import {
  createTicketPanel,
  getTicketPanel,
  listTicketPanels,
  deleteTicketPanel,
} from '../../core/database/repositories/ticketRepo.js';
import { resolveChannel } from '../../core/resolver/ChannelResolver.js';
import { mentionRole, mentionChannel } from '../../core/utils/formatters.js';

export default defineCommand({
  name: 'panel',
  aliases: ['ticketpanel'],
  module: 'ticket',
  description: 'Manage interactive support ticket panels (create, view, edit, delete, send).',
  usage: 'panel create <name> | panel view <name> | panel delete <name> | panel send <name> [channel]',
  examples: [
    'panel create support',
    'panel view support',
    'panel send support #tickets',
    'panel delete support',
  ],
  permissions: [PermissionsBitField.Flags.ManageGuild],
  botPermissions: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageMessages],
  cooldown: 3,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, guild, respond } = ctx;

    if (parsed.args.length === 0) {
      await respond.info(
        `**Ticket Panel Management:**\n` +
        `• \`${parsed.prefix}panel create <name>\` — Create a new interactive ticket panel\n` +
        `• \`${parsed.prefix}panel view <name>\` — Render live preview of panel\n` +
        `• \`${parsed.prefix}panel send <name> [channel]\` — Post the interactive panel to a channel\n` +
        `• \`${parsed.prefix}panel delete <name>\` — Remove panel configuration\n` +
        `• \`${parsed.prefix}panel list\` — View all configured panels`
      );
      return;
    }

    const sub = parsed.args[0].toLowerCase();
    const panelName = parsed.args[1]?.toLowerCase();

    // ── Subcommand: list ──
    if (sub === 'list') {
      const panels = await listTicketPanels(guild.id);
      if (panels.length === 0) {
        await respond.info('No ticket panels have been configured in this server.');
        return;
      }

      const listStr = panels
        .map((p) => `• **${p.name}** — Staff: ${mentionRole(p.staffRoleId, guild)} ${p.categoryId ? `(Cat: ${mentionChannel(p.categoryId)})` : ''}`)
        .join('\n');

      await respond.send(`**Configured Ticket Panels (${panels.length}):**\n${listStr}`);
      return;
    }

    if (!panelName) {
      await respond.error(`Please specify a panel name.\nUsage: \`${parsed.prefix}panel ${sub} <name>\``);
      return;
    }

    // ── Subcommand: create ──
    if (sub === 'create') {
      // Find default staff role or mention in guild
      const staffRole = guild.roles.cache.find(
        (r) => r.name.toLowerCase().includes('staff') || r.name.toLowerCase().includes('mod') || r.name.toLowerCase().includes('support')
      ) || guild.roles.highest;

      // Default Discohook visual layout
      const panel = await createTicketPanel({
        guildId: guild.id,
        name: panelName,
        title: 'Support Tickets',
        description:
          `Need help? We've got you covered!\n` +
          `Use the button below to open a ticket.\n\n` +
          `• For questions about the server\n` +
          `• For reporting issues or problems\n` +
          `• For private staff assistance\n` +
          `• To claim rewards won from events and giveaways\n\n` +
          `*Making troll or unnecessary tickets will result in a warning.*`,
        buttonLabel: 'Create Ticket',
        staffRoleId: staffRole.id,
        categoryId: ('parentId' in ctx.channel && ctx.channel.parentId) ? ctx.channel.parentId : null,
      });

      await respond.success(
        `Created ticket panel **${panel.name}**!\n` +
        `• **Staff Role:** ${mentionRole(panel.staffRoleId, guild)}\n` +
        `• **Destination Category:** ${panel.categoryId ? mentionChannel(panel.categoryId) : 'None'}\n\n` +
        `Use \`${parsed.prefix}panel view ${panel.name}\` to preview or \`${parsed.prefix}panel send ${panel.name} [channel]\` to post.`
      );
      return;
    }

    // ── Subcommand: view (Preview render) ──
    if (sub === 'view') {
      const panel = await getTicketPanel(guild.id, panelName);
      if (!panel) {
        await respond.error(`Panel **${panelName}** does not exist.`);
        return;
      }

      const { content, embed, row } = buildPanelPayload(panel, true);
      await ctx.channel.send({ content, embeds: [embed], components: [row] });
      return;
    }

    // ── Subcommand: send (Post to target channel) ──
    if (sub === 'send') {
      const panel = await getTicketPanel(guild.id, panelName);
      if (!panel) {
        await respond.error(`Panel **${panelName}** does not exist.`);
        return;
      }

      let targetChannel = ctx.channel as TextChannel;
      if (parsed.args[2]) {
        const cRes = resolveChannel(parsed.args[2], guild);
        if (cRes.success && cRes.value.channel.isTextBased()) {
          targetChannel = cRes.value.channel as TextChannel;
        } else {
          await respond.error(`Target channel could not be resolved: ${cRes.success ? 'Not a text channel' : cRes.error}`);
          return;
        }
      }

      const { content, embed, row } = buildPanelPayload(panel, false);
      await targetChannel.send({ content, embeds: [embed], components: [row] });
      await respond.success(`Posted ticket panel **${panel.name}** in ${mentionChannel(targetChannel.id)}.`);
      return;
    }

    // ── Subcommand: delete ──
    if (sub === 'delete' || sub === 'del' || sub === 'remove') {
      const deleted = await deleteTicketPanel(guild.id, panelName);
      if (deleted) {
        await respond.success(`Ticket panel **${panelName}** was deleted.`);
      } else {
        await respond.error(`Ticket panel **${panelName}** was not found.`);
      }
      return;
    }

    await respond.error(`Unknown panel subcommand: \`${sub}\`.\nUsage: \`${parsed.prefix}panel create|view|send|delete <name>\``);
  },
});

function buildPanelPayload(panel: any, isPreview: boolean) {
  // Discohook Style Layout Matching Screenshot
  const content = `# AMO\n# SUPPORT`;

  const embed = new EmbedBuilder()
    .setColor(0x10b981)
    .setTitle(`🎟️ ${panel.title}`)
    .setDescription(panel.description)
    .setFooter({ text: isPreview ? '[Preview Mode - Button Disabled]' : 'Support Desk' });

  if (panel.thumbnailUrl) {
    embed.setThumbnail(panel.thumbnailUrl);
  }

  const button = new ButtonBuilder()
    .setCustomId(`ticket_open_${panel.id}`)
    .setLabel(panel.buttonLabel || 'Create Ticket')
    .setEmoji('🎟️')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(isPreview);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  return { content, embed, row };
}

