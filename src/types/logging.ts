// ── Log Severity ────────────────────────────────────────────

export type LogSeverity = 'debug' | 'info' | 'warning' | 'error' | 'critical';

// ── Log Categories ──────────────────────────────────────────

export type LogCategory =
  | 'command_execution'
  | 'command_failure'
  | 'permission_denial'
  | 'config_change'
  | 'startup'
  | 'shutdown'
  | 'database_error'
  | 'api_error'
  | 'unhandled_exception';

// ── Log Event ───────────────────────────────────────────────

export interface LogEvent {
  severity: LogSeverity;
  category: LogCategory;
  message: string;
  details?: Record<string, unknown>;
  timestamp: Date;
}

// ── Command Log ─────────────────────────────────────────────

export type CommandOutcome = 'success' | 'fail' | 'warning' | 'info' | 'denied' | 'cooldown' | 'maintenance' | 'ignored' | 'unknown';

export interface CommandLogEvent {
  guildId: string;
  guildName: string;
  channelId: string;
  channelName: string;
  userId: string;
  userTag: string;
  commandName: string;
  aliasUsed: string;
  rawContent: string;
  rawArgs: string;
  /** Resolved targets (e.g. mentioned users, roles) for audit purposes */
  resolvedTargets?: string[];
  success: boolean;
  outcome?: CommandOutcome;
  replyType?: 'success' | 'warning' | 'error' | 'info';
  responseSnippet?: string;
  error?: string;
}
