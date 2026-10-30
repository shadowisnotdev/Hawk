import { test } from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import dotenv from 'dotenv';

import { getPrefix, getLogChannel } from '../src/core/database/repositories/guildConfigRepo.js';
import { getWelcomeConfig } from '../src/core/database/repositories/welcomeRepo.js';
import { getSticky } from '../src/core/database/repositories/stickyRepo.js';
import { isMediaChannel, getMediaAutoThread } from '../src/core/database/repositories/mediaRepo.js';
import { getPermitsForGuild, hasPermit } from '../src/core/database/repositories/permissionRepo.js';
import { getGamePing } from '../src/core/database/repositories/gameRepo.js';
import { getSuggestionChannel } from '../src/core/database/repositories/suggestionRepo.js';

dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  'postgresql://postgres:postgres@localhost:5432/hawk';

const isLocalOrDisabled =
  connectionString.includes('localhost') ||
  connectionString.includes('127.0.0.1') ||
  connectionString.includes('sslmode=disable') ||
  connectionString.includes('ssl=false');

const isExplicitSsl =
  connectionString.includes('sslmode=require') ||
  connectionString.includes('ssl=true') ||
  connectionString.includes('neon.tech') ||
  connectionString.includes('supabase.co');

const sslMode = isLocalOrDisabled ? false : isExplicitSsl ? 'require' : 'prefer';

function createDbClient() {
  return postgres(connectionString, {
    max: 2,
    idle_timeout: 5,
    connect_timeout: 5,
    ssl: sslMode,
    prepare: false,
    onnotice: () => {},
  });
}

