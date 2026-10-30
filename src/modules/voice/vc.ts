import { PermissionsBitField, OverwriteType } from 'discord.js';
import type { GuildMember, VoiceBasedChannel, GuildChannel } from 'discord.js';
import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import { resolveUser } from '../../core/resolver/UserResolver.js';
import { resolveVoiceChannel } from '../../core/resolver/VoiceChannelResolver.js';
import { resolveRole } from '../../core/resolver/RoleResolver.js';
import { checkVoiceAccess } from './vconfigEvaluator.js';
import { isMemberManageable } from '../moderation/roleHelpers.js';
import { mentionChannel, mentionRole } from '../../core/utils/formatters.js';
import { logAuditAction } from '../../core/logging/AuditLogger.js';

export default defineCommand({
  name: 'vc',
  aliases: [
    'vcmute',
    'vcunmute',
    'vcmuteall',
    'vcunmuteall',
    'vcdeafen',
    'vcundeafen',
    'vcdeafenall',
    'vcundeafenall',
    'vckick',
    'vclock',
    'vcunlock',
    'vchide',
    'vcunhide',
    'vclimit',
    'vcslam',
    'slam',
    'silent',
    'unsilent',
  ],
  module: 'voice',
  description: 'Complete voice channel management and moderation suite.',
  usage: 'vc <lock|unlock|hide|unhide|connect|disconnect|limit|kick|mute|unmute|muteall|unmuteall|deafen|undeafen|deafenall|undeafenall|silent|unsilent> [args...]',
  examples: [
    'vc lock',
    'vc unlock @Member',
    'vc hide',
    'vc unhide all',
    'vc connect',
    'vc disconnect @Role',
    'vc limit 10',
    'vc kick @User',
    'vc mute @User',
    'vc muteall',
    'vc deafen @User',
    'vc deafenall',
    'vc silent',
    'vc unsilent',
  ],
  permissions: [],
  botPermissions: [
    PermissionsBitField.Flags.ManageChannels,
    PermissionsBitField.Flags.MuteMembers,
    PermissionsBitField.Flags.DeafenMembers,
    PermissionsBitField.Flags.MoveMembers,
  ],
  cooldown: 3,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, respond } = ctx;
    const aliasUsed = parsed.aliasUsed.toLowerCase();

    // ── Direct Shortcut Aliases ──
    if (aliasUsed === 'silent') {
      await handleSilent(ctx, true);
      return;
    }
    if (aliasUsed === 'unsilent') {
      await handleSilent(ctx, false);
      return;
    }
    if (['vcmute', 'vmute'].includes(aliasUsed)) {
      await handleMute(ctx, parsed.args, true);
      return;
    }
    if (['vcunmute', 'vunmute'].includes(aliasUsed)) {
      await handleMute(ctx, parsed.args, false);
      return;
    }
    if (['vcmuteall', 'muteall'].includes(aliasUsed)) {
      await handleMuteAll(ctx, parsed.args, true);
      return;
    }
    if (['vcunmuteall', 'unmuteall'].includes(aliasUsed)) {
      await handleMuteAll(ctx, parsed.args, false);
      return;
    }
    if (['vcdeafen', 'vdeaf'].includes(aliasUsed)) {
      await handleDeafen(ctx, parsed.args, true);
      return;
    }
    if (['vcundeafen', 'vundeafen'].includes(aliasUsed)) {
      await handleDeafen(ctx, parsed.args, false);
      return;
    }
    if (['vcdeafenall', 'deafenall'].includes(aliasUsed)) {
      await handleDeafenAll(ctx, parsed.args, true);
      return;
    }
    if (['vcundeafenall', 'undeafenall'].includes(aliasUsed)) {
      await handleDeafenAll(ctx, parsed.args, false);
      return;
    }
    if (['vckick', 'disconnect'].includes(aliasUsed)) {
      await handleKick(ctx, parsed.args);
      return;
    }
    if (aliasUsed === 'vclock') {
      await handleChannelPerm(ctx, 'lock', parsed.args);
      return;
    }
    if (aliasUsed === 'vcunlock') {
      await handleChannelPerm(ctx, 'unlock', parsed.args);
      return;
    }
    if (aliasUsed === 'vchide') {
      await handleChannelPerm(ctx, 'hide', parsed.args);
      return;
    }
    if (aliasUsed === 'vcunhide') {
      await handleChannelPerm(ctx, 'unhide', parsed.args);
      return;
    }
    if (aliasUsed === 'vclimit') {
      await handleLimit(ctx, parsed.args);
      return;
    }

    if (parsed.args.length === 0) {
      await respond.error(
        `**Voice Moderation Commands (\`vc\`):**\n` +
        `• \`${parsed.prefix}vc lock [role|all|none]\` — Denies connect on this VC\n` +
        `• \`${parsed.prefix}vc unlock [role|all|none]\` — Restores connect on this VC\n` +
        `• \`${parsed.prefix}vc hide [role|all|none]\` — Hides VC from view\n` +
        `• \`${parsed.prefix}vc unhide [role|all|none]\` — Makes VC visible\n` +
        `• \`${parsed.prefix}vc connect\` — Sets @everyone connect to Inherit\n` +
        `• \`${parsed.prefix}vc disconnect [role|all|none]\` — Denies connect\n` +
        `• \`${parsed.prefix}vc limit <number>\` — Sets user limit on voice channel\n` +
        `• \`${parsed.prefix}vc kick <targets...>\` — Disconnects users from voice\n` +
        `• \`${parsed.prefix}vc mute <targets...>\` — Server mutes users\n` +
        `• \`${parsed.prefix}vc unmute <targets...>\` — Server unmutes users\n` +
        `• \`${parsed.prefix}vc muteall [channel]\` — Mutes everyone in VC\n` +
        `• \`${parsed.prefix}vc unmuteall [channel]\` — Unmutes everyone in VC\n` +
        `• \`${parsed.prefix}vc deafen <targets...>\` — Server deafens users\n` +
        `• \`${parsed.prefix}vc undeafen <targets...>\` — Server undeafens users\n` +
        `• \`${parsed.prefix}vc deafenall [channel]\` — Deafens everyone in VC\n` +
        `• \`${parsed.prefix}vc undeafenall [channel]\` — Undeafens everyone in VC\n` +
        `• \`${parsed.prefix}vc silent\` — Mutes all non-staff in your voice channel\n` +
        `• \`${parsed.prefix}vc unsilent\` — Unmutes all users in your voice channel`
      );
      return;
    }

    const sub = parsed.args[0].toLowerCase();
    const subArgs = parsed.args.slice(1);

    switch (sub) {
      case 'lock':
      case 'unlock':
      case 'hide':
      case 'unhide':
      case 'connect':
      case 'disconnect':
        await handleChannelPerm(ctx, sub, subArgs);
        break;
      case 'limit':
        await handleLimit(ctx, subArgs);
        break;
      case 'kick':
        await handleKick(ctx, subArgs);
        break;
      case 'mute':
        await handleMute(ctx, subArgs, true);
        break;
      case 'unmute':
        await handleMute(ctx, subArgs, false);
        break;
      case 'muteall':
        await handleMuteAll(ctx, subArgs, true);
        break;
      case 'unmuteall':
        await handleMuteAll(ctx, subArgs, false);
        break;
      case 'deafen':
        await handleDeafen(ctx, subArgs, true);
        break;
      case 'undeafen':
        await handleDeafen(ctx, subArgs, false);
        break;
      case 'deafenall':
        await handleDeafenAll(ctx, subArgs, true);
        break;
      case 'undeafenall':
        await handleDeafenAll(ctx, subArgs, false);
        break;
      case 'silent':
        await handleSilent(ctx, true);
        break;
      case 'unsilent':
        await handleSilent(ctx, false);
        break;
      default:
        await respond.error(`Unknown subcommand \`${sub}\`. Type \`${parsed.prefix}vc\` for help.`);
        break;
    }
  },
});

