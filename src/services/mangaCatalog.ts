import { anilistClient } from "../providers/anilist/client.js";
import {
  QUERY_MANGA_BY_ID,
  QUERY_MANGA_BY_MAL,
  QUERY_MANGA_PAGE,
  QUERY_MANGA_SEARCH,
} from "../providers/anilist/queries.js";
import type { AniListMedia, AniListPage } from "../providers/anilist/types.js";
import { anilistToTatakaiMedia } from "./normalize.js";
import { upsertMangaMapping } from "./mapping/mangaMapping.js";
import { jikanClient } from "../providers/jikan/client.js";
import type { TatakaiMedia } from "../types/tatakaiMedia.js";

export type MangaBrowseParams = {
  query?: string;
  page?: number;
  perPage?: number;
  isAdult?: boolean;
  mode?: string;
  sort?: string;
  genre?: string;
  origin?: string;
  format?: string;
  status?: string;
};

const SORT_MAP: Record<string, string> = {
  TRENDING_DESC: "TRENDING_DESC",
  POPULARITY_DESC: "POPULARITY_DESC",
  SCORE_DESC: "SCORE_DESC",
  UPDATED_AT_DESC: "UPDATED_AT_DESC",
  START_DATE_DESC: "START_DATE_DESC",
  FAVOURITES_DESC: "FAVOURITES_DESC",
  trending: "TRENDING_DESC",
  popularity: "POPULARITY_DESC",
  rating: "SCORE_DESC",
  latestUpdate: "UPDATED_AT_DESC",
  relevance: "SEARCH_MATCH",
  chapterCount: "POPULARITY_DESC",
};

const ORIGIN_MAP: Record<string, string> = {
  jp: "JP",
  japan: "JP",
  kr: "KR",
  korea: "KR",
  cn: "CN",
  zh: "CN",
  china: "CN",
  tw: "TW",
};

const FORMAT_MAP: Record<string, string> = {
  manga: "MANGA",
  novel: "NOVEL",
  oneshot: "ONE_SHOT",
  "one_shot": "ONE_SHOT",
};

function resolveSort(params: MangaBrowseParams): string[] {
  const mode = String(params.mode || "").toLowerCase();
  if (params.sort && SORT_MAP[params.sort]) return [SORT_MAP[params.sort]];
  if (mode === "latest" || mode === "new-chap" || mode === "added") return ["UPDATED_AT_DESC"];
  if (mode === "popular" || mode === "explore") return ["POPULARITY_DESC"];
  if (mode === "recommendation" || mode === "foryou") return ["SCORE_DESC"];
  if (mode === "random") return ["POPULARITY_DESC"];
  if (params.query?.trim()) return ["SEARCH_MATCH", "POPULARITY_DESC"];
  return ["TRENDING_DESC"];
}

function resolveOrigin(params: MangaBrowseParams): string | undefined {
  const origin = String(params.origin || "").toLowerCase().trim();
  if (origin && ORIGIN_MAP[origin]) return ORIGIN_MAP[origin];
  const format = String(params.format || "").toLowerCase();
  if (format === "manhwa") return "KR";
  if (format === "manhua") return "CN";
  return undefined;
}

async function mapAndUpsert(page: AniListPage<AniListMedia>) {
  const media = page.media.map((m) => anilistToTatakaiMedia(m));
  await Promise.all(page.media.map((m) => upsertMangaMapping(m).catch(() => null)));
  return { media, pageInfo: page.pageInfo };
}

/** @deprecated Prefer browseManga — kept for simple call sites */
export async function searchManga(query: string, page = 1, perPage = 20, isAdult?: boolean) {
  return browseManga({ query, page, perPage, isAdult });
}

export async function browseManga(params: MangaBrowseParams = {}): Promise<{
  media: TatakaiMedia[];
  pageInfo: AniListPage<AniListMedia>["pageInfo"];
}> {
  const page = params.page ?? 1;
  const perPage = Math.min(Math.max(params.perPage ?? 20, 1), 50);
  const isAdultParam = params.isAdult === true ? undefined : params.isAdult === false ? false : false;
  const sort = resolveSort(params);
  const countryOfOrigin = resolveOrigin(params);
  const genres = params.genre ? [params.genre] : undefined;
  const format = params.format && FORMAT_MAP[params.format.toLowerCase()]
    ? FORMAT_MAP[params.format.toLowerCase()]
    : undefined;
  const search = params.query?.trim() || undefined;

  // Empty browse (trending/popular feeds) — no search string required
  if (!search && !genres) {
    const data = await anilistClient.query<{ Page: AniListPage<AniListMedia> }>(QUERY_MANGA_PAGE, {
      page,
      perPage,
      sort,
      countryOfOrigin,
      isAdult: isAdultParam,
    });
    return mapAndUpsert(data.Page);
  }

  const data = await anilistClient.query<{ Page: AniListPage<AniListMedia> }>(QUERY_MANGA_SEARCH, {
    page,
    perPage,
    search,
    isAdult: isAdultParam,
    sort,
    genres,
    countryOfOrigin,
    format,
    status: params.status || undefined,
  });
  return mapAndUpsert(data.Page);
}

export async function getMangaByAniListId(id: number) {
  const data = await anilistClient.query<{ Media: AniListMedia | null }>(QUERY_MANGA_BY_ID, { id });
  if (!data.Media) return null;
  await upsertMangaMapping(data.Media).catch(() => null);
  return anilistToTatakaiMedia(data.Media);
}

export async function getMangaByMalId(idMal: number) {
  const data = await anilistClient.query<{ Media: AniListMedia | null }>(QUERY_MANGA_BY_MAL, { idMal });
  if (!data.Media) return null;
  await upsertMangaMapping(data.Media).catch(() => null);
  return anilistToTatakaiMedia(data.Media);
}

export async function getJikanMangaFull(malId: number) {
  return jikanClient.getMangaFull(malId);
}

export async function getJikanMangaCharacters(malId: number) {
  return jikanClient.getMangaCharacters(malId);
}

/** Bulk ingest manga mappings from AniList trending/popular pages. */
export async function bulkRefreshMangaMappings(pages = 5, perPage = 50): Promise<{ upserted: number }> {
  let upserted = 0;
  for (let page = 1; page <= pages; page += 1) {
    for (const sort of [["TRENDING_DESC"], ["POPULARITY_DESC"]] as string[][]) {
      const data = await anilistClient.query<{ Page: AniListPage<AniListMedia> }>(QUERY_MANGA_PAGE, {
        page,
        perPage,
        sort,
        isAdult: false,
      });
      for (const m of data.Page.media) {
        await upsertMangaMapping(m).catch(() => null);
        upserted += 1;
      }
    }
  }
  return { upserted };
}
