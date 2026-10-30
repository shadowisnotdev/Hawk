import { PermissionsBitField } from 'discord.js';
import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import { getGamePing, getGameTestChannel } from '../../core/database/repositories/gameRepo.js';
import { checkVcCooldown, setVcCooldown, removeVcCooldown } from './GameVcCooldownManager.js';
import { mentionChannel } from '../../core/utils/formatters.js';
import { logEvent } from '../../core/logging/WebhookLogger.js';

export default defineCommand({
  name: 'rp',
  module: 'gaming',
  description: 'Announce a game session by pinging its configured role and linking its destination VC.',
  usage: 'rp <identifier> <message...>',
  examples: [
    'rp au1 Come play Among Us!',
    'rp au2 Anyone up for a game?',
    'rp aum Modded lobby starting!',
  ],
  permissions: [],
  permitOnly: true,
  botPermissions: [PermissionsBitField.Flags.SendMessages],
  cooldown: 0,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, guild, respond, message, channel } = ctx;

    if (parsed.args.length === 0) {
      await respond.error(`Usage: \`${parsed.prefix}rp <identifier> <message...>\``);
      return;
    }

    const identifier = parsed.args[0].toLowerCase();
    const pingConfig = await getGamePing(guild.id, identifier);

    if (!pingConfig) {
      await respond.error(`No game ping configuration found with identifier \`${identifier}\`.`);
      return;
    }

    const userMessageContent = parsed.args.slice(1).join(' ').trim();
    if (!userMessageContent) {
      await respond.error('Please provide a message for the announcement.');
      return;
    }

    // Check if current channel is designated game test channel or name contains 'test'
    const testChannelId = await getGameTestChannel(guild.id);
    const isTestChannel = Boolean(
      (testChannelId && channel.id === testChannelId) ||
      ('name' in channel && channel.name && channel.name.toLowerCase().includes('test'))
    );

    if (isTestChannel) {
      removeVcCooldown(guild.id, pingConfig.identifier);
    } else {
      // Check independent per-identifier cooldown
      const remainingCooldown = checkVcCooldown(guild.id, pingConfig.identifier);
      if (remainingCooldown > 0) {
        await respond.warning(
          `The ping destination \`${pingConfig.identifier}\` (${pingConfig.gameName}) is on cooldown for **${remainingCooldown}s**.`,
        );
        return;
      }
    }

    // Auto-delete original command message (non-blocking, ignore transient network drops)
    message.delete().catch(() => {});

    // Construct announcement skeleton: Role Mention -> User Message -> VC Mention
    const announcementText = `<@&${pingConfig.roleId}> ${userMessageContent} ${mentionChannel(pingConfig.vcId)}`;

    // Send with strict allowedMentions: ONLY the configured game role can be mentioned by the bot
    await channel.send({
      content: announcementText,
      allowedMentions: {
        roles: [pingConfig.roleId],
        users: [],
        parse: [],
      },
    });

    // Set per-identifier cooldown only if not in test channel
    if (!isTestChannel) {
      setVcCooldown(guild.id, pingConfig.identifier, pingConfig.cooldownSeconds);
    }

    // Developer webhook logging
    logEvent('info', 'command_execution', `rp: ${ctx.member.user.tag} announced ${pingConfig.identifier} (${pingConfig.gameName})`, {
      user: ctx.member.user.tag,
      userId: ctx.member.id,
      guild: guild.name,
      guildId: guild.id,
      channel: channel.name,
      identifier: pingConfig.identifier,
      gameName: pingConfig.gameName,
      roleId: pingConfig.roleId,
      vcId: pingConfig.vcId,
      message: userMessageContent,
    });
  },
});