// ── Permission Management (Targets Execution Channel) ────────

async function handleChannelPerm(
  ctx: CommandContext,
  subcommand: string,
  args: string[],
): Promise<void> {
  const { guild, channel, member, respond } = ctx;

  if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
    await respond.denied('You require the **Manage Channels** permission to use this command.');
    return;
  }

  // Targets execution channel
  const targetChannel = channel as GuildChannel;
  if (!('permissionOverwrites' in targetChannel)) {
    await respond.error('This command can only be executed in server channels.');
    return;
  }

  const everyoneRole = guild.roles.everyone;
  const isNone = args.length === 0 || args[0].toLowerCase() === 'none';
  const isAll = args.length > 0 && args[0].toLowerCase() === 'all';

  const isHideAction = subcommand === 'hide';
  const isUnhideAction = subcommand === 'unhide';
  const isLockAction = subcommand === 'lock' || subcommand === 'disconnect';

  const permKey = isHideAction || isUnhideAction ? 'ViewChannel' : 'Connect';

  if (isNone) {
    // No args / none: Affects @everyone exclusively
    if (isHideAction || isLockAction) {
      await (targetChannel as any).permissionOverwrites.edit(everyoneRole.id, { [permKey]: false });
      await respond.transientSuccess(`Updated ${mentionChannel(targetChannel.id)}: Denied \`${permKey}\` for @everyone.`, 5000);
    } else {
      // unhide / unlock / connect sets @everyone to Inherit (null)
      await (targetChannel as any).permissionOverwrites.edit(everyoneRole.id, { [permKey]: null });
      await respond.transientSuccess(`Updated ${mentionChannel(targetChannel.id)}: Restored \`${permKey}\` for @everyone (Inherit).`, 5000);
    }

    logAuditAction({
      guild,
      action: `VC ${subcommand.toUpperCase()}`,
      executor: member,
      channelName: targetChannel.name,
      details: `• **Channel:** \`${targetChannel.name}\` (${targetChannel.id})\n• **Scope:** @everyone`,
    });
    return;
  }

  if (isAll) {
    // all: Affects @everyone and all role overrides
    if (isHideAction || isLockAction) {
      await (targetChannel as any).permissionOverwrites.edit(everyoneRole.id, { [permKey]: false });
      let count = 1;
      for (const [, ow] of (targetChannel as any).permissionOverwrites.cache) {
        if (ow.type === OverwriteType.Role && ow.id !== everyoneRole.id) {
          await (targetChannel as any).permissionOverwrites.edit(ow.id, { [permKey]: false });
          count++;
        }
      }
      await respond.transientSuccess(`Updated ${mentionChannel(targetChannel.id)}: Denied \`${permKey}\` for **${count}** role overrides.`, 5000);
    } else {
      // unhide / unlock: sets role overwrites to Allow (true) while keeping @everyone at Inherit (null)
      await (targetChannel as any).permissionOverwrites.edit(everyoneRole.id, { [permKey]: null });
      let count = 1;
      for (const [, ow] of (targetChannel as any).permissionOverwrites.cache) {
        if (ow.type === OverwriteType.Role && ow.id !== everyoneRole.id) {
          await (targetChannel as any).permissionOverwrites.edit(ow.id, { [permKey]: true });
          count++;
        }
      }
      await respond.transientSuccess(`Updated ${mentionChannel(targetChannel.id)}: Allowed \`${permKey}\` for **${count}** role overrides (@everyone Inherit).`, 5000);
    }

    logAuditAction({
      guild,
      action: `VC ${subcommand.toUpperCase()}`,
      executor: member,
      channelName: targetChannel.name,
      details: `• **Channel:** \`${targetChannel.name}\` (${targetChannel.id})\n• **Scope:** All roles`,
    });
    return;
  }

  // Specific role argument
  const roleRes = resolveRole(args.join(' '), guild);
  if (!roleRes.success) {
    await respond.error(`Could not resolve role: ${roleRes.error}`);
    return;
  }

  const targetRole = roleRes.value.role;
  if (isHideAction || isLockAction) {
    await (targetChannel as any).permissionOverwrites.edit(targetRole.id, { [permKey]: false });
    await respond.transientSuccess(`Updated ${mentionChannel(targetChannel.id)}: Denied \`${permKey}\` for ${mentionRole(targetRole, guild)}.`, 5000);
  } else {
    await (targetChannel as any).permissionOverwrites.edit(targetRole.id, { [permKey]: true });
    await respond.transientSuccess(`Updated ${mentionChannel(targetChannel.id)}: Allowed \`${permKey}\` for ${mentionRole(targetRole, guild)}.`, 5000);
  }

  logAuditAction({
    guild,
    action: `VC ${subcommand.toUpperCase()}`,
    executor: member,
    channelName: targetChannel.name,
    details: `• **Channel:** \`${targetChannel.name}\` (${targetChannel.id})\n• **Scope:** ${targetRole.name}`,
  });
}

