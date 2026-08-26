import { hasSupabase } from "../config/env.js";
import { anilistClient } from "../providers/anilist/client.js";
import {
  QUERY_GENRE_COLLECTION,
  QUERY_MEDIA,
  QUERY_MEDIA_BY_MAL,
  QUERY_PAGE,
  QUERY_SEARCH,
  QUERY_TRENDING,
} from "../providers/anilist/queries.js";
import type { AniListMedia } from "../providers/anilist/types.js";
import { jikanClient } from "../providers/jikan/client.js";
import { jikanToAniListShape } from "../providers/jikan/mapper.js";
import { anilistToTatakaiMedia } from "./normalize.js";
import { upsertFromAniListMedia } from "./contentIngestion.js";
import * as repo from "./contentRepository.js";
import { saveFeed } from "./contentFeeds.js";
import type { HomePageBundle, TatakaiMedia } from "../types/tatakaiMedia.js";
import type { ContentSearchResult } from "../types/tatakaiMedia.js";
import type { SearchParams } from "./searchService.js";
import { searchContent } from "./searchService.js";
import {
  resolveAnimeMappingByAniListId,
  resolveAnimeMappingByMalId,
  resolveMangaMappingByAniListId,
  resolveMangaMappingByMalId,
} from "./mapping/mappingResolver.js";
import type { AnimeMapping, MangaMapping } from "./mapping/types.js";

type MetaSource = "anilist" | "jikan" | "db" | "mixed";

async function maybeUpsert(raw: AniListMedia) {
  if (!hasSupabase) return;
  try {
    await upsertFromAniListMedia(raw);
  } catch {
    /* ignore single-row ingest failures */
  }
}

function slimFeedItems(media: TatakaiMedia[]) {
  return media.map((m) => ({ anilistId: m.anilistId, malId: m.malId, tatakaiId: m.tatakaiId }));
}

function normalizeTitleKey(value?: string | null): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function sourceRank(source: TatakaiMedia["source_api"]): number {
  if (source === "tatakai") return 3;
  if (source === "anilist") return 2;
  return 1;
}

function mergeMedia(primary: TatakaiMedia, fallback: TatakaiMedia): TatakaiMedia {
  const merged: TatakaiMedia = {
    ...fallback,
    ...primary,
  };

  merged.anilistId = primary.anilistId || fallback.anilistId;
  merged.malId = primary.malId ?? fallback.malId;
  merged.titleRomaji = primary.titleRomaji || fallback.titleRomaji;
  merged.titleEnglish = primary.titleEnglish ?? fallback.titleEnglish;
  merged.titleNative = primary.titleNative ?? fallback.titleNative;
  merged.synonyms = primary.synonyms?.length ? primary.synonyms : fallback.synonyms ?? [];
  merged.genres = primary.genres?.length ? primary.genres : fallback.genres ?? [];
  merged.tags = primary.tags?.length ? primary.tags : fallback.tags ?? [];
  merged.studios = primary.studios?.length ? primary.studios : fallback.studios ?? [];
  merged.externalLinks = primary.externalLinks?.length ? primary.externalLinks : fallback.externalLinks;
  merged.streamingEpisodes = primary.streamingEpisodes?.length ? primary.streamingEpisodes : fallback.streamingEpisodes;
  merged.characters = primary.characters?.length ? primary.characters : fallback.characters;
  merged.staff = primary.staff?.length ? primary.staff : fallback.staff;
  merged.relations = primary.relations?.length ? primary.relations : fallback.relations;
  merged.coverImageLarge = primary.coverImageLarge ?? fallback.coverImageLarge;
  merged.coverImageMedium = primary.coverImageMedium ?? fallback.coverImageMedium;
  merged.bannerImage = primary.bannerImage ?? fallback.bannerImage;
  merged.description = primary.description ?? fallback.description;
  merged.averageScore = primary.averageScore ?? fallback.averageScore;
  merged.meanScore = primary.meanScore ?? fallback.meanScore;
  merged.popularity = primary.popularity ?? fallback.popularity;
  merged.favourites = primary.favourites ?? fallback.favourites;
  merged.format = primary.format ?? fallback.format;
  merged.status = primary.status ?? fallback.status;
  merged.season = primary.season ?? fallback.season;
  merged.seasonYear = primary.seasonYear ?? fallback.seasonYear;
  merged.episodes = primary.episodes ?? fallback.episodes;
  merged.duration = primary.duration ?? fallback.duration;
  merged.nextAiringEpisode = primary.nextAiringEpisode ?? fallback.nextAiringEpisode;
  merged.trailerUrl = primary.trailerUrl ?? fallback.trailerUrl;
  merged.isAdult = primary.isAdult ?? fallback.isAdult;
  merged.countryOfOrigin = primary.countryOfOrigin ?? fallback.countryOfOrigin;
  merged.source_api = primary.source_api;
  merged.fetchedAt = primary.fetchedAt ?? fallback.fetchedAt;

  return merged;
}

