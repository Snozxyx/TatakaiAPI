/** Matches frontend `TatakaiAPIResponse` in src/core/content/types.ts */

export type CacheMeta = "hit" | "miss" | "stale";

export interface ApiMeta {
  page?: number;
  perPage?: number;
  total?: number;
  hasNextPage?: boolean;
  lastPage?: number;
  cache?: CacheMeta;
  ttlSec?: number;
  source?: "anilist" | "jikan" | "db" | "mixed";
  /** Optional human-readable note (e.g. admin stub messages) */
  note?: string;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: ApiMeta;
  error?: string;
}

export function jsonOk<T>(data: T, meta?: ApiMeta): ApiEnvelope<T> {
  return { success: true, data, meta };
}

export function jsonError(message: string): ApiEnvelope<null> {
  return { success: false, data: null, error: message };
}