// ── User Limit Handler (Merged from vclimit.ts) ───────────────

async function handleLimit(ctx: CommandContext, args: string[]): Promise<void> {
  const { guild, member, respond, channel } = ctx;

  if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
    await respond.denied('You require the **Manage Channels** permission to change user limits.');
    return;
  }

  let targetVc: VoiceBasedChannel | null = null;
  let newLimit: number | null = null;

  if (args.length === 0) {
    if (channel.isVoiceBased()) {
      targetVc = channel as VoiceBasedChannel;
    } else if (member.voice.channel) {
      targetVc = member.voice.channel;
    }
    if (!targetVc) {
      await respond.error('Specify a limit to set, or join a voice channel.\nUsage: `vc limit <number> [channel]`');
      return;
    }
    const limit = 'userLimit' in targetVc && targetVc.userLimit ? targetVc.userLimit : 0;
    await respond.send(`User limit for **${targetVc.name}** is currently **${limit === 0 ? 'unlimited (∞)' : limit}**.`);
    return;
  }

  // Check if first arg or last arg is a number
  const firstNum = parseInt(args[0], 10);
  const lastNum = parseInt(args[args.length - 1], 10);

  if (!isNaN(firstNum)) {
    newLimit = Math.max(0, Math.min(99, firstNum));
    if (args.length > 1) {
      const res = resolveVoiceChannel(args.slice(1).join(' '), guild);
      if (res.success) targetVc = res.value.channel;
    }
  } else if (!isNaN(lastNum)) {
    newLimit = Math.max(0, Math.min(99, lastNum));
    const res = resolveVoiceChannel(args.slice(0, -1).join(' '), guild);
    if (res.success) targetVc = res.value.channel;
  }

  if (newLimit === null) {
    await respond.error('Please specify a valid limit number (0 - 99).\nUsage: `vc limit <number> [channel]`');
    return;
  }

  if (!targetVc) {
    if (channel.isVoiceBased()) {
      targetVc = channel as VoiceBasedChannel;
    } else if (member.voice.channel) {
      targetVc = member.voice.channel;
    }
  }

  if (!targetVc) {
    await respond.error('You must specify a voice channel or be connected to one.');
    return;
  }

  const access = await checkVoiceAccess(guild.id, member, 'vclimit', targetVc.id);
  if (!access.allowed) {
    await respond.denied(access.reason || 'Voice command access denied.');
    return;
  }

  try {
    await (targetVc as any).setUserLimit(newLimit);
    await respond.transientSuccess(
      `Set user limit for **${targetVc.name}** to **${newLimit === 0 ? 'unlimited (∞)' : newLimit}**.`,
      5000,
    );
  } catch {
    await respond.error(`Failed to update limit for **${targetVc.name}**.`);
  }
}

