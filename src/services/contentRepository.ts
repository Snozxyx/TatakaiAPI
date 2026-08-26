import { getSupabase } from "../lib/supabase.js";
import { dbRowToTatakaiMedia } from "./normalize.js";
import type { TatakaiMedia } from "../types/tatakaiMedia.js";

export async function findByTatakaiId(id: string): Promise<TatakaiMedia | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from("content_items").select("*").eq("tatakai_id", id).maybeSingle();
  return data ? dbRowToTatakaiMedia(data as Record<string, unknown>) : null;
}

export async function findByAnilistId(id: number): Promise<TatakaiMedia | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from("content_items").select("*").eq("anilist_id", id).maybeSingle();
  return data ? dbRowToTatakaiMedia(data as Record<string, unknown>) : null;
}

export async function findByMalId(id: number): Promise<TatakaiMedia | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from("content_items").select("*").eq("mal_id", id).maybeSingle();
  return data ? dbRowToTatakaiMedia(data as Record<string, unknown>) : null;
}

export async function listByIds(tatakaiIds: string[]): Promise<TatakaiMedia[]> {
  const sb = getSupabase();
  if (!sb || !tatakaiIds.length) return [];
  const { data } = await sb.from("content_items").select("*").in("tatakai_id", tatakaiIds);
  return (data ?? []).map((r) => dbRowToTatakaiMedia(r as Record<string, unknown>));
}

export async function getProviderMappings(tatakaiId: string): Promise<Record<string, unknown>[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb.from("content_provider_mappings").select("*").eq("tatakai_id", tatakaiId);
  return data ?? [];
}

export async function listEpisodes(tatakaiId: string): Promise<Record<string, unknown>[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("episode_items")
    .select("*")
    .eq("tatakai_id", tatakaiId)
    .order("episode_number", { ascending: true });
  return data ?? [];
}

export async function getEpisode(tatakaiId: string, episodeNumber: number): Promise<Record<string, unknown> | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb
    .from("episode_items")
    .select("*")
    .eq("tatakai_id", tatakaiId)
    .eq("episode_number", episodeNumber)
    .maybeSingle();
  return data;
}
