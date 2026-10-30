import {
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import { getAuthorityLevel } from '../../core/permissions/PermissionChecker.js';
import { AuthorityLevel } from '../../types/permission.js';
import {
  getMaintenanceState,
  setMaintenanceState,
  type MaintenanceState,
} from '../../core/database/repositories/systemRepo.js';
import { ui, type ComponentV2Payload } from '../../core/ui/index.js';
import { logAuditAction } from '../../core/logging/AuditLogger.js';
import { logEvent } from '../../core/logging/WebhookLogger.js';

function buildMaintenanceCard(state: MaintenanceState, userIsOwner: boolean): { payload: ComponentV2Payload; row?: ActionRowBuilder<ButtonBuilder> } {
  const statusBadge = state.enabled ? '**ACTIVE (Locked to Developers)**' : '**INACTIVE (Live for Everyone)**';
  const timeStr = state.enabledAt
    ? `<t:${Math.floor(state.enabledAt.getTime() / 1000)}:f> (<t:${Math.floor(state.enabledAt.getTime() / 1000)}:R>)`
    : '*N/A*';
  const enabledByStr = state.enabledBy ? `\`${state.enabledBy}\`` : '*N/A*';

  const details = [
    `• **Status:** ${statusBadge}`,
    `• **Reason:** ${state.reason}`,
    `• **Enabled At:** ${timeStr}`,
    `• **Enabled By:** ${enabledByStr}`,
    '',
    state.enabled
      ? '*All commands across all servers are blocked for non-owner users.*'
      : '*All commands and features are operating normally.*',
  ].join('\n');

  let row: ActionRowBuilder<ButtonBuilder> | undefined;
  if (userIsOwner) {
    const toggleBtn = new ButtonBuilder()
      .setCustomId(state.enabled ? 'mm_disable' : 'mm_enable')
      .setLabel(state.enabled ? 'Turn Maintenance OFF' : 'Turn Maintenance ON')
      .setStyle(state.enabled ? ButtonStyle.Secondary : ButtonStyle.Danger);

    row = new ActionRowBuilder<ButtonBuilder>().addComponents(toggleBtn);
  }

  const payload = ui.standard({
    title: 'System Maintenance Control',
    text: details,
    components: row ? [row] : undefined,
  });

  return { payload, row };
}

export default defineCommand({
  name: 'maintenance',
  aliases: ['mm', 'maint'],
  module: 'owner',
  description: 'View or toggle global maintenance mode (Bot Owner only).',
  usage: 'maintenance [on <reason>|off|status]',
  examples: [
    'maintenance',
    'maintenance on Rolling out database update v2',
    'maintenance off',
    'maintenance status',
  ],
  ownerOnly: true,
  permissions: [],
  botPermissions: [PermissionsBitField.Flags.SendMessages],
  cooldown: 2,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, member, guild, respond } = ctx;
    const authority = getAuthorityLevel(member.id, guild.ownerId, member);

    const firstArg = parsed.args[0]?.toLowerCase();

    // ── Subcommand: ON ──
    if (firstArg === 'on' || firstArg === 'enable') {
      if (authority !== AuthorityLevel.Owner) {
        await respond.error('Only **Bot Owners** can enable global maintenance mode.');
        return;
      }

      const customReason = parsed.args.slice(1).join(' ').trim() || 'Scheduled system updates in progress.';
      await setMaintenanceState(true, customReason, member.user.tag);

      logAuditAction({
        guild,
        action: 'Global Maintenance Mode Enabled',
        executor: member,
        details: [`• **Reason:** ${customReason}`],
      });

      logEvent('warning', 'command_execution', `Global maintenance mode ENABLED by ${member.user.tag}`, {
        executor: member.user.tag,
        executorId: member.id,
        reason: customReason,
      });

      await respond.success(`Global maintenance mode is now **ENABLED**.\n• **Reason:** ${customReason}\n• Commands are now locked to Bot Owners.`);
      return;
    }

    // ── Subcommand: OFF ──
    if (firstArg === 'off' || firstArg === 'disable') {
      if (authority !== AuthorityLevel.Owner) {
        await respond.error('Only **Bot Owners** can disable global maintenance mode.');
        return;
      }

      await setMaintenanceState(false, 'Scheduled maintenance completed.', member.user.tag);

      logAuditAction({
        guild,
        action: 'Global Maintenance Mode Disabled',
        executor: member,
      });

      logEvent('info', 'command_execution', `Global maintenance mode DISABLED by ${member.user.tag}`, {
        executor: member.user.tag,
        executorId: member.id,
      });

      await respond.success('Global maintenance mode is now **DISABLED**. All commands are open to regular users.');
      return;
    }

    // ── Interactive Status & Toggle Panel ──
    let state = await getMaintenanceState();
    const isOwner = authority === AuthorityLevel.Owner;

    const { payload } = buildMaintenanceCard(state, isOwner);

    const sentMsg = await respond.raw({
      components: payload.components,
      flags: payload.flags as any,
    });

    if (!isOwner) return;

    const collector = sentMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === member.id,
      time: 60_000,
    });

    collector.on('collect', async (interaction) => {
      if (interaction.customId === 'mm_enable') {
        await setMaintenanceState(true, 'Maintenance enabled via interactive control panel.', member.user.tag);
      } else if (interaction.customId === 'mm_disable') {
        await setMaintenanceState(false, 'Maintenance completed.', member.user.tag);
      }

      state = await getMaintenanceState();
      const updated = buildMaintenanceCard(state, true);

      await interaction.update({
        components: updated.payload.components,
        flags: updated.payload.flags as any,
      });
    });

    collector.on('end', () => {
      sentMsg.edit({ components: [] }).catch(() => {});
    });
  },
});
