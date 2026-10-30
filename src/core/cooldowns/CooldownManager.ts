import { constants } from '../config/constants.js';
import { AuthorityLevel } from '../../types/permission.js';

const cooldowns = new Map<string, number>();
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startCooldownCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, expiry] of cooldowns) {
      if (expiry <= now) cooldowns.delete(key);
    }
  }, constants.cooldownCleanupInterval);
  cleanupTimer.unref();
}

export function stopCooldownCleanup(): void {
  if (cleanupTimer) { clearInterval(cleanupTimer); cleanupTimer = null; }
}

export function checkCooldown(userId: string, commandName: string, cooldownSeconds: number, authority: AuthorityLevel): number {
  if (cooldownSeconds <= 0) return 0;
  if (authority >= AuthorityLevel.ServerAdmin) return 0;
  const key = `${userId}:${commandName}`;
  const expiry = cooldowns.get(key);
  const now = Date.now();
  if (expiry && expiry > now) return Math.ceil((expiry - now) / 1000);
  return 0;
}

export function setCooldown(userId: string, commandName: string, cooldownSeconds: number): void {
  if (cooldownSeconds <= 0) return;
  if (cooldowns.size >= constants.maxCooldownEntries) {
    const firstKey = cooldowns.keys().next().value;
    if (firstKey !== undefined) cooldowns.delete(firstKey);
  }
  cooldowns.set(`${userId}:${commandName}`, Date.now() + cooldownSeconds * 1000);
}

export function clearAllCooldowns(): void { cooldowns.clear(); }

export function clearCooldown(userId: string, commandName: string): void { cooldowns.delete(`${userId}:${commandName}`); }
