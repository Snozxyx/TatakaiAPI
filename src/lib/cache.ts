import type { CacheMeta } from "./envelope.js";
import { env } from "../config/env.js";

interface Entry<T> {
  value: T;
  expiresAt: number;
  staleAt: number;
}

/** Simple in-memory stale-while-revalidate cache */
export class MemoryCache {
  private map = new Map<string, Entry<unknown>>();

  get<T>(key: string): { hit: T; meta: CacheMeta } | null {
    const e = this.map.get(key) as Entry<T> | undefined;
    if (!e) return null;
    const now = Date.now();
    if (now > e.expiresAt) {
      this.map.delete(key);
      return null;
    }
    const meta: CacheMeta = now > e.staleAt ? "stale" : "hit";
    return { hit: e.value, meta };
  }

  set<T>(key: string, value: T, ttlSec: number, staleRatio = 0.85): void {
    const ttlMs = ttlSec * 1000;
    const staleAt = Date.now() + ttlMs * staleRatio;
    const expiresAt = Date.now() + ttlMs;
    this.map.set(key, { value, expiresAt, staleAt });
  }

  delete(key: string) {
    this.map.delete(key);
  }
}

export const memoryCache = new MemoryCache();

export function defaultTtlSec(): number {
  return env.CACHE_DEFAULT_TTL_SEC;
}
