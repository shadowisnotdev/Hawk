import { initializeCustomCommands, stopCustomCommands } from '../commands/CustomCommandExecutor.js';
import { Events, Client, MessageFlags, type GuildMember } from 'discord.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import url from 'node:url';
import { env } from '../config/environment.js';
import { createClient, updateBotActivity, runMemoryCleanup } from '../../client/BotClient.js';
import { loadCommands } from '../commands/CommandLoader.js';
import { getCommandCount } from '../commands/CommandRegistry.js';
import { getPrefix } from '../database/repositories/guildConfigRepo.js';
import { classifyMessage, MessageType } from '../../services/MentionHandler.js';
import { handleMessage } from '../commands/CommandExecutor.js';
import { runMigrations } from '../database/migrations/runner.js';
import { validateConnection, closeDb } from '../database/pool.js';
import { logEvent, startWebhookLogger, stopWebhookLogger } from '../logging/WebhookLogger.js';
import { consoleLog } from '../logging/ConsoleLogger.js';
import { isNoPrefixEnabled, loadNoPrefixCache } from '../config/NoPrefixConfig.js';
import { loadAfkCache } from '../database/repositories/afkRepo.js';
import { startInteractionCleanup, stopInteractionCleanup } from '../interactions/InteractionState.js';
import { startCooldownCleanup, stopCooldownCleanup } from '../cooldowns/CooldownManager.js';
import { recordDeletedMessage, recordEditedMessage } from '../../modules/moderation/SnipeManager.js';
import { loadModuleManifests } from '../modules/ModuleLoader.js';
import { interactionRouter } from '../interactions/InteractionRouter.js';
import { presenceManager } from '../presence/PresenceManager.js';
import type { ModuleManifest } from '../../types/module.js';

export class Bootstrap {
  private static client: Client | null = null;
  private static manifests: ModuleManifest[] = [];
  private static heartbeatTimer: NodeJS.Timeout | null = null;

