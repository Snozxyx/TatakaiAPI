/**
 * ani.zip mapping client.
 *
 * `GET https://api.ani.zip/mappings?anilist_id={id}` returns, in one request, the
 * three things AniList does not give us well:
 *
 *   1. Per-episode metadata — real episode titles in several languages, synopsis,
 *      a TheTVDB screencap, air date in both local and UTC form, and runtime.
 *      AniList's `streamingEpisodes` has a thumbnail and a title at best, and
 *      nothing at all for unaired episodes.
 *   2. Series title aliases across ~14 languages, which is what the search index
 *      needs in order to match "Ore dake Level Up na Ken" or "나 혼자만 레벨업"
 *      to Solo Leveling.
 *   3. Cross-site ids (MAL, Kitsu, AniDB, TVDB, TMDB, IMDb, AnimePlanet…), so a
 *      single call replaces several id-resolution round trips.
 *
 * Episode keys are strings because specials are keyed `"S1"`, `"S2"`, … alongside
 * the numeric regular episodes — hence `key` plus a parsed `number`/`isSpecial`
 * rather than an array index.
 *
 * Served to the app through `GET /api/v3/mapping/anime/:anilistId/anizip` so the
 * renderer never talks to ani.zip directly: one shared cache instead of one per
 * client, one place to absorb the upstream quirks, and no third-party host in the
 * app's CSP. The wire shape here is exactly what `src/lib/mapping/anizip.ts`
 * exposes, minus the `byNumber` index (a `Map`, which JSON cannot carry — the
 * client rebuilds it).
 */

import { memoryCache } from "../../lib/cache.js";

const ANIZIP_BASE = "https://api.ani.zip";

/** Air dates are the reason to cache: they change rarely but are read constantly. */
const CACHE_TTL_SEC = 60 * 60; // 1 hour
const REQUEST_TIMEOUT_MS = 12_000;

// ── Wire shapes ───────────────────────────────────────────────────────────────

interface RawEpisode {
  tvdbShowId?: number;
  tvdbId?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  absoluteEpisodeNumber?: number;
  title?: Record<string, string | null> | null;
  airDate?: string;
  airDateUtc?: string;
  runtime?: number;
  overview?: string;
  image?: string;
  episode?: string;
  anidbEid?: number;
  length?: number;
  airdate?: string;
  rating?: string;
}

interface RawMappings {
  titles?: Record<string, string>;
  episodes?: Record<string, RawEpisode>;
  episodeCount?: number;
  specialCount?: number;
  images?: Array<{ coverType?: string; url?: string }>;
  mappings?: Record<string, string | number | null>;
}

// ── Normalized shapes ─────────────────────────────────────────────────────────

export interface AniZipEpisode {
  /** Raw key from the payload — `"1"` for regulars, `"S1"` for specials. */
  key: string;
  /** Parsed episode number. For specials this is the number *within* specials. */
  number: number;
  isSpecial: boolean;
  seasonNumber: number | null;
  absoluteNumber: number | null;
  /** Best available title: English → romaji (`x-jat`) → Japanese. */
  title: string | null;
  /** Every localized title, keyed by language tag. */
  titles: Record<string, string>;
  overview: string | null;
  image: string | null;
  /** Local broadcast date, `YYYY-MM-DD`. */
  airDate: string | null;
  /** UTC instant of broadcast, ISO 8601. Sorting and "next episode" use this. */
  airDateUtc: string | null;
  /** Minutes. */
  runtime: number | null;
  rating: number | null;
  tvdbId: number | null;
  anidbEid: number | null;
  /** True once `airDateUtc` is in the past. Unknown dates count as aired. */
  hasAired: boolean;
}

export interface AniZipArtwork {
  banner: string | null;
  poster: string | null;
  fanart: string | null;
  clearLogo: string | null;
}

export interface AniZipIds {
  anilistId: number | null;
  malId: number | null;
  kitsuId: number | null;
  anidbId: number | null;
  tvdbId: number | null;
  tmdbId: string | null;
  imdbId: string | null;
  animePlanetId: string | null;
  aniSearchId: number | null;
  liveChartId: number | null;
  notifyMoeId: string | null;
  type: string | null;
}