function matchesSearchFilters(media: TatakaiMedia, p: SearchParams): boolean {
  if (p.isAdult === false && media.isAdult) return false;

  if (p.format?.length && media.format && !p.format.includes(media.format)) return false;
  if (p.status?.length && media.status && !p.status.includes(media.status)) return false;
  if (p.genres?.length) {
    const normalized = media.genres.map((g) => g.toLowerCase());
    const target = p.genres.map((g) => g.toLowerCase());
    if (!target.every((g) => normalized.includes(g))) return false;
  }

  const year = media.seasonYear ?? media.startDate?.year;
  if (p.yearMin && year && year < p.yearMin) return false;
  if (p.yearMax && year && year > p.yearMax) return false;

  if (p.scoreMin != null && media.averageScore != null && media.averageScore < p.scoreMin) return false;
  if (p.scoreMax != null && media.averageScore != null && media.averageScore > p.scoreMax) return false;

  if (p.epMin != null && media.episodes != null && media.episodes < p.epMin) return false;
  if (p.epMax != null && media.episodes != null && media.episodes > p.epMax) return false;

  return true;
}

async function resolveMappingForMedia(media: TatakaiMedia): Promise<AnimeMapping | MangaMapping | null> {
  const isManga = media.chapters !== undefined || media.volumes !== undefined;
  if (media.anilistId) {
    if (isManga) {
      const mapping = await resolveMangaMappingByAniListId(media.anilistId).catch(() => null);
      if (mapping) return mapping;
    }
    const mapping = await resolveAnimeMappingByAniListId(media.anilistId).catch(() => null);
    if (mapping) return mapping;
  }
  if (media.malId) {
    if (isManga) {
      const mapping = await resolveMangaMappingByMalId(media.malId).catch(() => null);
      if (mapping) return mapping;
    }
    return resolveAnimeMappingByMalId(media.malId).catch(() => null);
  }
  return null;
}

async function normalizeSearchMedia(media: TatakaiMedia): Promise<{ key: string; media: TatakaiMedia; rank: number }> {
  const mapping = await resolveMappingForMedia(media);
  const normalized: TatakaiMedia = { ...media };

  if (mapping?.anilist_id && (!normalized.anilistId || normalized.anilistId === 0)) {
    normalized.anilistId = mapping.anilist_id;
  }
  if (mapping?.mal_id && !normalized.malId) {
    normalized.malId = mapping.mal_id;
  }

  const anidbId =
    mapping && "anidb_id" in mapping && typeof mapping.anidb_id === "number"
      ? mapping.anidb_id
      : null;

  const key =
    anidbId
      ? `anidb:${anidbId}`
      : normalized.anilistId
        ? `anilist:${normalized.anilistId}`
        : normalized.malId
          ? `mal:${normalized.malId}`
          : `title:${normalizeTitleKey(normalized.titleRomaji || normalized.titleEnglish || normalized.titleNative)}`;

  return { key, media: normalized, rank: sourceRank(normalized.source_api) };
}

async function fetchTrending(page: number, perPage: number): Promise<{ media: TatakaiMedia[]; source: MetaSource }> {
  const pageData = await anilistClient.pageMedia({ page, perPage }, QUERY_TRENDING);
  const media = pageData.media.map((m) => anilistToTatakaiMedia(m));
  for (const raw of pageData.media) await maybeUpsert(raw);
  if (hasSupabase) void saveFeed("trending", slimFeedItems(media), null, null).catch(() => {});
  return { media, source: "anilist" };
}

async function fetchPageSort(
  sort: string,
  page: number,
  perPage: number,
  extra?: Record<string, unknown>,
): Promise<{ media: TatakaiMedia[]; source: MetaSource }> {
  const variables = { page, perPage, sort: [sort], ...extra };
  const pageData = await anilistClient.pageMedia(variables, QUERY_PAGE);
  const media = pageData.media.map((m) => anilistToTatakaiMedia(m));
  for (const raw of pageData.media) await maybeUpsert(raw);
  return { media, source: "anilist" };
}

export async function getTrending(page: number, perPage: number) {
  return fetchTrending(page, perPage);
}

export async function getPopular(page: number, perPage: number) {
  return fetchPageSort("POPULARITY_DESC", page, perPage);
}

export async function getTopRated(page: number, perPage: number) {
  return fetchPageSort("SCORE_DESC", page, perPage);
}

