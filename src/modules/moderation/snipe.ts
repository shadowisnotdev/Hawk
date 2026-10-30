import {
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import {
  getSnipes,
  getEditSnipes,
  clearChannelSnipe,
  type SnipeData,
  type EditSnipeData,
} from './SnipeManager.js';
import { HawkTheme } from '../../core/ui/theme.js';
import { ui, type ComponentV2Payload } from '../../core/ui/index.js';

function buildSnipeEmbed(snipe: SnipeData, currentIndex: number, total: number): EmbedBuilder {
  const unixTimestamp = Math.floor(snipe.deletedAt.getTime() / 1000);

  const embed = new EmbedBuilder()
    .setColor(HawkTheme.colors.primary)
    .setAuthor({
      name: `${snipe.authorTag} (${snipe.authorId})`,
      iconURL: snipe.authorAvatar,
    })
    .setDescription(
      `**Author:** **${snipe.authorTag}** (\`${snipe.authorId}\`)\n` +
      `**Deleted:** <t:${unixTimestamp}:R> (<t:${unixTimestamp}:T>)\n\n` +
      (snipe.content ? snipe.content : '*[No text content]*')
    )
    .setFooter({
      text: `Deleted Message ${currentIndex + 1} of ${total} • Auto-expires after 30m`,
    });

  if (snipe.attachments.length > 0) {
    embed.addFields({
      name: `Attachments [${snipe.attachments.length}]`,
      value: snipe.attachments.map((url, i) => `[Attachment ${i + 1}](${url})`).join(' • '),
    });

    const firstImg = snipe.attachments.find((url) => /\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i.test(url));
    if (firstImg) {
      embed.setImage(firstImg);
    }
  }

  return embed;
}

function buildEditSnipePayload(editSnipe: EditSnipeData, currentIndex: number, total: number): ComponentV2Payload {
  const unixTimestamp = Math.floor(editSnipe.editedAt.getTime() / 1000);
  const sections: string[] = [];

  sections.push(`**Author:** **${editSnipe.authorTag}** (\`${editSnipe.authorId}\`)\n**Edited:** <t:${unixTimestamp}:R> (<t:${unixTimestamp}:T>)`);
  sections.push(`**Before:**\n${editSnipe.oldContent}`);
  sections.push(`**After:**\n${editSnipe.newContent}`);

  if (editSnipe.attachments.length > 0) {
    sections.push(
      `**Attachments (${editSnipe.attachments.length}):**\n` +
      editSnipe.attachments.map((url, i) => `[Attachment ${i + 1}](${url})`).join(' • ')
    );
  }

  return ui.standard({
    title: `Edited Message ${currentIndex + 1} of ${total}`,
    sections,
  });
}

function buildNavButtons(prefix: string, currentIndex: number, total: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}_prev`)
      .setLabel('◀ Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentIndex <= 0),
    new ButtonBuilder()
      .setCustomId(`${prefix}_count`)
      .setLabel(`${currentIndex + 1} / ${total}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`${prefix}_next`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentIndex >= total - 1),
  );
}

export default defineCommand({
  name: 'snipe',
  aliases: ['s', 'esnipe', 'clearsnipe'],
  module: 'moderation',
  description: 'Retrieve recently deleted or edited messages in this channel, or clear snipe history.',
  usage: 'snipe [index|list] | snipe edit [index|list] | snipe clear',
  examples: ['snipe', 'snipe 2', 'snipe edit', 'snipe edit 2', 'snipe list', 'snipe clear', 'esnipe', 'clearsnipe'],
  permissions: [PermissionsBitField.Flags.ManageMessages],
  botPermissions: [PermissionsBitField.Flags.SendMessages],
  cooldown: 3,

  async execute(ctx: CommandContext): Promise<void> {
    const { channel, parsed, respond } = ctx;
    const aliasUsed = parsed.aliasUsed.toLowerCase();

    // ── Clear Snipe Shortcut / Subcommand ──
    if (['clearsnipe', 'cs', 'csnipe'].includes(aliasUsed) || parsed.args[0]?.toLowerCase() === 'clear') {
      const cleared = clearChannelSnipe(channel.id);
      if (cleared) {
        await respond.success('Snipe and edit snipe history has been cleared for this channel.');
      } else {
        await respond.info('No active snipe or edit snipe records found for this channel.');
      }
      return;
    }

    // ── Edit Snipe Shortcut / Subcommand ──
    const isEditSnipe = ['esnipe', 'editsnipe', 'es', 'editsnipes'].includes(aliasUsed) || parsed.args[0]?.toLowerCase() === 'edit';
    const effectiveArgs = parsed.args[0]?.toLowerCase() === 'edit' ? parsed.args.slice(1) : parsed.args;

    if (isEditSnipe) {
      await handleEditSnipe(ctx, effectiveArgs);
    } else {
      await handleDeleteSnipe(ctx, effectiveArgs);
    }
  },
});

