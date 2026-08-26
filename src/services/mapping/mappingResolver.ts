import { getSupabase } from "../../lib/supabase.js";
import type { MappingEnvelope, AnimeMapping, MangaMapping } from "./types.js";
import { extractAnimeMappingFromAniList } from "./extractor.js";
import { anilistClient } from "../../providers/anilist/client.js";
import { QUERY_MEDIA } from "../../providers/anilist/queries.js";
import type { AniListMedia } from "../../providers/anilist/types.js";

const FRIBB_URL = "https://raw.githubusercontent.com/Fribb/anime-lists/refs/heads/master/anime-list-full.json";
let fribbLoadedAt = 0;
let fribbLoading: Promise<void> | null = null;
let fribbByAnilist = new Map<number, AnimeMapping>();
let fribbByMal = new Map<number, AnimeMapping>();

async function ensureFribbCache() {
  const now = Date.now();
  if (fribbByAnilist.size > 0 && now - fribbLoadedAt < 6 * 60 * 60 * 1000) return;
  if (fribbLoading) {
    await fribbLoading;
    return;
  }

  fribbLoading = (async () => {
    try {
      const res = await fetch(FRIBB_URL);
      if (!res.ok) return;
      const rows = (await res.json()) as Array<Record<string, unknown>>;
      const nextByAnilist = new Map<number, AnimeMapping>();
      const nextByMal = new Map<number, AnimeMapping>();

      for (const row of rows) {
        const mapping = normalizeAnimeRow(row);
        if (mapping.anilist_id && Number.isFinite(mapping.anilist_id)) {
          nextByAnilist.set(mapping.anilist_id, mapping);
        }
        if (mapping.mal_id && Number.isFinite(mapping.mal_id)) {
          nextByMal.set(mapping.mal_id, mapping);
        }
      }

      fribbByAnilist = nextByAnilist;
      fribbByMal = nextByMal;
      fribbLoadedAt = Date.now();
    } catch {
      // Best-effort fallback only.
    } finally {
      fribbLoading = null;
    }
  })();

  await fribbLoading;
}

function normalizeAnimeRow(row: Record<string, unknown>): AnimeMapping {
  return {
    type: (row.type as string | null) ?? null,
    anidb_id: (row.anidb_id as number | null) ?? null,
    anilist_id: (row.anilist_id as number | null) ?? null,
    "anime-planet_id": (row.anime_planet_id as string | null) ?? null,
    animecountdown_id: (row.animecountdown_id as number | null) ?? null,
    animenewsnetwork_id: (row.animenewsnetwork_id as number | null) ?? null,
    anisearch_id: (row.anisearch_id as number | null) ?? null,
    imdb_id: (row.imdb_id as string | null) ?? null,
    kitsu_id: (row.kitsu_id as number | null) ?? null,
    livechart_id: (row.livechart_id as number | null) ?? null,
    mal_id: (row.mal_id as number | null) ?? null,
    simkl_id: (row.simkl_id as number | null) ?? null,
    themoviedb_id: (row.themoviedb_id as number | null) ?? null,
    tvdb_id: (row.tvdb_id as number | null) ?? null,
    season: {
      tmdb: (row.season_tmdb as number | null) ?? null,
      tvdb: (row.season_tvdb as number | null) ?? null,
    },
  };
}

function normalizeMangaRow(row: Record<string, unknown>): MangaMapping {
  return {
    anilist_id: (row.anilist_id as number | null) ?? null,
    mal_id: (row.mal_id as number | null) ?? null,
    kitsu_id: (row.kitsu_id as number | null) ?? null,
    "anime-planet_id": (row.anime_planet_id as string | null) ?? null,
    mangaupdates_id: (row.mangaupdates_id as number | null) ?? null,
    mangadex_slug: (row.mangadex_slug as string | null) ?? null,
  };
}

