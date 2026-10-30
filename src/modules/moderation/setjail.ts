import { PermissionsBitField } from 'discord.js';
import { defineCommand, type CommandContext } from '../../types/command.js';
import { setJailConfig, getJailConfig } from '../../core/database/repositories/jailRepo.js';
import { resolveRole } from '../../core/resolver/RoleResolver.js';
import { resolveChannel } from '../../core/resolver/ChannelResolver.js';
import { mentionRole, mentionChannel } from '../../core/utils/formatters.js';

export default defineCommand({
  name: 'setjail',
  aliases: ['jailconfig', 'jailsetup'],
  module: 'moderation',
  description: 'Configure the designated quarantine Jail role and channel for this server.',
  usage: 'setjail <@role> [channel]',
  examples: ['setjail @Jail', 'setjail @Quarantined #quarantine-cell'],
  permissions: [PermissionsBitField.Flags.Administrator],
  botPermissions: [PermissionsBitField.Flags.ManageRoles],
  cooldown: 5,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, guild, respond } = ctx;

    if (parsed.args.length === 0) {
      const config = await getJailConfig(guild.id);
      if (!config) {
        await respond.info(`No Jail configuration found.\nUsage: \`${parsed.prefix}setjail <@role> [channel]\``);
      } else {
        await respond.info(
          `**Current Jail Configuration:**\n` +
          `• **Jail Role:** ${mentionRole(config.jailRoleId, guild)}\n` +
          `• **Quarantine Channel:** ${config.jailChannelId ? mentionChannel(config.jailChannelId) : 'None'}`
        );
      }
      return;
    }

    const roleRes = resolveRole(parsed.args[0], guild);
    if (!roleRes.success) {
      await respond.error(`Could not resolve Jail role: ${roleRes.error}`);
      return;
    }

    const jailRole = roleRes.value.role;
    let channelId: string | null = null;

    if (parsed.args[1]) {
      const cRes = resolveChannel(parsed.args[1], guild);
      if (cRes.success) {
        channelId = cRes.value.channel.id;
      }
    }

    await setJailConfig(guild.id, jailRole.id, channelId);

    await respond.success(
      `Successfully configured Jail system:\n` +
      `• **Jail Role:** ${mentionRole(jailRole.id, guild)}\n` +
      `• **Quarantine Channel:** ${channelId ? mentionChannel(channelId) : 'None'}`
    );
  },
});

