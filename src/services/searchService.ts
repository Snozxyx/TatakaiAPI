import { getSupabase } from "../lib/supabase.js";
import { dbRowToTatakaiMedia } from "./normalize.js";
import type { TatakaiMedia } from "../types/tatakaiMedia.js";

export interface SearchParams {
  query?: string;
  q?: string;
  page: number;
  perPage: number;
  genres?: string[];
  season?: string[];
  yearMin?: number;
  yearMax?: number;
  format?: string[];
  status?: string[];
  scoreMin?: number;
  scoreMax?: number;
  epMin?: number;
  epMax?: number;
  isAdult?: boolean;
  sort?: string;
  sortBy?: string;
}

export async function searchContent(p: SearchParams): Promise<{
  media: TatakaiMedia[];
  pageInfo: { total: number; currentPage: number; lastPage: number; hasNextPage: boolean; perPage: number };
}> {
  const sb = getSupabase();
  if (!sb) {
    return { media: [], pageInfo: { total: 0, currentPage: p.page, lastPage: 1, hasNextPage: false, perPage: p.perPage } };
  }

  let q = sb.from("content_items").select("*", { count: "exact" });

  if (p.isAdult === false) {
    // Show only non-adult content
    q = q.eq("is_adult", false);
  }
  // If true or undefined, include both adult and non-adult
  if (p.genres?.length) q = q.contains("genres", p.genres);
  if (p.format?.length) q = q.in("format", p.format);
  if (p.status?.length) q = q.in("status", p.status);
  if (p.yearMin != null) q = q.gte("season_year", p.yearMin);
  if (p.yearMax != null) q = q.lte("season_year", p.yearMax);
  if (p.scoreMin != null) q = q.gte("average_score", p.scoreMin);
  if (p.scoreMax != null) q = q.lte("average_score", p.scoreMax);
  if (p.epMin != null) q = q.gte("episodes", p.epMin);
  if (p.epMax != null) q = q.lte("episodes", p.epMax);
  if (p.season?.length) q = q.in("season", p.season);

  const qtext = p.query ?? p.q;
  if (qtext?.trim()) {
    const term = `%${qtext.trim()}%`;
    q = q.or(`title_romaji.ilike.${term},title_english.ilike.${term},title_native.ilike.${term}`);
  }

  const sortKey = p.sortBy ?? p.sort;
  const sortCol =
    sortKey === "POPULARITY_DESC"
      ? "popularity"
      : sortKey === "SCORE_DESC"
        ? "average_score"
        : sortKey === "START_DATE_DESC"
          ? "season_year"
          : sortKey === "TITLE_ROMAJI"
            ? "title_romaji"
            : "popularity";
  const ascending = sortKey === "TITLE_ROMAJI";

  const from = (p.page - 1) * p.perPage;
  const { data, count, error } = await q
    .order(sortCol, { ascending, nullsFirst: false })
    .range(from, from + p.perPage - 1);

  if (error) throw error;
  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / p.perPage));
  return {
    media: (data ?? []).map((r) => dbRowToTatakaiMedia(r as Record<string, unknown>)),
    pageInfo: {
      total,
      currentPage: p.page,
      lastPage,
      hasNextPage: p.page < lastPage,
      perPage: p.perPage,
    },
  };
}
