import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './helpers/loadModule.js';
import { PermissionsBitField } from 'discord.js';
import * as cooldowns from '../src/core/cooldowns/CooldownManager.js';
import * as botErrors from '../src/core/errors/BotError.js';

test('welcome buttons and forged modal submissions deny non-managers before side effects', async () => {
 let writes = 0;
 const handler = loadModule('src/modules/welcome/_welcomeHandler.ts', { '../../core/database/repositories/welcomeRepo.js': { setGreetPayload: async () => writes++ }, './welcomeEngine.js': {}, '../../core/config/branding.js': {}, '../../core/logging/WebhookLogger.js': {}, '../../core/logging/ConsoleLogger.js': {} });
 const make = (customId: string) => ({ customId, guild: { id: 'guild' }, memberPermissions: new PermissionsBitField(0n), member: { permissions: new PermissionsBitField(0n) }, fields: { getTextInputValue: () => 'forged' }, user: { id: 'user' }, showModal: async () => writes++, reply: async (value: any) => { assert.match(value.content, /Manage Server|ManageGuild/); } });
 await handler.handleWelcomeButton(make('welcome_edit_greet'));
 await handler.handleWelcomeModal(make('welcome_modal_simple_greet'));
 assert.equal(writes, 0);
});

test('native Discord admin bypasses private permit checks but cannot use owner-only commands', async () => {
 const checker = loadModule('src/core/permissions/PermissionChecker.ts', { '../config/environment.js': { env: { botOwnerIds: [], botAdminIds: [] } }, '../database/repositories/permissionRepo.js': { getPermitsForGuild: async () => [], getLatestRevocation: async () => null }, './permitEffect.js': { resolvePermitEffect: () => null }, '../../types/permission.js': { AuthorityLevel: { Owner: 4, BotAdmin: 3, ServerAdmin: 2, Normal: 0 } } });
 const member = { permissions: new PermissionsBitField(PermissionsBitField.Flags.Administrator) };
 const context = { userId: 'admin', guildId: 'guild', guildOwnerId: 'owner', memberRoleIds: [], commandName: 'ban', moduleName: 'moderation' };
 assert.equal((await checker.checkPermission({ name: 'ban', module: 'moderation' }, context, member)).allowed, true);
 assert.equal((await checker.checkPermission({ name: 'reset', module: 'owner', ownerOnly: true }, context, member)).allowed, false);
});

test('native Administrator command access does not bypass Discord role hierarchy', () => {
 const helper = loadModule('src/modules/moderation/roleHelpers.ts', { '../../core/permissions/PermissionChecker.js': { getAuthorityLevel: (id: string) => id === 'bot-owner' ? 4 : 2 } });
 const guild = { id: 'guild', ownerId: 'guild-owner', members: { me: { roles: { highest: { position: 20 } } } } };
 const junior = { id: 'junior-admin', roles: { highest: { position: 5 } } };
 const senior = { id: 'senior-admin', roles: { highest: { position: 10 } } };
 const role = { id: 'role', position: 10, managed: false };
 assert.equal(helper.canExecutorManage(guild, junior, role), false);
 assert.equal(helper.canExecutorManage(guild, junior, undefined, senior), false);
 assert.equal(helper.canExecutorManage(guild, { ...junior, id: 'guild-owner' }, role), true);
 assert.equal(helper.canExecutorManage(guild, { ...junior, id: 'bot-owner' }, role), true);
 assert.equal(helper.isRoleManageable(guild, { ...role, position: 21 }, { ...junior, id: 'bot-owner' }), false);
});

test('AFK message hot path never edits a self-selected AFK nickname without a record', async () => {
 let renames = 0;
 const handler = loadModule('src/modules/general/_afkHandler.ts', { '../../core/database/repositories/afkRepo.js': { getAfk: () => null }, './afkUI.js': {}, './afkSanitizer.js': { removeAfkNickname: async () => renames++ }, '../../core/logging/ConsoleLogger.js': { consoleLog: () => {} } });
 const message = { guild: { id: 'guild' }, author: { id: 'user', bot: false }, member: { nickname: '[AFK] My name' }, mentions: { users: new Map() }, channel: {} };
 await handler.handleAfkMessage(message); await handler.handleAfkMessage(message);
 assert.equal(renames, 0);
});

