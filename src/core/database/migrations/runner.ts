import { readdir, readFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from '../pool.js';
import { consoleLog } from '../../logging/ConsoleLogger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function resolveSqlDir(): Promise<string | null> {
  const candidates = [
    join(__dirname, 'sql'),
    join(process.cwd(), 'src', 'core', 'database', 'migrations', 'sql'),
    join(process.cwd(), 'dist', 'core', 'database', 'migrations', 'sql'),
  ];

  for (const dir of candidates) {
    const s = await stat(dir).catch(() => null);
    if (s?.isDirectory()) {
      return dir;
    }
  }

  return null;
}

export async function runMigrations(): Promise<number> {
  const db = getDb();

  await db`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Explicit safety guarantee for guild_config.log_channel_id and afk_users
  await db`ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS log_channel_id TEXT`.catch(() => {});
  await db`ALTER TABLE afk_users ADD COLUMN IF NOT EXISTS channel_id TEXT, ADD COLUMN IF NOT EXISTS message_id TEXT`.catch(() => {});

  const applied = await db`SELECT filename FROM _migrations ORDER BY filename`;
  const appliedSet = new Set(applied.map(r => r.filename));

  const sqlDir = await resolveSqlDir();
  if (!sqlDir) {
    consoleLog('warning', 'database', 'Could not locate SQL migrations directory.');
    return 0;
  }

  let files: string[];
  try {
    files = (await readdir(sqlDir)).filter(f => f.endsWith('.sql')).sort();
  } catch (err) {
    consoleLog('warning', 'database', `Failed to read migrations from ${sqlDir}: ${String(err)}`);
    return 0;
  }

  let count = 0;
  for (const file of files) {
    if (appliedSet.has(file)) continue;

    const rawSql = await readFile(join(sqlDir, file), 'utf-8');
    const sqlContent = rawSql.replace(/^\uFEFF/, '').trim();
    if (!sqlContent) continue;

    await db.begin(async (tx) => {
      await tx.unsafe(sqlContent);
      await tx`INSERT INTO _migrations (filename) VALUES (${file})`;
    });

    consoleLog('info', 'database', `Applied migration: ${file}`);
    count++;
  }

  return count;
}
