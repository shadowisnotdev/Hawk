import { PermissionsBitField } from 'discord.js';
import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import { resolveRole } from '../../core/resolver/RoleResolver.js';
import {
  setCustomRoleAlias,
  getGuildCustomRoleAliases,
  deleteCustomRoleAlias,
} from '../../core/database/repositories/customRoleRepo.js';
import { mentionRole } from '../../core/utils/formatters.js';

export default defineCommand({
  name: 'setcustomrole',
  aliases: ['addcustomrole', 'customrole', 'scr'],
  module: 'customrole',
  description: 'Creates a dynamic role-assignment command alias guarded by a required role.',
  usage: 'setcustomrole <role> <alias> <required role> | setcustomrole list | setcustomrole delete <alias>',
  examples: [
    'setcustomrole @VIP vip @Staff',
    'setcustomrole "Girl" g "Female Mod"',
    'setcustomrole list',
    'setcustomrole delete vip',
  ],
  permissions: [PermissionsBitField.Flags.ManageRoles],
  botPermissions: [PermissionsBitField.Flags.ManageRoles],
  cooldown: 3,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, guild, respond } = ctx;

    if (parsed.args.length === 0) {
      await respond.error(
        `**Custom Role Setup:**\n` +
        `• \`${parsed.prefix}setcustomrole <role> <alias> <required role>\` — Register dynamic alias\n` +
        `• \`${parsed.prefix}setcustomrole list\` — View registered custom roles\n` +
        `• \`${parsed.prefix}setcustomrole delete <alias>\` — Remove custom role alias`
      );
      return;
    }

    const sub = parsed.args[0].toLowerCase();

    // ── Subcommand: list ──
    if (sub === 'list') {
      const aliases = await getGuildCustomRoleAliases(guild.id);
      if (aliases.length === 0) {
        await respond.info('No custom role aliases are registered in this server.');
        return;
      }

      const lines = aliases.map(
        (a) => `• \`${parsed.prefix}${a.alias}\` ➔ ${mentionRole(a.role_id, guild)} *(Requires ${mentionRole(a.required_role_id, guild)})*`
      );
      await respond.send(`**Custom Role Aliases (${aliases.length}):**\n${lines.join('\n')}`);
      return;
    }

    // ── Subcommand: delete ──
    if (sub === 'delete' || sub === 'del' || sub === 'remove') {
      if (parsed.args.length < 2) {
        await respond.error(`Usage: \`${parsed.prefix}setcustomrole delete <alias>\``);
        return;
      }
      const targetAlias = parsed.args[1].toLowerCase().trim();
      const deleted = await deleteCustomRoleAlias(guild.id, targetAlias);
      if (deleted) {
        await respond.success(`Deleted custom role alias \`${targetAlias}\`.`);
      } else {
        await respond.error(`No custom role alias found with name \`${targetAlias}\`.`);
      }
      return;
    }

    // ── Main: setcustomrole <role> <alias> <required role> ──
    if (parsed.args.length < 3) {
      await respond.error(
        `Usage: \`${parsed.prefix}setcustomrole <role> <alias> <required role>\`\n` +
        `Example: \`${parsed.prefix}setcustomrole @VIP vip @Staff\``
      );
      return;
    }

    // Parse role (1st argument, or quotes if multi-word)
    // We can parse the alias: often the middle argument or single token without spaces
    // Let's check token types or arguments:
    // If 3 arguments: args[0] = role, args[1] = alias, args[2] = required role
    const roleArg = parsed.args[0];
    const aliasArg = parsed.args[1].toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const reqRoleArg = parsed.args.slice(2).join(' ');

    // If args[0] was not resolved directly, handle quotes or 3-tier resolution
    const targetRoleRes = resolveRole(roleArg, guild);
    if (!targetRoleRes.success) {
      await respond.error(`Target role could not be resolved: ${targetRoleRes.error}`);
      return;
    }
    const targetRole = targetRoleRes.value.role;

    if (targetRole.id === guild.id) {
      await respond.error('Cannot set @everyone as a custom assignable role.');
      return;
    }

    if (!aliasArg) {
      await respond.error('Please specify a valid alphanumeric alias for the command (e.g. `vip`).');
      return;
    }

    // Resolve required role via 3-tier matcher
    const reqRoleRes = resolveRole(reqRoleArg, guild);
    if (!reqRoleRes.success) {
      await respond.error(`Required role could not be resolved: ${reqRoleRes.error}`);
      return;
    }
    const reqRole = reqRoleRes.value.role;

    // Check bot hierarchy
    const botMember = guild.members.me;
    if (botMember && botMember.roles.highest.comparePositionTo(targetRole) <= 0) {
      await respond.warning(
        `Warning: ${mentionRole(targetRole, guild)} is currently higher than or equal to my highest role. Move my role above it in Server Settings so I can assign it.`
      );
    }

    await setCustomRoleAlias(guild.id, aliasArg, targetRole.id, reqRole.id);

    await respond.success(
      `Registered dynamic custom role command:\n` +
      `• **Command:** \`${parsed.prefix}${aliasArg} @user\`\n` +
      `• **Role Assigned/Toggled:** ${mentionRole(targetRole, guild)}\n` +
      `• **Guarded By Role:** ${mentionRole(reqRole, guild)}`
    );
  },
});

