import test from 'node:test';
import assert from 'node:assert/strict';

test('New modules and commands load with valid structure and metadata', async () => {
  // Ticket module
  const panelCmd = (await import('../src/modules/ticket/panel.js')).default;
  const ticketCmd = (await import('../src/modules/ticket/ticket.js')).default;
  assert.equal(panelCmd.name, 'panel');
  assert.equal(ticketCmd.name, 'ticket');
  assert.ok(ticketCmd.aliases.includes('t'));

  // Conditional roles
  const connectCmd = (await import('../src/modules/moderation/connect.js')).default;
  assert.equal(connectCmd.name, 'connect');
  assert.ok(connectCmd.aliases.includes('connectrole'));

  // Moderation: jail, unjail, setjail, timeout, untimeout, kick, ban
  const jailCmd = (await import('../src/modules/moderation/jail.js')).default;
  const unjailCmd = (await import('../src/modules/moderation/unjail.js')).default;
  const setjailCmd = (await import('../src/modules/moderation/setjail.js')).default;
  const timeoutCmd = (await import('../src/modules/moderation/timeout.js')).default;
  const untimeoutCmd = (await import('../src/modules/moderation/untimeout.js')).default;
  const kickCmd = (await import('../src/modules/moderation/kick.js')).default;
  const banCmd = (await import('../src/modules/moderation/ban.js')).default;

  assert.equal(jailCmd.name, 'jail');
  assert.equal(unjailCmd.name, 'unjail');
  assert.equal(setjailCmd.name, 'setjail');
  assert.equal(timeoutCmd.name, 'timeout');
  assert.ok(timeoutCmd.aliases.includes('to'));
  assert.ok(timeoutCmd.aliases.includes('mute'));
  assert.equal(untimeoutCmd.name, 'untimeout');
  assert.ok(untimeoutCmd.aliases.includes('unmute'));
  assert.equal(kickCmd.name, 'kick');
  assert.ok(kickCmd.aliases.includes('k'));
  assert.equal(banCmd.name, 'ban');
  assert.ok(banCmd.aliases.includes('b'));

  // Giveaways: gstart, gend, greroll
  const gstartCmd = (await import('../src/modules/giveaway/gstart.js')).default;
  const gendCmd = (await import('../src/modules/giveaway/gend.js')).default;
  const grerollCmd = (await import('../src/modules/giveaway/greroll.js')).default;

  assert.equal(gstartCmd.name, 'gstart');
  assert.equal(gendCmd.name, 'gend');
  assert.equal(grerollCmd.name, 'greroll');
  assert.ok(grerollCmd.aliases.includes('giveawayreroll'));
});

test('Conditional role evaluation assigns and revokes main role accurately', async () => {
  const { evaluateMemberConnections } = await import('../src/modules/moderation/connect.js');

  let addedRole: string | null = null;
  let removedRole: string | null = null;

  const rolesSet = new Set<string>(['mod_role_1']);

  const mockMember = {
    roles: {
      cache: {
        has: (rId: string) => rolesSet.has(rId),
      },
      add: async (rId: string) => {
        addedRole = rId;
        rolesSet.add(rId);
      },
      remove: async (rId: string) => {
        removedRole = rId;
        rolesSet.delete(rId);
      },
    },
  } as any;

  const connection = {
    id: 1,
    guildId: 'g1',
    mainRoleId: 'staff_role',
    conditionalRoleIds: ['mod_role_1', 'gaming_mod'],
    requireAll: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // 1. Should add main role because user has mod_role_1
  const changed1 = await evaluateMemberConnections(mockMember, [connection]);
  assert.equal(changed1, true);
  assert.equal(addedRole, 'staff_role');

  // 2. Already has main role, no change
  const changed2 = await evaluateMemberConnections(mockMember, [connection]);
  assert.equal(changed2, false);

  // 3. User loses conditional role -> should remove main role
  rolesSet.delete('mod_role_1');
  const changed3 = await evaluateMemberConnections(mockMember, [connection]);
  assert.equal(changed3, true);
  assert.equal(removedRole, 'staff_role');
});

