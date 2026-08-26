/**
 * Kitsu chapter client — builds the volume → chapter hierarchy for a manga.
 *
 * The Kitsu manga id comes from MangaBaka's `source.kitsu.id` (see
 * `./mangabaka.ts`), which is what makes this reachable from an AniList id:
 *
 *   AniList id → MangaBaka → source.kitsu.id → Kitsu `/chapters` → volumes
 *
 * Kitsu is the only free source in the stack that publishes a **volume number per
 * chapter**. Scanlation providers give a chapter number and, with luck, a title;
 * MangaBaka gives a final volume count but no chapter→volume assignment. So the
 * volume tree on the manga page can only be built from here.
 *
 * Kitsu speaks JSON:API, so every row is `{id, type, attributes, relationships}`
 * and `filter[…]` / `page[…]` brackets must be percent-encoded or the server
 * rejects the query.
 *
 * Two upstream quirks drive the design:
 *
 *   • `meta.count` is not the chapter count. Kitsu reports a flat `5000` for
 *     Berserk (401 real chapters), so pagination must detect the end from short
 *     pages rather than trust the total — and the UI must never print it.
 *   • Rows are frequently sparse. Berserk's chapters have `canonicalTitle`,
 *     `published`, `length` and `thumbnail` all null. Every field here is
 *     therefore nullable and the title falls back to `Chapter {number}`.
 *
 * Served to the app through `GET /api/v3/mapping/manga/:anilistId/chapters`.
 */

import { memoryCache } from "../../lib/cache.js";

const KITSU_BASE = "https://kitsu.io/api/edge";

/** Kitsu caps `page[limit]` at 20 and 400s anything larger. */
const PAGE_SIZE = 20;

/**
 * Pages requested at once. Long series need many round trips (Berserk is 21
 * pages), and doing them one at a time is several seconds of dead time; five in
 * flight converges in ~5 rounds without hammering a public API.
 */
const PAGE_CONCURRENCY = 5;

/** Hard stop so a bad id or a pathological series can't page forever. */
const MAX_CHAPTERS = 3000;

const CACHE_TTL_SEC = 6 * 60 * 60; // 6 hours
const REQUEST_TIMEOUT_MS = 12_000;

// ── Wire shapes ───────────────────────────────────────────────────────────────

interface RawChapterAttributes {
  createdAt?: string | null;
  updatedAt?: string | null;
  synopsis?: string | null;
  description?: string | null;
  titles?: Record<string, string | null> | null;
  canonicalTitle?: string | null;
  volumeNumber?: number | null;
  number?: number | null;
  /** `YYYY-MM-DD`. */
  published?: string | null;
  /** Page count. Kitsu documents it as a string; it arrives as either. */
  length?: number | string | null;
  thumbnail?: {
    original?: string | null;
    meta?: { dimensions?: Record<string, { width?: number; height?: number }> | null } | null;
  } | null;
}

interface RawChapter {
  id?: string;
  type?: string;
  attributes?: RawChapterAttributes;
}

interface RawChapterPage {
  data?: RawChapter[];
  meta?: { count?: number };
  links?: { next?: string; last?: string };
}

// ── Normalized shapes ─────────────────────────────────────────────────────────

export interface KitsuChapter {
  /** Kitsu's own chapter id — stable, useful as a React key. */
  kitsuId: string;
  /** Chapter number. `null` on rows Kitsu never numbered. */
  number: number | null;
  /** Volume this chapter belongs to, or `null` when unassigned. */
  volumeNumber: number | null;
  /** `canonicalTitle` when present, else `Chapter {number}`. */
  title: string;
  /** True when the title is the generated fallback rather than a real one. */
  isGeneratedTitle: boolean;
  titles: Record<string, string>;
  synopsis: string | null;
  /** `YYYY-MM-DD`. */
  published: string | null;
  /** Page count. */
  pageCount: number | null;
  thumbnail: string | null;
  thumbnailWidth: number | null;
  thumbnailHeight: number | null;
}