export interface AniZipMapping {
  anilistId: number;
  /** Localized series titles keyed by language tag. */
  titles: Record<string, string>;
  /**
   * Distinct series titles, best-first (English → romaji → Japanese → rest).
   * This is the alias list the search index matches against.
   */
  aliases: string[];
  preferredTitle: string | null;
  /** Regular episodes, ascending. */
  episodes: AniZipEpisode[];
  /** Specials (`S1`, `S2`, …), ascending. */
  specials: AniZipEpisode[];
  episodeCount: number | null;
  specialCount: number | null;
  images: Array<{ coverType: string; url: string }>;
  artwork: AniZipArtwork;
  ids: AniZipIds;
  /** Earliest episode whose `airDateUtc` is still in the future. */
  nextEpisode: AniZipEpisode | null;
  /** Latest episode that has already aired. */
  lastAiredEpisode: AniZipEpisode | null;
}

// ── Normalization ─────────────────────────────────────────────────────────────

/**
 * Language tags in preference order.
 *
 * `x-jat` is ani.zip's tag for romanized Japanese, which reads better than the
 * native script for an English-language UI and is often the only non-native
 * title present on older entries.
 */
const TITLE_PREFERENCE = ["en", "x-jat", "ja", "x-kot"];

function pickTitle(titles: Record<string, string>): string | null {
  for (const tag of TITLE_PREFERENCE) {
    const value = titles[tag];
    if (value) return value;
  }
  const first = Object.values(titles).find(Boolean);
  return first ?? null;
}

/** Distinct titles, preference-ordered first, then whatever remains. */
function buildAliases(titles: Record<string, string>): string[] {
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
  for (const tag of TITLE_PREFERENCE) push(titles[tag]);
  for (const value of Object.values(titles)) push(value);
  return out;
}

function cleanTitleMap(
  raw: Record<string, string | null> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [tag, value] of Object.entries(raw ?? {})) {
    const text = String(value ?? "").trim();
    if (text) out[tag] = text;
  }
  return out;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeEpisode(key: string, raw: RawEpisode, now: number): AniZipEpisode {
  const isSpecial = /^[A-Za-z]/.test(key);
  const numeric = toNumber(isSpecial ? key.replace(/^[A-Za-z]+/, "") : key);
  const titles = cleanTitleMap(raw.title);
  const airDateUtc = toText(raw.airDateUtc);

  // `length` is AniDB's minute count and `runtime` is TheTVDB's; either is fine
  // and entries frequently carry only one of them.
  const runtime = toNumber(raw.runtime) ?? toNumber(raw.length);

  const airedAt = airDateUtc ? Date.parse(airDateUtc) : NaN;

  return {
    key,
    number: numeric ?? toNumber(raw.episodeNumber) ?? 0,
    isSpecial,
    seasonNumber: toNumber(raw.seasonNumber),
    absoluteNumber: toNumber(raw.absoluteEpisodeNumber),
    title: pickTitle(titles),
    titles,
    overview: toText(raw.overview),
    image: toText(raw.image),
    // `airDate` and `airdate` both occur; they agree when both are present.
    airDate: toText(raw.airDate) ?? toText(raw.airdate),
    airDateUtc,
    runtime,
    rating: toNumber(raw.rating),
    tvdbId: toNumber(raw.tvdbId),
    anidbEid: toNumber(raw.anidbEid),
    // An episode with no date is treated as aired: the alternative hides the
    // whole back catalogue of entries that never got dated.
    hasAired: Number.isFinite(airedAt) ? airedAt <= now : true,
  };
}

function normalizeArtwork(images: Array<{ coverType: string; url: string }>): AniZipArtwork {
  const find = (type: string) =>
    images.find((img) => img.coverType.toLowerCase() === type.toLowerCase())?.url ?? null;
  return {
    banner: find("Banner"),
    poster: find("Poster"),
    fanart: find("Fanart"),
    clearLogo: find("Clearlogo"),
  };
}

