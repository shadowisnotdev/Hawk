import test from 'node:test';
import assert from 'node:assert/strict';
import stickyCmd from '../src/modules/sticky/sticky.js';

test('sticky command exists with proper metadata and aliases', async () => {
  assert.equal(stickyCmd.name, 'sticky');
  assert.equal(stickyCmd.module, 'sticky');
  assert.ok(stickyCmd.aliases.includes('stick'));
  assert.ok(stickyCmd.aliases.includes('unstick'));
  assert.ok(stickyCmd.aliases.includes('stickyedit'));
  assert.ok(stickyCmd.aliases.includes('stickyrefresh'));
});