// ── Silent / Unsilent (Operates on AUTHOR'S VOICE CHANNEL) ─────

async function handleSilent(ctx: CommandContext, isSilent: boolean): Promise<void> {
  const { guild, member, respond } = ctx;

  if (!member.permissions.has(PermissionsBitField.Flags.MuteMembers)) {
    await respond.denied('You require the **Mute Members** permission to use silent/unsilent.');
    return;
  }

  // Operates on the AUTHOR'S current voice channel!
  const authorVc = member.voice.channel;
  if (!authorVc) {
    await respond.error('You must be connected to a voice channel to use silent/unsilent.');
    return;
  }

  const access = await checkVoiceAccess(guild.id, member, isSilent ? 'vcsilent' : 'vcunsilent', authorVc.id);
  if (!access.allowed) {
    await respond.denied(access.reason || 'Voice command access denied.');
    return;
  }

  const membersInVc = Array.from(authorVc.members.values());
  if (membersInVc.length === 0) {
    await respond.error('There are no members in your voice channel.');
    return;
  }

  // Staff / elevated permissions to exempt from silent
  const staffPerms = [
    PermissionsBitField.Flags.Administrator,
    PermissionsBitField.Flags.MoveMembers,
    PermissionsBitField.Flags.MuteMembers,
    PermissionsBitField.Flags.DeafenMembers,
    PermissionsBitField.Flags.ManageChannels,
    PermissionsBitField.Flags.ManageGuild,
    PermissionsBitField.Flags.ManageRoles,
  ];

  let modifiedCount = 0;

  for (const target of membersInVc) {
    if (isSilent) {
      // Exclude staff / elevated permissions and server owner
      const isStaff = target.id === guild.ownerId || staffPerms.some((perm) => target.permissions.has(perm));
      if (isStaff) continue;

      try {
        await target.voice.setMute(true, `Silent activated by ${member.user.tag}`);
        modifiedCount++;
      } catch {
        // Continue muting remaining members
      }
    } else {
      // Unsilent: acts as unmuteall for author's VC
      try {
        await target.voice.setMute(false, `Unsilent activated by ${member.user.tag}`);
        modifiedCount++;
      } catch {
        // Continue unmuting remaining members
      }
    }
  }

  const actionText = isSilent ? 'Silenced non-staff' : 'Unmuted everyone';
  await respond.transientSuccess(
    `**${actionText}** in **${authorVc.name}** (**${modifiedCount}** member(s) updated). *(Auto-deleting in 5s)*`,
    5000,
  );
}

