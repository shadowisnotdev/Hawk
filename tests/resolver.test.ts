import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveUser } from '../src/core/resolver/UserResolver.js';
import mmvCmd from '../src/modules/voice/mmv.js';
import svcCmd from '../src/modules/voice/svc.js';
import mvCmd from '../src/modules/voice/mv.js';
import pingCmd from '../src/modules/general/ping.js';
import infoCmd from '../src/modules/general/info.js';

test('UserResolver resolves users by name, username, mention, and snowflake', async () => {
  const mockMember = {
    id: '123456789012345678',
    displayName: 'John Doe',
    nickname: 'Johnny',
    user: { id: '123456789012345678', username: 'johndoe', tag: 'johndoe#0000', globalName: 'John Global' },
  };

  const mockGuild = {
    members: {
      cache: new Map([
        ['123456789012345678', mockMember],
      ]),
      fetch: async (opt: any) => {
        if (typeof opt === 'string' && opt === '123456789012345678') {
          return mockMember;
        }
        return mockGuild.members.cache;
      },
    },
    client: {
      users: {
        fetch: async () => mockMember.user,
      },
    },
  } as any;

  // Resolve by username
  const resultUsername = await resolveUser('johndoe', mockGuild);
  assert.equal(resultUsername.success, true);
  if (resultUsername.success) {
    assert.equal(resultUsername.value.id, '123456789012345678');
  }

  // Resolve by display name
  const resultDisplayName = await resolveUser('John Doe', mockGuild);
  assert.equal(resultDisplayName.success, true);
  if (resultDisplayName.success) {
    assert.equal(resultDisplayName.value.id, '123456789012345678');
  }

  // Resolve by mention
  const resultMention = await resolveUser('<@123456789012345678>', mockGuild);
  assert.equal(resultMention.success, true);
  if (resultMention.success) {
    assert.equal(resultMention.value.id, '123456789012345678');
  }

  // Resolve by Snowflake ID
  const resultId = await resolveUser('123456789012345678', mockGuild);
  assert.equal(resultId.success, true);
  if (resultId.success) {
    assert.equal(resultId.value.id, '123456789012345678');
  }

  // Non-existent user
  const resultMissing = await resolveUser('non_existent_person_xyz', mockGuild);
  assert.equal(resultMissing.success, false);
  assert.match(resultMissing.error || '', /Could not find a user matching/);
});

test('Voice commands have correct requested aliases', () => {
  assert.ok(mmvCmd.aliases.includes('move'), 'mmv command should have move alias');
  assert.ok(mmvCmd.aliases.includes('multimove'), 'mmv command should have multimove alias');
  assert.ok(svcCmd.aliases.includes('shiftvc'), 'svc command should have shiftvc alias');
  assert.ok(mvCmd.aliases.includes('pull'), 'mv command should have pull alias');
});

test('vc commands support mute, deafen, unmute, undeafen in usage and examples', async () => {
  const vcCmd = (await import('../src/modules/voice/vc.js')).default;

  assert.ok(vcCmd.aliases.includes('vcmute'));
  assert.ok(vcCmd.aliases.includes('vcdeafen'));
  assert.ok(vcCmd.aliases.includes('vcunmute'));
  assert.ok(vcCmd.aliases.includes('vcundeafen'));
  assert.ok(vcCmd.usage.includes('mute'));
  assert.ok(vcCmd.usage.includes('deafen'));
});

test('Ping and Info commands exist with proper metadata', () => {
  assert.equal(pingCmd.name, 'ping');
  assert.ok(pingCmd.aliases.includes('latency'));

  assert.equal(infoCmd.name, 'info');
  assert.ok(infoCmd.aliases.includes('botinfo'));
});

test('AuthorityLevel correctly identifies multiple bot owners', async () => {
  const { getAuthorityLevel } = await import('../src/core/permissions/PermissionChecker.js');
  const { AuthorityLevel } = await import('../src/types/permission.js');
  const { env } = await import('../src/core/config/environment.js');

  assert.ok(env.botOwnerIds.includes('1021765669185925150'), '1021765669185925150 should be in botOwnerIds');
  assert.equal(getAuthorityLevel('1021765669185925150', '999'), AuthorityLevel.Owner);
});

