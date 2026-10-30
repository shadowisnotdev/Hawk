import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePermitEffect } from '../src/core/permissions/permitEffect.js';
import type { PermitRecord } from '../src/types/permission.js';
const grant = (patch: Partial<PermitRecord>): PermitRecord => ({ id: 1, guildId: 'g', targetId: 'r', targetType: 'role', commandName: null, moduleName: 'economy', createdAt: new Date(), ...patch });
test('command denial overrides broader role grant, while explicit user ACL wins', () => {
 const rules = [grant({}), grant({ commandName: 'balance', effect: 'DENY' })];
 assert.equal(resolvePermitEffect(rules, 'u', ['r'], 'balance', 'economy'), 'DENY');
 assert.equal(resolvePermitEffect(rules, 'u', ['r'], 'work', 'economy'), 'ALLOW');
 assert.equal(resolvePermitEffect([...rules, grant({ targetType: 'user', targetId: 'u', commandName: 'balance', effect: 'ALLOW' })], 'u', ['r'], 'balance', 'economy'), 'ALLOW');
});
test('legacy command-only grants work and unrelated modules do not', () => {
 assert.equal(resolvePermitEffect([grant({ commandName: 'balance', moduleName: null })], 'u', ['r'], 'balance', 'economy'), 'ALLOW');
 assert.equal(resolvePermitEffect([grant({})], 'u', ['r'], 'ban', 'moderation'), null);
});
