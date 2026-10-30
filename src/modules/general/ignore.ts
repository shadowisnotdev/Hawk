import { PermissionsBitField } from 'discord.js';
import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import { resolveCommand } from '../../core/commands/CommandRegistry.js';
import { resolveRole } from '../../core/resolver/RoleResolver.js';
import { resolveChannel } from '../../core/resolver/ChannelResolver.js';
import { resolveUser } from '../../core/resolver/UserResolver.js';
import {
  addIgnore,
  removeIgnore,
  getIgnoreEntries,
} from '../../core/database/repositories/ignoreRepo.js';
import { ui } from '../../core/ui/index.js';
import { mentionRole, mentionChannel, mentionUser } from '../../core/utils/formatters.js';
import { logEvent } from '../../core/logging/WebhookLogger.js';

const KNOWN_MODULES = new Set([
  'general',
  'moderation',
  'voice',
  'gaming',
  'suggestion',
  'sticky',
  'welcome',
  'media',
]);

export default defineCommand({
  name: 'ignore',
  module: 'general',
  description: 'Configure command or module whitelist/blacklist execution rules per role, channel, or user.',
  usage: 'ignore <command|module|all> <wl|bl> <@role|#channel|@user|all> | ignore list | ignore remove <command|module|all> <wl|bl> <target>',
  examples: [
    'ignore purge bl @Moderator',
    'ignore moderation bl #general',
    'ignore all bl @TrialMod',
    'ignore list',
    'ignore remove purge bl @Moderator',
  ],
  permissions: [PermissionsBitField.Flags.ManageGuild],
  botPermissions: [PermissionsBitField.Flags.SendMessages],
  cooldown: 3,

  async execute(ctx: CommandContext): Promise<void> {
    const { guild, member, parsed, respond } = ctx;

    if (parsed.args.length === 0) {
      await respond.error(`Usage: \`${parsed.prefix}ignore <command|module|all> <wl|bl> <@role|#channel|@user|all>\` or \`${parsed.prefix}ignore list\``);
      return;
    }

    const sub = parsed.args[0].toLowerCase();

    // ── Subcommand: list ──────────────────────────────────────
    if (sub === 'list') {
      const entries = await getIgnoreEntries(guild.id);
      if (entries.length === 0) {
        await respond.info('No command or module ignore/whitelist rules exist for this server.');
        return;
      }

      interface GroupedIgnore {
        entityType: 'user' | 'role' | 'channel';
        entityId: string;
        mode: 'wl' | 'bl';
        hasGlobal: boolean;
        commands: Set<string>;
        modules: Set<string>;
      }

      const groupedMap = new Map<string, GroupedIgnore>();

      for (const e of entries) {
        const key = `${e.entityType}:${e.entityId}:${e.mode || 'bl'}`;
        let entry = groupedMap.get(key);
        if (!entry) {
          entry = {
            entityType: e.entityType as 'user' | 'role' | 'channel',
            entityId: e.entityId,
            mode: (e.mode || 'bl') as 'wl' | 'bl',
            hasGlobal: false,
            commands: new Set<string>(),
            modules: new Set<string>(),
          };
          groupedMap.set(key, entry);
        }

        if (!e.scopeType || !e.scopeId) {
          entry.hasGlobal = true;
        } else if (e.scopeType === 'command') {
          entry.commands.add(e.scopeId);
        } else if (e.scopeType === 'module') {
          entry.modules.add(e.scopeId);
        }
      }

      const lines = Array.from(groupedMap.values()).map((g) => {
        const targetStr =
          g.entityId === 'all' || g.entityId === '*'
            ? '**All Targets**'
            : g.entityType === 'role'
            ? mentionRole(g.entityId, guild)
            : g.entityType === 'channel'
            ? mentionChannel(g.entityId)
            : mentionUser(g.entityId, guild);

        const modeBadge = g.mode === 'wl' ? '**[WHITELIST]**' : '**[BLACKLIST]**';

        let scopesText: string;
        if (g.hasGlobal) {
          scopesText = '**ALL Commands & Modules**';
        } else {
          const parts: string[] = [];
          if (g.modules.size > 0) {
            const modList = Array.from(g.modules).map(m => `\`${m}\``).join(', ');
            parts.push(`Modules: ${modList}`);
          }
          if (g.commands.size > 0) {
            const cmdList = Array.from(g.commands).map(c => `\`${c}\``).join(', ');
            parts.push(`Commands: ${cmdList}`);
          }
          scopesText = parts.join(' • ');
        }

        return `• ${modeBadge} ${targetStr} (${g.entityType}) ➜ ${scopesText}`;
      });

      await ui.paginated(ctx, {
        title: `Command & Module Access Rules (${lines.length} Targets / ${entries.length} Rules)`,
        items: lines,
        pageSize: 8,
        emptyText: 'No command or module ignore/whitelist rules exist for this server.',
      });
      return;
    }

    // ── Subcommand: remove ────────────────────────────────────
    if (sub === 'remove' || sub === 'delete') {
      if (parsed.args.length < 4) {
        await respond.error(`Usage: \`${parsed.prefix}ignore remove <command|module|all> <wl|bl> <@role|#channel|@user|all>\``);
        return;
      }

      const scopeArg = parsed.args[1].toLowerCase();
      const modeArg = parsed.args[2].toLowerCase();
      const targetArg = parsed.args[3];

      if (modeArg !== 'wl' && modeArg !== 'bl') {
        await respond.error('Mode must be `wl` (whitelist) or `bl` (blacklist).');
        return;
      }

      const { scopeType, scopeId } = resolveScope(scopeArg);
      const target = await resolveTarget(targetArg, guild);
      if (!target) {
        await respond.error('Could not resolve the target role, channel, user, or `all`.');
        return;
      }

      const removed = await removeIgnore(guild.id, target.type, target.id, scopeType, scopeId, modeArg as 'wl' | 'bl');
      if (removed) {
        await respond.success(`Removed **${modeArg.toUpperCase()}** rule for ${scopeType ?? 'global'}: \`${scopeId ?? 'all'}\` on ${target.mention}.`);
        logEvent('info', 'command_execution', `ignore rule removed by ${member.user.tag}`, {
          administrator: member.user.tag,
          scopeType,
          scopeId,
          mode: modeArg,
          target: target.mention,
          guild: guild.name,
        });
      } else {
        await respond.info('No matching access rule was found to remove.');
      }
      return;
    }

    if (parsed.args.length < 3) {
      await respond.error(`Usage: \`${parsed.prefix}ignore <command|module|all> <wl|bl> <@role|#channel|@user|all>\``);
      return;
    }

    const scopeArg = parsed.args[0].toLowerCase();
    const modeArg = parsed.args[1].toLowerCase();
    const targetArg = parsed.args[2];

    if (modeArg !== 'wl' && modeArg !== 'bl') {
      await respond.error('Mode must be `wl` (whitelist) or `bl` (blacklist).');
      return;
    }

    const { scopeType, scopeId } = resolveScope(scopeArg);

    const target = await resolveTarget(targetArg, guild);
    if (!target) {
      await respond.error('Could not resolve the target role, channel, user, or `all`.');
      return;
    }

    const mode = modeArg as 'wl' | 'bl';
    await addIgnore(guild.id, target.type, target.id, scopeType, scopeId, mode);

    await respond.success(`Added **${mode.toUpperCase()}** rule for **${scopeType ?? 'global'}** \`${scopeId ?? 'all'}\` on ${target.mention}.`);

    logEvent('info', 'command_execution', `ignore rule added by ${member.user.tag}`, {
      administrator: member.user.tag,
      scopeType,
      scopeId,
      mode,
      targetType: target.type,
      targetId: target.id,
      guild: guild.name,
    });
  },
});

