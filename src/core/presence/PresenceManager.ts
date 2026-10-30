import { Client, ActivityType, PresenceStatusData } from 'discord.js';
import { constants } from '../config/constants.js';
import { getCommandCount } from '../commands/CommandRegistry.js';
import { consoleLog } from '../logging/ConsoleLogger.js';

export type PresenceMode = 'auto' | 'rotating' | 'custom';

export interface CustomPresenceConfig {
  status: PresenceStatusData;
  activityType: ActivityType;
  activityText: string;
}

export class PresenceManager {
  private static instance: PresenceManager | null = null;
  private client: Client | null = null;
  private mode: PresenceMode = 'auto';
  private rotationIndex = 0;
  private tickerInterval: NodeJS.Timeout | null = null;
  private lastCommandTimestamp = Date.now();
  private idleThresholdMs = 10 * 60 * 1000; // 10 minutes of inactivity -> idle
  private busyTasks = new Map<string, string>(); // taskId -> taskDescription
  private customConfig: CustomPresenceConfig | null = null;

  public static getInstance(): PresenceManager {
    if (!PresenceManager.instance) {
      PresenceManager.instance = new PresenceManager();
    }
    return PresenceManager.instance;
  }

  public init(client: Client): void {
    this.client = client;
    this.startTicker();
    this.update();
  }

  public setMode(mode: PresenceMode): void {
    this.mode = mode;
    this.update();
  }

  public getMode(): PresenceMode {
    return this.mode;
  }

  public getCustomConfig(): CustomPresenceConfig | null {
    return this.customConfig;
  }

  public setCustomPresence(status: PresenceStatusData, activityType: ActivityType, activityText: string): void {
    this.mode = 'custom';
    this.customConfig = { status, activityType, activityText };
    this.update();
  }

  public resetToAuto(): void {
    this.mode = 'auto';
    this.customConfig = null;
    this.busyTasks.clear();
    this.lastCommandTimestamp = Date.now();
    this.update();
  }

  /** Called whenever a command is executed to reset the idle timer */
  public recordActivity(): void {
    const wasIdle = this.isIdle();
    this.lastCommandTimestamp = Date.now();
    if (wasIdle && this.mode === 'auto') {
      this.update();
    }
  }

  /** Register a heavy operation (e.g. shiftvc, purge) to trigger DND status */
  public setBusy(taskId: string, description: string): void {
    this.busyTasks.set(taskId, description);
    this.update();
  }

  /** Clear a busy operation */
  public clearBusy(taskId: string): void {
    this.busyTasks.delete(taskId);
    this.update();
  }

  public isBusy(): boolean {
    return this.busyTasks.size > 0;
  }

  public getBusyDescription(): string | null {
    if (this.busyTasks.size === 0) return null;
    return Array.from(this.busyTasks.values())[0];
  }

  public isIdle(): boolean {
    return Date.now() - this.lastCommandTimestamp > this.idleThresholdMs;
  }

  public getIdleTimeSeconds(): number {
    return Math.floor((Date.now() - this.lastCommandTimestamp) / 1000);
  }

  public startTicker(): void {
    if (this.tickerInterval) clearInterval(this.tickerInterval);
    // Ticker runs every 30 seconds to rotate or check idle status
    this.tickerInterval = setInterval(() => {
      this.rotationIndex++;
      this.update();
    }, 30_000);
  }

  public stopTicker(): void {
    if (this.tickerInterval) {
      clearInterval(this.tickerInterval);
      this.tickerInterval = null;
    }
  }

  public update(): void {
    if (!this.client || !this.client.user) return;

    try {
      if (this.mode === 'custom' && this.customConfig) {
        this.client.user.setPresence({
          status: this.customConfig.status,
          activities: [
            {
              name: this.customConfig.activityText,
              type: this.customConfig.activityType,
            },
          ],
        });
        return;
      }

      // ── AUTO / ROTATING MODE ──
      const prefix = constants.defaultPrefix;
      const totalMembers = this.client.guilds.cache.reduce((acc, g) => acc + (g.memberCount ?? 0), 0);
      const totalGuilds = this.client.guilds.cache.size;

      let totalVoice = 0;
      for (const guild of this.client.guilds.cache.values()) {
        totalVoice += guild.voiceStates.cache.size;
      }

      // 1. DND state: Heavy background task ongoing
      if (this.isBusy()) {
        const busyDesc = this.getBusyDescription() ?? 'Processing task';
        this.client.user.setPresence({
          status: 'dnd',
          activities: [
            {
              name: `Busy: ${busyDesc} | ${prefix}help`,
              type: ActivityType.Custom,
            },
          ],
        });
        return;
      }

      // 2. Idle state: Inactivity threshold exceeded in auto mode
      if (this.mode === 'auto' && this.isIdle()) {
        this.client.user.setPresence({
          status: 'idle',
          activities: [
            {
              name: `Idle | Watching ${totalMembers.toLocaleString()} members | ${prefix}help`,
              type: ActivityType.Watching,
            },
          ],
        });
        return;
      }

      // 3. Online Active state: Dynamic Rotation
      const totalCommands = getCommandCount();

      const rotationSteps = [
        {
          name: `${totalMembers.toLocaleString()} members across ${totalGuilds} servers | ${prefix}help`,
          type: ActivityType.Watching,
        },
        {
          name: totalVoice > 0 ? `${totalVoice} members in voice channels | ${prefix}help` : `${totalCommands} commands | ${prefix}help`,
          type: totalVoice > 0 ? ActivityType.Listening : ActivityType.Playing,
        },
        {
          name: `${prefix}help | ${this.client.user.username}`,
          type: ActivityType.Watching,
        },
        {
          name: `Voice & Moderation System | ${prefix}help`,
          type: ActivityType.Competing,
        },
      ];

      const currentStep = rotationSteps[this.rotationIndex % rotationSteps.length];

      this.client.user.setPresence({
        status: 'online',
        activities: [
          {
            name: currentStep.name,
            type: currentStep.type,
          },
        ],
      });
    } catch (err) {
      consoleLog('warning', 'gateway', `Failed to update presence: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

export const presenceManager = PresenceManager.getInstance();