test('Database Sync Verification: Bot Repositories', async (t) => {
  const probeDb = createDbClient();
  let isConnected = false;

  try {
    const res = await probeDb`SELECT 1 as ok`;
    if (res[0]?.ok === 1) isConnected = true;
  } catch {
    console.log('Skipping live DB assertions (no active PostgreSQL server on connection string)');
  } finally {
    await probeDb.end().catch(() => {});
  }

  if (!isConnected) return;

  const testGuildId = '888888888888888001';
  const testUserId = '111111111111111001';
  const testRoleId = '222222222222222001';
  const testChannelId = '333333333333333001';

  const db = createDbClient();

  // Cleanup any old test artifacts
  const cleanup = async () => {
    await db`DELETE FROM guild_config WHERE guild_id = ${testGuildId}`.catch(() => {});
    await db`DELETE FROM welcome_configs WHERE guild_id = ${testGuildId}`.catch(() => {});
    await db`DELETE FROM sticky_messages WHERE guild_id = ${testGuildId}`.catch(() => {});
    await db`DELETE FROM media_channels WHERE guild_id = ${testGuildId}`.catch(() => {});
    await db`DELETE FROM media_guild_configs WHERE guild_id = ${testGuildId}`.catch(() => {});
    await db`DELETE FROM permits WHERE guild_id = ${testGuildId}`.catch(() => {});
    await db`DELETE FROM game_pings WHERE guild_id = ${testGuildId}`.catch(() => {});
    await db`DELETE FROM suggestion_configs WHERE guild_id = ${testGuildId}`.catch(() => {});
  };

  await cleanup();

  try {
    // 1. General Settings Module
    await t.test('1. General Settings: Prefix and Log Channel', async () => {
      await db`
        INSERT INTO guild_config (guild_id, prefix, log_channel_id)
        VALUES (${testGuildId}, '!', ${testChannelId})
        ON CONFLICT (guild_id) DO UPDATE SET prefix = '!', log_channel_id = ${testChannelId}
      `;

      const prefix = await getPrefix(testGuildId);
      assert.equal(prefix, '!', 'Bot should read updated prefix');

      const logChannel = await getLogChannel(testGuildId);
      assert.equal(logChannel, testChannelId, 'Bot should read updated log channel');
    });

    // 2. Gaming LFG Module
    await t.test('2. Gaming LFG: Custom triggers', async () => {
      await db`
        INSERT INTO game_pings (guild_id, identifier, game_name, role_id, vc_id, cooldown_seconds)
        VALUES (${testGuildId}, 'val', 'Valorant Competitive', ${testRoleId}, ${testChannelId}, 600)
        ON CONFLICT (guild_id, identifier) DO UPDATE SET
          game_name = 'Valorant Competitive',
          role_id = ${testRoleId},
          vc_id = ${testChannelId},
          cooldown_seconds = 600
      `;

      const ping = await getGamePing(testGuildId, 'val');
      assert.ok(ping, 'Game ping config should be returned');
      assert.equal(ping.gameName, 'Valorant Competitive');
      assert.equal(ping.roleId, testRoleId);
      assert.equal(ping.vcId, testChannelId);
      assert.equal(ping.cooldownSeconds, 600);
    });

    // 3. Welcome Greetings Module
    await t.test('3. Welcome Greetings: Welcome configuration', async () => {
      const welcomePayload = JSON.stringify({
        content: 'Welcome to our server, {user}!',
        is_embed: false,
      });

      await db`
        INSERT INTO welcome_configs (guild_id, greet_channel_id, greet_payload, greet_enabled)
        VALUES (${testGuildId}, ${testChannelId}, ${welcomePayload}, true)
        ON CONFLICT (guild_id) DO UPDATE SET
          greet_channel_id = ${testChannelId},
          greet_payload = ${welcomePayload},
          greet_enabled = true
      `;

      const welcome = await getWelcomeConfig(testGuildId);
      assert.ok(welcome, 'Welcome config should exist');
      assert.equal(welcome.greetChannelId, testChannelId);
      assert.equal(welcome.greetEnabled, true);
      assert.equal(welcome.greetPayload, welcomePayload);
    });

    // 4. Community Tools Module (Suggestions)
    await t.test('4. Community Tools: Suggestion channels', async () => {
      await db`
        INSERT INTO suggestion_configs (guild_id, channel_id)
        VALUES (${testGuildId}, ${testChannelId})
        ON CONFLICT (guild_id) DO UPDATE SET channel_id = ${testChannelId}
      `;

      const sugChannel = await getSuggestionChannel(testGuildId);
      assert.equal(sugChannel, testChannelId, 'Bot should read suggestion channel');
    });

    // 5. Media Channels Module
    await t.test('5. Media Channels: Media channel list and auto-thread flag', async () => {
      await db`
        INSERT INTO media_channels (guild_id, channel_id)
        VALUES (${testGuildId}, ${testChannelId})
        ON CONFLICT (guild_id, channel_id) DO NOTHING
      `;

      await db`
        INSERT INTO media_guild_configs (guild_id, auto_thread)
        VALUES (${testGuildId}, false)
        ON CONFLICT (guild_id) DO UPDATE SET auto_thread = false
      `;

      const isMedia = await isMediaChannel(testGuildId, testChannelId);
      assert.equal(isMedia, true, 'Channel should be recognized as media channel');

      const autoThread = await getMediaAutoThread(testGuildId);
      assert.equal(autoThread, false, 'Auto-thread setting should be recognized');
    });

    // 6. Sticky Notices Module
    await t.test('6. Sticky Notices: Sticky messages', async () => {
      const noticeContent = 'Notice: Keep chat civil!';
      await db`
        INSERT INTO sticky_messages (guild_id, channel_id, message_id, content)
        VALUES (${testGuildId}, ${testChannelId}, '666666666666666001', ${noticeContent})
        ON CONFLICT (guild_id, channel_id) DO UPDATE SET content = ${noticeContent}
      `;

      const sticky = await getSticky(testGuildId, testChannelId);
      assert.ok(sticky, 'Sticky record should exist');
      assert.equal(sticky.content, noticeContent);
      assert.equal(sticky.channelId, testChannelId);
    });

    // 7. Permissions & Access Rules Module
    await t.test('7. Permissions & Access Rules: Command permits', async () => {
      await db`
        INSERT INTO permits (guild_id, target_type, target_id, command_name, module_name)
        VALUES (${testGuildId}, 'user', ${testUserId}, 'game', 'gaming')
        ON CONFLICT (guild_id, target_type, target_id, command_name, module_name) DO NOTHING
      `;

      const permits = await getPermitsForGuild(testGuildId);
      assert.ok(permits.some(p => p.targetId === testUserId && p.commandName === 'game'), 'Permit should be present');

      const hasPerm = await hasPermit(testGuildId, testUserId, [], 'game', 'gaming');
      assert.equal(hasPerm, true, 'Bot should grant command permit');
    });

  } finally {
    await cleanup();
    await db.end().catch(() => {});
  }
});