async function handleDeleteSnipe(ctx: CommandContext, args: string[]): Promise<void> {
  const { channel, member, respond } = ctx;
  const snipes = getSnipes(channel.id);
  if (snipes.length === 0) {
    await respond.info('There are no recently deleted messages to snipe in this channel (or all records have expired after 30m).');
    return;
  }

  const firstArg = args[0]?.toLowerCase();

  if (firstArg === 'list' || firstArg === 'history') {
    const lines = snipes.map((s, i) => {
      const time = Math.floor(s.deletedAt.getTime() / 1000);
      const snippet = s.content ? (s.content.length > 50 ? s.content.slice(0, 47) + '...' : s.content) : '[No Text Content]';
      const attachStr = s.attachments.length > 0 ? ` • \`[${s.attachments.length} attachment(s)]\`` : '';
      return `\`${i + 1}.\` **${s.authorTag}** (<t:${time}:R>): "${snippet}"${attachStr}`;
    });

    await ui.paginated(ctx, {
      title: `Deleted Message History (${snipes.length})`,
      items: lines,
      pageSize: 8,
      emptyText: 'No deleted messages recorded.',
    });
    return;
  }

  let initialIndex = 0;
  if (firstArg && /^\d+$/.test(firstArg)) {
    const parsedNum = parseInt(firstArg, 10);
    if (parsedNum >= 1 && parsedNum <= snipes.length) {
      initialIndex = parsedNum - 1;
    } else {
      await respond.warning(`Invalid index. Available range: **1 to ${snipes.length}**.`);
      return;
    }
  }

  let currentIndex = initialIndex;
  const initialEmbed = buildSnipeEmbed(snipes[currentIndex], currentIndex, snipes.length);

  if (snipes.length === 1) {
    await respond.raw({ embeds: [initialEmbed] });
    return;
  }

  const initialRow = buildNavButtons('snipe', currentIndex, snipes.length);
  const sentMsg = await respond.raw({
    embeds: [initialEmbed],
    components: [initialRow],
  });

  const collector = sentMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.user.id === member.id,
    time: 90000,
  });

  collector.on('collect', async (interaction) => {
    if (interaction.customId === 'snipe_prev') {
      if (currentIndex > 0) currentIndex--;
    } else if (interaction.customId === 'snipe_next') {
      if (currentIndex < snipes.length - 1) currentIndex++;
    }

    const updatedEmbed = buildSnipeEmbed(snipes[currentIndex], currentIndex, snipes.length);
    const updatedRow = buildNavButtons('snipe', currentIndex, snipes.length);

    await interaction.update({
      embeds: [updatedEmbed],
      components: [updatedRow],
    });
  });

  collector.on('end', () => {
    const disabledRow = buildNavButtons('snipe', currentIndex, snipes.length);
    disabledRow.components.forEach(c => c.setDisabled(true));
    sentMsg.edit({ components: [disabledRow] }).catch(() => {});
  });
}

async function handleEditSnipe(ctx: CommandContext, args: string[]): Promise<void> {
  const { channel, member, respond } = ctx;
  const snipes = getEditSnipes(channel.id);
  if (snipes.length === 0) {
    await respond.info('There are no recently edited messages to snipe in this channel (or all records have expired after 30m).');
    return;
  }

  const firstArg = args[0]?.toLowerCase();

  if (firstArg === 'list' || firstArg === 'history') {
    const lines = snipes.map((s, i) => {
      const time = Math.floor(s.editedAt.getTime() / 1000);
      const snippet = s.newContent ? (s.newContent.length > 50 ? s.newContent.slice(0, 47) + '...' : s.newContent) : '[No Text Content]';
      const attachStr = s.attachments.length > 0 ? ` • \`[${s.attachments.length} attachment(s)]\`` : '';
      return `\`${i + 1}.\` **${s.authorTag}** (<t:${time}:R>): "${snippet}"${attachStr}`;
    });

    await ui.paginated(ctx, {
      title: `Edited Message History (${snipes.length})`,
      items: lines,
      pageSize: 8,
      emptyText: 'No edited messages recorded.',
    });
    return;
  }

  let initialIndex = 0;
  if (firstArg && /^\d+$/.test(firstArg)) {
    const parsedNum = parseInt(firstArg, 10);
    if (parsedNum >= 1 && parsedNum <= snipes.length) {
      initialIndex = parsedNum - 1;
    } else {
      await respond.warning(`Invalid index. Available range: **1 to ${snipes.length}**.`);
      return;
    }
  }

  let currentIndex = initialIndex;
  const initialPayload = buildEditSnipePayload(snipes[currentIndex], currentIndex, snipes.length);

  if (snipes.length === 1) {
    await respond.raw({
      components: initialPayload.components,
      flags: initialPayload.flags as any,
    });
    return;
  }

  const initialRow = buildNavButtons('esnipe', currentIndex, snipes.length);
  const sentMsg = await respond.raw({
    components: [...initialPayload.components, initialRow],
    flags: initialPayload.flags as any,
  });

  const collector = sentMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.user.id === member.id,
    time: 90000,
  });

  collector.on('collect', async (interaction) => {
    if (interaction.customId === 'esnipe_prev') {
      if (currentIndex > 0) currentIndex--;
    } else if (interaction.customId === 'esnipe_next') {
      if (currentIndex < snipes.length - 1) currentIndex++;
    }

    const updatedPayload = buildEditSnipePayload(snipes[currentIndex], currentIndex, snipes.length);
    const updatedRow = buildNavButtons('esnipe', currentIndex, snipes.length);

    await interaction.update({
      components: [...updatedPayload.components, updatedRow],
      flags: updatedPayload.flags as any,
    });
  });

  collector.on('end', () => {
    const disabledRow = buildNavButtons('esnipe', currentIndex, snipes.length);
    disabledRow.components.forEach(c => c.setDisabled(true));
    sentMsg.edit({ components: [disabledRow] }).catch(() => {});
  });
}
