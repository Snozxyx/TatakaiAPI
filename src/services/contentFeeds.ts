import { getSupabase } from "../lib/supabase.js";
import { log } from "../config/logger.js";

export async function saveFeed(
  feedType: string,
  items: unknown[],
  season?: string | null,
  seasonYear?: number | null,
  ttlHours = 6,
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const expires = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();
  const { error } = await sb.from("content_feeds").upsert(
    {
      feed_type: feedType,
      season: season ?? null,
      season_year: seasonYear ?? null,
      items,
      computed_at: new Date().toISOString(),
      expires_at: expires,
    },
    { onConflict: "feed_type,season,season_year" },
  );
  if (error) log.warn({ error, feedType }, "saveFeed failed");
}

export async function getFeed(
  feedType: string,
  season?: string | null,
  seasonYear?: number | null,
): Promise<unknown[] | null> {
  const sb = getSupabase();
  if (!sb) return null;
  let query = sb.from("content_feeds").select("items, expires_at").eq("feed_type", feedType);
  if (season == null) query = query.is("season", null);
  else query = query.eq("season", season);
  if (seasonYear == null) query = query.is("season_year", null);
  else query = query.eq("season_year", seasonYear);
  const { data } = await query.maybeSingle();
  if (!data) return null;
  const exp = data.expires_at ? new Date(String(data.expires_at)).getTime() : 0;
  if (exp && Date.now() > exp) return null;
  return (data.items as unknown[]) ?? null;
}