export interface KitsuVolume {
  /** `null` groups every chapter Kitsu left unassigned. */
  volumeNumber: number | null;
  label: string;
  chapters: KitsuChapter[];
  firstChapter: number | null;
  lastChapter: number | null;
  /** Earliest and latest `published` among this volume's chapters. */
  publishedStart: string | null;
  publishedEnd: string | null;
}

export interface KitsuChapterHierarchy {
  kitsuMangaId: number;
  /** Flat list, ascending by number. */
  chapters: KitsuChapter[];
  /** Volumes ascending; the unassigned bucket, if any, sorts last. */
  volumes: KitsuVolume[];
  /** Real chapter count — derived from the rows fetched, never from `meta.count`. */
  totalChapters: number;
  /** Volume count, excluding the unassigned bucket. */
  totalVolumes: number;
  /** True when the `MAX_CHAPTERS` guard cut the list short. */
  truncated: boolean;
}

// ── Normalization ─────────────────────────────────────────────────────────────

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeChapter(raw: RawChapter): KitsuChapter | null {
  const kitsuId = toText(raw?.id);
  if (!kitsuId) return null;

  const attrs = raw.attributes ?? {};
  const number = toNumber(attrs.number);

  const titles: Record<string, string> = {};
  for (const [tag, value] of Object.entries(attrs.titles ?? {})) {
    const text = toText(value);
    if (text) titles[tag] = text;
  }

  const canonical = toText(attrs.canonicalTitle);

  // `meta.dimensions` keys vary by asset (`large`, `medium`, `small`, `tiny`,
  // `original`); take whichever is present rather than guessing one.
  const dimensions = Object.values(attrs.thumbnail?.meta?.dimensions ?? {})[0];

  return {
    kitsuId,
    number,
    volumeNumber: toNumber(attrs.volumeNumber),
    title: canonical ?? (number !== null ? `Chapter ${number}` : "Chapter"),
    isGeneratedTitle: !canonical,
    titles,
    // `synopsis` is the short form and `description` the long one; either beats
    // showing nothing, and on Kitsu they are usually identical when both exist.
    synopsis: toText(attrs.synopsis) ?? toText(attrs.description),
    published: toText(attrs.published),
    pageCount: toNumber(attrs.length),
    thumbnail: toText(attrs.thumbnail?.original),
    thumbnailWidth: toNumber(dimensions?.width),
    thumbnailHeight: toNumber(dimensions?.height),
  };
}

/**
 * Group a flat chapter list into volumes.
 *
 * Chapters Kitsu never assigned to a volume land in a single `null` bucket that
 * sorts last, so they stay reachable instead of being dropped or silently folded
 * into volume 1.
 */
export function buildChapterHierarchy(
  chapters: KitsuChapter[],
  kitsuMangaId: number,
  truncated = false,
): KitsuChapterHierarchy {
  const ordered = [...chapters].sort((a, b) => {
    // Unnumbered chapters sort last within their volume rather than to the front,
    // which is where `null` would land under a naive numeric compare.
    if (a.number === null && b.number === null) return 0;
    if (a.number === null) return 1;
    if (b.number === null) return -1;
    return a.number - b.number;
  });

  const buckets = new Map<number | null, KitsuChapter[]>();
  for (const chapter of ordered) {
    const key = chapter.volumeNumber;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(chapter);
    else buckets.set(key, [chapter]);
  }

  const volumes: KitsuVolume[] = Array.from(buckets.entries())
    .map(([volumeNumber, list]) => {
      const numbers = list.map((c) => c.number).filter((n): n is number => n !== null);
      const dates = list
        .map((c) => c.published)
        .filter((d): d is string => Boolean(d))
        .sort();
      return {
        volumeNumber,
        label: volumeNumber === null ? "Unassigned" : `Volume ${volumeNumber}`,
        chapters: list,
        firstChapter: numbers.length > 0 ? Math.min(...numbers) : null,
        lastChapter: numbers.length > 0 ? Math.max(...numbers) : null,
        publishedStart: dates[0] ?? null,
        publishedEnd: dates.length > 0 ? dates[dates.length - 1] : null,
      };
    })
    .sort((a, b) => {
      if (a.volumeNumber === null) return 1;
      if (b.volumeNumber === null) return -1;
      return a.volumeNumber - b.volumeNumber;
    });

  return {
    kitsuMangaId,
    chapters: ordered,
    volumes,
    totalChapters: ordered.length,
    totalVolumes: volumes.filter((volume) => volume.volumeNumber !== null).length,
    truncated,
  };
}

