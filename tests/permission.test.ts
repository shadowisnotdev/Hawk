import test from 'node:test';
import assert from 'node:assert/strict';
import { getUsableCommandsForMember } from '../src/core/permissions/PermissionChecker.js';
import { registerCommand } from '../src/core/commands/CommandRegistry.js';
import { defineCommand } from '../src/types/command.js';
import { PermissionsBitField } from 'discord.js';
import { env } from '../src/core/config/environment.js';

test('PermissionChecker allows public commands (help, afk, ping, info) and restricts private commands without permits', async () => {
  registerCommand(defineCommand({
    name: 'wv',
    module: 'voice',
    description: 'Check which voice channel a user is in',
    permissions: [],
    execute: async () => {},
  }));

  registerCommand(defineCommand({
    name: 'help',
    module: 'general',
    description: 'Show bot commands',
    permissions: [],
    execute: async () => {},
  }));

  registerCommand(defineCommand({
    name: 'afk',
    module: 'general',
    description: 'Set AFK status',
    permissions: [],
    execute: async () => {},
  }));

  const normalMember = {
    id: '123456789012345678',
    guild: {
      id: '987654321098765432',
      ownerId: '999999999999999999',
    },
    roles: {
      cache: new Map(),
    },
    permissions: new PermissionsBitField([]),
  } as any;

  const mockChannel = {
    id: '111222333444555666',
    parentId: null,
  } as any;

  const res = await getUsableCommandsForMember(normalMember, mockChannel);
  assert.equal(res.usableSet.has('afk'), true);
  assert.equal(res.usableSet.has('help'), true);
  assert.equal(res.usableSet.has('wv'), false);
});

test('PermissionChecker allows all commands to bot owner', async () => {
  const ownerId = env.botOwnerId || '111111111111111111';
  const botOwnerMember = {
    id: ownerId,
    guild: {
      id: '987654321098765432',
      ownerId: '999999999999999999',
    },
    roles: {
      cache: new Map(),
    },
    permissions: new PermissionsBitField([]),
  } as any;

  const mockChannel = {
    id: '111222333444555666',
    parentId: null,
  } as any;

  const res = await getUsableCommandsForMember(botOwnerMember, mockChannel);
  assert.ok(res.usableCount > 0);
  assert.equal(res.usableSet.has('wv'), true);
  assert.equal(res.usableSet.has('help'), true);
  assert.equal(res.usableSet.has('afk'), true);
});
