import type { AniListMedia } from "../../providers/anilist/types.js";
import type { AnimeMapping } from "./types.js";

function getLastPathSegment(url: string): string | null {
  const parts = String(url || "").split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}

function extractNumericId(url: string): number | null {
  const segment = getLastPathSegment(url);
  if (!segment) return null;
  const direct = Number(segment);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const match = segment.match(/(\d{1,10})/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function extractAnimeMappingFromAniList(media: AniListMedia): AnimeMapping {
  const extLinks = Array.isArray(media.externalLinks) ? media.externalLinks : [];

  const animePlanet = extLinks.find((l) => /anime-planet/i.test(l.site || ""))?.url || null;
  const kitsu = extLinks.find((l) => /kitsu/i.test(l.site || ""))?.url || null;
  const kitsuId = kitsu ? extractNumericId(kitsu) : null;
  const imdb = extLinks.find((l) => /imdb/i.test(l.site || ""))?.url || null;
  const imdbId = imdb ? getLastPathSegment(imdb) : null;
  const tmdb = extLinks.find((l) => /(tmdb|themoviedb|movie\s*database)/i.test(l.site || ""))?.url || null;
  const tmdbId = tmdb ? extractNumericId(tmdb) : null;
  const tvdb = extLinks.find((l) => /(tvdb|thetvdb)/i.test(l.site || ""))?.url || null;
  const tvdbId = tvdb ? extractNumericId(tvdb) : null;
  const anidb = extLinks.find((l) => /anidb/i.test(l.site || ""))?.url || null;
  const anidbId = anidb ? extractNumericId(anidb) : null;
  const simkl = extLinks.find((l) => /simkl/i.test(l.site || ""))?.url || null;
  const simklId = simkl ? extractNumericId(simkl) : null;

  return {
    type: media.format ?? null,
    anidb_id: anidbId,
    anilist_id: media.id,
    "anime-planet_id": animePlanet ? getLastPathSegment(animePlanet) : null,
    animecountdown_id: null,
    animenewsnetwork_id: null,
    anisearch_id: null,
    imdb_id: imdbId,
    kitsu_id: kitsuId,
    livechart_id: null,
    mal_id: media.idMal ?? null,
    simkl_id: simklId,
    themoviedb_id: tmdbId,
    tvdb_id: tvdbId,
    season: {
      tmdb: null,
      tvdb: null,
    },
  };
}
