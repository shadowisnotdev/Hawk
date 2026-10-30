import type { Message, GuildTextBasedChannel, GuildMember } from 'discord.js';
import type { CommandContext, ParsedCommand } from '../../types/command.js';
import type { PermissionContext } from '../../types/permission.js';
import { parseCommand } from '../parser/PrefixParser.js';
import { tokenize } from '../parser/ArgumentTokenizer.js';
import { resolveCommand, isRegistered } from './CommandRegistry.js';
import { checkPermission, checkBotPermissions, getAuthorityLevel } from '../permissions/PermissionChecker.js';
import { checkRestrictions } from '../restrictions/RestrictionChecker.js';
import { isIgnored } from '../ignore/IgnoreChecker.js';
import { checkCooldown, setCooldown, clearCooldown } from '../cooldowns/CooldownManager.js';
import { ResponseBuilder } from '../responses/ResponseBuilder.js';
import { logCommand, logEvent } from '../logging/WebhookLogger.js';
import { logCommandAudit } from '../logging/AuditLogger.js';
import type { CommandLogEvent } from '../../types/logging.js';
import { getUserMessage, getInternalMessage, BotError, ValidationError } from '../errors/BotError.js';
import { getPrefix } from '../database/repositories/guildConfigRepo.js';
import { getGameTestChannel } from '../database/repositories/gameRepo.js';
import { AuthorityLevel } from '../../types/permission.js';
import { isNoPrefixEnabled } from '../config/NoPrefixConfig.js';
import { presenceManager } from '../presence/PresenceManager.js';
import { getMaintenanceState } from '../database/repositories/systemRepo.js';
import { resolveCustomCommand } from './CustomCommandExecutor.js';
import { resolveCustomRoleCommand } from './CustomRoleExecutor.js';

function recordCommandLog(client: any, event: CommandLogEvent): void {
  logCommand(event);
  logCommandAudit(client, event).catch(() => {});
}

function tryNoPrefixParse(content: string): ParsedCommand | null {
  const trimmed = content.trim();
  if (!trimmed) return null;
  const spaceIndex = trimmed.indexOf(' ');
  const firstWord = (spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex)).toLowerCase();

  if (!isRegistered(firstWord)) return null;

  const rawArgs = spaceIndex === -1 ? '' : trimmed.slice(spaceIndex + 1).trim();
  const { args, tokens } = tokenize(rawArgs);

  return {
    prefix: '',
    commandName: firstWord,
    aliasUsed: firstWord,
    rawArgs,
    args,
    tokens,
  };
}

