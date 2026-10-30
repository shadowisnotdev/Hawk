import { PermissionsBitField } from 'discord.js';
import type { VoiceBasedChannel } from 'discord.js';
import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import { resolveVoiceChannel } from '../../core/resolver/VoiceChannelResolver.js';
import { mentionChannel } from '../../core/utils/formatters.js';
import { checkVoiceAccess } from './vconfigEvaluator.js';
import { logAuditAction } from '../../core/logging/AuditLogger.js';

export default defineCommand({
  name: 'svc',
  aliases: ['shiftvc', 'moveall'],
  module: 'voice',
  description: "Shifts an entire voice channel's occupants to another voice channel.",
  usage: 'svc <destination> OR svc <source> <destination>',
  examples: ['svc #General', 'svc #Lounge #General', 'svc "Gaming Lounge", "General"'],
  permissions: [PermissionsBitField.Flags.MoveMembers],
  botPermissions: [PermissionsBitField.Flags.MoveMembers],
  cooldown: 5,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, guild, member, respond } = ctx;

    const raw = parsed.rawArgs.trim();
    if (!raw) {
      await respond.error('Usage: `svc <destination>` or `svc <source> <destination>`');
      return;
    }

    let sourceVc: VoiceBasedChannel | null = null;
    let destVc: VoiceBasedChannel | null = null;

    // Check if separated by comma first
    const commaIndex = raw.indexOf(',');
    if (commaIndex !== -1) {
      const srcInput = raw.slice(0, commaIndex).trim();
      const dstInput = raw.slice(commaIndex + 1).trim();

      const srcRes = resolveVoiceChannel(srcInput, guild);
      if (!srcRes.success) {
        await respond.error(`Source: ${srcRes.error}`);
        return;
      }
      sourceVc = srcRes.value.channel;

      const dstRes = resolveVoiceChannel(dstInput, guild);
      if (!dstRes.success) {
        await respond.error(`Destination: ${dstRes.error}`);
        return;
      }
      destVc = dstRes.value.channel;
    } else if (parsed.args.length >= 2) {
      // Check if first arg resolves to VC and remaining resolves to VC
      const firstRes = resolveVoiceChannel(parsed.args[0], guild);
      const secondRes = resolveVoiceChannel(parsed.args.slice(1).join(' '), guild);

      if (firstRes.success && secondRes.success) {
        sourceVc = firstRes.value.channel;
        destVc = secondRes.value.channel;
      }
    }

    // If still not resolved as 2 channels, try 1 argument (destination only)
    if (!sourceVc || !destVc) {
      if (!member.voice.channel) {
        await respond.error(
          'You must be connected to a voice channel, or provide both source and destination channels.\n' +
          'Usage: `svc <destination>` or `svc <source> <destination>`'
        );
        return;
      }

      sourceVc = member.voice.channel;
      const dstRes = resolveVoiceChannel(raw, guild);
      if (!dstRes.success) {
        await respond.error(`Destination: ${dstRes.error}`);
        return;
      }
      destVc = dstRes.value.channel;
    }

    if (sourceVc.id === destVc.id) {
      await respond.error('Source and destination cannot be the same voice channel.');
      return;
    }

    const botMember = guild.members.me;
    if (botMember && !destVc.permissionsFor(botMember).has([PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.MoveMembers])) {
      await respond.error(`I lack permission to connect and move members into ${mentionChannel(destVc.id)}.`);
      return;
    }

    const access = await checkVoiceAccess(guild.id, member, 'svc', destVc.id);
    if (!access.allowed) {
      await respond.denied(access.reason || 'Voice command access denied.');
      return;
    }

    const membersToMove = Array.from(sourceVc.members.values());
    if (membersToMove.length === 0) {
      await respond.error(`There is no one connected to ${mentionChannel(sourceVc.id)}.`);
      return;
    }

    const statusMsg = await respond.send(`> Shifting **${membersToMove.length}** member(s) from **${sourceVc.name}** to **${destVc.name}**...`);

    let moved = 0;
    let failed = 0;

    // Move all members simultaneously
    await Promise.all(
      membersToMove.map(async (m) => {
        try {
          await m.voice.setChannel(destVc);
          moved++;
        } catch {
          failed++;
        }
      })
    );

    logAuditAction({
      guild,
      action: 'Voice Channel Shifted',
      executor: member,
      channelName: destVc.name,
      details: `• **Source:** \`${sourceVc.name}\` (${sourceVc.id})\n• **Destination:** \`${destVc.name}\` (${destVc.id})\n• **Moved:** ${moved} | **Failed:** ${failed}`,
    });

    if (failed === 0) {
      await statusMsg.edit({
        content: `Successfully shifted all **${moved}** member(s) from **${sourceVc.name}** to **${destVc.name}**.`,
      }).catch(() => {});
    } else {
      await statusMsg.edit({
        content: `Shifted **${moved}** member(s) from **${sourceVc.name}** to **${destVc.name}** (${failed} failed).`,
      }).catch(() => {});
    }
  },
});

