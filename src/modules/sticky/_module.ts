import type { ModuleManifest } from '../../types/module.js';
import { handleStickyResurface } from './_stickyHandler.js';

export default {
  name: 'sticky',
  description: 'Sticky message system',
  onMessage: handleStickyResurface,
} satisfies ModuleManifest;