  public static async start(): Promise<Client> {
    const startTime = Date.now();
    consoleLog('info', 'startup', 'Starting Hawk Discord Bot (Amo Architecture)...');

    // 0. Start Webhook Logger Immediately
    startWebhookLogger();

    // 1. Database Connection & Migrations
    try {
      await validateConnection();
      consoleLog('info', 'database', 'PostgreSQL database connection verified.');
      const applied = await runMigrations();
      consoleLog('info', 'database', `Database migrations up to date (${applied} new applied).`);
    } catch (error) {
      consoleLog('critical', 'database', `Database initialization failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }

    // 2. Resolve Modules Directory
    const currentDir = path.dirname(url.fileURLToPath(import.meta.url));
    let modulesDir = path.join(currentDir, '..', '..', 'modules');
    const dirExists = await fs.stat(modulesDir).then(s => s.isDirectory()).catch(() => false);
    if (!dirExists) {
      modulesDir = path.join(process.cwd(), 'src', 'modules');
    }

    // 3. Load Command Definitions
    await loadCommands(modulesDir, env.enabledModules);
    consoleLog('info', 'startup', `Loaded ${getCommandCount()} commands across enabled modules.`);

    // 4. Load Module Manifests & Register Interaction Routes
    this.manifests = await loadModuleManifests(modulesDir, env.enabledModules);
    interactionRouter.registerModules(this.manifests);
    consoleLog('info', 'startup', `Registered manifests for ${this.manifests.length} modules.`);

    // 5. Create Client
    const client = createClient();
    this.client = client;

    // 6. Register ClientReady Event
    client.on(Events.ClientReady, async () => {
      const elapsed = Date.now() - startTime;
      consoleLog('info', 'startup', `Logged in as ${client.user?.tag} \u2014 ${getCommandCount()} commands loaded \u2014 ${elapsed}ms startup`);

      (globalThis as any).hawkClient = client;
      presenceManager.init(client);
      startInteractionCleanup();
      startCooldownCleanup();
      await loadNoPrefixCache();
      await loadAfkCache();

      // 5-minute periodic heartbeat for presence refresh & RAM optimization
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = setInterval(() => {
        try {
          updateBotActivity(client);
          runMemoryCleanup(client);
        } catch {
          // Ignore heartbeat error
        }
      }, 5 * 60 * 1000);

      // Execute module onReady lifecycle hooks concurrently
      const readyHooks = this.manifests
        .filter(m => typeof m.onReady === 'function')
        .map(m => m.onReady!(client));
      await Promise.allSettled(readyHooks);

      // Check and update restart state message if rebooted via command
      await this.handleRestartResume(client);

      await initializeCustomCommands();

      logEvent('info', 'startup', `Bot started: ${client.user?.tag}`, {
        commands: getCommandCount(),
        modules: this.manifests.length,
        startupMs: elapsed,
        environment: env.nodeEnv,
        guilds: client.guilds.cache.size,
      });
    });

    // 7. Register Message Events
    client.on(Events.MessageCreate, async (message) => {
      if (!message.guild || message.author.bot) return;
      try {
        const prefix = await getPrefix(message.guild.id);
        const type = classifyMessage(message, prefix);

        // Run non-command background onMessage hooks concurrently
        const messageHooks = this.manifests
          .filter(m => typeof m.onMessage === 'function')
          .map(m => m.onMessage!(message));
        Promise.allSettled(messageHooks).catch(() => {});

        switch (type) {
          case MessageType.PrefixCommand:
            await handleMessage(message);
            break;
          case MessageType.Normal:
            if (isNoPrefixEnabled(message.guild.id, message.author.id)) {
              await handleMessage(message);
            }
            break;
        }
      } catch (error) {
        consoleLog('error', 'unhandled_exception', `Unhandled error in messageCreate: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    client.on(Events.MessageDelete, async (message) => {
      try {
        recordDeletedMessage(message as any);

        const deleteHooks = this.manifests
          .filter(m => typeof m.onMessageDelete === 'function')
          .map(m => m.onMessageDelete!(message as any));
        await Promise.allSettled(deleteHooks);
      } catch (error) {
        consoleLog('error', 'unhandled_exception', `Unhandled error in messageDelete: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
      try {
        recordEditedMessage(oldMessage as any, newMessage as any);
      } catch (error) {
        consoleLog('error', 'unhandled_exception', `Unhandled error in messageUpdate: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
      try {
        const voiceHooks = this.manifests
          .filter(m => typeof m.onVoiceStateUpdate === 'function')
          .map(m => m.onVoiceStateUpdate!(oldState, newState));
        await Promise.allSettled(voiceHooks);
      } catch (error) {
        consoleLog('error', 'unhandled_exception', `Unhandled error in voiceStateUpdate: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    client.on(Events.MessageReactionAdd, async (reaction, user) => {
      try {
        const reactionAddHooks = this.manifests
          .filter(m => typeof m.onReactionAdd === 'function')
          .map(m => m.onReactionAdd!(reaction as any, user as any));
        await Promise.allSettled(reactionAddHooks);
      } catch (error) {
        consoleLog('error', 'unhandled_exception', `Unhandled error in messageReactionAdd: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    client.on(Events.MessageReactionRemove, async (reaction, user) => {
      try {
        const reactionRemoveHooks = this.manifests
          .filter(m => typeof m.onReactionRemove === 'function')
          .map(m => m.onReactionRemove!(reaction as any, user as any));
        await Promise.allSettled(reactionRemoveHooks);
      } catch (error) {
        consoleLog('error', 'unhandled_exception', `Unhandled error in messageReactionRemove: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    client.on(Events.GuildMemberAdd, async (member) => {
      try {
        updateBotActivity(client);
        const memberJoinHooks = this.manifests
          .filter(m => typeof m.onMemberJoin === 'function')
          .map(m => m.onMemberJoin!(member));
        await Promise.allSettled(memberJoinHooks);
      } catch (error) {
        consoleLog('error', 'unhandled_exception', `Unhandled error in guildMemberAdd: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    client.on(Events.GuildMemberRemove, async (member) => {
      try {
        updateBotActivity(client);
        const memberLeaveHooks = this.manifests
          .filter(m => typeof m.onMemberLeave === 'function')
          .map(m => m.onMemberLeave!(member as any));
        await Promise.allSettled(memberLeaveHooks);
      } catch (error) {
        consoleLog('error', 'unhandled_exception', `Unhandled error in guildMemberRemove: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
      try {
        const memberUpdateHooks = this.manifests
          .filter(m => typeof m.onMemberUpdate === 'function')
          .map(m => m.onMemberUpdate!(oldMember as GuildMember, newMember as GuildMember));
        await Promise.allSettled(memberUpdateHooks);
      } catch (error) {
        consoleLog('error', 'unhandled_exception', `Unhandled error in guildMemberUpdate: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    // 8. Register Unified Interaction Routing
    client.on(Events.InteractionCreate, async (interaction) => {
      const handled = await interactionRouter.dispatch(interaction);
      if (!handled && (interaction.isButton() || interaction.isAnySelectMenu())) {
        // Allow in-memory message component collectors a grace period to acknowledge or defer
        await new Promise((resolve) => setTimeout(resolve, 800));
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: 'This interaction has expired or is unrecognized.',
            flags: MessageFlags.Ephemeral,
          }).catch(() => {});
        }
      }
    });

    // Gateway diagnostics
    client.on(Events.Error, (err) => {
      consoleLog('error', 'gateway', `Discord client error: ${err.message}`);
    });
    client.on(Events.Warn, (warn) => {
      consoleLog('warning', 'gateway', `Discord client warning: ${warn}`);
    });
    client.on(Events.ShardReady, (shardId) => {
      consoleLog('info', 'gateway', `Shard ${shardId} connected & ready.`);
    });
    client.on(Events.ShardDisconnect, (event, shardId) => {
      consoleLog('warning', 'gateway', `Shard ${shardId} disconnected (${event.code}): ${event.reason}`);
    });
    client.on(Events.ShardReconnecting, (shardId) => {
      consoleLog('info', 'gateway', `Shard ${shardId} reconnecting to gateway...`);
    });
    client.on(Events.ShardResume, (shardId, replayedEvents) => {
      consoleLog('info', 'gateway', `Shard ${shardId} resumed connection (${replayedEvents} events replayed).`);
    });

    // 9. Login & Setup Process Signals
    const token = env.botToken;
    const maskedToken = token ? `${token.slice(0, 6)}...[REDACTED] (len=${token.length})` : 'EMPTY/UNDEFINED';
    consoleLog('info', 'startup', `Connecting to Discord gateway... token=${maskedToken}`);
    try {
      const loginPromise = client.login(token);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('LOGIN TIMEOUT: client.login() did not resolve within 30 seconds')), 30_000),
      );
      await Promise.race([loginPromise, timeoutPromise]);
      consoleLog('info', 'startup', 'client.login() resolved successfully.');
    } catch (loginError) {
      const msg = loginError instanceof Error ? loginError.message : String(loginError);
      consoleLog('critical', 'startup', `FATAL: client.login() failed — ${msg}`);
      console.error('LOGIN FAILED:', loginError);
      process.exit(1);
    }
    this.setupProcessHandlers();

    return client;
  }

  private static async handleRestartResume(client: Client): Promise<void> {
    const statePath = path.join(process.cwd(), '.restart_state.json');
    try {
      const raw = await fs.readFile(statePath, 'utf-8');
      const state = JSON.parse(raw);
      await fs.unlink(statePath).catch(() => {});

      if (!state.channelId || !state.messageId) return;

      const elapsed = ((Date.now() - (state.startTime || Date.now())) / 1000).toFixed(2);
      const channel = await client.channels.fetch(state.channelId).catch(() => null);
      if (channel && channel.isTextBased()) {
        const msg = await channel.messages.fetch(state.messageId).catch(() => null);
        if (msg) {
          await msg.edit({
            content: `> **Successfully restarted!** (Completed in \`${elapsed}s\`)`,
            allowedMentions: { parse: [] },
          }).catch(() => {});
          consoleLog('info', 'startup', `Updated restart state message in channel ${state.channelId} (${elapsed}s)`);
        }
      }
    } catch {
      // No active restart state or failed to read
    }
  }

  private static setupProcessHandlers(): void {
    const shutdown = async (signal: string) => {
      consoleLog('info', 'shutdown', `Received ${signal}, initiating graceful shutdown...`);

      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }

      // Execute onShutdown hooks
      const shutdownHooks = this.manifests
        .filter(m => typeof m.onShutdown === 'function')
        .map(m => m.onShutdown!());
      await Promise.allSettled(shutdownHooks);

      stopInteractionCleanup();
      stopCooldownCleanup();
      await stopCustomCommands();
      presenceManager.stopTicker();
      await stopWebhookLogger();

      if (this.client) {
        this.client.destroy();
      }
      await closeDb();
      consoleLog('info', 'shutdown', 'Shutdown complete. Exiting process.');
      process.exit(0);
    };

    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.once('SIGTERM', () => void shutdown('SIGTERM'));

    process.on('uncaughtException', (error) => {
      consoleLog('critical', 'unhandled_exception', `Uncaught Exception: ${error instanceof Error ? error.message : String(error)}`, { stack: error instanceof Error ? error.stack : undefined });
      logEvent('critical', 'unhandled_exception', `Uncaught Exception: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      const msg = reason instanceof Error ? reason.message : String(reason);
      consoleLog('error', 'unhandled_exception', `Unhandled Rejection: ${msg}`);
      logEvent('error', 'unhandled_exception', `Unhandled Rejection: ${msg}`);
    });
  }
}
