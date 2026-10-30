import type { CommandDefinition } from '../../types/command.js';
import { consoleLog } from '../logging/ConsoleLogger.js';

const commands = new Map<string, CommandDefinition>();
const aliases = new Map<string, string>();
const modules = new Map<string, Set<string>>();

export function registerCommand(command: CommandDefinition): void {
  if (commands.has(command.name)) { consoleLog('warning', 'startup', `Duplicate command name: ${command.name} \u2014 skipping`); return; }
  commands.set(command.name, command);
  for (const alias of command.aliases) {
    if (aliases.has(alias) || commands.has(alias)) { consoleLog('warning', 'startup', `Duplicate alias: ${alias} (from ${command.name}) \u2014 skipping`); continue; }
    aliases.set(alias, command.name);
  }
  if (!modules.has(command.module)) modules.set(command.module, new Set());
  modules.get(command.module)!.add(command.name);
}

export function resolveCommand(nameOrAlias: string): CommandDefinition | null {
  const lower = nameOrAlias.toLowerCase();
  const direct = commands.get(lower);
  if (direct) return direct;
  const canonical = aliases.get(lower);
  if (canonical) return commands.get(canonical) ?? null;
  return null;
}

export function getModuleCommands(moduleName: string, includeHidden = false): CommandDefinition[] {
  const names = modules.get(moduleName);
  if (!names) return [];
  return Array.from(names)
    .map(n => commands.get(n))
    .filter((c): c is CommandDefinition => c !== undefined && (includeHidden || !c.hidden));
}

export function getModules(includeOwner = false, includeDynamic = false): string[] {
  const names = Array.from(new Set([...modules.keys(), ...(includeDynamic ? ['custom'] : [])]));
  if (includeOwner) return names;
  return names.filter(m => m !== 'owner');
}

export function getAllCommands(includeOwner = false): CommandDefinition[] {
  if (includeOwner) return Array.from(commands.values());
  return Array.from(commands.values()).filter(c => c.module !== 'owner' && !c.hidden && !c.ownerOnly);
}

export function getCommandCount(includeOwner = false): number {
  return getAllCommands(includeOwner).length;
}

export function isRegistered(nameOrAlias: string): boolean { return resolveCommand(nameOrAlias) !== null; }
