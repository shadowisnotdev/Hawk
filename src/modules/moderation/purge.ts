import {
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type Message,
  type TextChannel,
  type Collection,
  type GuildTextBasedChannel,
} from 'discord.js';
import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import { resolveUser } from '../../core/resolver/UserResolver.js';
import { resolveRole } from '../../core/resolver/RoleResolver.js';
import { removeRoleFromMember } from './roleHelpers.js';
import { mentionRole } from '../../core/utils/formatters.js';
import { logEvent } from '../../core/logging/WebhookLogger.js';
import { logAuditAction } from '../../core/logging/AuditLogger.js';
import { ui } from '../../core/ui/index.js';
import { LiveProgressTracker, renderProgressBar } from '../../core/utils/ProgressBar.js';

export default defineCommand({
  name: 'purge',
  aliases: ['c', 'clear'],
  module: 'moderation',
  description: 'Purge recent messages matching an optional user/filter, or purge a role from all members.',
  usage: 'purge [@user] <amount> | purge <amount> [filter] | purge role <@role>',
  examples: [
    'purge @User 50',
    'purge 50',
    'purge 50 bot',
    'purge 100 human',
    'purge 50 @User',
    'purge role @Muted',
    'purgerole @Muted',
    'rr @level5',
  ],
  permissions: [PermissionsBitField.Flags.ManageMessages],
  botPermissions: [PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.ReadMessageHistory],
  cooldown: 3,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, respond } = ctx;
    const aliasUsed = parsed.aliasUsed.toLowerCase();

    // ── Direct PurgeRole Aliases ──
    if (['purgerole', 'rr'].includes(aliasUsed)) {
      await handlePurgeRole(ctx, parsed.args);
      return;
    }

    if (parsed.args.length === 0) {
      await respond.error(
        `Usage: \`${parsed.prefix}purge [@user] <amount>\` or \`${parsed.prefix}purge <amount> [filter]\` or \`${parsed.prefix}purge role <@role>\``,
      );
      return;
    }

    // ── Subcommand: role ──
    if (parsed.args[0].toLowerCase() === 'role') {
      await handlePurgeRole(ctx, parsed.args.slice(1));
      return;
    }

    // ── Standard Message Purge ──
    await handleMessagePurge(ctx);
  },
});