function mergeAnimeMappings(primary: AnimeMapping, fallback: AnimeMapping): AnimeMapping {
  const merged: AnimeMapping = { ...fallback, ...primary, season: { ...fallback.season, ...primary.season } };
  for (const key of Object.keys(fallback) as Array<keyof AnimeMapping>) {
    if (merged[key] === null || merged[key] === undefined) {
      merged[key] = fallback[key] as never;
    }
  }
  return merged;
}

function isAnimeMappingShallow(mapping: AnimeMapping | null | undefined): boolean {
  if (!mapping) return true;
  return Boolean(
    mapping.anilist_id &&
    !mapping.kitsu_id &&
    !mapping.imdb_id &&
    !mapping.anidb_id &&
    !mapping["anime-planet_id"],
  );
}

function isMangaMappingShallow(mapping: MangaMapping | null | undefined): boolean {
  if (!mapping) return true;
  return Boolean(
    mapping.anilist_id &&
    !mapping.kitsu_id &&
    !mapping.mangadex_slug &&
    !mapping["anime-planet_id"] &&
    !mapping.mangaupdates_id,
  );
}

export function isShallowMapping(mapping: AnimeMapping | MangaMapping | null | undefined): boolean {
  if (!mapping) return true;
  const looksManga = (mapping as MangaMapping).mangadex_slug !== undefined
    || (mapping as MangaMapping).mangaupdates_id !== undefined;
  return looksManga
    ? isMangaMappingShallow(mapping as MangaMapping)
    : isAnimeMappingShallow(mapping as AnimeMapping);
}

export async function resolveMappingByTatakaiId(tatakaiId: string): Promise<MappingEnvelope | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data: unifiedRow, error: unifiedError } = await sb
    .schema("mappings")
    .from("tatakai_id_map")
    .select("*")
    .eq("tatakai_id", tatakaiId)
    .maybeSingle();

  if (!unifiedError && unifiedRow) {
    const kind = String((unifiedRow as Record<string, unknown>).kind || "").toLowerCase();
    if (kind === "manga") {
      return { id: String((unifiedRow as Record<string, unknown>).tatakai_id), mapping: normalizeMangaRow(unifiedRow as Record<string, unknown>) };
    }
    return { id: String((unifiedRow as Record<string, unknown>).tatakai_id), mapping: normalizeAnimeRow(unifiedRow as Record<string, unknown>) };
  }

  const { data: link } = await sb
    .schema("mappings")
    .from("tatakai_id_link")
    .select("tatakai_id, anilist_id, kind")
    .eq("tatakai_id", tatakaiId)
    .maybeSingle();

  if (!link) return null;

  if (link.kind === "anime") {
    const { data: row } = await sb.schema("mappings").from("anime_id_map").select("*").eq("anilist_id", link.anilist_id).maybeSingle();
    return { id: link.tatakai_id, mapping: row ? normalizeAnimeRow(row as Record<string, unknown>) : null };
  }

  const { data: row } = await sb.schema("mappings").from("manga_id_map").select("*").eq("anilist_id", link.anilist_id).maybeSingle();
  return { id: link.tatakai_id, mapping: row ? normalizeMangaRow(row as Record<string, unknown>) : null };
}

export async function resolveTatakaiIdByAniListId(anilistId: number): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data: unifiedRow, error: unifiedError } = await sb
    .schema("mappings")
    .from("tatakai_id_map")
    .select("tatakai_id")
    .eq("anilist_id", anilistId)
    .maybeSingle();

  if (!unifiedError && unifiedRow?.tatakai_id) return String(unifiedRow.tatakai_id);

  const { data: link } = await sb
    .schema("mappings")
    .from("tatakai_id_link")
    .select("tatakai_id")
    .eq("anilist_id", anilistId)
    .maybeSingle();

  return link?.tatakai_id ? String(link.tatakai_id) : null;
}