// ── Fetching ──────────────────────────────────────────────────────────────────

async function fetchChapterPage(
  kitsuMangaId: number,
  offset: number,
): Promise<RawChapter[] | null> {
  // Brackets must be percent-encoded — Kitsu rejects the raw form.
  const params = new URLSearchParams();
  params.set("filter[mangaId]", String(kitsuMangaId));
  params.set("page[limit]", String(PAGE_SIZE));
  params.set("page[offset]", String(offset));
  params.set("sort", "number");

  try {
    const res = await fetch(`${KITSU_BASE}/chapters?${params.toString()}`, {
      headers: { Accept: "application/vnd.api+json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as RawChapterPage;
    return body?.data ?? [];
  } catch {
    return null;
  }
}

const inFlight = new Map<string, Promise<KitsuChapterHierarchy | null>>();

/**
 * Fetch every chapter for a Kitsu manga id and group it into volumes.
 *
 * Pages are requested `PAGE_CONCURRENCY` at a time and the walk stops on the
 * first round that comes back short — the only reliable end-of-list signal, since
 * `meta.count` is wrong. Returns `null` when the id has no chapters at all, so
 * callers can fall back to their provider-derived list.
 */
export async function fetchKitsuChapterHierarchy(
  kitsuMangaId: number | string | null | undefined,
  options: { force?: boolean; maxChapters?: number } = {},
): Promise<KitsuChapterHierarchy | null> {
  const id = Number(kitsuMangaId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const limit = Math.max(PAGE_SIZE, Math.min(options.maxChapters ?? MAX_CHAPTERS, MAX_CHAPTERS));
  const cacheKey = `kitsu:chapters:${id}:${limit}`;

  if (!options.force) {
    const cached = memoryCache.get<KitsuChapterHierarchy | null>(cacheKey);
    if (cached) return cached.hit;
    const pending = inFlight.get(cacheKey);
    if (pending) return pending;
  }

  const request = (async (): Promise<KitsuChapterHierarchy | null> => {
    try {
      const collected: KitsuChapter[] = [];
      let offset = 0;
      let exhausted = false;
      let truncated = false;

      while (!exhausted && collected.length < limit) {
        const offsets = Array.from({ length: PAGE_CONCURRENCY }, (_, i) => offset + i * PAGE_SIZE);
        const pages = await Promise.all(offsets.map((pageOffset) => fetchChapterPage(id, pageOffset)));

        for (const page of pages) {
          // A failed page is treated as the end rather than retried: a partial
          // hierarchy beats blocking the manga page on a flaky public API.
          if (page === null) {
            exhausted = true;
            break;
          }
          for (const row of page) {
            const chapter = normalizeChapter(row);
            if (chapter) collected.push(chapter);
          }
          if (page.length < PAGE_SIZE) exhausted = true;
        }

        offset += PAGE_CONCURRENCY * PAGE_SIZE;
      }

      if (collected.length >= limit && !exhausted) truncated = true;

      if (collected.length === 0) {
        memoryCache.set(cacheKey, null, CACHE_TTL_SEC);
        return null;
      }

      // Overlapping offsets can't happen here, but Kitsu occasionally returns a
      // row twice across pages when the underlying list shifts mid-walk.
      const unique = new Map<string, KitsuChapter>();
      for (const chapter of collected) unique.set(chapter.kitsuId, chapter);

      const hierarchy = buildChapterHierarchy([...unique.values()], id, truncated);
      memoryCache.set(cacheKey, hierarchy, CACHE_TTL_SEC);
      return hierarchy;
    } catch {
      memoryCache.set(cacheKey, null, CACHE_TTL_SEC);
      return null;
    } finally {
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, request);
  return request;
}
