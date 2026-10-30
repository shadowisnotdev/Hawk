import { PermissionsBitField } from 'discord.js';
import { defineCommand, type CommandContext } from '../../types/command.js';
import { getGiveawayByMessageId } from '../../core/database/repositories/giveawayRepo.js';
import { finalizeGiveaway } from './_giveawayHandler.js';

export default defineCommand({
  name: 'gend',
  aliases: ['giveawayend', 'gstop'],
  module: 'giveaway',
  description: 'Instantly end an active giveaway and pick winners.',
  usage: 'gend <message_id>',
  examples: ['gend 123456789012345678'],
  permissions: [PermissionsBitField.Flags.ManageGuild],
  cooldown: 3,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, guild, respond } = ctx;

    if (parsed.args.length === 0) {
      await respond.error(`Please provide the message ID of the giveaway to end.\nUsage: \`${parsed.prefix}gend <message_id>\``);
      return;
    }

    const messageId = parsed.args[0].trim();
    const ga = await getGiveawayByMessageId(messageId);

    if (!ga || ga.guildId !== guild.id) {
      await respond.error(`Could not find a giveaway with message ID \`${messageId}\` in this server.`);
      return;
    }

    if (ga.ended) {
      await respond.warning('This giveaway has already ended.');
      return;
    }

    await respond.info(`Ending giveaway for **${ga.prize}** and selecting winners...`);
    const winners = await finalizeGiveaway(guild.client, ga);

    if (winners.length > 0) {
      const mentions = winners.map((id) => `<@${id}>`).join(', ');
      await respond.success(`Giveaway concluded! Winner(s): ${mentions}`);
    } else {
      await respond.warning('Giveaway concluded with no valid entries.');
    }
  },
});

