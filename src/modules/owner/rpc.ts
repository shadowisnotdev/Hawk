import { ActivityType, PresenceStatusData } from 'discord.js';
import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import { presenceManager, type PresenceMode } from '../../core/presence/PresenceManager.js';
import { ui } from '../../core/ui/index.js';

export default defineCommand({
  name: 'rpc',
  aliases: ['presence', 'setpresence', 'setstatus'],
  module: 'owner',
  description: 'Manage bot dynamic presence (RPC), status, activity, and rotation modes.',
  usage: 'rpc [mode|status|activity|reset] [args...]',
  examples: [
    'rpc',
    'rpc mode auto',
    'rpc mode rotating',
    'rpc status dnd',
    'rpc status idle',
    'rpc activity watching Over the server',
    'rpc activity playing Games',
    'rpc reset',
  ],
  ownerOnly: true,
  cooldown: 2,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, respond } = ctx;
    const sub = parsed.args[0]?.toLowerCase();

    if (!sub) {
      // Show Status Dashboard
      const mode = presenceManager.getMode();
      const customConfig = presenceManager.getCustomConfig();
      const isBusy = presenceManager.isBusy();
      const busyDesc = presenceManager.getBusyDescription();
      const isIdle = presenceManager.isIdle();
      const idleSec = presenceManager.getIdleTimeSeconds();

      const sections: string[] = [
        `**Mode:** \`${mode.toUpperCase()}\`\n` +
        `**State:** ${isBusy ? `[Busy] (${busyDesc})` : (isIdle ? `[Idle] (${idleSec}s inactive)` : '[Online / Active]')}\n` +
        `**Idle Timer:** \`${idleSec}s\` since last command`,
      ];

      if (customConfig) {
        sections.push(
          `**Custom Override:**\n` +
          `• Status: \`${customConfig.status}\`\n` +
          `• Activity Type: \`${ActivityType[customConfig.activityType]}\`\n` +
          `• Activity Text: \`${customConfig.activityText}\``
        );
      }

      sections.push(
        `**Trigger Rules:**\n` +
        `• **Auto Mode**: Switches to \`idle\` after 10m without commands; switches to \`dnd\` during heavy tasks (\`shiftvc\`, \`purge\`); otherwise rotates stats in \`online\`.\n` +
        `• **Commands**: \`rpc mode <auto|rotating>\`, \`rpc status <online|idle|dnd|invisible>\`, \`rpc activity <type> <text>\`, \`rpc reset\``
      );

      const payload = ui.standard({
        title: 'Dynamic RPC / Presence Manager',
        sections,
      });

      await respond.raw({
        components: payload.components,
        flags: payload.flags as any,
      });
      return;
    }

    if (sub === 'reset') {
      presenceManager.resetToAuto();
      await respond.success('Reset presence to **Dynamic Auto Mode**.');
      return;
    }

    if (sub === 'mode') {
      const targetMode = parsed.args[1]?.toLowerCase() as PresenceMode;
      if (!['auto', 'rotating', 'custom'].includes(targetMode)) {
        await respond.error('Invalid mode. Choose `auto`, `rotating`, or `custom`.');
        return;
      }
      presenceManager.setMode(targetMode);
      await respond.success(`Presence mode updated to **${targetMode.toUpperCase()}**.`);
      return;
    }

    if (sub === 'status') {
      const targetStatus = parsed.args[1]?.toLowerCase() as PresenceStatusData;
      if (!['online', 'idle', 'dnd', 'invisible'].includes(targetStatus)) {
        await respond.error('Invalid status. Choose `online`, `idle`, `dnd`, or `invisible`.');
        return;
      }

      const existingConfig = presenceManager.getCustomConfig();
      presenceManager.setCustomPresence(
        targetStatus,
        existingConfig?.activityType ?? ActivityType.Watching,
        existingConfig?.activityText ?? 'Bot Activity'
      );
      await respond.success(`Presence status set to **${targetStatus.toUpperCase()}** (Custom Mode).`);
      return;
    }

    if (sub === 'activity') {
      const typeStr = parsed.args[1]?.toLowerCase();
      const text = parsed.args.slice(2).join(' ');

      if (!typeStr || !text) {
        await respond.error('Usage: `rpc activity <watching|listening|playing|competing|streaming|custom> <text>`');
        return;
      }

      let actType: ActivityType = ActivityType.Watching;
      if (typeStr === 'playing') actType = ActivityType.Playing;
      else if (typeStr === 'listening') actType = ActivityType.Listening;
      else if (typeStr === 'watching') actType = ActivityType.Watching;
      else if (typeStr === 'competing') actType = ActivityType.Competing;
      else if (typeStr === 'streaming') actType = ActivityType.Streaming;
      else if (typeStr === 'custom') actType = ActivityType.Custom;

      const existingConfig = presenceManager.getCustomConfig();
      presenceManager.setCustomPresence(
        existingConfig?.status ?? 'online',
        actType,
        text
      );

      await respond.success(`Presence activity set to **${typeStr.toUpperCase()} ${text}** (Custom Mode).`);
      return;
    }

    await respond.error('Unknown subcommand. Usage: `rpc [mode|status|activity|reset]`');
  },
});
