import { PermissionsBitField } from 'discord.js';
import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import { resolveRole } from '../../core/resolver/RoleResolver.js';
import { resolveVoiceChannel } from '../../core/resolver/VoiceChannelResolver.js';
import { resolveChannel } from '../../core/resolver/ChannelResolver.js';
import {
  createGamePing,
  updateGamePing,
  deleteGamePing,
  getGamePing,
  listGamePings,
  setGameTestChannel,
  getGameTestChannel,
} from '../../core/database/repositories/gameRepo.js';
import { mentionRole, mentionChannel, bold, inlineCode } from '../../core/utils/formatters.js';
import { ui } from '../../core/ui/index.js';

export default defineCommand({
  name: 'game',
  aliases: ['gamelist', 'games', 'gameconfig', 'listgames'],
  module: 'gaming',
  description: 'Manage single-destination game ping configurations and test channel.',
  usage: 'game <create|edit|delete|list|testchannel> [args...]',
  examples: [
    'game create au1 "Among Us" @AmongUs #au-vc1 300',
    'game list',
    'gamelist',
    'game delete au1',
    'game testchannel #test-pings',
    'game testchannel none',
  ],
  permissions: [PermissionsBitField.Flags.ManageGuild],
  botPermissions: [],
  cooldown: 3,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, respond } = ctx;

    const alias = parsed.aliasUsed.toLowerCase();
    if (alias === 'gamelist' || alias === 'games' || alias === 'gameconfig' || alias === 'listgames') {
      await handleList(ctx);
      return;
    }

    if (parsed.args.length === 0) {
      await respond.error('Specify a subcommand: `create`, `edit`, `delete`, or `list`.');
      return;
    }

    const subcommand = parsed.args[0].toLowerCase();
    const subArgs = parsed.args.slice(1);

    switch (subcommand) {
      case 'create':
        await handleCreate(ctx, subArgs);
        break;

      case 'edit':
        await handleEdit(ctx, subArgs);
        break;

      case 'delete':
      case 'remove':
        await handleDelete(ctx, subArgs);
        break;

      case 'list':
      case 'show':
        await handleList(ctx);
        break;

      case 'testchannel':
      case 'test_channel':
      case 'tc':
      case 'test':
        await handleTestChannel(ctx, subArgs);
        break;

      default:
        await respond.error(
          `Unknown subcommand \`${subcommand}\`. Valid options: \`create\`, \`edit\`, \`delete\`, \`list\`, \`testchannel\`.`
        );
        break;
    }
  },
});

async function handleCreate(ctx: CommandContext, args: string[]): Promise<void> {
  const { guild, respond } = ctx;

  if (args.length < 4) {
    await respond.error(`Usage: \`${ctx.parsed.prefix}game create <identifier> "<game_name>" <@role> <#vc> [cooldown_seconds]\``);
    return;
  }

  const identifier = args[0].toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(identifier)) {
    await respond.error('Game identifier must contain only alphanumeric characters, dashes, or underscores.');
    return;
  }

  const existing = await getGamePing(guild.id, identifier);
  if (existing) {
    await respond.error(`A game ping configuration with identifier \`${identifier}\` already exists.`);
    return;
  }

  const gameName = args[1];

  // Resolve role (3rd arg)
  const roleResult = resolveRole(args[2], guild);
  if (!roleResult.success) {
    await respond.error(`Role: ${roleResult.error}`);
    return;
  }
  const roleId = roleResult.value.id;

  // Resolve VC (4th arg)
  const vcResult = resolveVoiceChannel(args[3], guild);
  if (!vcResult.success) {
    await respond.error(`Voice channel: ${vcResult.error}`);
    return;
  }
  const vcId = vcResult.value.id;

  // Optional 5th arg for cooldown in seconds
  let cooldownSeconds = 300;
  if (args.length >= 5 && /^\d+$/.test(args[4])) {
    cooldownSeconds = parseInt(args[4], 10);
  }

  await createGamePing({
    guildId: guild.id,
    identifier,
    gameName,
    roleId,
    vcId,
    cooldownSeconds,
  });

  await respond.success(
    `Created ping configuration ${inlineCode(identifier)}:\nGame: ${bold(gameName)}\nRole: ${mentionRole(roleId, guild)}\nVC: ${mentionChannel(vcId)}\nCooldown: ${cooldownSeconds}s`,
  );
}

