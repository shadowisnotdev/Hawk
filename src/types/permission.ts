// ── Authority Levels ────────────────────────────────────────

export enum AuthorityLevel {
  /** Normal server member — no special bypass */
  Normal = 0,
  /** User/role with an explicit custom permit for this command */
  Permitted = 1,
  /** Server owner or configured server administrator */
  ServerAdmin = 2,
  /** Bot administrator — bypasses normal permission checks */
  BotAdmin = 3,
  /** Bot owner/developer — bypasses everything */
  Owner = 4,
}

// ── Permit Records ──────────────────────────────────────────

export interface PermitRecord {
  id: number;
  guildId: string;
  /** Whether this permit targets a user or a role */
  targetType: 'user' | 'role';
  /** The Discord snowflake of the target user/role */
  targetId: string;
  /** Specific command name, or null for module-level permit */
  commandName: string | null;
  /** Module name */
  moduleName: string | null;
  effect?: 'ALLOW' | 'DENY';
  createdAt: Date;
}

// ── Permission Context ──────────────────────────────────────

export interface PermissionContext {
  userId: string;
  guildId: string;
  guildOwnerId: string;
  memberRoleIds: string[];
  commandName: string;
  moduleName: string;
  channelId: string;
  categoryId: string | null;
}

// ── Restriction Records ─────────────────────────────────────

export type RestrictionEffect = 'allow' | 'deny';

export interface RestrictionRecord {
  id: number;
  guildId: string;
  /** Specific command, or null for module-level */
  commandName: string | null;
  /** Module name */
  moduleName: string;
  /** Restrict for a specific role/user, or null for everyone */
  targetType: 'user' | 'role' | null;
  targetId: string | null;
  /** Whether restricting by channel or category */
  locationType: 'channel' | 'category';
  locationId: string;
  /** Allow or deny */
  effect: RestrictionEffect;
  createdAt: Date;
}

// ── Ignore Records ──────────────────────────────────────────

export interface IgnoreRecord {
  id: number;
  guildId: string;
  /** What type of entity is being ignored */
  entityType: 'user' | 'role' | 'channel' | 'category';
  entityId: string;
  /** Scope of the ignore (command, module, or null for global) */
  scopeType: 'command' | 'module' | null;
  scopeId: string | null;
  /** Mode: whitelist (wl) or blacklist (bl) */
  mode: 'wl' | 'bl';
  createdAt: Date;
}

export interface PermitRevocationRecord {
  id: number;
  guildId: string;
  targetType: 'user' | 'role';
  targetId: string;
  commandName: string | null;
  moduleName: string | null;
  revokedById: string;
  revokedByName: string;
  revokedAt: Date;
}

// ── Permission Check Result ─────────────────────────────────

export interface PermissionCheckResult {
  allowed: boolean;
  authority: AuthorityLevel;
  reason: string;
  revocationInfo?: {
    revokedByName: string;
    revokedAt: Date;
  };
}
