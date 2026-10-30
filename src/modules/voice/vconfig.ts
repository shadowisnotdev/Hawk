import {
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  MessageFlags,
} from 'discord.js';
import type { GuildTextBasedChannel } from 'discord.js';
import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import { resolveCommand } from '../../core/commands/CommandRegistry.js';
import { resolveRole } from '../../core/resolver/RoleResolver.js';
import {
  saveVConfigRule,
  removeVConfigRule,
  getVConfigRulesForGuild,
} from '../../core/database/repositories/vconfigRepo.js';
import { ui } from '../../core/ui/index.js';
import { mentionRole } from '../../core/utils/formatters.js';
import { logEvent } from '../../core/logging/WebhookLogger.js';

export default defineCommand({
  name: 'vconfig',
  module: 'voice',
  description: 'Configure voice command channel access (whitelist/blacklist) per role.',
  usage: 'vconfig <voice-command|all> <wl|bl> <@role|?all> [all|?all] | vconfig list | vconfig remove <command|all> <wl|bl> <@role|?all>',
  examples: [
    'vconfig dragme wl @Moderator',
    'vconfig all bl @TrialMod',
    'vconfig all wl ?all ?all',
    'vconfig list',
    'vconfig remove dragme wl @Moderator',
  ],
  permissions: [PermissionsBitField.Flags.ManageGuild],
  botPermissions: [PermissionsBitField.Flags.SendMessages],
  cooldown: 3,

  async execute(ctx: CommandContext): Promise<void> {
    const { guild, member, channel, parsed, respond } = ctx;

    if (parsed.args.length === 0) {
      await respond.error(`Usage: \`${parsed.prefix}vconfig <voice-command|all> <wl|bl> <@role|?all>\` or \`${parsed.prefix}vconfig list\``);
      return;
    }

    const sub = parsed.args[0].toLowerCase();

    // ── Subcommand: list ──────────────────────────────────────
    if (sub === 'list') {
      const rules = await getVConfigRulesForGuild(guild.id);
      if (rules.length === 0) {
        await respond.info('No voice command access configurations exist for this server.');
        return;
      }

      interface GroupedVConfig {
        roleId: string;
        mode: 'wl' | 'bl';
        commands: Set<string>;
        channels: Set<string>;
      }

      const groupedMap = new Map<string, GroupedVConfig>();
      for (const r of rules) {
        const key = `${r.roleId}:${r.mode}`;
        let entry = groupedMap.get(key);
        if (!entry) {
          entry = {
            roleId: r.roleId,
            mode: r.mode,
            commands: new Set<string>(),
            channels: new Set<string>(),
          };
          groupedMap.set(key, entry);
        }
        entry.commands.add(r.commandName);
        for (const cid of r.channelIds) {
          entry.channels.add(cid);
        }
      }

      const lines = Array.from(groupedMap.values()).map((g) => {
        const roleStr = mentionRole(g.roleId, guild);
        const modeBadge = g.mode === 'wl' ? '**[WHITELIST]**' : '**[BLACKLIST]**';
        const cmdList = Array.from(g.commands).map(c => `\`${c}\``).join(', ');
        const chanList =
          g.channels.has('all') || g.channels.has('*')
            ? 'All Channels'
            : Array.from(g.channels).map(id => `<#${id}>`).join(', ');

        return `• ${modeBadge} ${roleStr} ➜ Commands: ${cmdList} | Channels: ${chanList}`;
      });

      await ui.paginated(ctx, {
        title: `Voice Command Access Configurations (${lines.length} Targets / ${rules.length} Rules)`,
        items: lines,
        pageSize: 8,
        emptyText: 'No voice command access configurations exist for this server.',
      });
      return;
    }

    // ── Subcommand: remove ────────────────────────────────────
    if (sub === 'remove' || sub === 'delete') {
      if (parsed.args.length < 4) {
        await respond.error(`Usage: \`${parsed.prefix}vconfig remove <voice-command|all> <wl|bl> <@role|?all>\``);
        return;
      }

      const cmdArg = parsed.args[1].toLowerCase();
      const modeArg = parsed.args[2].toLowerCase();
      const roleArg = parsed.args[3];

      if (modeArg !== 'wl' && modeArg !== 'bl') {
        await respond.error('Mode must be `wl` (whitelist) or `bl` (blacklist).');
        return;
      }

      const roleRes = resolveRole(roleArg, guild);
      if (!roleRes.success) {
        await respond.error(`Role: ${roleRes.error}`);
        return;
      }

      const targetCmdName = cmdArg === 'all' || cmdArg === '*' ? 'all' : cmdArg;

      const removed = await removeVConfigRule(guild.id, targetCmdName, roleRes.value.role.id, modeArg as 'wl' | 'bl');
      if (removed) {
        await respond.success(`Removed **${modeArg.toUpperCase()}** configuration for \`${targetCmdName}\` on ${mentionRole(roleRes.value.role, guild)}.`);
        logEvent('info', 'command_execution', `vconfig rule removed by ${member.user.tag}`, {
          administrator: member.user.tag,
          command: targetCmdName,
          mode: modeArg,
          role: roleRes.value.role.name,
          guild: guild.name,
        });
      } else {
        await respond.info('No matching configuration rule was found to remove.');
      }
      return;
    }

    if (parsed.args.length < 3) {
      await respond.error(`Usage: \`${parsed.prefix}vconfig <voice-command|all> <wl|bl> <@role|?all>\``);
      return;
    }

    const cmdArg = parsed.args[0].toLowerCase();
    const modeArg = parsed.args[1].toLowerCase();
    const roleArg = parsed.args[2];

    if (modeArg !== 'wl' && modeArg !== 'bl') {
      await respond.error('Mode must be `wl` (whitelist) or `bl` (blacklist).');
      return;
    }

    let targetCmdName: string;
    if (cmdArg === 'all' || cmdArg === '*') {
      targetCmdName = 'all';
    } else {
      const targetCmd = resolveCommand(cmdArg);
      if (!targetCmd || targetCmd.module !== 'voice') {
        await respond.error(`\`${cmdArg}\` is not a valid command in the **Voice** module.`);
        return;
      }
      targetCmdName = targetCmd.name;
    }

    // Resolve role
    const roleRes = resolveRole(roleArg, guild);
    if (!roleRes.success) {
      await respond.error(`Role: ${roleRes.error}`);
      return;
    }

    const targetRole = roleRes.value.role;
    const mode = modeArg as 'wl' | 'bl';
    const modeText = mode === 'wl' ? 'WHITELIST' : 'BLACKLIST';

    // If 'all' or '?all' channels passed as 4th argument, bypass select menu
    const fourthArg = parsed.args[3]?.toLowerCase();
    if (fourthArg === 'all' || fourthArg === '?all' || fourthArg === '*') {
      await saveVConfigRule(guild.id, targetCmdName, targetRole.id, mode, ['all']);
      await respond.success(
        `Configured **${modeText}** for \`${targetCmdName}\` on ${mentionRole(targetRole, guild)} across **ALL voice channels**.`
      );
      return;
    }

    // Build Select Menu for Voice Channels
    const channelSelect = new ChannelSelectMenuBuilder()
      .setCustomId(`vconfig_select_${targetCmdName}_${targetRole.id}`)
      .setPlaceholder('Select Voice Channels')
      .setChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
      .setMinValues(1)
      .setMaxValues(25);

    const selectRow = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect);
    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`vconfig_save_${targetCmdName}_${targetRole.id}`)
        .setLabel('Save Configuration')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`vconfig_cancel_${targetCmdName}_${targetRole.id}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary),
    );

    const payload = ui.standard({
      title: 'Voice Access Configuration',
      text:
        `• **Command:** \`${targetCmdName}\`\n` +
        `• **Role:** ${mentionRole(targetRole, guild)}\n` +
        `• **Mode:** **${modeText}**\n\n` +
        `Select the voice channels this role should be ${mode === 'wl' ? 'whitelisted for' : 'blacklisted from'} using the dropdown below:`,
      components: [selectRow, buttonRow],
    });

    const sentMsg = await (channel as GuildTextBasedChannel).send({
      components: payload.components,
      flags: payload.flags as any,
    });

    // Collector for configuration interaction
    let selectedChannelIds: string[] = [];

    const collector = sentMsg.createMessageComponentCollector({
      time: 60_000,
    });

    collector.on('collect', async (i) => {
      if (i.user.id !== member.id) {
        await i.reply({
          content: 'Only the administrator who ran vconfig can use these controls.',
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
        return;
      }

      if (i.isChannelSelectMenu()) {
        selectedChannelIds = i.values;
        await i.reply({
          content: `Selected ${selectedChannelIds.length} voice channel(s): ${selectedChannelIds.map((id) => `<#${id}>`).join(', ')}`,
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
      } else if (i.isButton()) {
        if (i.customId.startsWith('vconfig_save_')) {
          if (selectedChannelIds.length === 0) {
            await i.reply({ content: 'Please select at least one voice channel before saving.', flags: MessageFlags.Ephemeral });
            return;
          }

          await saveVConfigRule(guild.id, targetCmdName, targetRole.id, mode, selectedChannelIds);
          collector.stop('saved');

          const updatePayload = ui.standard({
            title: 'Voice Access Configuration Saved',
            text:
              `• **Command:** \`${targetCmdName}\`\n` +
              `• **Role:** ${mentionRole(targetRole.id)}\n` +
              `• **Mode:** **${modeText}**\n` +
              `• **Affected Channels:** ${selectedChannelIds.map((id) => `<#${id}>`).join(', ')}`,
          });

          await i.update({
            components: updatePayload.components,
            flags: updatePayload.flags as any,
          });

          logEvent('info', 'command_execution', `vconfig rule saved by ${member.user.tag}`, {
            administrator: member.user.tag,
            command: targetCmdName,
            mode,
            role: targetRole.name,
            channels: selectedChannelIds,
            guild: guild.name,
          });
        } else if (i.customId.startsWith('vconfig_cancel_')) {
          collector.stop('cancelled');
          await i.update({
            content: 'Voice access configuration cancelled.',
            components: [],
          });
        }
      }
    });

    collector.on('end', (_, reason) => {
      if (reason !== 'saved' && reason !== 'cancelled') {
        sentMsg.edit({ components: [] }).catch(() => {});
      }
    });
  },
});

export async function handleVConfigFallback(
  interaction: import('discord.js').ButtonInteraction | import('discord.js').ChannelSelectMenuInteraction,
): Promise<void> {
  if (interaction.replied || interaction.deferred) return;
  await interaction.reply({
    content: 'This voice configuration menu has expired or is no longer active. Please run `vconfig` again.',
    flags: MessageFlags.Ephemeral,
  }).catch(() => {});
}
