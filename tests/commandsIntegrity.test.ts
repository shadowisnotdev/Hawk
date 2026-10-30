import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadCommands } from '../src/core/commands/CommandLoader.js';
import {
  getAllCommands,
  getCommandCount,
  resolveCommand,
  getModules,
  getModuleCommands,
} from '../src/core/commands/CommandRegistry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const modulesDir = join(__dirname, '..', 'src', 'modules');

test('Command Integrity & Full Audit Test', async (t) => {
  await t.test('all module command files load without syntax or definition errors', async () => {
    const loadedCount = await loadCommands(modulesDir);
    assert.ok(loadedCount >= 25, `Expected at least 25 commands to be loaded, got ${loadedCount}`);
  });

  await t.test('every command has valid structure, name, description, usage, and examples', () => {
    const all = getAllCommands(true); // include owner commands
    assert.ok(all.length > 0, 'Commands should be registered');

    const seenNames = new Set<string>();
    const seenAliases = new Map<string, string>();

    for (const cmd of all) {
      assert.ok(cmd.name, 'Command must have a name');
      assert.equal(cmd.name, cmd.name.toLowerCase(), `Command name '${cmd.name}' must be lowercase`);
      assert.ok(!seenNames.has(cmd.name), `Duplicate command name found: ${cmd.name}`);
      seenNames.add(cmd.name);

      assert.ok(cmd.module, `Command '${cmd.name}' must belong to a module`);
      assert.equal(typeof cmd.execute, 'function', `Command '${cmd.name}' must have an execute function`);
      assert.ok(cmd.description && cmd.description.length > 0, `Command '${cmd.name}' must have a description`);
      assert.ok(Array.isArray(cmd.aliases), `Command '${cmd.name}' aliases must be an array`);
      assert.ok(Array.isArray(cmd.examples), `Command '${cmd.name}' examples must be an array`);
      assert.ok(Array.isArray(cmd.permissions), `Command '${cmd.name}' permissions must be an array`);
      assert.ok(Array.isArray(cmd.botPermissions), `Command '${cmd.name}' botPermissions must be an array`);
      assert.ok(typeof cmd.cooldown === 'number' && cmd.cooldown >= 0, `Command '${cmd.name}' cooldown must be >= 0`);

      // Check aliases
      for (const alias of cmd.aliases) {
        assert.equal(alias, alias.toLowerCase(), `Alias '${alias}' for '${cmd.name}' must be lowercase`);
        assert.ok(
          !seenNames.has(alias) && !seenAliases.has(alias),
          `Alias '${alias}' on '${cmd.name}' collides with '${seenAliases.get(alias) || alias}'`,
        );
        seenAliases.set(alias, cmd.name);
      }
    }
  });

  await t.test('resolveCommand finds every registered command and all its aliases', () => {
    const all = getAllCommands(true);
    for (const cmd of all) {
      const resolvedPrimary = resolveCommand(cmd.name);
      assert.ok(resolvedPrimary, `Failed to resolve primary name '${cmd.name}'`);
      assert.equal(resolvedPrimary?.name, cmd.name);

      for (const alias of cmd.aliases) {
        const resolvedAlias = resolveCommand(alias);
        assert.ok(resolvedAlias, `Failed to resolve alias '${alias}' for command '${cmd.name}'`);
        assert.equal(resolvedAlias?.name, cmd.name);
      }
    }
  });

  await t.test('public getCommandCount and getAllCommands exclude owner commands by default', () => {
    const publicCommands = getAllCommands(false);
    const allCommandsWithDev = getAllCommands(true);

    assert.ok(allCommandsWithDev.length > publicCommands.length, 'Owner commands should exist in full registry');
    const ownerCmdsInPublic = publicCommands.filter(c => c.module === 'owner' || c.ownerOnly || c.hidden);
    assert.equal(ownerCmdsInPublic.length, 0, 'No owner or hidden commands should be in public getAllCommands()');

    const publicCount = getCommandCount(false);
    assert.equal(publicCount, publicCommands.length);
  });

  await t.test('every module category returns clean command list', () => {
    const mods = getModules(false);
    assert.ok(!mods.includes('owner'), 'owner module should not be in public getModules()');

    for (const mod of mods) {
      const cmds = getModuleCommands(mod);
      assert.ok(cmds.length > 0, `Module '${mod}' has no registered commands`);
      for (const cmd of cmds) {
        assert.equal(cmd.module, mod);
      }
    }
  });
});
