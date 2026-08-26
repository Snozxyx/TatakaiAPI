import type { AniListMedia } from "../../providers/anilist/types.js";
import { getSupabase } from "../../lib/supabase.js";

export async function upsertMangaMapping(media: AniListMedia) {
  const sb = getSupabase();
  if (!sb) return null;

  const extLinks = Array.isArray(media.externalLinks) ? media.externalLinks : [];
  const animePlanet = extLinks.find((l) => /anime-planet/i.test(l.site || ""))?.url || null;
  const mangadex = extLinks.find((l) => /mangadex/i.test(l.site || ""))?.url || null;
  const mangadexSlug = mangadex ? mangadex.split("/").filter(Boolean).pop() || null : null;

  const payload = {
    anilist_id: media.id,
    mal_id: media.idMal ?? null,
    kitsu_id: null,
    anime_planet_id: animePlanet,
    mangaupdates_id: null,
    mangadex_slug: mangadexSlug,
    source_revision: "anilist",
  };

  const { error } = await sb.schema("mappings").from("manga_id_map").upsert(payload, { onConflict: "anilist_id" });
  if (error) throw error;
  return payload;
}