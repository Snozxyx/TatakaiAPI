import type { AniListMedia } from "../anilist/types.js";
import type { JikanAnime, JikanAnimeFull } from "./types.js";

function parseDurationMinutes(raw?: string | null): number | undefined {
  if (!raw) return undefined;
  const m = raw.match(/(\d+)\s*min/i);
  if (m) return Number(m[1]);
  const h = raw.match(/(\d+)\s*hr/i);
  if (h) return Number(h[1]) * 60;
  return undefined;
}

function jikanStatusToAniList(s?: string | null): string | undefined {
  if (!s) return undefined;
  const u = s.toUpperCase();
  if (u.includes("FINISH")) return "FINISHED";
  if (u.includes("AIRING")) return "RELEASING";
  if (u.includes("UPCOMING") || u.includes("NOT YET")) return "NOT_YET_RELEASED";
  if (u.includes("HIATUS")) return "HIATUS";
  return undefined;
}

function jikanTypeToFormat(t?: string | null): string | undefined {
  if (!t) return undefined;
  return t.replace(/\s+/g, "_").toUpperCase();
}

/** Map Jikan anime to AniList-shaped media for shared normalize() */
export function jikanToAniListShape(a: JikanAnime | JikanAnimeFull, anilistId?: number | null): AniListMedia {
  const genres = (a.genres ?? []).map((g) => g.name);
  const cover = a.images?.jpg?.large_image_url ?? a.images?.jpg?.image_url ?? a.images?.webp?.large_image_url;
  const airedFrom = a.aired?.from;
  const startDate = airedFrom
    ? (() => {
        const d = new Date(airedFrom);
        return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
      })()
    : undefined;

  return {
    id: anilistId ?? 0,
    idMal: a.mal_id,
    title: {
      romaji: a.title ?? "",
      english: a.title_english ?? undefined,
      native: a.title_japanese ?? undefined,
    },
    coverImage: cover ? { large: cover, medium: a.images?.jpg?.small_image_url ?? cover } : undefined,
    bannerImage: undefined,
    description: a.synopsis ?? undefined,
    episodes: a.episodes ?? undefined,
    duration: parseDurationMinutes(a.duration),
    format: jikanTypeToFormat(a.type),
    status: jikanStatusToAniList(a.status),
    season: a.season ? (a.season.toUpperCase() as string) : undefined,
    seasonYear: a.year ?? undefined,
    averageScore: a.score != null ? Math.round(a.score * 10) : undefined,
    meanScore: undefined,
    popularity: a.members ?? a.popularity ?? undefined,
    favourites: a.favorites ?? undefined,
    genres,
    isAdult: (a.rating ?? "").includes("Hentai") || (a.rating ?? "").includes("Rx"),
    countryOfOrigin: undefined,
    source: a.source ? (a.source.replace(/\s+/g, "_").toUpperCase() as string) : undefined,
    startDate,
    endDate: undefined,
    nextAiringEpisode: undefined,
    trailer: a.trailer?.embed_url
      ? { id: undefined, site: "youtube", thumbnail: undefined }
      : undefined,
    externalLinks: a.url ? [{ url: a.url, site: "MyAnimeList" }] : undefined,
    rankings: undefined,
    tags: [],
    studios: {
      edges: (a.studios ?? []).map((s) => ({
        isMain: true,
        node: { id: s.mal_id, name: s.name, siteUrl: null },
      })),
    },
    characters: undefined,
    staff: undefined,
    relations: undefined,
    streamingEpisodes: undefined,
  };
}
