import { getSupabase } from "../lib/supabase.js";
import { log } from "../config/logger.js";
import type { AniListMedia } from "../providers/anilist/types.js";
import { anilistToTatakaiMedia, tatakaiMediaToDbRow } from "./normalize.js";

async function upsertTitles(sb: NonNullable<ReturnType<typeof getSupabase>>, tatakaiId: string, m: ReturnType<typeof anilistToTatakaiMedia>) {
  const titles: { title: string; title_type: string; language?: string; is_primary: boolean }[] = [];
  if (m.titleRomaji) titles.push({ title: m.titleRomaji, title_type: "romaji", is_primary: true });
  if (m.titleEnglish) titles.push({ title: m.titleEnglish, title_type: "english", is_primary: false });
  if (m.titleNative) titles.push({ title: m.titleNative, title_type: "native", is_primary: false });
  for (const s of m.synonyms ?? []) {
    if (s) titles.push({ title: s, title_type: "synonym", is_primary: false });
  }
  await sb.from("content_titles").delete().eq("tatakai_id", tatakaiId);
  if (titles.length) {
    await sb.from("content_titles").insert(titles.map((t) => ({ ...t, tatakai_id: tatakaiId })));
  }
}

export async function upsertFromAniListMedia(raw: AniListMedia): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const media = anilistToTatakaiMedia(raw, "anilist");

  let existing = null as { tatakai_id: string } | null;
  if (media.anilistId) {
    const { data } = await sb.from("content_items").select("tatakai_id").eq("anilist_id", media.anilistId).maybeSingle();
    existing = data;
  }
  if (!existing && media.malId) {
    const { data } = await sb.from("content_items").select("tatakai_id").eq("mal_id", media.malId).maybeSingle();
    existing = data;
  }

  const tatakaiId = existing?.tatakai_id;
  const payload = tatakaiMediaToDbRow(media, tatakaiId);

  if (tatakaiId) {
    const { error } = await sb.from("content_items").update(payload).eq("tatakai_id", tatakaiId);
    if (error) {
      log.error({ error }, "content_items update failed");
      throw error;
    }
    await upsertTitles(sb, tatakaiId, media);
    await upsertEpisodeStubs(sb, tatakaiId, raw.episodes ?? media.episodes);
    return tatakaiId;
  }

  const { data: inserted, error } = await sb.from("content_items").insert(payload).select("tatakai_id").single();
  if (error || !inserted) {
    log.error({ error }, "content_items insert failed");
    throw error ?? new Error("insert failed");
  }
  const id = String(inserted.tatakai_id);
  await upsertTitles(sb, id, media);
  await upsertEpisodeStubs(sb, id, raw.episodes ?? media.episodes);
  return id;
}

async function upsertEpisodeStubs(
  sb: NonNullable<ReturnType<typeof getSupabase>>,
  tatakaiId: string,
  episodeCount?: number | null,
) {
  const n = episodeCount ?? 0;
  if (n <= 0 || n > 2000) return;
  await sb.from("episode_items").delete().eq("tatakai_id", tatakaiId);
  const rows = Array.from({ length: n }, (_, i) => ({
    tatakai_id: tatakaiId,
    episode_number: i + 1,
    episode_internal_id: `tatakai:${tatakaiId}:ep:${i + 1}`,
  }));
  await sb.from("episode_items").insert(rows);
}
