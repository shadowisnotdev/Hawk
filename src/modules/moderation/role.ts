import { PermissionsBitField } from 'discord.js';
import type { GuildMember, Role, GuildTextBasedChannel } from 'discord.js';
import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import { resolveUser } from '../../core/resolver/UserResolver.js';
import { resolveRole } from '../../core/resolver/RoleResolver.js';
import {
  toggleRoleForMember,
  addRoleToMember,
  removeRoleFromMember,
  isRoleManageable,
} from './roleHelpers.js';
import { formatUser, mentionRole } from '../../core/utils/formatters.js';
import { logEvent } from '../../core/logging/WebhookLogger.js';
import { logAuditAction } from '../../core/logging/AuditLogger.js';
import { ui } from '../../core/ui/index.js';
import { LiveProgressTracker, renderProgressBar } from '../../core/utils/ProgressBar.js';
import { consoleLog } from '../../core/logging/ConsoleLogger.js';

type ActionMode = 'add' | 'remove' | 'toggle';

export default defineCommand({
  name: 'role',
  aliases: [
    'r',
    'urole',
    'roleicon',
    '-rem',
    '-add',
  ],
  module: 'moderation',
  description: 'Manage roles: add, remove, or toggle role(s) on a user, batch-manage a role across users/role members, or set role icons.',
  usage: 'role <user|role> <role(s)...> [-add|-remove|-rem] | role icon <role> [emoji|url|none]',
  examples: [
    'role @User @Role',
    'role @User @Role1 @Role2 -add',
    'role @User @Role1 @Role2 -remove',
    'role @User @Role1 @Role2 -rem',
    '-rem @User @Role',
    'role @RoleA @RoleB',
    'role icon @VIP https://example.com/icon.png',
  ],
  permissions: [PermissionsBitField.Flags.ManageRoles],
  botPermissions: [PermissionsBitField.Flags.ManageRoles],
  cooldown: 3,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, respond } = ctx;
    const aliasUsed = parsed.aliasUsed.toLowerCase();

    // ── Direct Role Icon Aliases ──
    if (['roleicon', 'ricon', 'setroleicon', 'removeroleicon'].includes(aliasUsed)) {
      await handleRoleIcon(ctx, parsed.args);
      return;
    }

    if (parsed.args.length === 0 && !ctx.replyTarget) {
      await respond.error(
        `Usage:\n` +
        `• \`${parsed.prefix}role <user|role> <role(s)...> [?add|?rem]\`\n` +
        `• \`${parsed.prefix}role icon <role> [emoji|url|none]\``,
      );
      return;
    }

    // ── Subcommand: icon ──
    if (parsed.args[0]?.toLowerCase() === 'icon') {
      await handleRoleIcon(ctx, parsed.args.slice(1));
      return;
    }

    await handleRoleManagement(ctx);
  },
});

