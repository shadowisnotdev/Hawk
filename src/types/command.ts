import type {
  Message,
  PermissionResolvable,
  Guild,
  GuildMember,
  GuildTextBasedChannel,
} from 'discord.js';
import type { ResponseBuilder } from '../core/responses/ResponseBuilder.js';

// ── Command Definition ──────────────────────────────────────

export interface CommandDefinition {
  /** Primary command name (lowercase) */
  name: string;
  /** Alternative names for this command */
  aliases: string[];
  /** Module/category this command belongs to */
  module: string;
  /** Short description of the command */
  description: string;
  /** Usage syntax string */
  usage: string;
  /** Example invocations */
  examples: string[];

  // ── Permission / Authorization ──────────────────────────
  /** Only the bot owner can use this command */
  ownerOnly: boolean;
  /** Bot admins (and owner) can use this command */
  botAdminOnly: boolean;
  /** Native Discord permissions required (OR with custom permits) */
  permissions: PermissionResolvable[];
  /** Native Discord permissions the bot itself needs */
  botPermissions: PermissionResolvable[];

  // ── Behavior ────────────────────────────────────────────
  /** Cooldown in seconds (0 = none) */
  cooldown: number;
  /** Whether this command can be used in DMs */
  dmAllowed: boolean;
  /** Whether this command is hidden from help */
  hidden: boolean;
  /** Whether this command is currently enabled */
  enabled: boolean;
  /** If true, requires a custom permit when no native permissions are set */
  permitOnly: boolean;

  // ── Execution ───────────────────────────────────────────
  execute(ctx: CommandContext): Promise<void>;
}

// ── Parsed Command ──────────────────────────────────────────

export interface ParsedCommand {
  /** The prefix that was used */
  prefix: string;
  /** Resolved canonical command name */
  commandName: string;
  /** The actual alias the user typed */
  aliasUsed: string;
  /** Raw argument string after the command name */
  rawArgs: string;
  /** Space-split arguments (respecting quotes) */
  args: string[];
  /** Structured argument tokens */
  tokens: ArgumentToken[];
}

export type ArgumentTokenType =
  | 'text'
  | 'mention_user'
  | 'mention_role'
  | 'mention_channel'
  | 'snowflake'
  | 'url'
  | 'quoted';

export interface ArgumentToken {
  type: ArgumentTokenType;
  /** Cleaned value (ID extracted from mention, text from quotes, etc.) */
  value: string;
  /** Original raw text as typed */
  raw: string;
}

// ── Command Context ─────────────────────────────────────────

export interface CommandContext {
  message: Message;
  replyTarget: GuildMember | null;
  command: CommandDefinition;
  parsed: ParsedCommand;
  guild: Guild;
  member: GuildMember;
  channel: GuildTextBasedChannel;
  respond: ResponseBuilder;
  canExecute(commandName: string): Promise<boolean>;
}

// ── Command Builder Helper ──────────────────────────────────

export type CommandOptions = Partial<Omit<CommandDefinition, 'name' | 'module' | 'execute'>> & {
  name: string;
  module: string;
  execute(ctx: CommandContext): Promise<void>;
};

/** Create a command definition with sensible defaults */
export function defineCommand(options: CommandOptions): CommandDefinition {
  const isOwnerModule = options.module === 'owner';
  return {
    aliases: [],
    description: 'No description provided.',
    usage: '',
    examples: [],
    ownerOnly: isOwnerModule,
    botAdminOnly: false,
    permissions: [],
    botPermissions: [],
    cooldown: 0,
    dmAllowed: false,
    hidden: isOwnerModule,
    enabled: true,
    permitOnly: false,
    ...options,
  };
}
