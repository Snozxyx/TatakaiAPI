/**
 * MangaBaka mapping client.
 *
 * `GET https://api.mangabaka.org/v1/source/anilist/{id}` maps an AniList manga id
 * to MangaBaka's merged series record. It is to manga what ani.zip is to anime:
 * one request returning cross-site ids plus much richer metadata than AniList
 * carries — publisher lists split by territory, a volume count, a weighted tag
 * tree, localized titles with provenance, and a rating aggregated across seven
 * trackers.
 *
 * The Kitsu id in `source.kitsu.id` is what the chapter hierarchy is built from —
 * see `./kitsu.ts`.
 *
 * Two things about the payload are worth knowing before reading the code:
 *   • `data.series` is an **array**, not an object. Ambiguous source ids can map
 *     to several series, so the first active entry is the answer.
 *   • `genres_v2` is frequently `null` even on major series (it is on Berserk)
 *     while `tags_v2` is fully populated. Anything showing genres must fall back
 *     to the v1 `genres` slugs, or it renders an empty row.
 *
 * Served to the app through `GET /api/v3/mapping/manga/:anilistId/mangabaka`.
 */

import { memoryCache } from "../../lib/cache.js";

const MANGABAKA_BASE = "https://api.mangabaka.org";
const CACHE_TTL_SEC = 6 * 60 * 60; // 6 hours — series metadata is near-static
const REQUEST_TIMEOUT_MS = 12_000;

// ── Wire shapes ───────────────────────────────────────────────────────────────

interface RawCoverVariants {
  x1?: string;
  x2?: string;
  x3?: string;
}

interface RawCover {
  raw?: {
    url?: string;
    width?: number;
    height?: number;
    blurhash?: string;
    thumbhash?: string;
    format?: string;
  };
  x150?: RawCoverVariants;
  x250?: RawCoverVariants;
  x350?: RawCoverVariants;
}

interface RawTitle {
  language?: string;
  traits?: string[];
  title?: string;
  note?: string | null;
  is_primary?: boolean;
}

interface RawTag {
  id?: number;
  name?: string;
  name_path?: string;
  level?: number;
  weight?: string;
  is_spoiler?: boolean;
  is_genre?: boolean;
}

interface RawPublisher {
  name?: string;
  type?: string;
  note?: string;
}

interface RawLink {
  url?: string;
  name?: string;
  name_display?: string;
  type?: string;
  language?: string;
}

interface RawSeries {
  id?: number;
  state?: string;
  merged_with?: number | null;
  title?: string;
  native_title?: string | null;
  romanized_title?: string | null;
  secondary_titles?: Record<string, Array<{ type?: string; title?: string; note?: string | null }>>;
  titles?: RawTitle[];
  cover?: RawCover;
  authors?: string[];
  artists?: string[];
  publishers?: RawPublisher[];
  description?: string | null;
  year?: number | null;
  published?: { start_date?: string | null; end_date?: string | null };
  status?: string | null;
  is_licensed?: boolean;
  has_anime?: boolean;
  anime?: { start?: string | null; end?: string | null } | null;
  content_rating?: string | null;
  type?: string | null;
  rating?: number | null;
  popularity?: { global?: { current?: number | null } } | null;
  final_volume?: number | string | null;
  total_chapters?: number | string | null;
  links?: string[];
  links_v2?: RawLink[];
  genres?: string[];
  genres_v2?: Array<{ name?: string }> | null;
  tags?: string[];
  tags_v2?: RawTag[];
  last_updated_at?: string | null;
  source?: Record<
    string,
    { id?: number | string; rating?: number | null; rating_normalized?: number | null }
  >;
}

interface RawResponse {
  status?: number;
  data?: { series?: RawSeries[] };
}

// ── Normalized shapes ─────────────────────────────────────────────────────────

export interface MangaBakaTag {
  id: number | null;
  name: string;
  /** `"Activities > Conflict > Duels"` — the tag's place in MangaBaka's tree. */
  path: string | null;
  /** `core` | `defining` | `incidental` — how central the tag is to the series. */
  weight: string | null;
  isSpoiler: boolean;
}

export interface MangaBakaPublisher {
  name: string;
  /** `Original` | `English` | `Other` — the territory this publisher covers. */
  type: string | null;
  note: string | null;
}

export interface MangaBakaLink {
  url: string;
  label: string;
  type: string | null;
  language: string | null;
}

export interface MangaBakaSourceId {
  id: string;
  rating: number | null;
  /** Rating rescaled to 0–100 so sources with different scales are comparable. */
  ratingNormalized: number | null;
}

