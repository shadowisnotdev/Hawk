import { PermissionsBitField } from 'discord.js';
import type { GuildTextBasedChannel } from 'discord.js';
import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import {
  getSticky,
  setSticky,
  deleteSticky,
  updateStickyMessageId,
  getStickiesForGuild,
} from '../../core/database/repositories/stickyRepo.js';
import { logEvent } from '../../core/logging/WebhookLogger.js';
import { mentionChannel } from '../../core/utils/formatters.js';
import { ui } from '../../core/ui/index.js';

export default defineCommand({
  name: 'sticky',
  aliases: ['stick', 'unstick', 'stickyedit', 'stickyrefresh'],
  module: 'sticky',
  description: 'Create, edit, remove, refresh, or list sticky messages in channels.',
  usage: 'sticky <message...> | sticky edit <new_message...> | sticky remove | sticky refresh | sticky list',
  examples: [
    'sticky Welcome to the server! Read #rules.',
    'sticky edit Updated server information.',
    'sticky remove',
    'sticky refresh',
    'sticky list',
    'unstick',
  ],
  permissions: [PermissionsBitField.Flags.ManageMessages],
  botPermissions: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageMessages],
  cooldown: 3,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, guild, channel, message, respond, member } = ctx;
    const textChannel = channel as GuildTextBasedChannel;
    const aliasUsed = parsed.aliasUsed.toLowerCase();

    // ── Shortcut Aliases ──
    if (['unstick', 'removesticky', 'stickyremove'].includes(aliasUsed)) {
      await handleStickyRemove(ctx);
      return;
    }
    if (['stickyrefresh', 'srefresh', 'refreshsticky'].includes(aliasUsed)) {
      await handleStickyRefresh(ctx);
      return;
    }
    if (aliasUsed === 'stickyedit') {
      await handleStickyEdit(ctx, parsed.rawArgs);
      return;
    }

    const firstWord = parsed.args[0]?.toLowerCase();

    // ── Subcommand: remove / delete / clear ──
    if (firstWord === 'remove' || firstWord === 'delete' || firstWord === 'clear') {
      await handleStickyRemove(ctx);
      return;
    }

    // ── Subcommand: refresh / resend ──
    if (firstWord === 'refresh' || firstWord === 'resend') {
      await handleStickyRefresh(ctx);
      return;
    }

    // ── Subcommand: edit ──
    if (firstWord === 'edit') {
      const editContent = parsed.args.slice(1).join(' ').trim();
      await handleStickyEdit(ctx, editContent);
      return;
    }

    // ── Subcommand: list ──
    if (firstWord === 'list' || firstWord === 'show') {
      const stickies = await getStickiesForGuild(guild.id);
      if (stickies.length === 0) {
        await respond.info('No active sticky messages configured in this server.');
        return;
      }
      const lines = stickies.map((s) => {
        const snippet = s.content.length > 60 ? s.content.slice(0, 57) + '...' : s.content;
        return `• ${mentionChannel(s.channelId)} — "${snippet}"`;
      });
      await ui.paginated(ctx, {
        title: `Active Sticky Messages (${stickies.length})`,
        items: lines,
        pageSize: 8,
        emptyText: 'No active sticky messages found.',
      });
      return;
    }

    // ── Default Action: Create / Overwrite Sticky ──
    let stickyContent = parsed.rawArgs.trim();

    // If no raw arguments provided, check if the command is a reply to another message
    if (!stickyContent && message.reference?.messageId) {
      const referencedMsg = await channel.messages.fetch(message.reference.messageId).catch(() => null);
      if (referencedMsg) {
        const parts: string[] = [];
        if (referencedMsg.content) parts.push(referencedMsg.content);
        if (referencedMsg.attachments.size > 0) {
          const attachmentUrls = Array.from(referencedMsg.attachments.values()).map(a => a.url);
          parts.push(...attachmentUrls);
        }
        stickyContent = parts.join('\n').trim();
      }
    }

    if (!stickyContent) {
      await respond.error(
        `Usage: \`${parsed.prefix}sticky <message...>\` or reply to a message with \`${parsed.prefix}sticky\`.\nSubcommands: \`edit\`, \`remove\`, \`refresh\`, \`list\`.`,
      );
      return;
    }

    const existingSticky = await getSticky(guild.id, channel.id);

    // 1. Delete previous sticky message if present
    if (existingSticky) {
      const prevMsg = await textChannel.messages.fetch(existingSticky.messageId).catch(() => null);
      if (prevMsg) {
        await prevMsg.delete().catch(() => {});
      }
    }

    // 2. Auto-delete command invocation message (non-blocking)
    message.delete().catch(() => {});

    // 3. Post new sticky message
    const stickyMsg = await textChannel.send({
      content: stickyContent,
      allowedMentions: {
        parse: [],
        roles: [],
        users: [],
      },
    });

    // 4. Save/update sticky configuration in database
    const record = await setSticky({
      guildId: guild.id,
      channelId: channel.id,
      messageId: stickyMsg.id,
      content: stickyContent,
    });

    logEvent('info', 'command_execution', `Sticky created in #${channel.name} by ${member.user.tag}`, {
      executor: member.user.tag,
      executorId: member.id,
      guild: guild.name,
      guildId: guild.id,
      channel: channel.name,
      channelId: channel.id,
      messageId: stickyMsg.id,
      content: stickyContent,
      stickyId: record.id,
    });
  },
});

