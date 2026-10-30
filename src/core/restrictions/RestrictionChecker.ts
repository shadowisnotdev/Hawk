import type { PermissionContext } from '../../types/permission.js';
import { AuthorityLevel } from '../../types/permission.js';
import * as restrictionRepo from '../database/repositories/restrictionRepo.js';

export interface RestrictionCheckResult {
  allowed: boolean;
  reason: string;
}

export async function checkRestrictions(ctx: PermissionContext, authority: AuthorityLevel): Promise<RestrictionCheckResult> {
  if (authority >= AuthorityLevel.ServerAdmin) return { allowed: true, reason: 'Authority bypass' };

  const result = await restrictionRepo.checkRestriction(ctx.guildId, ctx.commandName, ctx.moduleName, ctx.channelId, ctx.categoryId, ctx.userId, ctx.memberRoleIds);
  if (result.restricted) return { allowed: false, reason: 'This command is not allowed in this channel.' };
  return { allowed: true, reason: result.effect };
}