// ── Kick / Mute / Deafen / Mass Moderation Handlers ────────────

async function handleKick(ctx: CommandContext, args: string[]): Promise<void> {
  const { guild, member, respond, replyTarget } = ctx;

  if (!member.permissions.has(PermissionsBitField.Flags.MoveMembers)) {
    await respond.denied('You require the **Move Members** permission to disconnect users.');
    return;
  }

  const targets: GuildMember[] = [];
  if (replyTarget) targets.push(replyTarget);

  for (const arg of args) {
    const res = await resolveUser(arg, guild);
    if (res.success && res.value.member) {
      if (!targets.some((m) => m.id === res.value.member!.id)) {
        targets.push(res.value.member);
      }
    }
  }

  if (targets.length === 0) {
    await respond.error('Please specify at least one user to disconnect from voice.');
    return;
  }

  let kicked = 0;
  for (const target of targets) {
    if (target.voice.channel && isMemberManageable(guild, target, member)) {
      try {
        await target.voice.disconnect(`VC kick by ${member.user.tag}`);
        kicked++;
      } catch {
        // Ignore single member disconnect error
      }
    }
  }

  await respond.transientSuccess(`Disconnected **${kicked}** user(s) from voice. *(Auto-deleting in 5s)*`, 5000);
}

async function handleMute(ctx: CommandContext, rawArgs: string[], state: boolean): Promise<void> {
  const { guild, member, respond, replyTarget } = ctx;

  if (!member.permissions.has(PermissionsBitField.Flags.MuteMembers)) {
    await respond.denied('You require the **Mute Members** permission to mute users.');
    return;
  }

  const targets: GuildMember[] = [];
  if (replyTarget) targets.push(replyTarget);

  for (const arg of rawArgs) {
    const res = await resolveUser(arg, guild);
    if (res.success && res.value.member) {
      if (!targets.some((m) => m.id === res.value.member!.id)) {
        targets.push(res.value.member);
      }
    }
  }

  if (targets.length === 0) {
    await respond.error('Please specify at least one user to mute/unmute.');
    return;
  }

  let updated = 0;
  for (const target of targets) {
    if (target.voice.channel && isMemberManageable(guild, target, member)) {
      try {
        await target.voice.setMute(state, `VC mute by ${member.user.tag}`);
        updated++;
      } catch {
        // Ignore single member error
      }
    }
  }

  await respond.transientSuccess(`${state ? 'Muted' : 'Unmuted'} **${updated}** user(s). *(Auto-deleting in 5s)*`, 5000);
}