export async function resolveTatakaiIdByMalId(malId: number): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data: unifiedRow, error: unifiedError } = await sb
    .schema("mappings")
    .from("tatakai_id_map")
    .select("tatakai_id")
    .eq("mal_id", malId)
    .maybeSingle();

  if (!unifiedError && unifiedRow?.tatakai_id) return String(unifiedRow.tatakai_id);

  // Try anime map
  const { data: animeMap } = await sb
    .schema("mappings")
    .from("anime_id_map")
    .select("anilist_id")
    .eq("mal_id", malId)
    .maybeSingle();

  if (animeMap?.anilist_id) return resolveTatakaiIdByAniListId(animeMap.anilist_id);

  // Try manga map
  const { data: mangaMap } = await sb
    .schema("mappings")
    .from("manga_id_map")
    .select("anilist_id")
    .eq("mal_id", malId)
    .maybeSingle();

  if (mangaMap?.anilist_id) return resolveTatakaiIdByAniListId(mangaMap.anilist_id);

  return null;
}

export async function resolveAnimeMappingByAniListId(anilistId: number) {
  const sb = getSupabase();
  const { data: row } = sb
    ? await sb.schema("mappings").from("anime_id_map").select("*").eq("anilist_id", anilistId).maybeSingle()
    : { data: null };
  const dbMapping = row ? normalizeAnimeRow(row as Record<string, unknown>) : null;
  if (dbMapping && !isAnimeMappingShallow(dbMapping)) return dbMapping;

  await ensureFribbCache();
  const fribbMapping = fribbByAnilist.get(anilistId) ?? null;
  if (!dbMapping) return fribbMapping;
  if (!fribbMapping) return dbMapping;

  return mergeAnimeMappings(dbMapping, fribbMapping);
}

export async function resolveAnimeMappingByMalId(malId: number) {
  const sb = getSupabase();
  const { data: row } = sb
    ? await sb.schema("mappings").from("anime_id_map").select("*").eq("mal_id", malId).maybeSingle()
    : { data: null };
  const dbMapping = row ? normalizeAnimeRow(row as Record<string, unknown>) : null;
  if (dbMapping && !isAnimeMappingShallow(dbMapping)) return dbMapping;

  await ensureFribbCache();
  const fribbMapping = fribbByMal.get(malId) ?? null;
  if (!dbMapping) return fribbMapping;
  if (!fribbMapping) return dbMapping;

  return mergeAnimeMappings(dbMapping, fribbMapping);
}

export async function resolveMangaMappingByAniListId(anilistId: number) {
  const sb = getSupabase();
  if (!sb) return null;
  const { data: row } = await sb.schema("mappings").from("manga_id_map").select("*").eq("anilist_id", anilistId).maybeSingle();
  return row ? normalizeMangaRow(row as Record<string, unknown>) : null;
}

export async function resolveMangaMappingByMalId(malId: number) {
  const sb = getSupabase();
  if (!sb) return null;
  const { data: row } = await sb.schema("mappings").from("manga_id_map").select("*").eq("mal_id", malId).maybeSingle();
  return row ? normalizeMangaRow(row as Record<string, unknown>) : null;
}

export async function resolveAnimeMappingByAnidbId(anidbId: number) {
  const sb = getSupabase();
  if (!sb) return null;
  const { data: row } = await sb.schema("mappings").from("anime_id_map").select("*").eq("anidb_id", anidbId).maybeSingle();
  return row ? normalizeAnimeRow(row as Record<string, unknown>) : null;
}

