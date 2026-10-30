import { constants } from '../../core/config/constants.js';

const pingCooldowns = new Map<string, number>();
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startVcCooldownCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, expiry] of pingCooldowns) {
      if (expiry <= now) pingCooldowns.delete(key);
    }
  }, constants.cooldownCleanupInterval);
  cleanupTimer.unref();
}

export function stopVcCooldownCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

function makeKey(guildId: string, identifier: string): string {
  return `${guildId}:${identifier.toLowerCase()}`;
}

export function checkVcCooldown(guildId: string, identifier: string, _vcId?: string): number {
  const key = makeKey(guildId, identifier);
  const expiry = pingCooldowns.get(key);
  const now = Date.now();
  if (expiry && expiry > now) {
    return Math.ceil((expiry - now) / 1000);
  }
  return 0;
}

export function setVcCooldown(guildId: string, identifier: string, vcIdOrSeconds: string | number, durationSeconds?: number): void {
  const seconds = typeof vcIdOrSeconds === 'number' ? vcIdOrSeconds : (durationSeconds ?? 300);
  if (seconds <= 0) return;

  if (pingCooldowns.size >= constants.maxCooldownEntries) {
    const firstKey = pingCooldowns.keys().next().value;
    if (firstKey !== undefined) pingCooldowns.delete(firstKey);
  }

  const key = makeKey(guildId, identifier);
  pingCooldowns.set(key, Date.now() + seconds * 1000);
}

export function removeVcCooldown(guildId: string, identifier?: string): void {
  if (identifier) {
    const key = makeKey(guildId, identifier);
    pingCooldowns.delete(key);
  } else {
    const prefix = `${guildId}:`;
    for (const key of pingCooldowns.keys()) {
      if (key.startsWith(prefix)) {
        pingCooldowns.delete(key);
      }
    }
  }
}

export function clearVcCooldowns(): void {
  pingCooldowns.clear();
}
