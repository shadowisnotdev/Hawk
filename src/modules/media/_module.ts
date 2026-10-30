import type { ModuleManifest } from '../../types/module.js';
import { handleMediaFilter } from './_mediaHandler.js';

export default {
  name: 'media',
  description: 'Media-only channel filter',
  onMessage: handleMediaFilter,
} satisfies ModuleManifest;
