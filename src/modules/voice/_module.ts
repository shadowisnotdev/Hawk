import type { ButtonInteraction, VoiceState } from 'discord.js';
import type { ModuleManifest } from '../../types/module.js';
import { handleDragmeInteraction, handleDragmeVoiceStateUpdate } from './_dragmeHandler.js';
import { handleRmvInteraction } from './_rmvHandler.js';
import { handleVConfigFallback } from './vconfig.js';
import { handleMvaVoiceStateUpdate } from './MvaManager.js';
import { handleVclockUnlockButton } from './_vclockHandler.js';

export default {
  name: 'voice',
  description: 'Voice channel movement, mass moderation, MVA, dragme, rmv, and vconfig controls',
  buttonPrefixes: ['dragme_', 'rmv_', 'vconfig_', 'vclock_unlock_'],
  channelSelectPrefixes: ['vconfig_'],
  onButton: async (interaction: ButtonInteraction) => {
    if (interaction.customId.startsWith('dragme_')) {
      await handleDragmeInteraction(interaction);
    } else if (interaction.customId.startsWith('rmv_')) {
      await handleRmvInteraction(interaction);
    } else if (interaction.customId.startsWith('vconfig_')) {
      await handleVConfigFallback(interaction);
    } else if (interaction.customId.startsWith('vclock_unlock_')) {
      await handleVclockUnlockButton(interaction);
    }
  },
  onChannelSelect: handleVConfigFallback,
  onVoiceStateUpdate: async (oldState: VoiceState, newState: VoiceState) => {
    await handleMvaVoiceStateUpdate(oldState, newState);
    await handleDragmeVoiceStateUpdate(oldState, newState);
  },
} satisfies ModuleManifest;