test('command cooldown blocks overlapping executions and releases only validation failures', async () => {
 cooldowns.clearAllCooldowns();
 let executes = 0; let release!: () => void;
 let execute = async () => { executes++; await new Promise<void>(resolve => { release = resolve; }); };
 const command = { name: 'test', module: 'general', enabled: true, cooldown: 60, botPermissions: [], execute: () => execute() };
 class Respond { async warning() {} async error() {} getLastOutcome() { return 'success'; } getLastSnippet() { return ''; } }
 const executor = loadModule('src/core/commands/CommandExecutor.ts', {
  '../parser/PrefixParser.js': { parseCommand: () => ({ commandName: 'test', rawArgs: '' }) }, '../parser/ArgumentTokenizer.js': {}, './CommandRegistry.js': { resolveCommand: () => command }, './CustomCommandExecutor.js': {},
  '../permissions/PermissionChecker.js': { getAuthorityLevel: () => 0, checkPermission: async () => ({ allowed: true, authority: 0 }) }, '../restrictions/RestrictionChecker.js': { checkRestrictions: async () => ({ allowed: true }) }, '../ignore/IgnoreChecker.js': { isIgnored: async () => false },
  '../cooldowns/CooldownManager.js': cooldowns, '../responses/ResponseBuilder.js': { ResponseBuilder: Respond }, '../logging/WebhookLogger.js': { logCommand: () => {}, logEvent: () => {} }, '../logging/AuditLogger.js': { logCommandAudit: async () => {} }, '../errors/BotError.js': botErrors,
  '../database/repositories/guildConfigRepo.js': { getPrefix: async () => '!' }, '../database/repositories/gameRepo.js': {}, '../config/NoPrefixConfig.js': {}, '../presence/PresenceManager.js': { presenceManager: { recordActivity() {} } }, '../database/repositories/systemRepo.js': { getMaintenanceState: async () => ({ enabled: false }) },
 });
 const message = { author: { id: 'user', bot: false }, member: { roles: { cache: new Map() } }, guild: { id: 'guild' }, channel: { isTextBased: () => true, isDMBased: () => false }, content: '!test' };
 const first = executor.handleMessage(message);
 while (!release) await new Promise(resolve => setImmediate(resolve));
 await executor.handleMessage(message); assert.equal(executes, 1); release(); await first;
 cooldowns.clearAllCooldowns(); execute = async () => { throw new botErrors.ValidationError('bad input'); };
 await executor.handleMessage(message); assert.equal(cooldowns.checkCooldown('user', 'test', 60, 0), 0);
 execute = async () => { throw new Error('database failure'); };
 await executor.handleMessage(message); assert.ok(cooldowns.checkCooldown('user', 'test', 60, 0) > 0);
 cooldowns.clearAllCooldowns();
});

test('AFK removal preserves manual nickname changes and restores the exact original', async () => {
 let changed: unknown;
 const sanitizer = loadModule('src/modules/general/afkSanitizer.ts', { '../../core/database/repositories/afkRepo.js': { getAfk: () => null }, '../../core/logging/ConsoleLogger.js': { consoleLog() {} } });
 const member = { id: 'user', nickname: '[AFK] Test', guild: { ownerId: 'owner', members: { me: { permissions: new PermissionsBitField(PermissionsBitField.Flags.ManageNicknames), roles: { highest: { position: 10 } } } } }, roles: { highest: { position: 1 } }, setNickname: async (name: unknown) => { changed = name; } };
 const record = { nicknameSet: true, afkNickname: '[AFK] Test', originalNickname: 'Test' };
 await sanitizer.removeAfkNickname(member, record); assert.equal(changed, 'Test');
 changed = undefined; member.nickname = 'Manual change'; await sanitizer.removeAfkNickname(member, record); assert.equal(changed, undefined);
});
