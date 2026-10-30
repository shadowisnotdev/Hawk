import * as ignoreRepo from '../database/repositories/ignoreRepo.js';

export async function isIgnored(
  guildId: string,
  userId: string,
  roleIds: string[],
  channelId: string,
  categoryId: string | null,
  commandName: string,
  moduleName: string,
  memberRolesCache?: any,
): Promise<boolean> {
  const ignores = await ignoreRepo.getIgnoresForGuild(guildId);
  if (ignores.length === 0) return false;

  // Filter rules matching scope (command, module, or global 'all' / '*')
  const applicableIgnores = ignores.filter((rec) => {
    const globalScope =
      (rec.scopeType === null && rec.scopeId === null) ||
      rec.scopeId === 'all' ||
      rec.scopeId === '*';
    const cmdScope = rec.scopeType === 'command' && rec.scopeId === commandName;
    const modScope = rec.scopeType === 'module' && rec.scopeId === moduleName;
    return globalScope || cmdScope || modScope;
  });

  if (applicableIgnores.length === 0) return false;

  // Role Hierarchy Failsafe: Evaluate highest role first if roles cache provided
  if (memberRolesCache && memberRolesCache.size > 0) {
    const memberRoleMap = new Map<string, number>();
    memberRolesCache.forEach((r: any) => memberRoleMap.set(r.id, r.position));

    const roleIgnores = applicableIgnores.filter((r) => r.entityType === 'role' && memberRoleMap.has(r.entityId));
    if (roleIgnores.length > 0) {
      roleIgnores.sort((a, b) => (memberRoleMap.get(b.entityId) ?? 0) - (memberRoleMap.get(a.entityId) ?? 0));
      const highestPos = memberRoleMap.get(roleIgnores[0].entityId) ?? 0;
      const highestRoleRules = roleIgnores.filter((r) => (memberRoleMap.get(r.entityId) ?? 0) === highestPos);

      // Blacklist on highest role -> IGNORED
      const blRules = highestRoleRules.filter((r) => r.mode === 'bl');
      if (blRules.length > 0) return true;

      // Whitelist on highest role -> ALLOWED
      const wlRules = highestRoleRules.filter((r) => r.mode === 'wl');
      if (wlRules.length > 0) return false;
    }
  }

  // Fallback standard evaluation
  const blRules = applicableIgnores.filter((r) => r.mode === 'bl');
  for (const rule of blRules) {
    if (rule.entityType === 'user' && rule.entityId === userId) return true;
    if (rule.entityType === 'role' && roleIds.includes(rule.entityId)) return true;
    if (
      rule.entityType === 'channel' &&
      (rule.entityId === channelId || rule.entityId === 'all' || rule.entityId === '*')
    )
      return true;
    if (rule.entityType === 'category' && categoryId && rule.entityId === categoryId) return true;
  }

  const wlRules = applicableIgnores.filter((r) => r.mode === 'wl');
  if (wlRules.length > 0) {
    const roleWl = wlRules.filter((r) => r.entityType === 'role');
    if (roleWl.length > 0) {
      const hasWlRole = roleWl.some((r) => roleIds.includes(r.entityId));
      if (!hasWlRole) return true;
    }

    const chanWl = wlRules.filter((r) => r.entityType === 'channel' || r.entityType === 'category');
    if (chanWl.length > 0) {
      const isWlChannel = chanWl.some(
        (r) =>
          (r.entityType === 'channel' &&
            (r.entityId === channelId || r.entityId === 'all' || r.entityId === '*')) ||
          (r.entityType === 'category' && categoryId && r.entityId === categoryId),
      );
      if (!isWlChannel) return true;
    }

    const userWl = wlRules.filter((r) => r.entityType === 'user');
    if (userWl.length > 0) {
      const isWlUser = userWl.some((r) => r.entityId === userId);
      if (!isWlUser) return true;
    }
  }

  return false;
}