test('RoleResolver resolves ?all and all directly to @everyone role without fuzzy search', async () => {
  const { resolveRole } = await import('../src/core/resolver/RoleResolver.js');
  const mockGuild = {
    id: 'guild_999',
    roles: {
      everyone: { id: 'guild_999', name: '@everyone' },
      cache: new Map([
        ['guild_999', { id: 'guild_999', name: '@everyone' }],
        ['role_111', { id: 'role_111', name: 'Alliance' }],
      ]),
    },
  } as any;

  const resQAll = resolveRole('?all', mockGuild);
  assert.equal(resQAll.success, true);
  if (resQAll.success) {
    assert.equal(resQAll.value.id, 'guild_999');
    assert.equal(resQAll.value.name, '@everyone');
  }

  const resAll = resolveRole('all', mockGuild);
  assert.equal(resAll.success, true);
  if (resAll.success) {
    assert.equal(resAll.value.id, 'guild_999');
    assert.equal(resAll.value.name, '@everyone');
  }
});

test('Moderation commands have memorable short aliases', async () => {
  const hideCmd = (await import('../src/modules/moderation/hide.js')).default;
  const lockCmd = (await import('../src/modules/moderation/lock.js')).default;
  const purgeCmd = (await import('../src/modules/moderation/purge.js')).default;
  const slowmodeCmd = (await import('../src/modules/moderation/slowmode.js')).default;
  const snipeCmd = (await import('../src/modules/moderation/snipe.js')).default;
  const roleCmd = (await import('../src/modules/moderation/role.js')).default;
  const vcCmd = (await import('../src/modules/voice/vc.js')).default;

  assert.ok(hideCmd.aliases.includes('h'));
  assert.ok(hideCmd.aliases.includes('unhide'));
  assert.ok(lockCmd.aliases.includes('l'));
  assert.ok(lockCmd.aliases.includes('unlock'));
  assert.ok(purgeCmd.aliases.includes('c'));
  const purgeroleCmd = (await import('../src/modules/moderation/purgerole.js')).default;
  assert.ok(purgeroleCmd.aliases.includes('pr'));
  assert.ok(slowmodeCmd.aliases.includes('sm'));
  assert.ok(snipeCmd.aliases.includes('s'));
  assert.ok(roleCmd.aliases.includes('r'));
  assert.ok(roleCmd.aliases.includes('urole'));
  assert.ok(vcCmd.aliases.includes('vcmute'));
  assert.ok(vcCmd.aliases.includes('vcslam'));
});

test('Nuke command exists with proper metadata and aliases', async () => {
  const nukeCmd = (await import('../src/modules/moderation/nuke.js')).default;
  assert.equal(nukeCmd.name, 'nuke');
  assert.ok(nukeCmd.aliases.includes('clearall'));
  assert.ok(nukeCmd.aliases.includes('recreatechannel'));
});

test('purgerole command exists with proper metadata and aliases', async () => {
  const purgeroleCmd = (await import('../src/modules/moderation/purgerole.js')).default;

  assert.equal(purgeroleCmd.name, 'purgerole');
  assert.ok(purgeroleCmd.aliases.includes('pr'));
  assert.ok(purgeroleCmd.usage.includes('purgerole <role>'));
});

test('addRoleToMember and removeRoleFromMember respect existing member roles', async () => {
  const { addRoleToMember, removeRoleFromMember } = await import('../src/modules/moderation/roleHelpers.js');

  const mockRole = { id: 'role1', position: 10, managed: false } as any;
  const mockBot = { roles: { highest: { position: 100 } } } as any;

  let added = false;
  let removed = false;

  const mockMemberWithRole = {
    id: 'user1',
    roles: {
      cache: new Map([['role1', mockRole]]),
      highest: { position: 5 },
      add: async () => { added = true; },
      remove: async () => { removed = true; },
    },
  } as any;

  const mockMemberWithoutRole = {
    id: 'user2',
    roles: {
      cache: new Map(),
      highest: { position: 5 },
      add: async () => { added = true; },
      remove: async () => { removed = true; },
    },
  } as any;

  const mockGuild = {
    id: 'guild1',
    ownerId: 'owner1',
    members: { me: mockBot },
  } as any;

  // Adding role to member who already has it -> skipped
  const res1 = await addRoleToMember(mockGuild, mockMemberWithRole, mockRole);
  assert.equal(res1, 'skipped');

  // Adding role to member who does not have it -> added
  added = false;
  const res2 = await addRoleToMember(mockGuild, mockMemberWithoutRole, mockRole);
  assert.equal(res2, 'added');
  assert.equal(added, true);

  // Removing role from member who does not have it -> skipped
  const res3 = await removeRoleFromMember(mockGuild, mockMemberWithoutRole, mockRole);
  assert.equal(res3, 'skipped');

  // Removing role from member who has it -> removed
  removed = false;
  const res4 = await removeRoleFromMember(mockGuild, mockMemberWithRole, mockRole);
  assert.equal(res4, 'removed');
  assert.equal(removed, true);
});

