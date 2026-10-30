import { PermissionsBitField } from 'discord.js';
import type { GuildTextBasedChannel } from 'discord.js';
import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import {
  setAfk,
  getAfkEntriesForGuild,
  clearAllAfkRecords,
  removeAfk,
} from '../../core/database/repositories/afkRepo.js';
import { buildAfkSetPayload, AFK_ALLOWED_MENTIONS } from './afkUI.js';
import { applyAfkNickname, removeAfkNickname } from './afkSanitizer.js';
import { getAuthorityLevel } from '../../core/permissions/PermissionChecker.js';
import { AuthorityLevel } from '../../types/permission.js';
import { ui } from '../../core/ui/index.js';
import { mentionUser, timestamp } from '../../core/utils/formatters.js';
import { logEvent } from '../../core/logging/WebhookLogger.js';

export default defineCommand({
  name: 'afk',
  aliases: ['afklist', 'afkreset', 'afkadmin'],
  module: 'general',
  description: 'Set your AFK status, view active server AFK members, or reset AFK records (Admin/Owner).',
  usage: 'afk [reason] | afk list | afk reset',
  examples: ['afk studying for exams', 'afk eating lunch', 'afk list', 'afk reset', 'afklist', 'afkreset'],
  permissions: [],
  botPermissions: [PermissionsBitField.Flags.SendMessages],
  cooldown: 3,

  async execute(ctx: CommandContext): Promise<void> {
    const { guild, member, channel, parsed, message, respond } = ctx;
    const aliasUsed = parsed.aliasUsed.toLowerCase();

    // ── Direct Reset Shortcut ──
    if (aliasUsed === 'afkreset') {
      await handleAfkReset(ctx);
      return;
    }

    // ── Direct List Shortcut ──
    if (aliasUsed === 'afklist') {
      await handleAfkList(ctx);
      return;
    }

    const firstWord = parsed.args[0]?.toLowerCase();

    // ── Subcommand: list ──
    if (firstWord === 'list' || firstWord === 'show') {
      await handleAfkList(ctx);
      return;
    }

    // ── Subcommand: clear / off / remove (Own AFK) ──
    if (firstWord === 'clear' || firstWord === 'off' || firstWord === 'remove') {
      const removed = await removeAfk(guild.id, member.id);
      await removeAfkNickname(member, removed);
      if (removed) {
        await respond.success('Your AFK status and nickname tag have been removed.');
      } else {
        await respond.info('You are not marked as AFK. Your nickname has been preserved.');
      }
      return;
    }

    // ── Subcommand: reset (Admin/Owner) ──
    if (firstWord === 'reset') {
      await handleAfkReset(ctx);
      return;
    }

    // ── Default Action: Set AFK ──
    const rawReason = parsed.rawArgs.trim();
    const reason = rawReason || 'AFK';

    // 1. Delete the user's command message (!afk ...)
    message.delete().catch(() => {});

    // 2. Send AFK confirmation message (keep in channel)
    const payload = buildAfkSetPayload(member.id, rawReason);
    const sentMsg = await (channel as GuildTextBasedChannel).send({
      ...payload,
      allowedMentions: AFK_ALLOWED_MENTIONS,
    }).catch(() => null);

    // 3. Save AFK record with message and channel tracking
    await setAfk(guild.id, member.id, reason, channel.id, sentMsg?.id);

    // 4. Apply [AFK] nickname prefix
    await applyAfkNickname(member);

    logEvent('info', 'command_execution', `AFK status set by ${member.user.tag}`, {
      user: member.user.tag,
      userId: member.id,
      guild: guild.name,
      guildId: guild.id,
      reason,
    });
  },
});

async function handleAfkList(ctx: CommandContext): Promise<void> {
  const { guild, respond } = ctx;
  const entries = getAfkEntriesForGuild(guild.id);
  if (entries.length === 0) {
    await respond.info('There are currently no members marked as AFK in this server.');
    return;
  }

  const lines = entries.map((e) => {
    const relTime = timestamp(e.startedAt, 'R');
    return `• ${mentionUser(e.userId, guild)} — **${e.reason}** (${relTime})`;
  });

  await ui.paginated(ctx, {
    title: `Active AFK Members (${entries.length})`,
    items: lines,
    pageSize: 8,
    emptyText: 'There are currently no members marked as AFK in this server.',
  });
}

async function handleAfkReset(ctx: CommandContext): Promise<void> {
  const { guild, member, respond } = ctx;
  const authority = getAuthorityLevel(member.id, guild.ownerId, member);
  if (authority !== AuthorityLevel.Owner) {
    await respond.error('Only the **Bot Owner** can reset all server AFK records.');
    return;
  }

  const entries = getAfkEntriesForGuild(guild.id);
  for (const e of entries) {
    const m = await guild.members.fetch(e.userId).catch(() => null);
    if (m) {
      await removeAfkNickname(m, e);
    }
  }

  await clearAllAfkRecords(guild.id);
  await respond.success('Successfully cleared all AFK records and restored nicknames for this server.');

  logEvent('info', 'command_execution', `Server AFK cache reset by ${member.user.tag}`, {
    executor: member.user.tag,
    executorId: member.id,
    guild: guild.name,
    guildId: guild.id,
  });
}
