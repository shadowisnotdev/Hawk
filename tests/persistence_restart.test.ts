import { test } from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import dotenv from 'dotenv';

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

test('Persistence & Restart Verification: Database State Retained Across Restarts', async (t) => {
  const probeDb = createDbClient();
  let isConnected = false;

  try {
    const res = await probeDb`SELECT 1 as ok`;
    if (res[0]?.ok === 1) isConnected = true;
  } catch {
    console.log('Skipping live DB persistence assertions (no active PostgreSQL server on connection string)');
  } finally {
    await probeDb.end().catch(() => {});
  }

  if (!isConnected) return;

  const testGuildA = '777777777777777001';
  const testGuildB = '777777777777777002';
  const knownChannelId = '123456789012345678';
  const uniqueWelcomeA = 'Welcome to Guild A - Special Edition';
  const uniqueWelcomeB = 'Welcome to Guild B - VIP Edition';

  await t.test('1. Stage 1: Verify and Apply Schemas for Test', async () => {
    const db = createDbClient();
    try {
      await db.unsafe(`
        CREATE TABLE IF NOT EXISTS guild_config (
          guild_id TEXT PRIMARY KEY,
          prefix TEXT NOT NULL DEFAULT '!',
          log_channel_id TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS welcome_configs (
          guild_id TEXT PRIMARY KEY,
          greet_channel_id TEXT,
          greet_payload TEXT,
          greet_enabled BOOLEAN NOT NULL DEFAULT true,
          leave_channel_id TEXT,
          leave_payload TEXT,
          leave_enabled BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
    } finally {
      await db.end();
    }
  });

  await t.test('2. Stage 2-4: Seed Multiple Guilds with Distinct Configurations', async () => {
    const db = createDbClient();
    try {
      const payloadA = JSON.stringify({
        content: uniqueWelcomeA,
        embed: { title: 'Guild A Rules', description: 'Read them!' },
      });

      const payloadB = JSON.stringify({
        content: uniqueWelcomeB,
        embed: { title: 'Guild B Rules', description: 'Be nice!' },
      });

      await db`
        INSERT INTO guild_config (guild_id, prefix, log_channel_id)
        VALUES (${testGuildA}, '?', ${knownChannelId})
        ON CONFLICT (guild_id) DO UPDATE SET prefix = '?', log_channel_id = ${knownChannelId}
      `;

      await db`
        INSERT INTO guild_config (guild_id, prefix, log_channel_id)
        VALUES (${testGuildB}, '.', ${knownChannelId})
        ON CONFLICT (guild_id) DO UPDATE SET prefix = '.', log_channel_id = ${knownChannelId}
      `;

      await db`
        INSERT INTO welcome_configs (guild_id, greet_channel_id, greet_payload, greet_enabled)
        VALUES (${testGuildA}, ${knownChannelId}, ${payloadA}, true)
        ON CONFLICT (guild_id) DO UPDATE SET
          greet_channel_id = EXCLUDED.greet_channel_id,
          greet_payload = EXCLUDED.greet_payload,
          greet_enabled = EXCLUDED.greet_enabled
      `;

      await db`
        INSERT INTO welcome_configs (guild_id, greet_channel_id, greet_payload, greet_enabled)
        VALUES (${testGuildB}, ${knownChannelId}, ${payloadB}, false)
        ON CONFLICT (guild_id) DO UPDATE SET
          greet_channel_id = EXCLUDED.greet_channel_id,
          greet_payload = EXCLUDED.greet_payload,
          greet_enabled = EXCLUDED.greet_enabled
      `;
    } finally {
      await db.end();
    }
  });

  await t.test('3. Stage 5: Hard Simulated Process Restart (Brand New DB Pool Instance)', async () => {
    const db = createDbClient();
    try {
      const probe = await db`SELECT 1 as reconnected`;
      assert.equal(probe[0]?.reconnected, 1);
    } finally {
      await db.end();
    }
  });

  await t.test('4. Stage 6-8: Read Values Back from Fresh Process and Assert 100% Retention', async () => {
    const db = createDbClient();
    try {
      const rowA = await db`SELECT guild_id, greet_channel_id, greet_payload, greet_enabled FROM welcome_configs WHERE guild_id = ${testGuildA}`;
      assert.equal(rowA.length, 1);
      assert.equal(rowA[0].greet_enabled, true);
      assert.equal(rowA[0].greet_channel_id, knownChannelId);
      assert.ok(rowA[0].greet_payload.includes(uniqueWelcomeA));

      const rowB = await db`SELECT guild_id, greet_channel_id, greet_payload, greet_enabled FROM welcome_configs WHERE guild_id = ${testGuildB}`;
      assert.equal(rowB.length, 1);
      assert.equal(rowB[0].greet_enabled, false);
      assert.equal(rowB[0].greet_channel_id, knownChannelId);
      assert.ok(rowB[0].greet_payload.includes(uniqueWelcomeB));
      assert.notEqual(rowB[0].greet_payload, rowA[0].greet_payload);

      const cfgA = await db`SELECT prefix FROM guild_config WHERE guild_id = ${testGuildA}`;
      assert.equal(cfgA[0]?.prefix, '?');

      const cfgB = await db`SELECT prefix FROM guild_config WHERE guild_id = ${testGuildB}`;
      assert.equal(cfgB[0]?.prefix, '.');
    } finally {
      await db.end();
    }
  });

  await t.test('5. Cleanup Test Guild Rows', async () => {
    const db = createDbClient();
    try {
      await db`DELETE FROM welcome_configs WHERE guild_id = ${testGuildA} OR guild_id = ${testGuildB}`;
      await db`DELETE FROM guild_config WHERE guild_id = ${testGuildA} OR guild_id = ${testGuildB}`;
    } finally {
      await db.end();
    }
  });
});
