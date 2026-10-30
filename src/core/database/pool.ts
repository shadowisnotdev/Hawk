import postgres from 'postgres';
import { env } from '../config/environment.js';
import { constants } from '../config/constants.js';

let sql: postgres.Sql | null = null;

export function getDb(): postgres.Sql {
  if (!sql) {
    const isLocalOrDisabled =
      env.databaseUrl.includes('localhost') ||
      env.databaseUrl.includes('127.0.0.1') ||
      env.databaseUrl.includes('sslmode=disable') ||
      env.databaseUrl.includes('ssl=false');

    const isExplicitSsl =
      env.databaseUrl.includes('sslmode=require') ||
      env.databaseUrl.includes('ssl=true') ||
      env.databaseUrl.includes('neon.tech') ||
      env.databaseUrl.includes('supabase.co');

    const sslMode = isLocalOrDisabled ? false : isExplicitSsl ? 'require' : 'prefer';

    sql = postgres(env.databaseUrl, {
      max: constants.dbPoolMax,
      idle_timeout: constants.dbIdleTimeout,
      connect_timeout: constants.dbConnectTimeout,
      max_lifetime: constants.dbMaxLifetime,
      ssl: sslMode,
      prepare: false,
      onnotice: () => {},
      keep_alive: 10,
      backoff: (attempt) => Math.min(attempt * 0.5, 2),
    });
  }
  return sql;
}

export async function validateConnection(): Promise<void> {
  const db = getDb();
  try {
    const result = await db`SELECT 1 as connected`;
    if (!result[0]?.connected) {
      throw new Error('Database validation query returned unexpected result');
    }
  } catch (error) {
    throw new Error(`Database connection failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function closeDb(): Promise<void> {
  if (sql) {
    await sql.end();
    sql = null;
  }
}
