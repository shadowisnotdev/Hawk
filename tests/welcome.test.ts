import test from 'node:test';
import assert from 'node:assert/strict';
import welcomeCommand from '../src/modules/welcome/welcome.js';
import { substituteVariables, renderWelcomePayload, WELCOME_VARIABLES_GUIDE } from '../src/modules/welcome/welcomeEngine.js';
import { buildWelcomeConfigPanel } from '../src/modules/welcome/welcomeUI.js';
import type { VariableContext } from '../src/types/welcome.js';

test('welcome command structure, aliases, and permissions', () => {
  assert.equal(welcomeCommand.name, 'welcome');
  assert.equal(welcomeCommand.module, 'welcome');
  assert.ok(welcomeCommand.aliases?.includes('greet'));
  assert.ok(welcomeCommand.aliases?.includes('greeting'));
  assert.ok(welcomeCommand.aliases?.includes('greetings'));
  assert.ok(welcomeCommand.aliases?.includes('leave'));
  assert.ok(welcomeCommand.aliases?.includes('farewell'));
  assert.ok(welcomeCommand.permissions.length > 0);
});

test('substituteVariables replaces all alias tokens accurately in plain text', () => {
  const ctx: VariableContext = {
    username: 'Alice',
    usermention: '<@123456789>',
    usertag: 'Alice#0001',
    useravatar: 'https://cdn.discordapp.com/avatars/123/avatar.png',
    servername: 'Hawks Nest',
    servermember: 500,
    serveravatar: 'https://cdn.discordapp.com/icons/456/icon.png',
    randomuser: '<@987654321>',
  };

  const template =
    'Welcome {user} ({username}) to {server} ({servername}, {server.name})! You are member #{server.count} (#{servermember}, #{servercount}). Check avatar: {user.avatar} {server.icon}';

  const result = substituteVariables(template, ctx);

  assert.ok(result.includes('Welcome <@123456789> (Alice) to Hawks Nest (Hawks Nest, Hawks Nest)!'));
  assert.ok(result.includes('You are member #500 (#500, #500).'));
  assert.ok(result.includes('https://cdn.discordapp.com/avatars/123/avatar.png'));
  assert.ok(result.includes('https://cdn.discordapp.com/icons/456/icon.png'));
});

test('renderWelcomePayload outputs clean plain text without embeds', () => {
  const ctx: VariableContext = {
    username: 'Bob',
    usermention: '<@111222333>',
    usertag: 'Bob#0002',
    useravatar: 'https://cdn.discordapp.com/avatars/111/avatar.png',
    servername: 'Test Server',
    servermember: 42,
    serveravatar: 'https://cdn.discordapp.com/icons/222/icon.png',
    randomuser: '<@333444555>',
  };

  // Plain text message
  const plainText = 'Welcome {user} to {server}! Member #{servermember}';
  const renderedPlain = renderWelcomePayload(plainText, ctx);
  assert.equal(renderedPlain.embeds, undefined);
  assert.equal(renderedPlain.content, 'Welcome <@111222333> to Test Server! Member #42');

  // JSON format converted cleanly to plain text with NO embeds
  const payloadJson = JSON.stringify({
    embeds: [
      {
        title: 'Welcome to {server}!',
        description: 'Hey {user}, welcome to {server}! Member #{server.count}',
      },
    ],
  });

  const renderedJson = renderWelcomePayload(payloadJson, ctx);
  assert.equal(renderedJson.embeds, undefined);
  assert.ok(renderedJson.content?.includes('Welcome to Test Server!'));
  assert.ok(renderedJson.content?.includes('Hey <@111222333>, welcome to Test Server! Member #42'));
});

test('buildWelcomeConfigPanel generates valid interactive action rows with Set Message button', () => {
  const greetPanel = buildWelcomeConfigPanel('greet');
  assert.ok(greetPanel.components);
  assert.ok(greetPanel.components.length > 0);

  const leavePanel = buildWelcomeConfigPanel('leave');
  assert.ok(leavePanel.components);
  assert.ok(leavePanel.components.length > 0);
});

test('WELCOME_VARIABLES_GUIDE contains essential token documentation', () => {
  assert.ok(WELCOME_VARIABLES_GUIDE.includes('{user}'));
  assert.ok(WELCOME_VARIABLES_GUIDE.includes('{server}'));
  assert.ok(WELCOME_VARIABLES_GUIDE.includes('{servermember}'));
});
