/**
 * A generic in-memory TTL cache.
 * Values expire after `ttlMs` milliseconds and are lazily evicted on read.
 */
export class TTLCache<K, V> {
  private cache = new Map<K, { value: V; timestamp: number }>();

  constructor(private readonly ttlMs: number) {}

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V): void {
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  invalidate(key: K): void {
    this.cache.delete(key);
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }
}
