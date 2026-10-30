import type { Guild } from 'discord.js';
import type { ResolvedRole, ResolutionResult } from '../../types/resolver.js';
import { isSnowflake } from '../utils/validators.js';
import { layeredMatch } from './LayeredMatcher.js';
import type { MatchItem } from './LayeredMatcher.js';

interface RoleItem extends MatchItem {
  id: string;
  name: string;
}

export function resolveRole(input: string, guild: Guild): ResolutionResult<ResolvedRole> {
  const trimmed = input.trim();
  if (!trimmed) return { success: false, error: 'No role specified.' };

  const lower = trimmed.toLowerCase();
  if (lower === '?all' || lower === 'all' || lower === '@everyone' || lower === '*') {
    const everyoneRole = guild.roles.everyone;
    return { success: true, value: { id: everyoneRole.id, name: everyoneRole.name, role: everyoneRole } };
  }

  // Mention or snowflake ID
  const mentionMatch = /^<@&(\d{17,20})>$/.exec(trimmed);
  const idInput = mentionMatch ? mentionMatch[1] : trimmed;

  if (isSnowflake(idInput)) {
    const role = guild.roles.cache.get(idInput);
    if (role) return { success: true, value: { id: role.id, name: role.name, role } };
    return { success: false, error: `Could not find role with ID \`${idInput}\`.` };
  }

  // Collect roles (exclude @everyone)
  const roles: RoleItem[] = [];
  for (const [id, role] of guild.roles.cache) {
    if (id !== guild.id) roles.push({ id, name: role.name });
  }

  if (roles.length === 0) {
    return { success: false, error: 'This server has no roles.' };
  }

  const result = layeredMatch(roles, trimmed);

  switch (result.outcome) {
    case 'resolved': {
      const role = guild.roles.cache.get(result.item.id);
      if (!role) return { success: false, error: `Could not find a role matching \`${trimmed}\`.` };
      return { success: true, value: { id: role.id, name: role.name, role } };
    }

    case 'ambiguous': {
      const list = result.candidates
        .slice(0, 5)
        .map(c => `• ${c.name}`)
        .join('\n');
      return {
        success: false,
        error: `Multiple roles match \`${trimmed}\`. Please be more specific:\n${list}`,
      };
    }

    case 'not_found':
      return { success: false, error: `Could not find a role matching \`${trimmed}\`.` };
  }
}
