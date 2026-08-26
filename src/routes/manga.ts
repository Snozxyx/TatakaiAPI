import { Hono } from "hono";
import { jsonOk } from "../lib/envelope.js";
import * as manga from "../services/mangaCatalog.js";
import { attachMappingToMedia } from "../services/mapping/mappingResolver.js";

const mangaRouter = new Hono();

function num(v: string | undefined, d: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

mangaRouter.get("/search", async (c) => {
  const q = String(c.req.query("q") || "").trim();
  const page = num(c.req.query("page"), 1);
  const perPage = num(c.req.query("perPage"), 20);
  const isAdultRaw = c.req.query("isAdult");
  const isAdult =
    isAdultRaw === "true"
      ? true
      : isAdultRaw === "false"
        ? false
        : undefined;
  const genre = c.req.query("genre") || undefined;

  const res = await manga.browseManga({
    query: q || undefined,
    page,
    perPage,
    isAdult,
    mode: c.req.query("mode") || undefined,
    sort: c.req.query("sort") || undefined,
    genre,
    origin: c.req.query("origin") || undefined,
    format: c.req.query("type") || c.req.query("format") || undefined,
    status: c.req.query("status") || undefined,
  });

  let combinedResults = res.media;
  let metaSource = "anilist";

  // If genre filter is provided and AniList returned few results, try MangaBaka tag search
  if (genre && combinedResults.length < perPage) {
    try {
      const { fetchMangaBakaSeriesByTag } = await import("../services/mapping/mangabaka.js");
      const tagResults = await fetchMangaBakaSeriesByTag(genre, { limit: perPage - combinedResults.length });
      
      if (tagResults && tagResults.length > 0) {
        // Deduplicate by anilistId
        const existingAnilistIds = new Set(combinedResults.map(m => m.anilistId).filter(Boolean));
        const uniqueTagResults = tagResults.filter(t => !existingAnilistIds.has(t.anilistId));
        combinedResults = [...combinedResults, ...uniqueTagResults];
        metaSource = "anilist+mangabaka";
      }
    } catch (err) {
      // Non-fatal: tag search enrichment failure shouldn't break the whole query
      console.warn("[manga search] MangaBaka tag search failed:", err);
    }
  }

  const wrapped = await Promise.all(combinedResults.map((m) => attachMappingToMedia(m)));
  return c.json(jsonOk(wrapped, {
    page: res.pageInfo.currentPage,
    perPage: res.pageInfo.perPage,
    total: res.pageInfo.total + (combinedResults.length - res.media.length),
    hasNextPage: res.pageInfo.hasNextPage || combinedResults.length >= perPage,
    lastPage: res.pageInfo.lastPage,
    source: metaSource,
  }));
});

mangaRouter.get("/mal/:id/full", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, error: "invalid id" }, 400);
  const data = await manga.getJikanMangaFull(id);
  return c.json(jsonOk(data, { source: "jikan" }));
});

mangaRouter.get("/mal/:id/characters", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, error: "invalid id" }, 400);
  const data = await manga.getJikanMangaCharacters(id);
  return c.json(jsonOk(data, { source: "jikan" }));
});

mangaRouter.get("/by-anilist/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, error: "invalid anilist id" }, 400);
  const media = await manga.getMangaByAniListId(id);
  if (!media) return c.json({ success: false, error: "not found" }, 404);
  return c.json(jsonOk(await attachMappingToMedia(media), { source: "anilist" }));
});

mangaRouter.get("/by-mal/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, error: "invalid mal id" }, 400);
  const media = await manga.getMangaByMalId(id);
  if (!media) return c.json({ success: false, error: "not found" }, 404);
  return c.json(jsonOk(await attachMappingToMedia(media), { source: "anilist" }));
});

mangaRouter.get("/:id/chapters", async (c) => {
  const rawId = String(c.req.param("id") || "");
  let anilistId = Number(rawId);
  let media = Number.isFinite(anilistId) && anilistId > 0 ? await manga.getMangaByAniListId(anilistId) : null;

  if (!media && rawId.startsWith("anilist:")) {
    anilistId = Number(rawId.replace("anilist:", ""));
    if (Number.isFinite(anilistId) && anilistId > 0) {
      media = await manga.getMangaByAniListId(anilistId);
    }
  }

  if (!media && rawId.startsWith("mal:")) {
    const malId = Number(rawId.replace("mal:", ""));
    if (Number.isFinite(malId) && malId > 0) {
      media = await manga.getMangaByMalId(malId);
    }
  }

  if (!media) return c.json({ success: false, error: "not found" }, 404);

  // Optional client-supplied extension chapter payloads (desktop merge)
  let extensionChapters: unknown[] = [];
  try {
    const raw = c.req.query("extensionChapters");
    if (raw) extensionChapters = JSON.parse(raw);
  } catch {
    extensionChapters = [];
  }

  const { buildChapterHierarchy } = await import("../services/mapping/chapterMerge.js");
  const hierarchy = buildChapterHierarchy({
    anilistId: media.anilistId,
    totalChapters: Number(media.chapters ?? 0),
    extensionChapters: Array.isArray(extensionChapters) ? extensionChapters as any : [],
  });

  return c.json(jsonOk(hierarchy, { source: "anilist" }));
});

mangaRouter.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ success: false, error: "invalid id" }, 400);
  const media = await manga.getMangaByAniListId(id);
  if (!media) return c.json({ success: false, error: "not found" }, 404);
  return c.json(jsonOk(await attachMappingToMedia(media), { source: "anilist" }));
});

export { mangaRouter };