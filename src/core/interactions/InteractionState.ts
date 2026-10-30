import { constants } from '../config/constants.js';

interface StateEntry<T = unknown> { data: T; userId: string; expiresAt: number; }

const store = new Map<string, StateEntry>();
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startInteractionCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => { const now = Date.now(); for (const [key, entry] of store) { if (entry.expiresAt <= now) store.delete(key); } }, 60_000);
  cleanupTimer.unref();
}

export function stopInteractionCleanup(): void { if (cleanupTimer) { clearInterval(cleanupTimer); cleanupTimer = null; } }

export function setState<T>(key: string, userId: string, data: T, ttlMs: number = constants.interactionStateTtl): void {
  if (store.size >= constants.maxInteractionStates) { const firstKey = store.keys().next().value; if (firstKey !== undefined) store.delete(firstKey); }
  store.set(key, { data, userId, expiresAt: Date.now() + ttlMs });
}

export function getState<T>(key: string, userId: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) { store.delete(key); return null; }
  if (entry.userId !== userId) return null;
  return entry.data as T;
}

export function deleteState(key: string): void { store.delete(key); }

export function hasState(key: string): boolean {
  const entry = store.get(key);
  if (!entry) return false;
  if (entry.expiresAt <= Date.now()) { store.delete(key); return false; }
  return true;
}

export function getStateAnyUser<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) { store.delete(key); return null; }
  return entry.data as T;
}
