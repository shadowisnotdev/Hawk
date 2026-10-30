import type { ModuleManifest } from '../../types/module.js';
import { handleNukeInteraction } from './_nukeHandler.js';
import { listRoleConnections } from '../../core/database/repositories/connectRoleRepo.js';
import { evaluateMemberConnections } from './connect.js';

export default {
  name: 'moderation',
  description: 'Moderation suite (purge, lock, hide, role, nuke, snipe, slowmode, setlogs, jail, timeout, connect)',
  buttonPrefixes: ['nuke_'],
  onButton: handleNukeInteraction,
  onMemberUpdate: async (_oldMember, newMember) => {
    if (newMember.user.bot) return;
    try {
      const connections = await listRoleConnections(newMember.guild.id);
      if (connections.length > 0) {
        await evaluateMemberConnections(newMember, connections);
      }
    } catch {
      // Ignore evaluation errors
    }
  },
} satisfies ModuleManifest;