async function handleMessagePurge(ctx: CommandContext): Promise<void> {
  const { parsed, guild, channel, message, respond, member } = ctx;

  let amount: number;
  let filterArg: string | null = null;

  const firstArg = parsed.args[0];
  const secondArg = parsed.args[1];

  const firstAsNum = parseInt(firstArg, 10);
  const secondAsNum = secondArg ? parseInt(secondArg, 10) : NaN;

  if (!isNaN(firstAsNum) && firstAsNum > 0) {
    amount = firstAsNum;
    filterArg = secondArg ? secondArg.toLowerCase() : null;
  } else if (!isNaN(secondAsNum) && secondAsNum > 0) {
    amount = secondAsNum;
    filterArg = firstArg.toLowerCase();
  } else {
    await respond.error(
      `Usage: \`${parsed.prefix}purge [@user] <amount>\` or \`${parsed.prefix}purge <amount> [bot|human|@user|embeds|links|images]\``,
    );
    return;
  }

  if (amount <= 0 || amount > 500) {
    await respond.error('Please specify a valid purge amount between 1 and 500.');
    return;
  }

  let targetUserId: string | null = null;
  let targetUserTag: string | null = null;

  if (filterArg && !['bot', 'human', 'embeds', 'links', 'images'].includes(filterArg)) {
    const userRes = await resolveUser(filterArg, guild);
    if (userRes.success) {
      targetUserId = userRes.value.id;
      targetUserTag = userRes.value.user.tag;
    } else {
      await respond.error(userRes.error ?? `Could not resolve user or filter: \`${filterArg}\``);
      return;
    }
  }

  const textChannel = channel as TextChannel;
  await message.delete().catch(() => {});

  const displayFilter = targetUserTag ? `@${targetUserTag}` : (filterArg ?? 'none');

  let statusMsg: Message | null = null;
  let tracker: LiveProgressTracker | null = null;

  if (amount > 50) {
    const initialPayload = ui.standard({
      title: 'Purging Messages',
      sections: [`**Progress:** ${renderProgressBar(0, amount)} (0/${amount})\nFilter: \`${displayFilter}\``],
    });
    statusMsg = await textChannel.send({ components: initialPayload.components, flags: initialPayload.flags as any }).catch(() => null);
    if (statusMsg) {
      tracker = new LiveProgressTracker(statusMsg, 'Purge Operations', amount);
    }
  }

  let deletedCount = 0;
  let botCount = 0;
  let humanCount = 0;
  let attachmentCount = 0;
  let linkCount = 0;

  const batchLimit = 100;
  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  let lastMessageId: string | undefined = undefined;

  while (deletedCount < amount) {
    const fetchLimit = filterArg ? batchLimit : Math.min(batchLimit, amount - deletedCount);
    const fetchOptions: { limit: number; before?: string } = { limit: fetchLimit };
    if (lastMessageId) {
      fetchOptions.before = lastMessageId;
    }

    const fetched: Collection<string, Message> = await textChannel.messages.fetch(fetchOptions).catch(() => new Map() as any);
    if (fetched.size === 0) break;

    lastMessageId = fetched.last()?.id;

    const validMessages: Message[] = [];
    for (const m of fetched.values()) {
      if (m.createdTimestamp < fourteenDaysAgo) continue;
      if (filterArg === 'bot' && !m.author.bot) continue;
      if (filterArg === 'human' && m.author.bot) continue;
      if (filterArg === 'embeds' && m.embeds.length === 0) continue;
      if (filterArg === 'links' && !/(https?:\/\/[^\s]+)/g.test(m.content)) continue;
      if (filterArg === 'images' && m.attachments.size === 0) continue;
      if (targetUserId && m.author.id !== targetUserId) continue;

      validMessages.push(m);
      if (deletedCount + validMessages.length >= amount) {
        break;
      }
    }

    if (validMessages.length === 0) {
      if (fetched.some(m => m.createdTimestamp < fourteenDaysAgo)) {
        break;
      }
      if (fetched.size < fetchLimit) {
        break;
      }
      continue;
    }

    for (const m of validMessages) {
      if (m.author.bot) botCount++;
      else humanCount++;
      if (m.attachments.size > 0) attachmentCount++;
      if (/(https?:\/\/[^\s]+)/g.test(m.content)) linkCount++;
    }

    const deleted = await textChannel.bulkDelete(validMessages, true).catch(() => null);
    if (!deleted || deleted.size === 0) break;

    deletedCount += deleted.size;
    if (tracker) {
      await tracker.update(deletedCount, `Filter: \`${displayFilter}\``);
    }

    if (deletedCount >= amount || fetched.size < fetchLimit) {
      break;
    }
  }

  if (tracker) {
    await tracker.update(deletedCount, `Filter: \`${displayFilter}\``, true);
  }

  const breakdownText = `Purged **${deletedCount}** message(s) [Users: **${humanCount}** | Bots: **${botCount}** | Media: **${attachmentCount}** | Links: **${linkCount}**] • *(Auto-deleting in 5s)*`;

  if (statusMsg) {
    const finalPayload = ui.standard({
      title: 'Purge Completed',
      text: breakdownText,
    });
    await statusMsg.edit({ components: finalPayload.components, flags: finalPayload.flags as any }).catch(() => {});
    setTimeout(() => {
      statusMsg?.delete().catch(() => {});
    }, 5000);
  } else {
    const replyMsg = await respond.success(breakdownText);
    setTimeout(() => {
      replyMsg.delete().catch(() => {});
    }, 5000);
  }

  logAuditAction({
    guild,
    action: 'Messages Purged',
    executor: member,
    channelName: textChannel.name,
    details: [
      `• **Amount Purged:** ${deletedCount} (Requested: ${amount})`,
      `• **Breakdown:** Users: ${humanCount} | Bots: ${botCount} | Media: ${attachmentCount} | Links: ${linkCount}`,
      `• **Filter:** ${displayFilter}`,
    ],
  });

  logEvent('info', 'command_execution', `Purge by ${member.user.tag}`, {
    executor: member.user.tag,
    executorId: member.id,
    guild: guild.name,
    guildId: guild.id,
    channel: channel.name,
    requestedAmount: amount,
    deletedAmount: deletedCount,
    filter: displayFilter,
  });
}

