import type { ModuleManifest } from '../../types/module.js';
import { handleAccessButton, handleAccessSelect } from './_accessHandler.js';

export default {
  name: 'owner',
  description: 'Bot owner and admin management suite',
  buttonPrefixes: ['access_'],
  selectPrefixes: ['access_'],
  onButton: handleAccessButton,
  onSelect: handleAccessSelect,
} satisfies ModuleManifest;

