import type { ButtonInteraction } from 'discord.js';
import type { ModuleManifest } from '../../types/module.js';
import { handleHelpSelect, handleHelpButton } from './_helpHandler.js';
import { handleStealButton, handleStealModal } from './_stealHandler.js';
import { handlePingRefresh } from './pingUI.js';
import { handleInfoInteraction } from './infoUI.js';
import { handleAfkMessage } from './_afkHandler.js';

export default {
  name: 'general',
  description: 'General utility commands (help, ping, info, AFK, steal, ignore)',
  buttonPrefixes: ['ping_refresh_', 'info_', 'steal_btn_', 'help_page_'],
  selectPrefixes: ['help_'],
  modalPrefixes: ['steal_modal_'],
  onButton: async (interaction: ButtonInteraction) => {
    const id = interaction.customId;
    if (id.startsWith('ping_refresh_')) {
      await handlePingRefresh(interaction);
    } else if (id.startsWith('info_')) {
      await handleInfoInteraction(interaction);
    } else if (id.startsWith('steal_btn_')) {
      await handleStealButton(interaction);
    } else if (id.startsWith('help_page_')) {
      await handleHelpButton(interaction);
    }
  },
  onSelect: handleHelpSelect,
  onModal: handleStealModal,
  onMessage: handleAfkMessage,
} satisfies ModuleManifest;