function resolveScope(input: string): { scopeType: 'command' | 'module' | null; scopeId: string | null } {
  const clean = input.toLowerCase();
  if (clean === 'all' || clean === '*') {
    return { scopeType: null, scopeId: null };
  }

  const cmd = resolveCommand(clean);
  if (cmd) {
    return { scopeType: 'command', scopeId: cmd.name };
  }
  if (KNOWN_MODULES.has(clean)) {
    return { scopeType: 'module', scopeId: clean };
  }
  return { scopeType: null, scopeId: null };
}

async function resolveTarget(
  input: string,
  guild: any,
): Promise<{ type: 'role' | 'channel' | 'user'; id: string; mention: string } | null> {
  const clean = input.toLowerCase();
  if (clean === 'all' || clean === '*') {
    return { type: 'channel', id: 'all', mention: '**All Targets**' };
  }

  const roleRes = resolveRole(input, guild);
  if (roleRes.success) {
    return { type: 'role', id: roleRes.value.role.id, mention: mentionRole(roleRes.value.role.id) };
  }

  const chanRes = resolveChannel(input, guild);
  if (chanRes.success) {
    return { type: 'channel', id: chanRes.value.channel.id, mention: mentionChannel(chanRes.value.channel.id) };
  }

  const userRes = await resolveUser(input, guild);
  if (userRes.success) {
    return { type: 'user', id: userRes.value.user.id, mention: mentionUser(userRes.value.member ?? userRes.value.user, guild) };
  }

  return null;
}
