import { PermissionsBitField, OverwriteType } from 'discord.js';
import type { GuildChannel } from 'discord.js';
import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import { resolveRole } from '../../core/resolver/RoleResolver.js';
import { mentionRole, mentionChannel } from '../../core/utils/formatters.js';
import { logEvent } from '../../core/logging/WebhookLogger.js';
import { logAuditAction } from '../../core/logging/AuditLogger.js';

export default defineCommand({
  name: 'lock',
  aliases: ['l', 'unlock'],
  module: 'moderation',
  description: 'Lock or unlock a channel by managing SendMessages permissions for @everyone, all roles, or a specific role.',
  usage: 'lock [role|all|none] | unlock [role|all|none]',
  examples: ['lock', 'unlock', 'lock @Role', 'unlock @Role', 'lock all', 'unlock all', 'lock none'],
  permissions: [PermissionsBitField.Flags.ManageChannels],
  botPermissions: [PermissionsBitField.Flags.ManageChannels],
  cooldown: 3,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, guild, channel, respond, member } = ctx;

    const targetChannel = channel as GuildChannel;
    if (!('permissionOverwrites' in targetChannel)) {
      await respond.error('Lock/Unlock can only be executed in server channels.');
      return;
    }

    const aliasUsed = parsed.aliasUsed.toLowerCase();
    const isExplicitUnlock =
      ['unlock', 'ul', 'unlockchannel'].includes(aliasUsed) ||
      parsed.args[0]?.toLowerCase() === 'off' ||
      parsed.args[0]?.toLowerCase() === 'unlock';

    const cleanArgs =
      parsed.args[0]?.toLowerCase() === 'off' ||
      parsed.args[0]?.toLowerCase() === 'unlock' ||
      parsed.args[0]?.toLowerCase() === 'on' ||
      parsed.args[0]?.toLowerCase() === 'lock'
        ? parsed.args.slice(1)
        : parsed.args;

    if (cleanArgs.length > 1) {
      await respond.error(`Usage: \`${parsed.prefix}lock [role|all|none]\` or \`${parsed.prefix}unlock [role|all|none]\`.`);
      return;
    }

    const everyoneRole = guild.roles.everyone;
    const isNone = cleanArgs.length === 0 || cleanArgs[0].toLowerCase() === 'none';
    const isAll = cleanArgs.length > 0 && cleanArgs[0].toLowerCase() === 'all';

    let logTarget = 'everyone';

    if (!isExplicitUnlock) {
      // ── LOCK LOGIC (Target: SendMessages: false) ──
      if (isNone) {
        // No args / none: Denies SendMessages for @everyone exclusively
        await (targetChannel as any).permissionOverwrites.edit(everyoneRole.id, { SendMessages: false }).catch(() => {});
        logTarget = mentionRole(everyoneRole, guild);
        await respond.transientSuccess(`Locked ${mentionChannel(targetChannel.id)} for ${logTarget}. *(Auto-deleting in 5s)*`, 5000);
      } else if (isAll) {
        // all: Denies SendMessages for @everyone and all explicit overwrites
        await (targetChannel as any).permissionOverwrites.edit(everyoneRole.id, { SendMessages: false }).catch(() => {});
        let count = 1;
        for (const [, overwrite] of (targetChannel as any).permissionOverwrites.cache) {
          if (overwrite.type === OverwriteType.Role && overwrite.id !== everyoneRole.id) {
            await (targetChannel as any).permissionOverwrites.edit(overwrite.id, { SendMessages: false }).catch(() => {});
            count++;
            await new Promise((r) => setTimeout(r, 50));
          }
        }
        logTarget = `All roles (${count} overrides)`;
        await respond.transientSuccess(`Locked ${mentionChannel(targetChannel.id)} for all **${count}** role overrides. *(Auto-deleting in 5s)*`, 5000);
      } else {
        // role Arg: Affects only the specified role's overwrite (Deny)
        const roleRes = resolveRole(cleanArgs[0], guild);
        if (!roleRes.success) {
          await respond.error(`Invalid target argument. Expected a role, 'all', or 'none'. Error: ${roleRes.error}`);
          return;
        }
        const targetRole = roleRes.value.role;
        await (targetChannel as any).permissionOverwrites.edit(targetRole.id, { SendMessages: false });
        logTarget = mentionRole(targetRole, guild);
        await respond.transientSuccess(`Locked ${mentionChannel(targetChannel.id)} for ${logTarget}. *(Auto-deleting in 5s)*`, 5000);
      }

      logAuditAction({
        guild,
        action: 'Channel Locked',
        executor: member,
        channelName: targetChannel.name,
        details: `• **Scope:** ${logTarget}`,
      });

      logEvent('info', 'command_execution', `Channel lock by ${member.user.tag}`);
    } else {
      // ── UNLOCK LOGIC (Target: SendMessages) ──
      if (isNone) {
        // No args / none: Sets @everyone to Inherit (null)
        await (targetChannel as any).permissionOverwrites.edit(everyoneRole.id, { SendMessages: null }).catch(() => {});
        logTarget = mentionRole(everyoneRole, guild);
        await respond.transientSuccess(`Unlocked ${mentionChannel(targetChannel.id)} for ${logTarget} (inherited). *(Auto-deleting in 5s)*`, 5000);
      } else if (isAll) {
        // all: Sets overwrites to Allow (true) while keeping @everyone at Inherit (null)
        await (targetChannel as any).permissionOverwrites.edit(everyoneRole.id, { SendMessages: null }).catch(() => {});
        let count = 1;
        for (const [, overwrite] of (targetChannel as any).permissionOverwrites.cache) {
          if (overwrite.type === OverwriteType.Role && overwrite.id !== everyoneRole.id) {
            await (targetChannel as any).permissionOverwrites.edit(overwrite.id, { SendMessages: true }).catch(() => {});
            count++;
            await new Promise((r) => setTimeout(r, 50));
          }
        }
        logTarget = `All roles (${count} overrides allowed, @everyone inherit)`;
        await respond.transientSuccess(
          `Unlocked ${mentionChannel(targetChannel.id)}: Allowed for **${count}** role overrides (@everyone inherited). *(Auto-deleting in 5s)*`,
          5000,
        );
      } else {
        // role Arg: Sets specified role overwrite to Allow (true)
        const roleRes = resolveRole(cleanArgs[0], guild);
        if (!roleRes.success) {
          await respond.error(`Invalid target argument. Expected a role, 'all', or 'none'. Error: ${roleRes.error}`);
          return;
        }
        const targetRole = roleRes.value.role;
        await (targetChannel as any).permissionOverwrites.edit(targetRole.id, { SendMessages: true });
        logTarget = mentionRole(targetRole, guild);
        await respond.transientSuccess(`Unlocked ${mentionChannel(targetChannel.id)} for ${logTarget} (explicitly allowed). *(Auto-deleting in 5s)*`, 5000);
      }

      logAuditAction({
        guild,
        action: 'Channel Unlocked',
        executor: member,
        channelName: targetChannel.name,
        details: `• **Scope:** ${logTarget}`,
      });

      logEvent('info', 'command_execution', `Channel unlock by ${member.user.tag}`);
    }
  },
});