async function handleDeafen(ctx: CommandContext, rawArgs: string[], state: boolean): Promise<void> {
  const { guild, member, respond, replyTarget } = ctx;

  if (!member.permissions.has(PermissionsBitField.Flags.DeafenMembers)) {
    await respond.denied('You require the **Deafen Members** permission to deafen users.');
    return;
  }

  const targets: GuildMember[] = [];
  if (replyTarget) targets.push(replyTarget);

  for (const arg of rawArgs) {
    const res = await resolveUser(arg, guild);
    if (res.success && res.value.member) {
      if (!targets.some((m) => m.id === res.value.member!.id)) {
        targets.push(res.value.member);
      }
    }
  }

  if (targets.length === 0) {
    await respond.error('Please specify at least one user to deafen/undeafen.');
    return;
  }

  let updated = 0;
  for (const target of targets) {
    if (target.voice.channel && isMemberManageable(guild, target, member)) {
      try {
        await target.voice.setDeaf(state, `VC deafen by ${member.user.tag}`);
        updated++;
      } catch {
        // Ignore single member error
      }
    }
  }

  await respond.transientSuccess(`${state ? 'Deafened' : 'Undeafened'} **${updated}** user(s). *(Auto-deleting in 5s)*`, 5000);
}

async function handleMuteAll(ctx: CommandContext, args: string[], state: boolean): Promise<void> {
  const { guild, member, respond, channel } = ctx;

  if (!member.permissions.has(PermissionsBitField.Flags.MuteMembers)) {
    await respond.denied('You require the **Mute Members** permission to use muteall.');
    return;
  }

  let targetVc: VoiceBasedChannel | null = null;
  if (args.length > 0) {
    const res = resolveVoiceChannel(args.join(' '), guild);
    if (res.success) targetVc = res.value.channel;
  } else if (channel.isVoiceBased()) {
    targetVc = channel as VoiceBasedChannel;
  } else if (member.voice.channel) {
    targetVc = member.voice.channel;
  }

  if (!targetVc) {
    await respond.error('Specify a voice channel or connect to one.');
    return;
  }

  let count = 0;
  for (const m of targetVc.members.values()) {
    if (isMemberManageable(guild, m, member)) {
      try {
        await m.voice.setMute(state);
        count++;
      } catch {
        // Ignore single member error
      }
    }
  }

  await respond.transientSuccess(`${state ? 'Muted' : 'Unmuted'} all **${count}** member(s) in **${targetVc.name}**. *(Auto-deleting in 5s)*`, 5000);
}

async function handleDeafenAll(ctx: CommandContext, args: string[], state: boolean): Promise<void> {
  const { guild, member, respond, channel } = ctx;

  if (!member.permissions.has(PermissionsBitField.Flags.DeafenMembers)) {
    await respond.denied('You require the **Deafen Members** permission to use deafenall.');
    return;
  }

  let targetVc: VoiceBasedChannel | null = null;
  if (args.length > 0) {
    const res = resolveVoiceChannel(args.join(' '), guild);
    if (res.success) targetVc = res.value.channel;
  } else if (channel.isVoiceBased()) {
    targetVc = channel as VoiceBasedChannel;
  } else if (member.voice.channel) {
    targetVc = member.voice.channel;
  }

  if (!targetVc) {
    await respond.error('Specify a voice channel or connect to one.');
    return;
  }

  let count = 0;
  for (const m of targetVc.members.values()) {
    if (isMemberManageable(guild, m, member)) {
      try {
        await m.voice.setDeaf(state);
        count++;
      } catch {
        // Ignore single member error
      }
    }
  }

  await respond.transientSuccess(`${state ? 'Deafened' : 'Undeafened'} all **${count}** member(s) in **${targetVc.name}**. *(Auto-deleting in 5s)*`, 5000);
}
