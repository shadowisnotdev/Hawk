import type {
  Client,
  Message,
  VoiceState,
  GuildMember,
  MessageReaction,
  User,
  ButtonInteraction,
  AnySelectMenuInteraction,
  ChannelSelectMenuInteraction,
  ModalSubmitInteraction,
} from 'discord.js';

export interface ModuleManifest {
  /** Module name (must match directory name) */
  name: string;

  /** Human-readable description */
  description?: string;

  /** Custom ID prefixes handled by this module */
  buttonPrefixes?: string[];
  selectPrefixes?: string[];
  channelSelectPrefixes?: string[];
  modalPrefixes?: string[];

  /** Component interaction handlers */
  onButton?: (interaction: ButtonInteraction) => Promise<void>;
  onSelect?: (interaction: AnySelectMenuInteraction) => Promise<void>;
  onChannelSelect?: (interaction: ChannelSelectMenuInteraction) => Promise<void>;
  onModal?: (interaction: ModalSubmitInteraction) => Promise<void>;

  /** Event hooks */
  onMessage?: (message: Message) => Promise<void>;
  onMessageDelete?: (message: Message) => Promise<void>;
  onVoiceStateUpdate?: (oldState: VoiceState, newState: VoiceState) => Promise<void>;
  onReactionAdd?: (reaction: MessageReaction, user: User) => Promise<void>;
  onReactionRemove?: (reaction: MessageReaction, user: User) => Promise<void>;
  onMemberJoin?: (member: GuildMember) => Promise<void>;
  onMemberLeave?: (member: GuildMember) => Promise<void>;
  onMemberUpdate?: (oldMember: GuildMember, newMember: GuildMember) => Promise<void>;

  /** Lifecycle hooks */
  onReady?: (client: Client) => Promise<void>;
  onShutdown?: () => Promise<void>;
}
