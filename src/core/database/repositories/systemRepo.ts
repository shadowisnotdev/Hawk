import { getDb } from '../pool.js';
import { TTLCache } from '../../utils/TTLCache.js';

export interface MaintenanceState {
  enabled: boolean;
  reason: string;
  enabledAt: Date | null;
  enabledBy: string | null;
}

const cache = new TTLCache<string, MaintenanceState>(300_000);

export async function getMaintenanceState(): Promise<MaintenanceState> {
  const cached = cache.get('maintenance');
  if (cached !== undefined) return cached;

  try {
    const db = getDb();
    const rows = await db`SELECT value FROM system_settings WHERE key = 'maintenance'`.catch(async () => {
      await db`
        CREATE TABLE IF NOT EXISTS system_settings (
          key TEXT PRIMARY KEY,
          value JSONB NOT NULL DEFAULT '{}'::jsonb,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `.catch(() => {});
      return await db`SELECT value FROM system_settings WHERE key = 'maintenance'`.catch(() => []);
    });

    if (rows.length === 0) {
      const state = {
        enabled: false,
        reason: 'Scheduled maintenance in progress.',
        enabledAt: null,
        enabledBy: null,
      };
      cache.set('maintenance', state);
      return state;
    }

    const val = rows[0].value as any;
    const state = {
      enabled: Boolean(val?.enabled),
      reason: val?.reason || 'Scheduled maintenance in progress.',
      enabledAt: val?.enabledAt ? new Date(val.enabledAt) : null,
      enabledBy: val?.enabledBy || null,
    };
    cache.set('maintenance', state);
    return state;
  } catch {
    return {
      enabled: false,
      reason: 'Scheduled maintenance in progress.',
      enabledAt: null,
      enabledBy: null,
    };
  }
}

export async function setMaintenanceState(
  enabled: boolean,
  reason = 'Scheduled maintenance in progress.',
  enabledBy: string | null = null,
): Promise<void> {
  const payload = {
    enabled,
    reason,
    enabledAt: enabled ? new Date().toISOString() : null,
    enabledBy,
  };

  const db = getDb();
  try {
    await db`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ('maintenance', ${JSON.stringify(payload)}::jsonb, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = ${JSON.stringify(payload)}::jsonb, updated_at = NOW()
    `;
  } catch (err: any) {
    if (err?.code === '42P01') {
      await db`
        CREATE TABLE IF NOT EXISTS system_settings (
          key TEXT PRIMARY KEY,
          value JSONB NOT NULL DEFAULT '{}'::jsonb,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `.catch(() => {});
      await db`
        INSERT INTO system_settings (key, value, updated_at)
        VALUES ('maintenance', ${JSON.stringify(payload)}::jsonb, NOW())
        ON CONFLICT (key)
        DO UPDATE SET value = ${JSON.stringify(payload)}::jsonb, updated_at = NOW()
      `;
    } else {
      throw err;
    }
  }

  cache.set('maintenance', {
    enabled,
    reason,
    enabledAt: enabled ? new Date() : null,
    enabledBy,
  });
}

export function invalidateMaintenanceCache(): void {
  cache.invalidate('maintenance');
}
