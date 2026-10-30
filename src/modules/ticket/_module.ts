import type { ModuleManifest } from '../../types/module.js';
import { handleTicketInteraction } from './_ticketHandler.js';

const manifest: ModuleManifest = {
  name: 'ticket',
  description: 'Interactive support ticket panels with modals, custom branching, and HTML transcripts',
  buttonPrefixes: ['ticket_'],
  selectPrefixes: ['ticket_'],
  modalPrefixes: ['ticket_'],

  async onButton(interaction) {
    await handleTicketInteraction(interaction);
  },
  async onSelect(interaction) {
    await handleTicketInteraction(interaction);
  },
  async onModal(interaction) {
    await handleTicketInteraction(interaction);
  },
};

export default manifest;