async function handlePurgeRole(ctx: CommandContext, args: string[]): Promise<void> {
  const { guild, respond, member, channel, message } = ctx;

  if (!member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    await respond.error('Manage Roles permission is required to purge a role.');
    return;
  }

  if (args.length === 0) {
    await respond.error(`Usage: \`${ctx.parsed.prefix}purge role <@role>\``);
    return;
  }

  const roleRes = resolveRole(args.join(' '), guild);
  if (!roleRes.success) {
    await respond.error(`Role: ${roleRes.error}`);
    return;
  }

  const targetRole = roleRes.value.role;

  const allMembers = await guild.members.fetch().catch(() => guild.members.cache);
  const membersWithRole = Array.from(allMembers.filter(m => m.roles.cache.has(targetRole.id)).values());
  const totalMembers = membersWithRole.length;

  if (totalMembers === 0) {
    await respond.info(`No members currently possess the role ${mentionRole(targetRole, guild)}.`);
    return;
  }

  if (totalMembers > 10) {
    const confirmId = `purgerole_confirm_${message.id}`;
    const cancelId = `purgerole_cancel_${message.id}`;

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(confirmId)
        .setLabel(`Confirm Purge (${totalMembers} members)`)
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(cancelId)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary),
    );

    const promptPayload = ui.standard({
      title: 'High-Impact Role Purge Confirmation',
      text:
        `Are you sure you want to remove ${mentionRole(targetRole, guild)} from **${totalMembers}** members?\n\n` +
        'This action cannot be undone automatically. You have **30 seconds** to confirm.',
      components: [row],
    });

    const promptMsg = await (channel as GuildTextBasedChannel).send({
      components: promptPayload.components,
      flags: promptPayload.flags as any,
    });

    let confirmed = false;
    try {
      const interaction = await promptMsg.awaitMessageComponent({
        filter: (i) => i.user.id === member.id && (i.customId === confirmId || i.customId === cancelId),
        time: 30_000,
        componentType: ComponentType.Button,
      });

      if (interaction.customId === confirmId) {
        confirmed = true;
        await interaction.deferUpdate().catch(() => {});
      } else {
        await interaction.update({
          content: '> Role purge cancelled.',
          components: [],
        }).catch(() => {});
        setTimeout(() => promptMsg.delete().catch(() => {}), 5000);
        return;
      }
    } catch {
      await promptMsg.edit({
        content: '> Role purge confirmation timed out.',
        components: [],
      }).catch(() => {});
      setTimeout(() => promptMsg.delete().catch(() => {}), 5000);
      return;
    }

    if (!confirmed) return;
    await promptMsg.delete().catch(() => {});
  }

  const initialPayload = ui.standard({
    title: `Purging Role: ${targetRole.name}`,
    text: `Target: ${mentionRole(targetRole, guild)} (${totalMembers} members)\n**Progress:** ${renderProgressBar(0, totalMembers)} (0/${totalMembers})\nRemoved: **0** | Skipped: **0**`,
  });
  const statusMsg = await (channel as GuildTextBasedChannel).send({
    components: initialPayload.components,
    flags: initialPayload.flags as any,
  }).catch(() => null);
  const tracker = statusMsg ? new LiveProgressTracker(statusMsg, `Purging Role (${targetRole.name})`, totalMembers) : null;

  let removedCount = 0;
  let skippedCount = 0;
  let processed = 0;

  const CHUNK_SIZE = 5;
  for (let i = 0; i < membersWithRole.length; i += CHUNK_SIZE) {
    const chunk = membersWithRole.slice(i, i + CHUNK_SIZE);
    const results = await Promise.all(
      chunk.map(targetMember =>
        removeRoleFromMember(guild, targetMember, targetRole, member).then(res => ({ targetMember, res }))
      )
    );

    for (const { res } of results) {
      if (res === 'removed') {
        removedCount++;
      } else {
        skippedCount++;
      }
    }
    processed += chunk.length;
    if (tracker) {
      await tracker.update(processed, `Removed: **${removedCount}** | Skipped: **${skippedCount}**`);
    }
    if (i + CHUNK_SIZE < membersWithRole.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  if (tracker) {
    await tracker.update(totalMembers, `Removed: **${removedCount}** | Skipped: **${skippedCount}**`, true);
  }

  const finalPayload = ui.standard({
    title: 'Role Purge Completed',
    text:
      `• **Target Role:** \`${targetRole.name}\` (${mentionRole(targetRole, guild)})\n` +
      `• **Removed From:** **${removedCount}** member(s)` +
      (skippedCount > 0 ? `\n• **Skipped:** **${skippedCount}** member(s)` : '') +
      '\n• *(Auto-deleting in 5s)*',
  });

  if (statusMsg) {
    await statusMsg.edit({ components: finalPayload.components, flags: finalPayload.flags as any }).catch(() => {});
    setTimeout(() => {
      statusMsg?.delete().catch(() => {});
    }, 5000);
  } else {
    const replyMsg = await respond.success(
      `Purged role \`${targetRole.name}\` (${mentionRole(targetRole, guild)}) from **${removedCount}** member(s).` +
      (skippedCount > 0 ? ` Skipped: **${skippedCount}**` : ''),
    );
    setTimeout(() => {
      replyMsg.delete().catch(() => {});
    }, 5000);
  }

  logAuditAction({
    guild,
    action: 'Role Purged from Members',
    executor: member,
    target: mentionRole(targetRole, guild),
    details: [
      `• **Role:** \`${targetRole.name}\` (${targetRole.id})`,
      `• **Members Affected:** ${removedCount} removed (Skipped: ${skippedCount})`,
    ],
  });

  logEvent('info', 'command_execution', `Role purge (${targetRole.name}) by ${member.user.tag}`, {
    executor: member.user.tag,
    executorId: member.id,
    guild: guild.name,
    guildId: guild.id,
    targetRole: targetRole.name,
    targetRoleId: targetRole.id,
    removedCount,
    skippedCount,
  });
}
