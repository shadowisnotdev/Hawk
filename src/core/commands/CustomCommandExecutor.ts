import { EmbedBuilder, PermissionsBitField, type PermissionResolvable } from 'discord.js';
import { getDb } from '../database/pool.js';
import { defineCommand, type CommandDefinition, type CommandContext } from '../../types/command.js';
import { validateFlow, type CommandFlow } from './customCommandFlow.js';
interface StoredCommand { name: string; flow_json: CommandFlow; cooldown_ms: number; required_roles: string[] }
const cache = new Map<string, { commands: StoredCommand[]; loaded: number }>();
const active = new Set<string>();
let listener: { unlisten: () => Promise<void> } | undefined;
export async function initializeCustomCommands(): Promise<void> {
  const db = getDb();
  listener = await db.listen('custom_commands_changed', guildId => cache.delete(guildId));
  const rows = await db<(StoredCommand & { guild_id: string })[]>`SELECT guild_id, name, flow_json, cooldown_ms, required_roles FROM custom_commands WHERE enabled = true`;
  for (const row of rows) {
    if (!cache.has(row.guild_id)) cache.set(row.guild_id, { commands: [], loaded: Date.now() });
    cache.get(row.guild_id)!.commands.push(row);
  }
}
export async function stopCustomCommands() { await listener?.unlisten(); listener = undefined; cache.clear(); }
export async function resolveCustomCommand(guildId: string, name: string): Promise<CommandDefinition | null> {
  let entry = cache.get(guildId);
  if (!entry || Date.now() - entry.loaded > 30_000) {
    const commands = await getDb()<StoredCommand[]>`SELECT name, flow_json, cooldown_ms, required_roles FROM custom_commands WHERE guild_id = ${guildId} AND enabled = true LIMIT 200`;
    entry = { commands, loaded: Date.now() }; cache.set(guildId, entry);
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
  }
  const stored = entry.commands.find(c => c.name === name);
  if (!stored) return null;
  return defineCommand({ name, module: 'custom', description: 'Server custom command', cooldown: Math.max(1, stored.cooldown_ms / 1000), execute: ctx => executeFlow(ctx, stored) });
}
async function executeFlow(ctx: CommandContext, command: StoredCommand): Promise<void> {
  if (command.required_roles.length && !command.required_roles.some(id => ctx.member.roles.cache.has(id))) { await ctx.respond.denied('You need a required role to use this command.'); return; }
  const key = `${ctx.guild.id}:${ctx.member.id}`;
  if (active.has(key) || [...active].filter(v => v.startsWith(ctx.guild.id + ':')).length >= 5) { await ctx.respond.error('A custom command is already running. Please try again shortly.'); return; }
  active.add(key);
  try {
    const flow = validateFlow(command.flow_json);
    const render = (value: string | number | undefined) => String(value ?? '').replace(/\{(user|username|server|args)\}/g, (_, variable: string) => ({ user: `<@${ctx.member.id}>`, username: ctx.message.author.username, server: ctx.guild.name, args: ctx.parsed.rawArgs })[variable] || '').slice(0, 4000);
    let node = flow.nodes.find(n => n.data.action === 'trigger'); let steps = 0;
    const deadline = Date.now() + 20_000;
    while (node && steps++ < 50) {
      if (Date.now() > deadline) throw new Error('Command execution timed out');
      const { action, args } = node.data; let branch: string | undefined;
      if (action === 'hasRole') branch = ctx.member.roles.cache.has(String(args.roleId)) ? 'yes' : 'no';
      if (action === 'hasPermission') branch = ctx.member.permissions.has(String(args.permission) as PermissionResolvable) ? 'yes' : 'no';
      if (action === 'inChannel') branch = ctx.channel.id === args.channelId ? 'yes' : 'no';
      if (action === 'reply') await ctx.message.reply({ content: render(args.text).slice(0, 2000), allowedMentions: { parse: [], repliedUser: false } });
      if (action === 'send' || action === 'embed') {
        const channel = await ctx.guild.channels.fetch(String(args.channelId));
        if (!channel || !channel.isTextBased() || !('send' in channel) || !channel.permissionsFor(ctx.member)?.has(['ViewChannel', 'SendMessages']) || !ctx.guild.members.me || !channel.permissionsFor(ctx.guild.members.me)?.has(['ViewChannel', 'SendMessages'])) throw new Error('Channel is unavailable or cannot receive messages');
        if (action === 'send') await channel.send({ content: render(args.text).slice(0, 2000), allowedMentions: { parse: [] } });
        else await channel.send({ embeds: [new EmbedBuilder().setDescription(render(args.description)).setTitle(render(args.title).slice(0, 256) || null).setColor(0x6366f1)], allowedMentions: { parse: [] } });
      }
      if (action === 'addRole' || action === 'removeRole') {
        const role = await ctx.guild.roles.fetch(String(args.roleId));
        const dangerous = new PermissionsBitField(['Administrator', 'ManageGuild', 'ManageRoles', 'ManageChannels', 'BanMembers', 'KickMembers', 'ManageWebhooks']);
        if (!role || role.managed || !role.editable || role.id === ctx.guild.id || role.permissions.any(dangerous) || !ctx.member.permissions.has('ManageRoles') || (ctx.member.id !== ctx.guild.ownerId && ctx.member.roles.highest.comparePositionTo(role) <= 0)) throw new Error('Role action denied by hierarchy or permissions');
        if (action === 'addRole') await ctx.member.roles.add(role); else await ctx.member.roles.remove(role);
      }
      if (action === 'react') await ctx.message.react(String(args.emoji));
      if (action === 'wait') await new Promise(resolve => setTimeout(resolve, Number(args.ms)));
      const edge = flow.edges.find(e => e.source === node!.id && (branch ? e.sourceHandle === branch : !e.sourceHandle));
      node = edge ? flow.nodes.find(n => n.id === edge.target) : undefined;
    }
  } finally { active.delete(key); }
}
