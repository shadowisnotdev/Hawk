import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Client,
  type GuildTextBasedChannel,
  type Interaction,
} from 'discord.js';
import {
  getGiveawayById,
  getActiveGiveaways,
  addGiveawayEntry,
  getGiveawayEntries,
  getGiveawayEntryCount,
  endGiveaway,
  type GiveawayRecord,
} from '../../core/database/repositories/giveawayRepo.js';
import { mentionRole } from '../../core/utils/formatters.js';

let giveawayTicker: NodeJS.Timeout | null = null;

export function startGiveawayTicker(client: Client): void {
  if (giveawayTicker) return;

  giveawayTicker = setInterval(async () => {
    try {
      const active = await getActiveGiveaways();
      const now = Date.now();

      for (const ga of active) {
        if (ga.endsAt.getTime() <= now) {
          await finalizeGiveaway(client, ga);
        }
      }
    } catch {
      // Ignore background ticker errors
    }
  }, 10_000);
}

export function stopGiveawayTicker(): void {
  if (giveawayTicker) {
    clearInterval(giveawayTicker);
    giveawayTicker = null;
  }
}

export async function handleGiveawayInteraction(interaction: Interaction): Promise<boolean> {
  if (!interaction.isButton()) return false;
  const { customId } = interaction;

  if (!customId.startsWith('ga_enter_')) return false;

  const giveawayId = parseInt(customId.replace('ga_enter_', ''), 10);
  const ga = await getGiveawayById(giveawayId);

  if (!ga || ga.ended) {
    await interaction.reply({ content: 'This giveaway has already ended.', ephemeral: true });
    return true;
  }

  // Check required role requirement
  if (ga.requiredRoleId && interaction.member) {
    const member = interaction.guild?.members.cache.get(interaction.user.id);
    if (member && !member.roles.cache.has(ga.requiredRoleId)) {
      await interaction.reply({
        content: `You need the ${mentionRole(ga.requiredRoleId, interaction.guild)} role to enter this giveaway.`,
        ephemeral: true,
      });
      return true;
    }
  }

  const added = await addGiveawayEntry(ga.id, interaction.user.id);
  const totalEntries = await getGiveawayEntryCount(ga.id);

  if (!added) {
    await interaction.reply({
      content: `You have already entered this giveaway! Total participants: **${totalEntries}**`,
      ephemeral: true,
    });
    return true;
  }

  await interaction.reply({
    content: `🎉 You have successfully entered the giveaway for **${ga.prize}**! Total participants: **${totalEntries}**`,
    ephemeral: true,
  });

  // Update participant count in the message embed
  try {
    const channel = interaction.channel as GuildTextBasedChannel | null;
    if (channel && 'messages' in channel) {
      const msg = await channel.messages.fetch(ga.messageId).catch(() => null);
      if (msg) {
        const { embed, row } = buildGiveawayActivePayload(ga, totalEntries, interaction.guild);
        await msg.edit({ embeds: [embed], components: [row] }).catch(() => {});
      }
    }
  } catch {
    // Non-critical update failure
  }

  return true;
}

export async function finalizeGiveaway(client: Client, ga: GiveawayRecord): Promise<string[]> {
  const entries = await getGiveawayEntries(ga.id);
  const winners: string[] = [];

  if (entries.length > 0) {
    // Randomly pick unique winners
    const pool = [...entries];
    const pickCount = Math.min(ga.winnerCount, pool.length);

    for (let i = 0; i < pickCount; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      winners.push(pool.splice(idx, 1)[0]);
    }
  }

  await endGiveaway(ga.id, winners);

  // Update Discord message to Ended State (Discohook layout)
  try {
    const guild = client.guilds.cache.get(ga.guildId);
    if (!guild) return winners;

    const channel = (guild.channels.cache.get(ga.channelId) ??
      (await guild.channels.fetch(ga.channelId).catch(() => null))) as GuildTextBasedChannel | null;

    if (channel && 'messages' in channel) {
      const msg = await channel.messages.fetch(ga.messageId).catch(() => null);
      if (msg) {
        const embed = buildGiveawayEndedEmbed(ga, entries.length, winners, guild);
        await msg.edit({ embeds: [embed], components: [] }).catch(() => {});

        if (winners.length > 0) {
          const winnersMention = winners.map((id) => `<@${id}>`).join(', ');
          await channel.send({
            content: `🎉 Congratulations ${winnersMention}! You won the **${ga.prize}**!\nHosted by <@${ga.hostId}> &bull; ${msg.url}`,
          }).catch(() => {});
        } else {
          await channel.send({
            content: `No valid participants entered the giveaway for **${ga.prize}**.`,
          }).catch(() => {});
        }
      }
    }
  } catch {
    // Error editing message
  }

  return winners;
}

export function buildGiveawayActivePayload(
  ga: GiveawayRecord,
  participantCount: number,
  guild: any,
) {
  // Discohook Layout Matching Screenshot: media_1793379356383_1d07386c.png
  const roleDisplay = ga.requiredRoleId ? mentionRole(ga.requiredRoleId, guild) : 'None';
  const timeDisplay = `<t:${Math.floor(ga.endsAt.getTime() / 1000)}:R>`;

  const embed = new EmbedBuilder()
    .setColor(0x10b981)
    .setTitle(`🎁 (${ga.prize}) Giveaway 🎁`)
    .setDescription(
      `• Hosted by: <@${ga.hostId}>\n` +
      `• Duration: ${timeDisplay}\n` +
      `• Required Role: ${roleDisplay}\n` +
      `• Participants: ${participantCount}`
    )
    .setFooter({ text: 'Click the button below to enter!' });

  const button = new ButtonBuilder()
    .setCustomId(`ga_enter_${ga.id}`)
    .setLabel('Enter')
    .setEmoji('🎁')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  return { embed, row };
}

export function buildGiveawayEndedEmbed(
  ga: GiveawayRecord,
  entryCount: number,
  winners: string[],
  guild: any,
): EmbedBuilder {
  // Discohook Layout Matching Screenshot: media_1793379360644_972490cc.png
  const roleDisplay = ga.requiredRoleId ? mentionRole(ga.requiredRoleId, guild) : 'None';
  const timeDisplay = `<t:${Math.floor(ga.endsAt.getTime() / 1000)}:R>`;
  const winnersStr = winners.length > 0 ? winners.map((id) => `<@${id}>`).join(', ') : 'No valid entries';

  return new EmbedBuilder()
    .setColor(0x3b82f6)
    .setTitle(`🎉 (${ga.prize}) Giveaway ended 🎉`)
    .setDescription(
      `• Hosted by: <@${ga.hostId}>\n` +
      `• Duration: ${timeDisplay}\n` +
      `• Required Role: ${roleDisplay}\n` +
      `• Entries: ${entryCount}\n\n` +
      `🎉 **Winner(s):** ${winnersStr}`
    )
    .setFooter({ text: 'Giveaway concluded' });
}