function normalizeIds(raw: Record<string, string | number | null> | undefined): AniZipIds {
  const r = raw ?? {};
  return {
    anilistId: toNumber(r.anilist_id),
    malId: toNumber(r.mal_id),
    kitsuId: toNumber(r.kitsu_id),
    anidbId: toNumber(r.anidb_id),
    tvdbId: toNumber(r.thetvdb_id),
    tmdbId: toText(r.themoviedb_id),
    imdbId: toText(r.imdb_id),
    animePlanetId: toText(r.animeplanet_id),
    aniSearchId: toNumber(r.anisearch_id),
    liveChartId: toNumber(r.livechart_id),
    notifyMoeId: toText(r.notifymoe_id),
    type: toText(r.type),
  };
}

export function normalizeAniZip(
  raw: RawMappings,
  anilistId: number,
  now = Date.now(),
): AniZipMapping {
  const titles = cleanTitleMap(raw.titles);

  const all = Object.entries(raw.episodes ?? {}).map(([key, value]) =>
    normalizeEpisode(key, value, now),
  );
  const episodes = all.filter((e) => !e.isSpecial).sort((a, b) => a.number - b.number);
  const specials = all.filter((e) => e.isSpecial).sort((a, b) => a.number - b.number);

  // "Next" is the earliest unaired episode by broadcast instant, not by number:
  // ani.zip lists specials and regulars together and simulcast order can differ
  // from numeric order for split-cours shows.
  const dated = all
    .filter((e) => e.airDateUtc)
    .sort((a, b) => Date.parse(a.airDateUtc!) - Date.parse(b.airDateUtc!));
  const nextEpisode = dated.find((e) => !e.hasAired) ?? null;
  const airedList = dated.filter((e) => e.hasAired);
  const lastAiredEpisode = airedList.length ? airedList[airedList.length - 1] : null;

  const images = (raw.images ?? [])
    .map((img) => ({
      coverType: String(img?.coverType ?? "").trim(),
      url: String(img?.url ?? "").trim(),
    }))
    .filter((img) => img.coverType && img.url);

  return {
    anilistId,
    titles,
    aliases: buildAliases(titles),
    preferredTitle: pickTitle(titles),
    episodes,
    specials,
    episodeCount: toNumber(raw.episodeCount),
    specialCount: toNumber(raw.specialCount),
    images,
    artwork: normalizeArtwork(images),
    ids: normalizeIds(raw.mappings),
    nextEpisode,
    lastAiredEpisode,
  };
}

// ── Fetching ──────────────────────────────────────────────────────────────────

const inFlight = new Map<number, Promise<AniZipMapping | null>>();

/**
 * Fetch and normalize the ani.zip mapping for an AniList id.
 *
 * Resolves to `null` rather than throwing when the show is absent upstream —
 * every consumer is enrichment on top of AniList data, so a miss must degrade to
 * "no extra detail", never to a failed render. Negative results are cached too,
 * so an unmapped show doesn't re-request on every view.
 */
export async function fetchAniZipMapping(
  anilistId: number | string | null | undefined,
  options: { force?: boolean } = {},
): Promise<AniZipMapping | null> {
  const id = Number(anilistId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const cacheKey = `anizip:${id}`;
  if (!options.force) {
    const cached = memoryCache.get<AniZipMapping | null>(cacheKey);
    if (cached) return cached.hit;
    const pending = inFlight.get(id);
    if (pending) return pending;
  }

  const request = (async (): Promise<AniZipMapping | null> => {
    try {
      const res = await fetch(`${ANIZIP_BASE}/mappings?anilist_id=${id}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        memoryCache.set(cacheKey, null, CACHE_TTL_SEC);
        return null;
      }
      const body = (await res.json()) as RawMappings;
      const mapping = normalizeAniZip(body, id);
      memoryCache.set(cacheKey, mapping, CACHE_TTL_SEC);
      return mapping;
    } catch {
      memoryCache.set(cacheKey, null, CACHE_TTL_SEC);
      return null;
    } finally {
      inFlight.delete(id);
    }
  })();

  inFlight.set(id, request);
  return request;
}

/** Drop cached mappings — used by manual refresh paths. */
export function clearAniZipCache(anilistId?: number): void {
  if (typeof anilistId === "number") memoryCache.delete(`anizip:${anilistId}`);
}
