import { PermissionsBitField } from 'discord.js';
import type { GuildTextBasedChannel } from 'discord.js';
import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import { resolveChannel } from '../../core/resolver/ChannelResolver.js';
import {
  getWelcomeConfig,
  setGreetChannel,
  setGreetPayload,
  removeGreetPayload,
  setLeaveChannel,
  setLeavePayload,
  removeLeavePayload,
} from '../../core/database/repositories/welcomeRepo.js';
import { buildWelcomeConfigPanel } from './welcomeUI.js';
import {
  WELCOME_VARIABLES_GUIDE,
  buildVariableContext,
  renderWelcomePayload,
} from './welcomeEngine.js';
import { mentionChannel } from '../../core/utils/formatters.js';
import { logEvent } from '../../core/logging/WebhookLogger.js';

export default defineCommand({
  name: 'welcome',
  aliases: ['greet', 'greeting', 'greetings', 'leave', 'farewell'],
  module: 'welcome',
  description: 'Manage welcome greetings and leave messages configuration.',
  usage: 'welcome <greet|leave> <channel|message|remove|showvars|test> [args...]',
  examples: [
    'welcome greet channel #welcome',
    'greet channel #welcome',
    'welcome greet message',
    'greet message',
    'welcome greet test',
    'greet test',
    'welcome leave channel #goodbye',
    'leave test',
  ],
  permissions: [PermissionsBitField.Flags.ManageGuild],
  botPermissions: [PermissionsBitField.Flags.SendMessages],
  cooldown: 3,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, respond, channel } = ctx;
    const cmdName = (parsed.aliasUsed || parsed.commandName || 'welcome').toLowerCase();

    // Support both direct alias syntax (!greet channel #welcome) and full syntax (!welcome greet channel #welcome)
    let effectiveArgs = [...parsed.args];
    if (cmdName === 'greet' || cmdName === 'greeting' || cmdName === 'greetings') {
      if (effectiveArgs.length === 0 || (effectiveArgs[0] !== 'greet' && effectiveArgs[0] !== 'leave')) {
        effectiveArgs = ['greet', ...effectiveArgs];
      }
    } else if (cmdName === 'leave' || cmdName === 'farewell') {
      if (effectiveArgs.length === 0 || (effectiveArgs[0] !== 'greet' && effectiveArgs[0] !== 'leave')) {
        effectiveArgs = ['leave', ...effectiveArgs];
      }
    }

    if (effectiveArgs.length === 0) {
      const panel = buildWelcomeConfigPanel('greet');
      await (channel as GuildTextBasedChannel).send(panel);
      return;
    }

    const typeArg = effectiveArgs[0].toLowerCase();
    if (typeArg !== 'greet' && typeArg !== 'leave') {
      if (typeArg === 'showvars' || typeArg === 'vars' || typeArg === 'variables') {
        await respond.info(WELCOME_VARIABLES_GUIDE);
        return;
      }
      await respond.error(`Usage: \`${parsed.prefix}welcome <greet|leave> <channel|message|remove|showvars|test> [args...]\``);
      return;
    }

    const isGreet = typeArg === 'greet';

    if (effectiveArgs.length < 2) {
      const panel = buildWelcomeConfigPanel(isGreet ? 'greet' : 'leave');
      await (channel as GuildTextBasedChannel).send(panel);
      return;
    }

    const action = effectiveArgs[1].toLowerCase();
    const actionArgs = effectiveArgs.slice(2);

    switch (action) {
      case 'channel':
      case 'setchannel':
        await handleChannel(ctx, isGreet, actionArgs);
        break;

      case 'message':
      case 'setmessage':
      case 'text':
      case 'msg':
      case 'panel':
        await handleMessageConfig(ctx, isGreet, actionArgs);
        break;

      case 'remove':
      case 'disable':
      case 'clear':
        await handleRemove(ctx, isGreet);
        break;

      case 'showvars':
      case 'vars':
      case 'variables':
        await respond.info(WELCOME_VARIABLES_GUIDE);
        break;

      case 'test':
      case 'preview':
        await handleTest(ctx, isGreet);
        break;

      default:
        await respond.error(`Unknown subcommand \`${action}\`. Valid options: \`channel\`, \`message\`, \`remove\`, \`showvars\`, \`test\`.`);
        break;
    }
  },
});