export async function handleMessage(message: Message): Promise<void> {
  if (message.author.bot) return;
  if (!message.guild) return;
  if (!message.member) return;

  const channel = message.channel;
  if (!channel.isTextBased() || channel.isDMBased()) return;
  const guildChannel = channel as GuildTextBasedChannel;

  const prefix = await getPrefix(message.guild.id);
  let parsed = parseCommand(message.content, prefix);
  const wasPrefixed = !!parsed;
  if (!parsed && isNoPrefixEnabled(message.guild.id, message.author.id)) {
    parsed = tryNoPrefixParse(message.content);
  }
  if (!parsed) return;

  const command =
    resolveCommand(parsed.commandName) ||
    (await resolveCustomCommand(message.guild.id, parsed.commandName)) ||
    (await resolveCustomRoleCommand(message.guild.id, parsed.commandName));
  if (!command) {
    if (wasPrefixed) {
      recordCommandLog(message.client, {
        guildId: message.guild.id,
        guildName: message.guild.name,
        channelId: guildChannel.id,
        channelName: guildChannel.name,
        userId: message.author.id,
        userTag: message.author.tag,
        commandName: parsed.commandName,
        aliasUsed: parsed.commandName,
        rawContent: message.content,
        rawArgs: parsed.rawArgs,
        success: false,
        outcome: 'unknown',
        error: `Unknown command '${parsed.commandName}'`,
      });
    }
    return;
  }

  parsed.aliasUsed = parsed.commandName;
  parsed.commandName = command.name;
  if (!command.enabled) {
    recordCommandLog(message.client, {
      guildId: message.guild.id,
      guildName: message.guild.name,
      channelId: guildChannel.id,
      channelName: guildChannel.name,
      userId: message.author.id,
      userTag: message.author.tag,
      commandName: command.name,
      aliasUsed: parsed.aliasUsed,
      rawContent: message.content,
      rawArgs: parsed.rawArgs,
      success: false,
      outcome: 'denied',
      error: 'Command is disabled',
    });
    return;
  }

  const categoryId = ('parentId' in guildChannel && guildChannel.parentId) ? guildChannel.parentId : null;
  const permCtx: PermissionContext = {
    userId: message.author.id, guildId: message.guild.id, guildOwnerId: message.guild.ownerId,
    memberRoleIds: Array.from(message.member.roles.cache.keys()),
    commandName: command.name, moduleName: command.module, channelId: guildChannel.id, categoryId,
  };

  const respond = new ResponseBuilder(message);

  // Auto-cleanup after 7 seconds for immediate action voice commands (excluding interactive/status lookups: wv, invc, vconfig, dragme, fmv, rmv)
  const isAutoCleanVoiceCmd = command.module === 'voice' && !['wv', 'invc', 'vconfig', 'dragme', 'fmv', 'rmv'].includes(command.name);
  if (isAutoCleanVoiceCmd) {
    respond.enableAutoClean(7000);
  }

  const authority = getAuthorityLevel(message.author.id, message.guild.ownerId, message.member);

  // Global Maintenance Mode check: Non-owners are blocked with a maintenance notice
  if (authority < AuthorityLevel.Owner) {
    const maintenance = await getMaintenanceState();
    if (maintenance.enabled) {
      recordCommandLog(message.client, {
        guildId: message.guild.id, guildName: message.guild.name, channelId: guildChannel.id, channelName: guildChannel.name,
        userId: message.author.id, userTag: message.author.tag, commandName: command.name, aliasUsed: parsed.aliasUsed,
        rawContent: message.content, rawArgs: parsed.rawArgs, success: false, outcome: 'maintenance',
        error: `Blocked by maintenance mode: ${maintenance.reason}`,
      });
      await respond.transientWarning(
        `**Maintenance in Progress**\n` +
        `The bot is currently undergoing scheduled maintenance.\n\n` +
        `• **Reason:** ${maintenance.reason}\n` +
        `• *Commands are temporarily reserved for developers. Please check back shortly!*`,
        8000
      );
      return;
    }
  }

  if (authority < AuthorityLevel.ServerAdmin) {
    const ignored = await isIgnored(message.guild.id, message.author.id, permCtx.memberRoleIds, guildChannel.id, categoryId, command.name, command.module, message.member.roles.cache);
    if (ignored) {
      recordCommandLog(message.client, {
        guildId: message.guild.id, guildName: message.guild.name, channelId: guildChannel.id, channelName: guildChannel.name,
        userId: message.author.id, userTag: message.author.tag, commandName: command.name, aliasUsed: parsed.aliasUsed,
        rawContent: message.content, rawArgs: parsed.rawArgs, success: false, outcome: 'ignored',
        error: 'Blocked by server ignore whitelist/blacklist rule',
      });
      return;
    }
  }

  const permResult = await checkPermission(command, permCtx, message.member);
  if (!permResult.allowed) {
    recordCommandLog(message.client, {
      guildId: message.guild.id, guildName: message.guild.name, channelId: guildChannel.id, channelName: guildChannel.name,
      userId: message.author.id, userTag: message.author.tag, commandName: command.name, aliasUsed: parsed.aliasUsed,
      rawContent: message.content, rawArgs: parsed.rawArgs, success: false, outcome: 'denied',
      error: permResult.reason || 'Missing permissions or custom permit',
    });
    return;
  }

  const restrictResult = await checkRestrictions(permCtx, permResult.authority);
  if (!restrictResult.allowed) {
    recordCommandLog(message.client, {
      guildId: message.guild.id, guildName: message.guild.name, channelId: guildChannel.id, channelName: guildChannel.name,
      userId: message.author.id, userTag: message.author.tag, commandName: command.name, aliasUsed: parsed.aliasUsed,
      rawContent: message.content, rawArgs: parsed.rawArgs, success: false, outcome: 'denied',
      error: restrictResult.reason || 'Command restricted in this channel or for this role',
    });
    return;
  }

  if (command.botPermissions.length > 0) {
    const botMember = message.guild.members.me ?? (await message.guild.members.fetchMe().catch(() => null));
    if (botMember) {
      const botPerms = checkBotPermissions(botMember, command.botPermissions);
      if (!botPerms.hasAll) {
        recordCommandLog(message.client, {
          guildId: message.guild.id, guildName: message.guild.name, channelId: guildChannel.id, channelName: guildChannel.name,
          userId: message.author.id, userTag: message.author.tag, commandName: command.name, aliasUsed: parsed.aliasUsed,
          rawContent: message.content, rawArgs: parsed.rawArgs, success: false, outcome: 'fail',
          error: `Bot missing permissions: ${botPerms.missing.join(', ')}`,
        });
        await respond.error(`I'm missing the following permissions: ${botPerms.missing.join(', ')}`);
        return;
      }
    }
  }

  let isGameTestChannel = false;
  if (command.module === 'gaming' || command.name === 'rp') {
    const testChannelId = await getGameTestChannel(message.guild.id);
    if (
      (testChannelId && guildChannel.id === testChannelId) ||
      ('name' in guildChannel && guildChannel.name && guildChannel.name.toLowerCase().includes('test'))
    ) {
      isGameTestChannel = true;
    }
  }

  if (!isGameTestChannel) {
    const remaining = checkCooldown(message.author.id, command.name, command.cooldown, permResult.authority);
    if (remaining > 0) {
      recordCommandLog(message.client, {
        guildId: message.guild.id, guildName: message.guild.name, channelId: guildChannel.id, channelName: guildChannel.name,
        userId: message.author.id, userTag: message.author.tag, commandName: command.name, aliasUsed: parsed.aliasUsed,
        rawContent: message.content, rawArgs: parsed.rawArgs, success: false, outcome: 'cooldown',
        error: `Triggered on cooldown (${remaining}s remaining)`,
      });
      await respond.warning(`Please wait **${remaining}s** before using this command again.`);
      return;
    }
  }

  setCooldown(message.author.id, command.name, command.cooldown);

  let replyTarget: GuildMember | null = null;
  if (message.reference?.messageId) {
    try {
      let referenced = (message as unknown as { referencedMessage?: Message | null }).referencedMessage;
      if (!referenced) {
        referenced = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
      }
      if (referenced?.author) {
        replyTarget = await message.guild.members.fetch(referenced.author.id).catch(() => null);
      }
    } catch {
      // Optional resolution
    }
  }

  const ctx: CommandContext = {
    message,
    replyTarget,
    command,
    parsed: parsed as ParsedCommand,
    guild: message.guild,
    member: message.member,
    channel: guildChannel,
    respond,
    async canExecute(cmdName: string): Promise<boolean> {
      const targetCmd = resolveCommand(cmdName);
      if (!targetCmd || !targetCmd.enabled) return false;
      const res = await checkPermission(targetCmd, permCtx, message.member!);
      if (!res.allowed) return false;
      const restr = await checkRestrictions(permCtx, res.authority);
      return restr.allowed;
    },
  };

  try {
    presenceManager.recordActivity();
    await command.execute(ctx);

    const replyType = respond.getLastOutcome();
    const responseSnippet = respond.getLastSnippet() || undefined;
    let outcome: 'success' | 'warning' | 'info' | 'fail' = 'success';
    if (replyType === 'warning') outcome = 'warning';
    else if (replyType === 'info') outcome = 'info';
    else if (replyType === 'error') outcome = 'fail';

    recordCommandLog(message.client, {
      guildId: message.guild.id, guildName: message.guild.name, channelId: guildChannel.id, channelName: guildChannel.name,
      userId: message.author.id, userTag: message.author.tag, commandName: command.name, aliasUsed: parsed.aliasUsed,
      rawContent: message.content, rawArgs: parsed.rawArgs, success: outcome !== 'fail', outcome,
      replyType: replyType || undefined, responseSnippet,
    });
  } catch (error) {
    if (error instanceof ValidationError) clearCooldown(message.author.id, command.name);
    const userMsg = getUserMessage(error);
    const internalMsg = getInternalMessage(error);
    if (error instanceof BotError) { await respond.error(userMsg).catch(() => {}); } else { await respond.error('An unexpected error occurred.').catch(() => {}); }
    recordCommandLog(message.client, {
      guildId: message.guild.id, guildName: message.guild.name, channelId: guildChannel.id, channelName: guildChannel.name,
      userId: message.author.id, userTag: message.author.tag, commandName: command.name, aliasUsed: parsed.aliasUsed,
      rawContent: message.content, rawArgs: parsed.rawArgs, success: false, outcome: 'fail', error: internalMsg,
    });
    logEvent('error', 'command_failure', `Command ${command.name} failed`, { error: internalMsg, user: message.author.id, guild: message.guild.id });
  }
}