async function handleEdit(ctx: CommandContext, args: string[]): Promise<void> {
  const { guild, respond } = ctx;

  if (args.length < 4) {
    await respond.error(`Usage: \`${ctx.parsed.prefix}game edit <identifier> "<game_name>" <@role> <#vc> [cooldown_seconds]\``);
    return;
  }

  const identifier = args[0].toLowerCase();
  const existing = await getGamePing(guild.id, identifier);
  if (!existing) {
    await respond.error(`No game ping configuration found with identifier \`${identifier}\`.`);
    return;
  }

  const gameName = args[1];

  const roleResult = resolveRole(args[2], guild);
  if (!roleResult.success) {
    await respond.error(`Role: ${roleResult.error}`);
    return;
  }
  const roleId = roleResult.value.id;

  const vcResult = resolveVoiceChannel(args[3], guild);
  if (!vcResult.success) {
    await respond.error(`Voice channel: ${vcResult.error}`);
    return;
  }
  const vcId = vcResult.value.id;

  let cooldownSeconds = existing.cooldownSeconds;
  if (args.length >= 5 && /^\d+$/.test(args[4])) {
    cooldownSeconds = parseInt(args[4], 10);
  }

  const updated = await updateGamePing(guild.id, identifier, {
    gameName,
    roleId,
    vcId,
    cooldownSeconds,
  });

  if (!updated) {
    await respond.error('Failed to update ping configuration.');
    return;
  }

  await respond.success(
    `Updated ping configuration ${inlineCode(identifier)}:\nGame: ${bold(gameName)}\nRole: ${mentionRole(roleId, guild)}\nVC: ${mentionChannel(vcId)}\nCooldown: ${cooldownSeconds}s`,
  );
}

async function handleDelete(ctx: CommandContext, args: string[]): Promise<void> {
  const { guild, respond } = ctx;

  if (args.length === 0) {
    await respond.error(`Usage: \`${ctx.parsed.prefix}game delete <identifier>\``);
    return;
  }

  const identifier = args[0].toLowerCase();
  const existing = await getGamePing(guild.id, identifier);
  if (!existing) {
    await respond.error(`No game ping configuration found with identifier \`${identifier}\`.`);
    return;
  }

  const deleted = await deleteGamePing(guild.id, identifier);
  if (deleted) {
    await respond.success(`Deleted ping configuration ${inlineCode(identifier)} (${bold(existing.gameName)}).`);
  } else {
    await respond.error(`Failed to delete ping configuration \`${identifier}\`.`);
  }
}

async function handleList(ctx: CommandContext): Promise<void> {
  const { guild, respond } = ctx;

  const pings = await listGamePings(guild.id);
  if (pings.length === 0) {
    await respond.info('No game ping configurations found for this server.');
    return;
  }

  const pingLines = pings.map((p) => {
    const roleStr = mentionRole(p.roleId, guild);
    return `• ${inlineCode(p.identifier)} — ${bold(p.gameName)} — ${roleStr}${p.vcId ? ` — ${mentionChannel(p.vcId)}` : ''} (\`${p.cooldownSeconds}s\` cooldown)`;
  });

  await ui.paginated(ctx, {
    title: 'Gaming Ping Configurations',
    items: pingLines,
    pageSize: 10,
    emptyText: 'No game ping configurations found for this server.',
  });
}

async function handleTestChannel(ctx: CommandContext, args: string[]): Promise<void> {
  const { guild, respond } = ctx;

  if (args.length === 0) {
    const currentTcId = await getGameTestChannel(guild.id);
    if (currentTcId) {
      await respond.info(`The current game test channel is set to ${mentionChannel(currentTcId)}.`);
    } else {
      await respond.info('No game test channel is currently set for this server.');
    }
    return;
  }

  const input = args[0].toLowerCase();
  if (['none', 'off', 'disable', 'delete', 'remove', 'clear'].includes(input)) {
    await setGameTestChannel(guild.id, null);
    await respond.success('Game test channel configuration removed. Cooldowns will apply in all channels.');
    return;
  }

  const channelRes = resolveChannel(args[0], guild);
  if (!channelRes.success) {
    await respond.error(`Channel: ${channelRes.error}`);
    return;
  }

  const targetChannelId = channelRes.value.id;
  await setGameTestChannel(guild.id, targetChannelId);
  await respond.success(
    `Game test channel set to ${mentionChannel(targetChannelId)}. Commands run in this channel will have **no cooldown**.`,
  );
}