export async function attachMappingToMedia<T extends { tatakaiId?: string; anilistId?: number; malId?: number; chapters?: number; volumes?: number; externalLinks?: any[]; source_api?: string }>(
  media: T,
) {
  const tatakaiId =
    media.tatakaiId
    ?? (media.anilistId ? await resolveTatakaiIdByAniListId(media.anilistId).catch(() => null) : null)
    ?? (media.malId ? await resolveTatakaiIdByMalId(media.malId).catch(() => null) : null);

  const isManga = media.chapters !== undefined || media.volumes !== undefined;

  const mappingCandidates: (AnimeMapping | MangaMapping | null)[] = [];

  if (tatakaiId) {
    const envelope = await resolveMappingByTatakaiId(String(tatakaiId));
    if (envelope?.mapping) mappingCandidates.push(envelope.mapping);
  }

  if (media.anilistId) {
    if (isManga) {
      mappingCandidates.push(await resolveMangaMappingByAniListId(media.anilistId).catch(() => null));
    } else {
      mappingCandidates.push(await resolveAnimeMappingByAniListId(media.anilistId).catch(() => null));
    }
  }

  if (media.malId) {
    if (isManga) {
      mappingCandidates.push(await resolveMangaMappingByMalId(media.malId).catch(() => null));
    } else {
      mappingCandidates.push(await resolveAnimeMappingByMalId(media.malId).catch(() => null));
    }
  }

  // Merge candidates, preferring non-null values
  let mapping: any = null;
  for (const candidate of mappingCandidates) {
    if (!candidate) continue;
    if (!mapping) {
      mapping = { ...candidate };
      continue;
    }
    // Simple merge: fill in nulls
    for (const key of Object.keys(candidate)) {
      if (mapping[key] === null || mapping[key] === undefined) {
        mapping[key] = (candidate as any)[key];
      }
    }
  }

  // If still shallow, try to extract from externalLinks if available
  // Shallow means missing crucial IDs like Kitsu, IMDb, AniDB, or Anime-Planet
  const isShallow = isShallowMapping(mapping);
  
  // Last resort: if shallow and no links, and we have an anilistId, fetch fresh from AniList
  // We remove the source_api !== "anilist" check to be extra aggressive
  if (isShallow && !media.externalLinks?.length && media.anilistId && !isManga) {
    try {
      const { Media } = await anilistClient.query<{ Media: AniListMedia }>(QUERY_MEDIA, { id: media.anilistId });
      if (Media?.externalLinks?.length) {
        (media as any).externalLinks = Media.externalLinks;
      }
    } catch (err) {
      // Ignore fetch failures but could log if we had a logger here
    }
  }

  if (media.externalLinks?.length && isShallow) {
    if (isManga) {
      const extLinks = media.externalLinks;
      const animePlanet = extLinks.find((l) => /anime-planet/i.test(l.site || ""))?.url || null;
      const mangadex = extLinks.find((l) => /mangadex/i.test(l.site || ""))?.url || null;
      const mangadexSlug = mangadex ? mangadex.split("/").filter(Boolean).pop() || null : null;
      
      const extractedManga = normalizeMangaRow({
        anilist_id: media.anilistId,
        mal_id: media.malId,
        anime_planet_id: animePlanet ? animePlanet.split("/").filter(Boolean).pop() || null : null,
        mangadex_slug: mangadexSlug,
      });

      if (!mapping) {
        mapping = extractedManga;
      } else {
        for (const key of Object.keys(extractedManga)) {
          if (mapping[key] === null || mapping[key] === undefined) {
            mapping[key] = (extractedManga as any)[key];
          }
        }
      }
    } else {
      const extractedAnime = extractAnimeMappingFromAniList({
        id: media.anilistId ?? 0,
        idMal: media.malId,
        externalLinks: media.externalLinks,
      } as any);

      if (!mapping) {
        mapping = extractedAnime;
      } else {
        for (const key of Object.keys(extractedAnime)) {
          if (mapping[key] === null || mapping[key] === undefined) {
            mapping[key] = (extractedAnime as any)[key];
          }
        }
      }
    }
  }

  // Final stub fallback if absolutely nothing found
  if (!mapping && (media.anilistId || media.malId)) {
    if (isManga) {
      mapping = normalizeMangaRow({ anilist_id: media.anilistId, mal_id: media.malId });
    } else {
      mapping = normalizeAnimeRow({ anilist_id: media.anilistId, mal_id: media.malId });
    }
  }

  const id = String(tatakaiId || media.anilistId || media.malId || "");
  const nextMedia = tatakaiId ? { ...media, tatakaiId } : media;
  return { id, mapping, media: nextMedia };
}