async function handleChannel(ctx: CommandContext, isGreet: boolean, args: string[]): Promise<void> {
  const { guild, respond, member } = ctx;

  if (args.length === 0) {
    const config = await getWelcomeConfig(guild.id);
    const channelId = isGreet ? config?.greetChannelId : config?.leaveChannelId;
    if (channelId) {
      await respond.info(`${isGreet ? 'Welcome' : 'Leave'} destination channel is currently ${mentionChannel(channelId)}.`);
    } else {
      await respond.info(`No ${isGreet ? 'welcome' : 'leave'} channel has been configured yet.`);
    }
    return;
  }

  const chanRes = resolveChannel(args[0], guild);
  if (!chanRes.success) {
    await respond.error(`Channel: ${chanRes.error}`);
    return;
  }

  const targetChan = chanRes.value.channel;
  if (!targetChan.isTextBased()) {
    await respond.error('Destination channel must be a text channel.');
    return;
  }

  if (isGreet) {
    await setGreetChannel(guild.id, targetChan.id);
  } else {
    await setLeaveChannel(guild.id, targetChan.id);
  }

  await respond.success(`${isGreet ? 'Welcome greeting' : 'Leave message'} destination channel configured to ${mentionChannel(targetChan.id)}.`);

  logEvent('info', 'command_execution', `Welcome ${isGreet ? 'greet' : 'leave'} channel set by ${member.user.tag}`, {
    administrator: member.user.tag,
    adminId: member.id,
    guild: guild.name,
    guildId: guild.id,
    type: isGreet ? 'greet' : 'leave',
    channelId: targetChan.id,
  });
}

async function handleMessageConfig(ctx: CommandContext, isGreet: boolean, args: string[]): Promise<void> {
  const { channel, respond, guild, member } = ctx;

  if (args.length > 0) {
    const rawText = args.join(' ').trim();
    if (isGreet) {
      await setGreetPayload(guild.id, rawText);
    } else {
      await setLeavePayload(guild.id, rawText);
    }

    await respond.success(`Configured ${isGreet ? 'welcome greeting' : 'leave message'} plain text message:\n\`\`\`\n${rawText}\n\`\`\``);

    logEvent('info', 'command_execution', `Welcome ${isGreet ? 'greet' : 'leave'} message updated by ${member.user.tag}`, {
      administrator: member.user.tag,
      adminId: member.id,
      guild: guild.name,
      guildId: guild.id,
      type: isGreet ? 'greet' : 'leave',
    });
    return;
  }

  const panel = buildWelcomeConfigPanel(isGreet ? 'greet' : 'leave');
  await (channel as GuildTextBasedChannel).send(panel);
  await respond.success(`Posted ${isGreet ? 'Welcome' : 'Leave'} message configuration panel.`);
}

async function handleRemove(ctx: CommandContext, isGreet: boolean): Promise<void> {
  const { guild, respond, member } = ctx;

  if (isGreet) {
    await removeGreetPayload(guild.id);
  } else {
    await removeLeavePayload(guild.id);
  }

  await respond.success(`Removed configured ${isGreet ? 'welcome greeting' : 'leave message'} payload.`);

  logEvent('info', 'command_execution', `Welcome ${isGreet ? 'greet' : 'leave'} payload removed by ${member.user.tag}`, {
    administrator: member.user.tag,
    adminId: member.id,
    guild: guild.name,
    guildId: guild.id,
    type: isGreet ? 'greet' : 'leave',
  });
}

async function handleTest(ctx: CommandContext, isGreet: boolean): Promise<void> {
  const { guild, respond, member } = ctx;
  const config = await getWelcomeConfig(guild.id);

  const channelId = isGreet ? config?.greetChannelId : config?.leaveChannelId;
  const rawPayload = isGreet ? config?.greetPayload : config?.leavePayload;

  if (!channelId) {
    await respond.error(`No ${isGreet ? 'welcome' : 'leave'} destination channel has been configured. Use \`${ctx.parsed.prefix}welcome ${isGreet ? 'greet' : 'leave'} channel <#channel>\`.`);
    return;
  }

  if (!rawPayload) {
    await respond.error(`No ${isGreet ? 'welcome' : 'leave'} message payload has been configured. Use \`${ctx.parsed.prefix}welcome ${isGreet ? 'greet' : 'leave'} message\`.`);
    return;
  }

  const targetChannel = (await guild.channels.fetch(channelId).catch(() => null)) as GuildTextBasedChannel | null;
  if (!targetChannel) {
    await respond.error('Configured destination channel no longer exists.');
    return;
  }

  // Build variable context using command executor as test user
  const varCtx = buildVariableContext(guild, member);
  const rendered = renderWelcomePayload(rawPayload, varCtx);

  try {
    await targetChannel.send(rendered);
  } catch (err: any) {
    const errorDetail = err?.message || 'Bot lacks permission to send messages in that channel';
    await respond.error(`Could not send preview to ${mentionChannel(targetChannel.id)}: \`${errorDetail}\`. Please check channel permissions.`);
    return;
  }

  await respond.success(`Sent ${isGreet ? 'welcome greeting' : 'leave message'} test preview to ${mentionChannel(targetChannel.id)}.`);

  logEvent('info', 'command_execution', `Welcome ${isGreet ? 'greet' : 'leave'} test executed by ${member.user.tag}`, {
    executor: member.user.tag,
    executorId: member.id,
    guild: guild.name,
    guildId: guild.id,
    type: isGreet ? 'greet' : 'leave',
  });
}
