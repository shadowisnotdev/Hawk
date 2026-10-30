import type { PermitRecord } from '../../types/permission.js';
export function resolvePermitEffect(permits: PermitRecord[], userId: string, roles: string[], command: string, module: string): 'ALLOW' | 'DENY' | null {
  const matching = permits.filter(p => (p.targetType === 'user' ? p.targetId === userId : roles.includes(p.targetId)) && (p.commandName === null || p.commandName === command) && (p.moduleName === null || p.moduleName === module));
  // Explicit user rules win over role rules; exact command rules win over
  // broader grants at the same target level. A conflicting deny wins.
  for (const target of ['user', 'role']) for (const exact of [true, false]) {
    const rules = matching.filter(p => p.targetType === target && (p.commandName !== null) === exact);
    if (rules.length) return rules.some(p => p.effect === 'DENY') ? 'DENY' : 'ALLOW';
  }
  return null;
}
