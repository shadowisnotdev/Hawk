import { PermissionsBitField } from 'discord.js';
import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import { resolveChannel } from '../../core/resolver/ChannelResolver.js';
import {
  addMediaChannel,
  removeMediaChannel,
  getMediaChannels,
  setMediaAutoThread,
  getMediaAutoThread,
} from '../../core/database/repositories/mediaRepo.js';
import { mentionChannel, bold } from '../../core/utils/formatters.js';
import { ui } from '../../core/ui/index.js';
import { logEvent } from '../../core/logging/WebhookLogger.js';

export default defineCommand({
  name: 'media',
  module: 'media',
  description: 'Manage media channel filtering and auto-threading configuration.',
  usage: 'media <channel|thread> <add|remove|list|on|off> [target]',
  examples: [
    'media channel add #media',
    'media channel remove #media',
    'media channel list',
    'media thread on',
    'media thread off',
  ],
  permissions: [PermissionsBitField.Flags.ManageGuild],
  botPermissions: [PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.CreatePublicThreads],
  cooldown: 3,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, respond } = ctx;

    if (parsed.args.length < 2) {
      await respond.error(`Usage: \`${parsed.prefix}media <channel|thread> <add|remove|list|on|off> [target]\``);
      return;
    }

    const group = parsed.args[0].toLowerCase();
    const action = parsed.args[1].toLowerCase();
    const subArgs = parsed.args.slice(2);

    if (group === 'channel' || group === 'channels') {
      switch (action) {
        case 'add':
          await handleChannelAdd(ctx, subArgs);
          break;
        case 'remove':
        case 'rm':
        case 'delete':
          await handleChannelRemove(ctx, subArgs);
          break;
        case 'list':
        case 'show':
          await handleChannelList(ctx);
          break;
        default:
          await respond.error(`Unknown channel subcommand \`${action}\`. Valid options: \`add\`, \`remove\`, \`list\`.`);
          break;
      }
    } else if (group === 'thread' || group === 'threads' || group === 'autothread') {
      if (action === 'on' || action === 'enable' || action === 'true') {
        await handleThreadToggle(ctx, true);
      } else if (action === 'off' || action === 'disable' || action === 'false') {
        await handleThreadToggle(ctx, false);
      } else {
        await respond.error(`Unknown thread option \`${action}\`. Valid options: \`on\`, \`off\`.`);
      }
    } else {
      await respond.error(`Specify \`channel\` or \`thread\`. Example: \`${parsed.prefix}media channel add #media\` or \`${parsed.prefix}media thread on\`.`);
    }
  },
});

async function handleChannelAdd(ctx: CommandContext, args: string[]): Promise<void> {
  const { guild, respond, member } = ctx;

  if (args.length === 0) {
    await respond.error(`Usage: \`${ctx.parsed.prefix}media channel add <#channel>\``);
    return;
  }

  const chanRes = resolveChannel(args[0], guild);
  if (!chanRes.success) {
    await respond.error(`Channel: ${chanRes.error}`);
    return;
  }

  const targetChan = chanRes.value.channel;
  if (!targetChan.isTextBased()) {
    await respond.error('Media channel must be a text-based channel.');
    return;
  }

  const added = await addMediaChannel(guild.id, targetChan.id);
  if (!added) {
    await respond.warning(`${mentionChannel(targetChan.id)} is already configured as a media channel.`);
    return;
  }

  await respond.success(`Added ${mentionChannel(targetChan.id)} to media channels.`);

  logEvent('info', 'command_execution', `Media channel added by ${member.user.tag}`, {
    administrator: member.user.tag,
    adminId: member.id,
    guild: guild.name,
    guildId: guild.id,
    channelId: targetChan.id,
  });
}

async function handleChannelRemove(ctx: CommandContext, args: string[]): Promise<void> {
  const { guild, respond, member } = ctx;

  if (args.length === 0) {
    await respond.error(`Usage: \`${ctx.parsed.prefix}media channel remove <#channel>\``);
    return;
  }

  const chanRes = resolveChannel(args[0], guild);
  if (!chanRes.success) {
    await respond.error(`Channel: ${chanRes.error}`);
    return;
  }

  const targetChan = chanRes.value.channel;
  const removed = await removeMediaChannel(guild.id, targetChan.id);

  if (!removed) {
    await respond.error(`${mentionChannel(targetChan.id)} is not configured as a media channel.`);
    return;
  }

  await respond.success(`Removed ${mentionChannel(targetChan.id)} from media channels.`);

  logEvent('info', 'command_execution', `Media channel removed by ${member.user.tag}`, {
    administrator: member.user.tag,
    adminId: member.id,
    guild: guild.name,
    guildId: guild.id,
    channelId: targetChan.id,
  });
}

async function handleChannelList(ctx: CommandContext): Promise<void> {
  const { guild, respond } = ctx;

  const channels = await getMediaChannels(guild.id);
  const autoThread = await getMediaAutoThread(guild.id);

  if (channels.length === 0) {
    await respond.info(`No media channels are currently configured for this server.\n\nAuto Threads: ${bold(autoThread ? 'ON' : 'OFF')}`);
    return;
  }

  const items = channels.map(c => `• ${mentionChannel(c.channelId)}`);
  items.push(`\n**Auto Threads:** ${bold(autoThread ? 'ON' : 'OFF')}`);

  await ui.paginated(ctx, {
    title: 'Media Filter Channels',
    items,
    pageSize: 10,
    emptyText: 'No media channels are currently configured.',
  });
}

async function handleThreadToggle(ctx: CommandContext, enabled: boolean): Promise<void> {
  const { guild, respond, member } = ctx;

  await setMediaAutoThread(guild.id, enabled);
  await respond.success(`Auto-threading for media channels set to ${bold(enabled ? 'ON' : 'OFF')}.`);

  logEvent('info', 'command_execution', `Media auto-thread set to ${enabled ? 'ON' : 'OFF'} by ${member.user.tag}`, {
    administrator: member.user.tag,
    adminId: member.id,
    guild: guild.name,
    guildId: guild.id,
    autoThread: enabled,
  });
}
