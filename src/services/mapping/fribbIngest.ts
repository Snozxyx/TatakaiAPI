import crypto from "node:crypto";
import { getSupabase } from "../../lib/supabase.js";

const FRIBB_URL = "https://raw.githubusercontent.com/Fribb/anime-lists/refs/heads/master/anime-list-full.json";

type FribbItem = {
  type?: string;
  anidb_id?: number;
  anilist_id?: number;
  mal_id?: number;
  kitsu_id?: number;
  [key: string]: unknown;
};

export async function ingestFribbMappings() {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");

  const res = await fetch(FRIBB_URL);
  if (!res.ok) throw new Error(`Failed downloading Fribb list: ${res.status}`);
  const raw = await res.text();
  const sha = crypto.createHash("sha256").update(raw).digest("hex");
  const items = JSON.parse(raw) as FribbItem[];

  let changed = 0;
  const chunkSize = 500;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize)
      .filter((x) => x.anidb_id || x.anilist_id)
      .map((x) => ({
        anidb_id: x.anidb_id ?? null,
        anilist_id: x.anilist_id ?? null,
        mal_id: x.mal_id ?? null,
        kitsu_id: x.kitsu_id ?? null,
        anime_planet_id: (x["anime-planet_id"] as string | undefined) ?? null,
        anisearch_id: (x.anisearch_id as number | undefined) ?? null,
        livechart_id: (x.livechart_id as number | undefined) ?? null,
        simkl_id: (x.simkl_id as number | undefined) ?? null,
        animecountdown_id: (x.animecountdown_id as number | undefined) ?? null,
        animenewsnetwork_id: (x.animenewsnetwork_id as number | undefined) ?? null,
        imdb_id: (x.imdb_id as string | undefined) ?? null,
        themoviedb_id: (x.themoviedb_id as number | undefined) ?? null,
        tvdb_id: (x.tvdb_id as number | undefined) ?? null,
        season_tmdb: ((x.season as { tmdb?: number } | undefined)?.tmdb ?? null),
        season_tvdb: ((x.season as { tvdb?: number } | undefined)?.tvdb ?? null),
        type: x.type ?? null,
        source_revision: sha,
      }));

    if (!chunk.length) continue;

    // Separate items into those with anidb_id (PK) and those without
    const withAnidb = chunk.filter(x => x.anidb_id !== null);
    const withoutAnidb = chunk.filter(x => x.anidb_id === null && x.anilist_id !== null);

    if (withAnidb.length) {
      const { error, count } = await sb
        .schema("mappings")
        .from("anime_id_map")
        .upsert(withAnidb, { onConflict: "anidb_id", count: "exact" });
      if (error) throw error;
      changed += count ?? 0;
    }

    if (withoutAnidb.length) {
      const { error, count } = await sb
        .schema("mappings")
        .from("anime_id_map")
        .upsert(withoutAnidb, { onConflict: "anilist_id", count: "exact" });
      if (error) throw error;
      changed += count ?? 0;
    }

  }

  await sb.schema("mappings").from("ingest_runs").insert({
    source: "fribb-anime-lists",
    items_total: items.length,
    items_changed: changed,
    payload_sha: sha,
  });

  return { total: items.length, changed, sha };
}