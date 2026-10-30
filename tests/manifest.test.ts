import test from 'node:test';
import assert from 'node:assert/strict';
import { InteractionRouter } from '../src/core/interactions/InteractionRouter.js';
import type { ModuleManifest } from '../src/types/module.js';

test('InteractionRouter routes button interactions by registered prefix', async () => {
  const router = new InteractionRouter();
  let calledWith: any = null;
  const mockHandler = async (interaction: any) => {
    calledWith = interaction;
  };

  const manifest: ModuleManifest = {
    name: 'test_module',
    buttonPrefixes: ['test_btn_'],
    onButton: mockHandler,
  };

  router.registerModule(manifest);

  const fakeButtonInteraction = {
    isButton: () => true,
    isStringSelectMenu: () => false,
    isChannelSelectMenu: () => false,
    isModalSubmit: () => false,
    customId: 'test_btn_submit',
  } as any;

  const handled = await router.dispatch(fakeButtonInteraction);

  assert.equal(handled, true);
  assert.equal(calledWith, fakeButtonInteraction);
});

test('InteractionRouter returns false for unknown customId prefixes', async () => {
  const router = new InteractionRouter();

  const fakeButtonInteraction = {
    isButton: () => true,
    isStringSelectMenu: () => false,
    isChannelSelectMenu: () => false,
    isModalSubmit: () => false,
    customId: 'unknown_prefix_123',
  } as any;

  const handled = await router.dispatch(fakeButtonInteraction);
  assert.equal(handled, false);
});

test('Owner module manifest registers access_ button and select prefixes', async () => {
  const { default: ownerManifest } = await import('../src/modules/owner/_module.js');
  const router = new InteractionRouter();
  router.registerModule(ownerManifest);

  assert.ok(ownerManifest.buttonPrefixes?.includes('access_'));
  assert.ok(ownerManifest.selectPrefixes?.includes('access_'));

  const fakePrevButton = {
    isButton: () => true,
    isAnySelectMenu: () => false,
    isStringSelectMenu: () => false,
    isChannelSelectMenu: () => false,
    isModalSubmit: () => false,
    customId: 'access_page_prev:0',
    guild: null,
  } as any;

  const handledBtn = await router.dispatch(fakePrevButton);
  assert.equal(handledBtn, true);

  const fakeInspectSelect = {
    isButton: () => false,
    isAnySelectMenu: () => true,
    isStringSelectMenu: () => true,
    isChannelSelectMenu: () => false,
    isModalSubmit: () => false,
    customId: 'access_select_inspect:0',
    values: ['inspect:user:12345:0'],
    guild: null,
    user: { tag: 'test', id: '1' },
    channel: null,
    client: {} as any,
  } as any;

  const handledSelect = await router.dispatch(fakeInspectSelect);
  assert.equal(handledSelect, true);
});

test('groupPermits correctly aggregates commands, modules, and target types', async () => {
  const { groupPermits } = await import('../src/modules/owner/_accessHandler.js');
  const mockPermits = [
    { id: 1, guildId: 'g1', targetType: 'user' as const, targetId: 'u1', commandName: 'ban', moduleName: 'mod', createdAt: new Date() },
    { id: 2, guildId: 'g1', targetType: 'user' as const, targetId: 'u1', commandName: 'kick', moduleName: 'mod', createdAt: new Date() },
    { id: 3, guildId: 'g1', targetType: 'role' as const, targetId: 'r1', commandName: null, moduleName: null, createdAt: new Date() },
  ];

  const grouped = groupPermits(mockPermits);
  assert.equal(grouped.length, 2);
  // Role sorted first
  assert.equal(grouped[0].targetType, 'role');
  assert.equal(grouped[0].hasAll, true);
  assert.equal(grouped[1].targetType, 'user');
  assert.equal(grouped[1].commands.size, 2);
});