export async function getSeasonal(season: string, year: number, page: number, perPage: number) {
  return fetchPageSort("POPULARITY_DESC", page, perPage, { season, seasonYear: year });
}

export async function getUpcoming(page: number, perPage: number) {
  return fetchPageSort("POPULARITY_DESC", page, perPage, { status: "NOT_YET_RELEASED" });
}

export async function getGenresList(): Promise<string[]> {
  const data = await anilistClient.query<{ GenreCollection: { genre: string }[] }>(QUERY_GENRE_COLLECTION);
  return (data.GenreCollection ?? []).map((g) => g.genre).filter(Boolean);
}

export async function searchAnilist(p: SearchParams): Promise<ContentSearchResult> {
  const qtext = p.query ?? p.q;
  const hasFilters = !!(p.genres?.length || p.format?.length || p.status?.length || p.yearMin || p.yearMax || p.scoreMin || p.scoreMax || p.epMin || p.epMax);
  
  let dbResult: ContentSearchResult | null = null;
  if (hasSupabase && (qtext?.trim() || hasFilters)) {
    try {
      dbResult = await searchContent({ ...p, q: qtext });
    } catch {
      /* fall through */
    }
  }

  const sortKey = (p.sortBy ?? p.sort ?? "SEARCH_MATCH") as string;
  // If isAdult is true, we pass undefined to AniList to "include" adult content (show both)
  // If isAdult is false, we pass false to AniList to "hide" adult content
  const isAdultParam = p.isAdult === true ? undefined : false;

  const variables: Record<string, unknown> = {
    page: p.page,
    perPage: p.perPage,
    search: qtext?.trim() ? qtext : undefined,
    genres: p.genres?.length ? p.genres : undefined,
    season: p.season?.[0] ?? undefined,
    seasonYear: p.yearMin ?? undefined,
    format: p.format?.length ? p.format : undefined,
    status: p.status?.length ? p.status : undefined,
    isAdult: isAdultParam,
    sort: [qtext?.trim() ? (sortKey === "SEARCH_MATCH" ? "SEARCH_MATCH" : sortKey) : "POPULARITY_DESC"],
    averageScoreGreater: p.scoreMin,
    averageScoreLesser: p.scoreMax,
    episodesGreater: p.epMin,
    episodesLesser: p.epMax,
  };
  let anilistPage: { media: TatakaiMedia[]; pageInfo: ContentSearchResult["pageInfo"] } | null = null;
  if (qtext?.trim() || hasFilters) {
    try {
      const pageData = await anilistClient.pageMedia(variables, QUERY_SEARCH);
      const media = pageData.media.map((m) => anilistToTatakaiMedia(m));
      for (const raw of pageData.media) await maybeUpsert(raw);
      anilistPage = {
        media,
        pageInfo: {
          total: pageData.pageInfo.total,
          currentPage: pageData.pageInfo.currentPage,
          lastPage: pageData.pageInfo.lastPage,
          hasNextPage: pageData.pageInfo.hasNextPage,
          perPage: pageData.pageInfo.perPage,
        },
      };
    } catch {
      /* fall through to DB/Jikan */
    }
  }

  let jikanPage:
    | { media: TatakaiMedia[]; pagination: { has_next_page: boolean; last_visible_page: number; items?: { total: number } } }
    | null = null;
  if (qtext?.trim()) {
    try {
      const jikanRes = await jikanClient.searchAnime(qtext.trim(), p.page, p.perPage);
      const jikanMedia = jikanRes.data
        .map((row) => anilistToTatakaiMedia(jikanToAniListShape(row, null), "jikan"))
        .filter((row) => matchesSearchFilters(row, p));
      jikanPage = { media: jikanMedia, pagination: jikanRes.pagination };
    } catch {
      /* ignore jikan failures */
    }
  }

  const candidates: TatakaiMedia[] = [];
  if (dbResult?.media?.length) candidates.push(...dbResult.media);
  if (anilistPage?.media?.length) candidates.push(...anilistPage.media);
  if (jikanPage?.media?.length) candidates.push(...jikanPage.media);

  const normalized = await Promise.all(candidates.map((m) => normalizeSearchMedia(m)));
  const merged = new Map<string, { media: TatakaiMedia; rank: number }>();

  for (const item of normalized) {
    const existing = merged.get(item.key);
    if (!existing) {
      merged.set(item.key, { media: item.media, rank: item.rank });
      continue;
    }

    const primary = item.rank >= existing.rank ? item.media : existing.media;
    const fallback = item.rank >= existing.rank ? existing.media : item.media;
    const nextRank = Math.max(item.rank, existing.rank);
    merged.set(item.key, { media: mergeMedia(primary, fallback), rank: nextRank });
  }

  const media = Array.from(merged.values()).map((entry) => entry.media);
  const totals = [
    dbResult?.pageInfo.total,
    anilistPage?.pageInfo.total,
    jikanPage?.pagination?.items?.total,
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  const total = totals.length ? Math.max(...totals) : media.length;
  const lastPage = Math.max(1, Math.ceil(total / p.perPage));
  const hasNextPage = [
    dbResult?.pageInfo.hasNextPage,
    anilistPage?.pageInfo.hasNextPage,
    jikanPage?.pagination?.has_next_page,
  ].some(Boolean);

  return {
    media,
    pageInfo: {
      total,
      currentPage: p.page,
      lastPage,
      hasNextPage,
      perPage: p.perPage,
    },
  };
}

export async function getMediaByAnilistId(id: number): Promise<{ media: TatakaiMedia; source: MetaSource } | null> {
  if (hasSupabase) {
    const db = await repo.findByAnilistId(id);
    if (db) return { media: db, source: "db" };
  }
  const data = await anilistClient.query<{ Media: AniListMedia | null }>(QUERY_MEDIA, { id });
  if (!data.Media) return null;
  await maybeUpsert(data.Media);
  const after = hasSupabase ? await repo.findByAnilistId(id) : null;
  return {
    media: after ?? anilistToTatakaiMedia(data.Media),
    source: after ? "db" : "anilist",
  };
}

export async function getMediaByMalId(malId: number): Promise<{ media: TatakaiMedia; source: MetaSource } | null> {
  if (hasSupabase) {
    const db = await repo.findByMalId(malId);
    if (db) return { media: db, source: "db" };
  }
  try {
    const data = await anilistClient.query<{ Media: AniListMedia | null }>(QUERY_MEDIA_BY_MAL, { idMal: malId });
    if (data.Media) {
      await maybeUpsert(data.Media);
      const after = hasSupabase ? await repo.findByMalId(malId) : null;
      return {
        media: after ?? anilistToTatakaiMedia(data.Media),
        source: after ? "db" : "anilist",
      };
    }
  } catch {
    /* fall through Jikan */
  }
  const full = await jikanClient.getAnimeFull(malId);
  const shaped = jikanToAniListShape(full, null);
  const media = anilistToTatakaiMedia(shaped, "jikan");
  return { media, source: "jikan" };
}

export async function getJikanAnimeEpisodes(malId: number, page = 1) {
  return jikanClient.getAnimeEpisodes(malId, page);
}

export async function getJikanAnimeFull(malId: number) {
  return jikanClient.getAnimeFull(malId);
}

export async function resolveIdParam(
  id: string,
): Promise<{ media: TatakaiMedia; source: MetaSource } | null> {
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  if (uuid && hasSupabase) {
    const db = await repo.findByTatakaiId(id);
    if (db) return { media: db, source: "db" };
  }
  const num = Number(id);
  if (!Number.isFinite(num) || num <= 0) return null;
  return getMediaByAnilistId(num);
}

export async function getHomeBundle(): Promise<HomePageBundle> {
  const [trending, popular, seasonal, upcoming, genres] = await Promise.all([
    fetchTrending(1, 10),
    fetchPageSort("POPULARITY_DESC", 1, 10),
    (async () => {
      const now = new Date();
      const m = now.getMonth() + 1;
      const y = now.getFullYear();
      const season = m <= 3 ? "WINTER" : m <= 6 ? "SPRING" : m <= 9 ? "SUMMER" : "FALL";
      return fetchPageSort("POPULARITY_DESC", 1, 12, { season, seasonYear: y });
    })(),
    getUpcoming(1, 12),
    getGenresList().catch(() => [] as string[]),
  ]);

  const topAiring = seasonal.media.filter((x) => x.status === "RELEASING").slice(0, 15);
  const latestCompleted = seasonal.media.filter((x) => x.status === "FINISHED").slice(0, 12);

  return {
    spotlight: trending.media.slice(0, 8),
    trending: trending.media,
    topAiring: topAiring.length ? topAiring : trending.media.slice(0, 15),
    popular: popular.media,
    topUpcoming: upcoming.media,
    latestCompleted: latestCompleted.length ? latestCompleted : popular.media.slice(0, 12),
    top10: {
      today: trending.media.slice(0, 10),
      week: popular.media.slice(0, 10),
      month: seasonal.media.slice(0, 10),
    },
    genres: genres.length ? genres : ["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Romance", "Sci-Fi", "Slice of Life"],
    fetchedAt: Date.now(),
  };
}