async function handleStickyEdit(ctx: CommandContext, newContent: string): Promise<void> {
  const { guild, channel, message, respond, member } = ctx;
  const textChannel = channel as GuildTextBasedChannel;

  const existingSticky = await getSticky(guild.id, channel.id);
  if (!existingSticky) {
    await respond.error(`No active sticky configuration found for this channel. Use \`${ctx.parsed.prefix}sticky <message...>\` first.`);
    return;
  }

  if (!newContent) {
    await respond.error(`Usage: \`${ctx.parsed.prefix}sticky edit <new_message...>\``);
    return;
  }

  const oldMsgId = existingSticky.messageId;

  // Auto-delete command invocation message
  await message.delete().catch(() => {});

  let newMsgId = oldMsgId;
  const targetMsg = await textChannel.messages.fetch(oldMsgId).catch(() => null);

  if (targetMsg) {
    await targetMsg.edit({
      content: newContent,
      allowedMentions: { parse: [], roles: [], users: [] },
    });
  } else {
    const recreatedMsg = await textChannel.send({
      content: newContent,
      allowedMentions: { parse: [], roles: [], users: [] },
    });
    newMsgId = recreatedMsg.id;
  }

  await setSticky({
    guildId: guild.id,
    channelId: channel.id,
    messageId: newMsgId,
    content: newContent,
  });

  logEvent('info', 'command_execution', `Sticky edited in #${channel.name} by ${member.user.tag}`, {
    executor: member.user.tag,
    executorId: member.id,
    guild: guild.name,
    guildId: guild.id,
    channel: channel.name,
    channelId: channel.id,
    oldMessageId: oldMsgId,
    newMessageId: newMsgId,
    newContent,
  });
}

async function handleStickyRemove(ctx: CommandContext): Promise<void> {
  const { guild, channel, message, respond, member } = ctx;
  const existingSticky = await getSticky(guild.id, channel.id);
  if (!existingSticky) {
    await respond.error('No active sticky configuration found for this channel.');
    return;
  }

  const textChannel = channel as GuildTextBasedChannel;
  const targetMsg = await textChannel.messages.fetch(existingSticky.messageId).catch(() => null);
  if (targetMsg) {
    await targetMsg.delete().catch(() => {});
  }

  await deleteSticky(guild.id, channel.id);
  await message.delete().catch(() => {});

  logEvent('info', 'command_execution', `Sticky removed from #${channel.name} by ${member.user.tag}`, {
    executor: member.user.tag,
    executorId: member.id,
    guild: guild.name,
    guildId: guild.id,
    channel: channel.name,
    channelId: channel.id,
    removedMessageId: existingSticky.messageId,
  });
}

async function handleStickyRefresh(ctx: CommandContext): Promise<void> {
  const { guild, channel, message, respond, member } = ctx;
  const existingSticky = await getSticky(guild.id, channel.id);
  if (!existingSticky) {
    await respond.error('No active sticky configuration found for this channel.');
    return;
  }

  const textChannel = channel as GuildTextBasedChannel;
  const oldMsgId = existingSticky.messageId;

  await message.delete().catch(() => {});

  const prevMsg = await textChannel.messages.fetch(oldMsgId).catch(() => null);
  if (prevMsg) {
    await prevMsg.delete().catch(() => {});
  }

  const newStickyMsg = await textChannel.send({
    content: existingSticky.content,
    allowedMentions: { parse: [], roles: [], users: [] },
  });

  await updateStickyMessageId(guild.id, channel.id, newStickyMsg.id);

  logEvent('info', 'command_execution', `Sticky refreshed in #${channel.name} by ${member.user.tag}`, {
    executor: member.user.tag,
    executorId: member.id,
    guild: guild.name,
    guildId: guild.id,
    channel: channel.name,
    channelId: channel.id,
    oldMessageId: oldMsgId,
    newMessageId: newStickyMsg.id,
  });
}