export interface MangaBakaCover {
  /** Full-resolution original. Extensionless — do not append a file suffix. */
  original: string | null;
  small: string | null;
  medium: string | null;
  large: string | null;
  width: number | null;
  height: number | null;
  blurhash: string | null;
}

export interface MangaBakaSeries {
  mangaBakaId: number | null;
  title: string;
  nativeTitle: string | null;
  romanizedTitle: string | null;
  /** Distinct titles across languages, best-first. Feeds alias search. */
  aliases: string[];
  localizedTitles: Array<{ language: string; title: string; traits: string[]; isPrimary: boolean }>;
  description: string | null;
  cover: MangaBakaCover;
  authors: string[];
  artists: string[];
  publishers: MangaBakaPublisher[];
  /** Human-readable genre labels, from `genres_v2` or the v1 slug list. */
  genres: string[];
  tags: MangaBakaTag[];
  status: string | null;
  contentRating: string | null;
  type: string | null;
  year: number | null;
  publishedStart: string | null;
  publishedEnd: string | null;
  /** 0–100. */
  rating: number | null;
  popularityRank: number | null;
  totalChapters: number | null;
  totalVolumes: number | null;
  isLicensed: boolean;
  hasAnime: boolean;
  /** Where an anime adaptation starts and stops in the manga, in prose. */
  animeCoverage: { start: string | null; end: string | null } | null;
  links: MangaBakaLink[];
  /** Per-tracker ids and ratings, keyed `anilist`, `kitsu`, `my_anime_list`, … */
  sources: Record<string, MangaBakaSourceId>;
  /** Convenience accessor — the id the chapter hierarchy is built from. */
  kitsuId: number | null;
  malId: number | null;
  anilistId: number | null;
  lastUpdatedAt: string | null;
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

/** `"award_winning"` → `"Award Winning"`. MangaBaka's v1 genres are slugs. */
function humanizeSlug(slug: string): string {
  return slug
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function normalizeCover(raw: RawCover | undefined): MangaBakaCover {
  // Prefer @2x within each size bucket: the cards render at 150–350 CSS px, so
  // the 1x asset is visibly soft on any modern display.
  const pick = (variants: RawCoverVariants | undefined) =>
    toText(variants?.x2) ?? toText(variants?.x1) ?? toText(variants?.x3);
  return {
    original: toText(raw?.raw?.url),
    small: pick(raw?.x150),
    medium: pick(raw?.x250),
    large: pick(raw?.x350),
    width: toNumber(raw?.raw?.width),
    height: toNumber(raw?.raw?.height),
    blurhash: toText(raw?.raw?.blurhash),
  };
}

function normalizeGenres(raw: RawSeries): string[] {
  // `genres_v2` is the newer, labelled list but is null on plenty of series
  // (Berserk included), so the v1 slug list is a required fallback, not an
  // optional one.
  const v2 = (raw.genres_v2 ?? [])
    .map((entry) => toText(entry?.name))
    .filter((name): name is string => Boolean(name));
  if (v2.length > 0) return v2;
  return (raw.genres ?? []).map((slug) => humanizeSlug(String(slug))).filter(Boolean);
}

function normalizeTags(raw: RawSeries): MangaBakaTag[] {
  const weightRank: Record<string, number> = { defining: 0, core: 1, incidental: 2 };
  return (raw.tags_v2 ?? [])
    .map((tag) => ({
      id: toNumber(tag?.id),
      name: toText(tag?.name) ?? "",
      path: toText(tag?.name_path),
      weight: toText(tag?.weight),
      isSpoiler: Boolean(tag?.is_spoiler),
    }))
    .filter((tag) => tag.name)
    // Most-defining first so a UI can show the top N and mean it.
    .sort((a, b) => (weightRank[a.weight ?? ""] ?? 3) - (weightRank[b.weight ?? ""] ?? 3));
}

function normalizeAliases(raw: RawSeries): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (value: unknown) => {
    const text = String(value ?? "").trim();
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(text);
  };

  push(raw.title);
  push(raw.romanized_title);
  push(raw.native_title);
  for (const entry of raw.titles ?? []) push(entry?.title);
  for (const group of Object.values(raw.secondary_titles ?? {})) {
    for (const entry of group ?? []) push(entry?.title);
  }
  return out;
}

function normalizeSources(raw: RawSeries): Record<string, MangaBakaSourceId> {
  const out: Record<string, MangaBakaSourceId> = {};
  for (const [key, value] of Object.entries(raw.source ?? {})) {
    const id = toText(value?.id);
    if (!id) continue;
    out[key] = {
      id,
      rating: toNumber(value?.rating),
      ratingNormalized: toNumber(value?.rating_normalized),
    };
  }
  return out;
}

function normalizeLinks(raw: RawSeries): MangaBakaLink[] {
  // Prefer `links_v2` — it carries a display name, a type and a language, where
  // `links` is a bare URL array. Fall back so older records stay clickable.
  const v2 = (raw.links_v2 ?? [])
    .map((link) => ({
      url: toText(link?.url) ?? "",
      label: toText(link?.name_display) ?? toText(link?.name) ?? toText(link?.url) ?? "",
      type: toText(link?.type),
      language: toText(link?.language),
    }))
    .filter((link) => link.url);
  if (v2.length > 0) return v2;

  return (raw.links ?? [])
    .map((url) => String(url ?? "").trim())
    .filter(Boolean)
    .map((url) => ({ url, label: hostnameOf(url) ?? url, type: null, language: null }));
}

export function normalizeMangaBakaSeries(raw: RawSeries): MangaBakaSeries {
  const sources = normalizeSources(raw);

  return {
    mangaBakaId: toNumber(raw.id),
    title: toText(raw.title) ?? toText(raw.romanized_title) ?? toText(raw.native_title) ?? "",
    nativeTitle: toText(raw.native_title),
    romanizedTitle: toText(raw.romanized_title),
    aliases: normalizeAliases(raw),
    localizedTitles: (raw.titles ?? [])
      .map((entry) => ({
        language: toText(entry?.language) ?? "unknown",
        title: toText(entry?.title) ?? "",
        traits: Array.isArray(entry?.traits) ? entry!.traits!.map(String) : [],
        isPrimary: Boolean(entry?.is_primary),
      }))
      .filter((entry) => entry.title),
    description: toText(raw.description),
    cover: normalizeCover(raw.cover),
    authors: (raw.authors ?? []).map(String).filter(Boolean),
    artists: (raw.artists ?? []).map(String).filter(Boolean),
    publishers: (raw.publishers ?? [])
      .map((publisher) => ({
        name: toText(publisher?.name) ?? "",
        type: toText(publisher?.type),
        note: toText(publisher?.note),
      }))
      .filter((publisher) => publisher.name),
    genres: normalizeGenres(raw),
    tags: normalizeTags(raw),
    status: toText(raw.status),
    contentRating: toText(raw.content_rating),
    type: toText(raw.type),
    year: toNumber(raw.year),
    publishedStart: toText(raw.published?.start_date),
    publishedEnd: toText(raw.published?.end_date),
    rating: toNumber(raw.rating),
    popularityRank: toNumber(raw.popularity?.global?.current),
    totalChapters: toNumber(raw.total_chapters),
    totalVolumes: toNumber(raw.final_volume),
    isLicensed: Boolean(raw.is_licensed),
    hasAnime: Boolean(raw.has_anime),
    animeCoverage: raw.anime
      ? { start: toText(raw.anime.start), end: toText(raw.anime.end) }
      : null,
    links: normalizeLinks(raw),
    sources,
    kitsuId: toNumber(sources.kitsu?.id),
    malId: toNumber(sources.my_anime_list?.id),
    anilistId: toNumber(sources.anilist?.id),
    lastUpdatedAt: toText(raw.last_updated_at),
  };
}

// ── Fetching ──────────────────────────────────────────────────────────────────

/** Sources MangaBaka can be queried by. */
export type MangaBakaSource =
  | "anilist"
  | "my_anime_list"
  | "kitsu"
  | "manga_updates"
  | "anime_planet";

const inFlight = new Map<string, Promise<MangaBakaSeries | null>>();

/**
 * Resolve an external manga id to a MangaBaka series.
 *
 * Resolves to `null` on any failure or miss: this is enrichment layered on top of
 * AniList data, so a manga MangaBaka has never heard of must still render. Misses
 * are cached so an unmapped series does not re-request on every page view.
 */
export async function fetchMangaBakaSeries(
  sourceId: number | string | null | undefined,
  options: { source?: MangaBakaSource; force?: boolean } = {},
): Promise<MangaBakaSeries | null> {
  const source = options.source ?? "anilist";
  const id = String(sourceId ?? "").trim();
  if (!id || id === "0") return null;

  const cacheKey = `mangabaka:${source}:${id}`;
  if (!options.force) {
    const cached = memoryCache.get<MangaBakaSeries | null>(cacheKey);
    if (cached) return cached.hit;
    const pending = inFlight.get(cacheKey);
    if (pending) return pending;
  }

  const request = (async (): Promise<MangaBakaSeries | null> => {
    try {
      const res = await fetch(
        `${MANGABAKA_BASE}/v1/source/${source}/${encodeURIComponent(id)}`,
        { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
      );
      if (!res.ok) {
        memoryCache.set(cacheKey, null, CACHE_TTL_SEC);
        return null;
      }
      const body = (await res.json()) as RawResponse;
      const list = body?.data?.series ?? [];

      // An ambiguous id can return several series. Prefer an active one; a merged
      // or deleted record points elsewhere and its fields are usually stale.
      const chosen = list.find((entry) => entry?.state === "active") ?? list[0];
      if (!chosen) {
        memoryCache.set(cacheKey, null, CACHE_TTL_SEC);
        return null;
      }

      const series = normalizeMangaBakaSeries(chosen);
      memoryCache.set(cacheKey, series, CACHE_TTL_SEC);
      return series;
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

/**
 * Search MangaBaka series by tag name.
 * Returns series that match the tag, converted to AniList-compatible format.
 */
export async function fetchMangaBakaSeriesByTag(
  tagName: string,
  options: { limit?: number; force?: boolean } = {},
): Promise<Array<{
  anilistId?: number;
  titleEnglish?: string;
  titleRomaji?: string;
  titleNative?: string;
  coverImageLarge?: string;
  coverImageMedium?: string;
  averageScore?: number;
  popularity?: number;
  status?: string;
  chapters?: number;
  volumes?: number;
  genres?: string[];
  countryOfOrigin?: string;
  isAdult?: boolean;
}>> {
  const normalized = String(tagName || "").trim();
  if (!normalized) return [];

  const cacheKey = `mangabaka:tag:${normalized}`;
  const limit = options.limit ?? 20;

  if (!options.force) {
    const cached = memoryCache.get<any[]>(cacheKey);
    if (cached) return cached.hit.slice(0, limit);
  }

  try {
    // MangaBaka doesn't have a direct tag search endpoint, so we'll use their search API
    // and filter by tags on the results. This is a workaround until they add tag filtering.
    const res = await fetch(
      `${MANGABAKA_BASE}/v1/search?q=${encodeURIComponent(normalized)}&limit=${limit * 2}`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
    );

    if (!res.ok) {
      memoryCache.set(cacheKey, [], CACHE_TTL_SEC);
      return [];
    }

    const body = (await res.json()) as RawResponse;
    const list = body?.data?.series ?? [];

    // Filter series that have the tag in their tags_v2 or tags array
    const matchingTag = normalized.toLowerCase();
    const filtered = list
      .filter((series) => {
        const tags = (series?.tags_v2 ?? [])
          .map(t => String(t?.name || "").toLowerCase())
          .concat((series?.tags ?? []).map(t => String(t).toLowerCase()));
        return tags.some(tag => tag.includes(matchingTag) || matchingTag.includes(tag));
      })
      .slice(0, limit);

    // Convert to AniList-compatible format
    const converted = filtered.map((series) => {
      const sources = normalizeSources(series);
      return {
        anilistId: toNumber(sources.anilist?.id) ?? undefined,
        titleEnglish: toText(series.title) ?? undefined,
        titleRomaji: toText(series.romanized_title) ?? undefined,
        titleNative: toText(series.native_title) ?? undefined,
        coverImageLarge: normalizeCover(series.cover).large ?? undefined,
        coverImageMedium: normalizeCover(series.cover).medium ?? undefined,
        averageScore: toNumber(series.rating) ?? undefined,
        popularity: toNumber(series.popularity?.global?.current) ?? undefined,
        status: toText(series.status) ?? undefined,
        chapters: toNumber(series.total_chapters) ?? undefined,
        volumes: toNumber(series.final_volume) ?? undefined,
        genres: normalizeGenres(series),
        countryOfOrigin: toText(series.type) ?? undefined,
        isAdult: series.content_rating !== "safe",
      };
    }).filter(s => s.anilistId); // Only include series with AniList IDs

    memoryCache.set(cacheKey, converted, CACHE_TTL_SEC);
    return converted;
  } catch (err) {
    console.warn("[MangaBaka] Tag search failed:", err);
    memoryCache.set(cacheKey, [], CACHE_TTL_SEC);
    return [];
  }
}
