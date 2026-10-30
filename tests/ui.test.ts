import test from 'node:test';
import assert from 'node:assert/strict';

test('Amo UI Theme exports borderless container settings and clean tokens', async () => {
  const { ui, AmoTheme, HawkTheme } = await import('../src/core/ui/index.js');
  assert.equal(ui.theme.container.borderless, true);
  assert.equal(ui.theme.container.accentColor, undefined);
  assert.equal(AmoTheme.colors.primary, 0x1e1f22);
  assert.equal(HawkTheme.colors.primary, 0x1e1f22);
});

test('Amo UI creates borderless containers by default', async () => {
  const { ui } = await import('../src/core/ui/index.js');
  const container = ui.container();
  assert.ok(container, 'Container should be created');
  assert.equal((container as any).data?.accent_color, undefined, 'Container accent color should be undefined for borderless look');
});

test('Amo UI standard and dashboard builders construct valid Components V2 payloads', async () => {
  const { ui } = await import('../src/core/ui/index.js');
  const standardPayload = ui.standard({
    title: 'System Notice',
    text: 'Operation completed successfully.',
  });
  assert.ok(standardPayload.components.length > 0);
  assert.ok(standardPayload.flags > 0);

  const dashPayload = ui.dashboard({
    title: 'Server Dashboard',
    description: 'Overview of system status',
    fields: [
      { name: 'Status', value: 'Online' },
      { name: 'Ping', value: '18ms' },
    ],
  });
  assert.ok(dashPayload.components.length > 0);
});

test('Amo UI customId builder and parser work correctly', async () => {
  const { ui } = await import('../src/core/ui/index.js');
  const built = ui.customId.build('v2', 'prev', '12345', 'extra');
  assert.equal(built, 'v2_prev_12345_extra');

  const parsed = ui.customId.parse(built);
  assert.equal(parsed.prefix, 'v2');
  assert.equal(parsed.action, 'prev');
  assert.equal(parsed.ownerId, '12345');
  assert.equal(parsed.extra, 'extra');

  const isOwner = ui.customId.isOwner({ user: { id: '12345' } } as any, '12345');
  assert.equal(isOwner, true);

  const isNotOwner = ui.customId.isOwner({ user: { id: '99999' } } as any, '12345');
  assert.equal(isNotOwner, false);
});

test('Amo UI status helpers generate valid V2 component payloads', async () => {
  const { ui } = await import('../src/core/ui/index.js');
  const successPayload = ui.success('Operation completed');
  assert.ok(successPayload.components.length > 0);
  assert.ok(successPayload.flags > 0);

  const errorPayload = ui.error({ text: 'Error details', title: 'Action Failed' });
  assert.ok(errorPayload.components.length > 0);
});

test('Welcome UI generates clean Components V2 payloads without emoji buttons', async () => {
  const { buildWelcomeConfigPanel } = await import('../src/modules/welcome/welcomeUI.js');
  const greetPanel = buildWelcomeConfigPanel('greet');
  assert.ok(greetPanel.components.length > 0);
  assert.ok(greetPanel.flags > 0);

  const leavePanel = buildWelcomeConfigPanel('leave');
  assert.ok(leavePanel.components.length > 0);
  assert.ok(leavePanel.flags > 0);
});
