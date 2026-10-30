import type { ModuleManifest } from '../../types/module.js';
import {
  handleGiveawayInteraction,
  startGiveawayTicker,
  stopGiveawayTicker,
} from './_giveawayHandler.js';

const manifest: ModuleManifest = {
  name: 'giveaway',
  description: 'Interactive giveaways matching Discohook layout with active/ended states and reroll',
  buttonPrefixes: ['ga_'],

  async onButton(interaction) {
    await handleGiveawayInteraction(interaction);
  },

  async onReady(client) {
    startGiveawayTicker(client);
  },

  async onShutdown() {
    stopGiveawayTicker();
  },
};

export default manifest;

