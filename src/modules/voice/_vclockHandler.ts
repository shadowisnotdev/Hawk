import { MessageFlags, type ButtonInteraction, type VoiceBasedChannel } from 'discord.js';
import { mentionChannel } from '../../core/utils/formatters.js';
import { logAuditAction } from '../../core/logging/AuditLogger.js';

export async function handleVclockUnlockButton(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split('_');
  // customId format: vclock_unlock_<vcId>_<invokerId>
  const vcId = parts[2];
  const invokerId = parts[3];

  if (interaction.user.id !== invokerId) {
    await interaction.reply({
      content: 'Only the moderator who locked the channel can use this quick unlock button.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guild = interaction.guild;
  if (!guild) return;

  const vc = guild.channels.cache.get(vcId) as VoiceBasedChannel | null;
  if (!vc) {
    await interaction.reply({ content: 'Voice channel no longer exists.', flags: MessageFlags.Ephemeral });
    return;
  }

  const everyoneRole = guild.roles.everyone;
  await vc.permissionOverwrites
    .edit(everyoneRole.id, {
      Connect: null,
      ViewChannel: null,
    })
    .catch(() => {});

  await interaction
    .update({
      content: `> Unlocked and unblinded voice channel ${mentionChannel(vc.id)}. *(Auto-deleting in 5s)*`,
      components: [],
    })
    .catch(() => {});

  logAuditAction({
    guild,
    action: 'Voice Channel Quick-Unlocked',
    executor: interaction.member as any,
    channelName: vc.name,
    details: `• **Channel:** \`${vc.name}\` (${vc.id})`,
  });

  setTimeout(() => {
    interaction.message.delete().catch(() => {});
  }, 5000);
}