test('mmv command supports multiple users and has updated usage metadata', async () => {
  const mmvCmd = (await import('../src/modules/voice/mmv.js')).default;
  assert.equal(mmvCmd.name, 'mmv');
  assert.ok(mmvCmd.usage.includes('<users...>'));
  assert.ok(mmvCmd.aliases.includes('move'));
});

test('list command exists with proper metadata and aliases', async () => {
  const listCmd = (await import('../src/modules/moderation/list.js')).default;
  assert.equal(listCmd.name, 'list');
  assert.ok(listCmd.aliases.includes('inrole'));
  assert.ok(listCmd.aliases.includes('admin'));
  assert.ok(listCmd.aliases.includes('admins'));
  assert.ok(listCmd.aliases.includes('bot'));
  assert.ok(listCmd.aliases.includes('bots'));
});

test('sanitize strips @ and masks mentions in bold without @ prefix', async () => {
  const { sanitize } = await import('../src/core/utils/validators.js');

  const mockGuild = {
    roles: {
      cache: new Map([
        ['111111111111111111', { id: '111111111111111111', name: 'Moderator' }],
      ]),
    },
    members: {
      cache: new Map([
        ['222222222222222222', { id: '222222222222222222', displayName: 'Yoshi', user: { username: 'yoshi' } }],
      ]),
    },
  } as any;

  assert.equal(sanitize('@everyone', mockGuild), '**everyone**');
  assert.equal(sanitize('@here', mockGuild), '**here**');
  assert.equal(sanitize('<@&111111111111111111>', mockGuild), '`Moderator`');
  assert.equal(sanitize('<@222222222222222222>', mockGuild), '**Yoshi**');
  assert.equal(sanitize('<@!222222222222222222>', mockGuild), '**Yoshi**');
});

test('sanitizeAsync resolves uncached members via Discord API fetch', async () => {
  const { sanitizeAsync } = await import('../src/core/utils/validators.js');

  const mockGuild = {
    roles: { cache: new Map() },
    members: {
      cache: new Map(),
      fetch: async (id: string) => {
        if (id === '731014816197771284') {
          return { id, displayName: 'Vanshu', user: { username: 'vanshu' } };
        }
        return null;
      },
    },
    client: {
      users: {
        fetch: async (id: string) => ({ id, username: `user_${id}` }),
      },
    },
  } as any;

  const result = await sanitizeAsync('<@731014816197771284> (user)', mockGuild);
  assert.equal(result, '**Vanshu** (user)');
});

test('toggleRoleForMember allows self-targeting and performs hybrid role toggling', async () => {
  const { toggleRoleForMember } = await import('../src/modules/moderation/roleHelpers.js');

  const mockRole1 = { id: 'role1', position: 10, managed: false } as any;
  const mockRole2 = { id: 'role2', position: 10, managed: false } as any;
  const mockBot = { roles: { highest: { position: 100 } } } as any;

  let addedRole = '';
  let removedRole = '';

  const mockMember = {
    id: 'user1',
    permissions: { has: () => false },
    roles: {
      cache: new Map([['role1', mockRole1]]),
      highest: { position: 50 },
      add: async (r: any) => { addedRole = r.id; },
      remove: async (r: any) => { removedRole = r.id; },
    },
  } as any;

  const mockGuild = {
    id: 'guild1',
    ownerId: 'owner1',
    members: { me: mockBot },
  } as any;

  // Toggling role user already has -> removes it
  const res1 = await toggleRoleForMember(mockGuild, mockMember, mockRole1, mockMember);
  assert.equal(res1, 'removed');
  assert.equal(removedRole, 'role1');

  // Toggling role user does not have -> adds it
  const res2 = await toggleRoleForMember(mockGuild, mockMember, mockRole2, mockMember);
  assert.equal(res2, 'added');
  assert.equal(addedRole, 'role2');
});