async function handleRoleManagement(ctx: CommandContext): Promise<void> {
  const { parsed, guild, member, replyTarget, respond, channel } = ctx;
  const aliasUsed = parsed.aliasUsed.toLowerCase();

  const args = [...parsed.args];
  let actionMode: ActionMode = 'toggle';

  // Check if alias implies add or remove
  if (['addrole', 'giverole', '-add'].includes(aliasUsed)) {
    actionMode = 'add';
  } else if (['unrole', 'removerole', 'takerole', '-rem', 'rem', '-remove'].includes(aliasUsed)) {
    actionMode = 'remove';
  }

  // Check for explicit mode flags anywhere in args
  const addFlagIndex = args.findIndex((a) => ['-add', '--add', '?add', 'add', '+', 'give'].includes(a.toLowerCase()));
  if (addFlagIndex !== -1) {
    actionMode = 'add';
    args.splice(addFlagIndex, 1);
  } else {
    const remFlagIndex = args.findIndex((a) =>
      ['-remove', '--remove', '-rem', '--rem', '?rem', '?remove', 'rem', 'remove', 'del', 'delete', '-', 'take'].includes(a.toLowerCase())
    );
    if (remFlagIndex !== -1) {
      actionMode = 'remove';
      args.splice(remFlagIndex, 1);
    }
  }

  if (args.length === 0 && !replyTarget) {
    await respond.error(`Usage: \`${parsed.prefix}role <user|role> <role(s)...> [?add|?rem]\``);
    return;
  }

  let targetMembers: GuildMember[] = [];
  let targetDisplayName = '';
  let roleArgs: string[] = [];

  // Case 1: First argument is a User / Member
  const firstUserRes = args.length > 0 ? await resolveUser(args[0], guild) : null;
  if (firstUserRes && firstUserRes.success && firstUserRes.value.member) {
    targetMembers = [firstUserRes.value.member];
    targetDisplayName = formatUser(firstUserRes.value.member, guild);
    roleArgs = args.slice(1);
  }
  // Case 2: Replying to a message, and first argument is NOT a user
  else if (replyTarget) {
    targetMembers = [replyTarget];
    targetDisplayName = formatUser(replyTarget, guild);
    roleArgs = args;
  }
  // Case 3: First argument is a Role
  else if (args.length > 0) {
    const firstRoleRes = resolveRole(args[0], guild);
    if (firstRoleRes.success) {
      const sourceRole = firstRoleRes.value.role;
      const remainingArgs = args.slice(1);

      if (remainingArgs.length === 0) {
        // Fallback: apply first role to executor
        targetMembers = [member];
        targetDisplayName = formatUser(member, guild);
        roleArgs = [args[0]];
      } else {
        // Check if subsequent arguments are individual users (legacy URole syntax: role <role> <user1> <user2>...)
        const secondUserCheck = await resolveUser(remainingArgs[0], guild);
        if (secondUserCheck.success && secondUserCheck.value.member) {
          const resolvedUsers: GuildMember[] = [];
          for (const uArg of remainingArgs) {
            const uRes = await resolveUser(uArg, guild);
            if (uRes.success && uRes.value.member) {
              resolvedUsers.push(uRes.value.member);
            }
          }
          targetMembers = resolvedUsers;
          targetDisplayName = `${resolvedUsers.length} specified user(s)`;
          roleArgs = [args[0]]; // Role is the first argument
        } else {
          // Role-to-Role syntax: First role provides target members, remaining args are target roles
          const allGuildMembers = await guild.members.fetch().catch(() => guild.members.cache);
          targetMembers = Array.from(allGuildMembers.filter(m => m.roles.cache.has(sourceRole.id)).values());
          targetDisplayName = `All members with ${mentionRole(sourceRole, guild)} (${targetMembers.length} members)`;
          roleArgs = remainingArgs;
        }
      }
    } else {
      await respond.error(`Could not resolve user or role: \`${args[0]}\``);
      return;
    }
  }

  if (targetMembers.length === 0) {
    await respond.error('No target members found to apply role changes.');
    return;
  }

  if (roleArgs.length === 0) {
    await respond.error(`Please specify at least one role. Usage: \`${parsed.prefix}role <user|role> <role(s)...> [?add|?rem]\``);
    return;
  }

  // Resolve all target roles
  const targetRoles: Role[] = [];
  for (const rArg of roleArgs) {
    const rRes = resolveRole(rArg, guild);
    if (rRes.success) {
      targetRoles.push(rRes.value.role);
    }
  }

  if (targetRoles.length === 0) {
    await respond.error(`Could not resolve any valid roles from: \`${roleArgs.join(' ')}\``);
    return;
  }

  const totalMembers = targetMembers.length;
  const rolesDisplay = targetRoles.map(r => mentionRole(r, guild)).join(', ');
  const modeText = actionMode === 'add' ? 'Add' : actionMode === 'remove' ? 'Remove' : 'Toggle';

  // ── Multi-member execution with Progress Tracker ──
  if (totalMembers > 3) {
    const initialPayload = ui.standard({
      title: `Role Operation [${modeText.toUpperCase()}]`,
      text:
        `• **Target:** ${targetDisplayName}\n` +
        `• **Role(s):** ${rolesDisplay}\n` +
        `• **Progress:** ${renderProgressBar(0, totalMembers)} (0/${totalMembers})\n` +
        `Added: **0** | Removed: **0** | Skipped: **0**`,
    });

    const statusMsg = await (channel as GuildTextBasedChannel).send({
      components: initialPayload.components,
      flags: initialPayload.flags as any,
    }).catch(() => null);

    const tracker = statusMsg ? new LiveProgressTracker(statusMsg, `Role [${modeText.toUpperCase()}]`, totalMembers) : null;

    let addedCount = 0;
    let removedCount = 0;
    let skippedCount = 0;
    let processed = 0;

    const CHUNK_SIZE = 5;
    for (let i = 0; i < targetMembers.length; i += CHUNK_SIZE) {
      const chunk = targetMembers.slice(i, i + CHUNK_SIZE);
      const results = await Promise.all(
        chunk.map(async (targetMem) => {
          let memAdded = 0;
          let memRemoved = 0;
          let memSkipped = 0;

          for (const role of targetRoles) {
            if (actionMode === 'add') {
              const res = await addRoleToMember(guild, targetMem, role, member);
              if (res === 'added') memAdded++;
              else memSkipped++;
            } else if (actionMode === 'remove') {
              const res = await removeRoleFromMember(guild, targetMem, role, member);
              if (res === 'removed') memRemoved++;
              else memSkipped++;
            } else {
              const res = await toggleRoleForMember(guild, targetMem, role, member);
              if (res === 'added') memAdded++;
              else if (res === 'removed') memRemoved++;
              else memSkipped++;
            }
          }
          return { memAdded, memRemoved, memSkipped };
        })
      );

      for (const r of results) {
        addedCount += r.memAdded;
        removedCount += r.memRemoved;
        skippedCount += r.memSkipped;
      }
      processed += chunk.length;

      if (tracker) {
        await tracker.update(processed, `Added: **${addedCount}** | Removed: **${removedCount}** | Skipped: **${skippedCount}**`);
      }

      if (i + CHUNK_SIZE < targetMembers.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    if (tracker) {
      await tracker.update(totalMembers, `Added: **${addedCount}** | Removed: **${removedCount}** | Skipped: **${skippedCount}**`, true);
    }

    const diffLines: string[] = [];
    if (addedCount > 0) diffLines.push(`[+] Added **${addedCount}** role instance(s)`);
    if (removedCount > 0) diffLines.push(`[-] Removed **${removedCount}** role instance(s)`);
    if (skippedCount > 0) diffLines.push(`[!] Skipped **${skippedCount}** (already has / hierarchy)`);
    if (diffLines.length === 0) diffLines.push('No changes applied.');

    const summaryText =
      `Role update for **${targetDisplayName}** [${modeText}]:\n` +
      `• **Role(s):** ${rolesDisplay}\n` +
      diffLines.map(l => `• ${l}`).join('\n') +
      `\n• *(Auto-deleting in 5s)*`;

    if (statusMsg) {
      const finalPayload = ui.standard({
        title: 'Role Operation Completed',
        text: summaryText,
      });
      await statusMsg.edit({ components: finalPayload.components, flags: finalPayload.flags as any }).catch(() => {});
      setTimeout(() => statusMsg?.delete().catch(() => {}), 5000);
    } else {
      const replyMsg = await respond.success(summaryText);
      setTimeout(() => replyMsg.delete().catch(() => {}), 5000);
    }

    logAuditAction({
      guild,
      action: `Batch Role ${modeText}`,
      executor: member,
      target: targetDisplayName,
      details: [
        `• **Role(s):** ${targetRoles.map(r => r.name).join(', ')}`,
        `• **Mode:** ${modeText}`,
        ...diffLines.map(line => `• ${line}`),
      ],
    });

    logEvent('info', 'command_execution', `Batch role ${modeText} by ${member.user.tag}`, {
      executor: member.user.tag,
      executorId: member.id,
      guild: guild.name,
      guildId: guild.id,
      target: targetDisplayName,
      mode: actionMode,
      addedCount,
      removedCount,
      skippedCount,
    });
    return;
  }

  // ── Single / Few Members Execution (1 to 3 members) ──
  const addedRoles: Role[] = [];
  const removedRoles: Role[] = [];
  let skippedCount = 0;

  for (const targetMem of targetMembers) {
    for (const role of targetRoles) {
      if (actionMode === 'add') {
        const res = await addRoleToMember(guild, targetMem, role, member);
        if (res === 'added') addedRoles.push(role);
        else skippedCount++;
      } else if (actionMode === 'remove') {
        const res = await removeRoleFromMember(guild, targetMem, role, member);
        if (res === 'removed') removedRoles.push(role);
        else skippedCount++;
      } else {
        const res = await toggleRoleForMember(guild, targetMem, role, member);
        if (res === 'added') addedRoles.push(role);
        else if (res === 'removed') removedRoles.push(role);
        else skippedCount++;
      }
    }
  }

  const diffLines: string[] = [];
  if (addedRoles.length > 0) diffLines.push(`[+] Added: ${addedRoles.map(r => mentionRole(r, guild)).join(', ')}`);
  if (removedRoles.length > 0) diffLines.push(`[-] Removed: ${removedRoles.map(r => mentionRole(r, guild)).join(', ')}`);
  if (skippedCount > 0) diffLines.push(`[!] Skipped: **${skippedCount}** (already has / hierarchy)`);
  if (diffLines.length === 0) diffLines.push('No role changes applied.');

  const diffText = `Role update for ${targetDisplayName} [${modeText}]:\n${diffLines.join('\n')}`;
  await respond.transientSuccess(diffText, 5000);

  logAuditAction({
    guild,
    action: `Member Role ${modeText}`,
    executor: member,
    target: targetDisplayName,
    details: [
      `• **Target:** ${targetDisplayName}`,
      `• **Mode:** ${modeText}`,
      ...diffLines.map(line => `• ${line}`),
    ],
  });

  logEvent('info', 'command_execution', `Role ${modeText} by ${member.user.tag}`, {
    executor: member.user.tag,
    executorId: member.id,
    guild: guild.name,
    guildId: guild.id,
    target: targetDisplayName,
    mode: actionMode,
    addedCount: addedRoles.length,
    removedCount: removedRoles.length,
    skippedCount,
  });
}

async function handleRoleIcon(ctx: CommandContext, args: string[]): Promise<void> {
  const { guild, member, respond } = ctx;

  if (args.length === 0) {
    await respond.error(`Usage: \`${ctx.parsed.prefix}role icon <role> [emoji|url|none]\``);
    return;
  }

  const roleRes = resolveRole(args[0], guild);
  if (!roleRes.success) {
    await respond.error(`Role: ${roleRes.error}`);
    return;
  }

  const targetRole = roleRes.value.role;
  if (!isRoleManageable(guild, targetRole, member)) {
    await respond.error(`Cannot modify ${mentionRole(targetRole, guild)} due to role hierarchy or permissions.`);
    return;
  }

  if (args.length < 2 || ['none', 'clear', 'remove', 'delete', 'off'].includes(args[1].toLowerCase())) {
    try {
      await targetRole.setIcon(null, `Role icon removed by ${member.user.tag}`);
      await respond.success(`Removed role icon from ${mentionRole(targetRole, guild)}.`);
      logEvent('info', 'command_execution', `Role icon removed by ${member.user.tag}`, {
        executor: member.user.tag,
        role: targetRole.name,
        guild: guild.name,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await respond.error(`Failed to remove role icon: ${msg}`);
    }
    return;
  }

  const iconInput = args.slice(1).join(' ').trim();
  let targetIcon: string | null = null;
  let iconType = 'url';

  const customEmojiRegex = /<(a)?:([a-zA-Z0-9_]+):(\d{17,20})>/;
  const customMatch = customEmojiRegex.exec(iconInput);
  if (customMatch) {
    const emojiId = customMatch[3];
    targetIcon = `https://cdn.discordapp.com/emojis/${emojiId}.png?size=96&quality=lossless`;
    iconType = 'custom_emoji';
  }

  if (!targetIcon) {
    const maskedLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/;
    const maskedMatch = maskedLinkRegex.exec(iconInput);
    if (maskedMatch) {
      targetIcon = maskedMatch[2];
      iconType = 'masked_link';
    }
  }

  if (!targetIcon) {
    const rawUrlRegex = /https?:\/\/[^\s]+/;
    const urlMatch = rawUrlRegex.exec(iconInput);
    if (urlMatch) {
      targetIcon = urlMatch[0];
      iconType = 'url';
    }
  }

  if (!targetIcon) {
    const unicodeEmojiRegex = /\p{Extended_Pictographic}/u;
    if (unicodeEmojiRegex.test(iconInput)) {
      targetIcon = iconInput.trim();
      iconType = 'unicode_emoji';
    }
  }

  if (!targetIcon) {
    await respond.error('Please provide a valid emoji, image URL, or masked link for the role icon.');
    return;
  }

  try {
    await targetRole.setIcon(targetIcon, `Role icon updated by ${member.user.tag}`);
    await respond.success(`Successfully set role icon for ${mentionRole(targetRole, guild)}!`);

    logEvent('info', 'command_execution', `Role icon updated by ${member.user.tag}`, {
      executor: member.user.tag,
      role: targetRole.name,
      iconType,
      targetIcon,
      guild: guild.name,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    consoleLog('error', 'command_failure', `role icon: failed to set icon for ${targetRole.id}`, { error: msg });
    await respond.error(`Failed to set role icon: ${msg}\n*(Note: Server role icons require Server Boost Level 2).*`);
  }
}
