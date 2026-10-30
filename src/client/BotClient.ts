import { Client, GatewayIntentBits, Partials, Options } from 'discord.js';
import { constants } from '../core/config/constants.js';

export function createClient(): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
    rest: {
      timeout: 30_000,
      retries: 5,
    },
    makeCache: Options.cacheWithLimits({
      ...Options.DefaultMakeCacheSettings,
      MessageManager: 25,
      GuildMemberManager: { maxSize: 200 },
      UserManager: 100,
      ReactionManager: 10,
      ReactionUserManager: 10,
      ThreadManager: 0,
      ThreadMemberManager: 0,
      StageInstanceManager: 0,
      GuildScheduledEventManager: 0,
      AutoModerationRuleManager: 0,
      GuildEmojiManager: 50,
      GuildStickerManager: 25,
    }),
    sweepers: {
      ...Options.DefaultSweeperSettings,
      messages: { interval: 60, lifetime: 30 },
      guildMembers: {
        interval: 120,
        filter: () => (member) => !member.user.bot && member.id !== member.guild.ownerId && !member.voice?.channelId,
      },
      users: {
        interval: 120,
        filter: () => (user) => !user.bot,
      },
      threads: {
        interval: 300,
        lifetime: 300,
      },
    },
  });
}

import { presenceManager } from '../core/presence/PresenceManager.js';

export function updateBotActivity(_client: Client, _prefix = constants.defaultPrefix): void {
  presenceManager.update();
}

export function runMemoryCleanup(client: Client): void {
  // Clear any unneeded cached collections
  for (const guild of client.guilds.cache.values()) {
    // Keep only voice members & guild owner in member cache
    guild.members.cache.sweep(
      (member) => !member.user.bot && member.id !== guild.ownerId && !member.voice?.channelId,
    );
  }

  // Trigger V8 Garbage Collection if flag is enabled
  if (typeof global.gc === 'function') {
    try {
      global.gc();
    } catch {
      // GC not available
    }
  }
}
