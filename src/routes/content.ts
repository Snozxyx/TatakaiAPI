import { Hono } from "hono";
import { jsonOk } from "../lib/envelope.js";
import { defaultTtlSec, memoryCache } from "../lib/cache.js";
import * as catalog from "../services/catalog.js";
import * as repo from "../services/contentRepository.js";
import { attachMappingToMedia } from "../services/mapping/mappingResolver.js";

const content = new Hono();

function num(v: string | undefined, d: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

content.get("/home", async (c) => {
  const key = "content:home";
  const hit = memoryCache.get(key);
  if (hit && hit.meta === "hit") {
    return c.json(jsonOk(hit.hit, { cache: "hit", ttlSec: defaultTtlSec(), source: "mixed" }));
  }
  const bundle = await catalog.getHomeBundle();
  memoryCache.set(key, bundle, defaultTtlSec());
  return c.json(jsonOk(bundle, { cache: "miss", ttlSec: defaultTtlSec(), source: "anilist" }));
});

content.get("/trending", async (c) => {
  const page = num(c.req.query("page"), 1);
  const perPage = num(c.req.query("perPage"), 20);
  const { media, source } = await catalog.getTrending(page, perPage);
  const wrapped = await Promise.all(media.map((m) => attachMappingToMedia(m)));
  return c.json(
    jsonOk(wrapped, {
      cache: "miss",
      ttlSec: defaultTtlSec(),
      source,
      page,
      perPage,
      hasNextPage: media.length >= perPage,
    }),
  );
});

content.get("/popular", async (c) => {
  const page = num(c.req.query("page"), 1);
  const perPage = num(c.req.query("perPage"), 20);
  const { media, source } = await catalog.getPopular(page, perPage);
  const wrapped = await Promise.all(media.map((m) => attachMappingToMedia(m)));
  return c.json(jsonOk(wrapped, { cache: "miss", ttlSec: defaultTtlSec(), source, page, perPage }));
});

content.get("/top-rated", async (c) => {
  const page = num(c.req.query("page"), 1);
  const perPage = num(c.req.query("perPage"), 20);
  const { media, source } = await catalog.getTopRated(page, perPage);
  const wrapped = await Promise.all(media.map((m) => attachMappingToMedia(m)));
  return c.json(jsonOk(wrapped, { cache: "miss", ttlSec: defaultTtlSec(), source, page, perPage }));
});

content.get("/seasonal", async (c) => {
  const page = num(c.req.query("page"), 1);
  const perPage = num(c.req.query("perPage"), 20);
  const season = (c.req.query("season") ?? "WINTER").toUpperCase();
  const year = num(c.req.query("year"), new Date().getFullYear());
  const { media, source } = await catalog.getSeasonal(season, year, page, perPage);
  const wrapped = await Promise.all(media.map((m) => attachMappingToMedia(m)));
  return c.json(jsonOk(wrapped, { cache: "miss", ttlSec: defaultTtlSec(), source, page, perPage }));
});

content.get("/upcoming", async (c) => {
  const page = num(c.req.query("page"), 1);
  const perPage = num(c.req.query("perPage"), 20);
  const { media, source } = await catalog.getUpcoming(page, perPage);
  const wrapped = await Promise.all(media.map((m) => attachMappingToMedia(m)));
  return c.json(jsonOk(wrapped, { cache: "miss", ttlSec: defaultTtlSec(), source, page, perPage }));
});

content.get("/genres", async (c) => {
  const genres = await catalog.getGenresList();
  return c.json(jsonOk(genres, { cache: "miss", ttlSec: 86400, source: "anilist" }));
});

content.get("/genre/:slug", async (c) => {
  const slug = c.req.param("slug");
  const page = num(c.req.query("page"), 1);
  const perPage = num(c.req.query("perPage"), 20);
  const res = await catalog.searchAnilist({
    page,
    perPage,
    genres: [slug],
    sortBy: "POPULARITY_DESC",
    isAdult: false,
  });
  const wrapped = await Promise.all(res.media.map((m) => attachMappingToMedia(m)));
  return c.json(
    jsonOk(wrapped, {
      ...res.pageInfo,
      cache: "miss",
      ttlSec: defaultTtlSec(),
      source: "mixed",
    }),
  );
});

content.get("/search", async (c) => {
  const q = c.req.query("q") ?? "";
  const page = num(c.req.query("page"), 1);
  const perPage = num(c.req.query("perPage"), 20);
  const genres = c.req.query("genres")?.split(",").filter(Boolean);
  const format = c.req.query("format")?.split(",").filter(Boolean);
  const status = c.req.query("status")?.split(",").filter(Boolean);
  const season = c.req.query("season")?.split(",").filter(Boolean);
  const sort =
    (c.req.query("sort") as
      | "TRENDING_DESC"
      | "POPULARITY_DESC"
      | "SCORE_DESC"
      | "START_DATE_DESC"
      | "TITLE_ROMAJI"
      | "SEARCH_MATCH") ?? "SEARCH_MATCH";
  const isAdultRaw = c.req.query("isAdult");
  const isAdult =
    isAdultRaw === "true"
      ? true
      : isAdultRaw === "false"
        ? false
        : undefined;

  const res = await catalog.searchAnilist({
    query: q,
    page,
    perPage,
    genres,
    format: format as never,
    status: status as never,
    season: season as never,
    sortBy: sort,
    isAdult,
    yearMin: num(c.req.query("yearMin"), NaN) || undefined,
    yearMax: num(c.req.query("yearMax"), NaN) || undefined,
    scoreMin: num(c.req.query("scoreMin"), NaN) || undefined,
    scoreMax: num(c.req.query("scoreMax"), NaN) || undefined,
    epMin: num(c.req.query("epMin"), NaN) || undefined,
    epMax: num(c.req.query("epMax"), NaN) || undefined,
  });
  const wrapped = await Promise.all(res.media.map((m) => attachMappingToMedia(m)));
  return c.json(jsonOk({ ...res, media: wrapped }, { cache: "miss", ttlSec: defaultTtlSec(), source: "mixed" }));
});

content.get("/mal/:malId", async (c) => {
  const malId = num(c.req.param("malId"), 0);
  const hit = await catalog.getMediaByMalId(malId);
  if (!hit) return c.json({ success: false, data: null, error: "Not found" }, 404);
  const wrapped = await attachMappingToMedia(hit.media);
  return c.json(jsonOk(wrapped, { cache: "miss", ttlSec: defaultTtlSec(), source: hit.source }));
});

content.get("/mal/:malId/episodes", async (c) => {
  const malId = num(c.req.param("malId"), 0);
  const page = num(c.req.query("page"), 1);
  const data = await catalog.getJikanAnimeEpisodes(malId, page);
  return c.json(
    jsonOk(data.data, {
      page,
      hasNextPage: Boolean(data.pagination?.has_next_page),
      lastPage: data.pagination?.last_visible_page,
      source: "jikan",
    }),
  );
});

content.get("/mal/:malId/full", async (c) => {
  const malId = num(c.req.param("malId"), 0);
  const data = await catalog.getJikanAnimeFull(malId);
  return c.json(jsonOk(data, { cache: "miss", ttlSec: defaultTtlSec(), source: "jikan" }));
});

content.get("/by-anilist/:id", async (c) => {
  const id = num(c.req.param("id"), 0);
  const hit = await catalog.getMediaByAnilistId(id);
  if (!hit) return c.json({ success: false, data: null, error: "Not found" }, 404);
  const wrapped = await attachMappingToMedia(hit.media);
  return c.json(jsonOk(wrapped, { cache: "miss", ttlSec: defaultTtlSec(), source: hit.source }));
});

content.get("/:id/provider-mappings", async (c) => {
  const id = c.req.param("id");
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  let tatakaiId = id;
  if (!uuid) {
    const m = await catalog.getMediaByAnilistId(num(id, 0));
    if (!m?.media.tatakaiId) return c.json(jsonOk([]));
    tatakaiId = m.media.tatakaiId!;
  }
  const rows = await repo.getProviderMappings(tatakaiId);
  return c.json(jsonOk(rows, { cache: "miss", ttlSec: defaultTtlSec(), source: "db" }));
});

content.get("/:id/episodes", async (c) => {
  const id = c.req.param("id");
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  let tatakaiId = id;
  if (!uuid) {
    const m = await catalog.getMediaByAnilistId(num(id, 0));
    if (!m?.media.tatakaiId) return c.json(jsonOk([]));
    tatakaiId = m.media.tatakaiId!;
  }
  const eps = await repo.listEpisodes(tatakaiId);
  return c.json(jsonOk(eps, { cache: "miss", ttlSec: defaultTtlSec(), source: "db" }));
});

content.get("/:id/episodes/:episodeNumber", async (c) => {
  const id = c.req.param("id");
  const ep = num(c.req.param("episodeNumber"), 0);
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  let tatakaiId = id;
  if (!uuid) {
    const m = await catalog.getMediaByAnilistId(num(id, 0));
    if (!m?.media.tatakaiId) return c.json({ success: false, data: null, error: "Not found" }, 404);
    tatakaiId = m.media.tatakaiId!;
  }
  const row = await repo.getEpisode(tatakaiId, ep);
  if (!row) return c.json({ success: false, data: null, error: "Not found" }, 404);
  return c.json(jsonOk(row, { cache: "miss", ttlSec: defaultTtlSec(), source: "db" }));
});

/**
 * Episode-name search — `GET /search/episodes?q=<query>&page=1&perPage=10`
 *
 * Searches AniList's `streamingEpisodes[].title` field (already returned in
 * MEDIA_FIELDS) and Jikan's episode titles via a two-step process:
 *   1. Run a broad anime-title search for the query on AniList.
 *   2. For each candidate, check if the query matches any streaming episode title.
 *   3. Return matching (anime, episodeNumber, episodeTitle) triples, marked with
 *      `_matchType: "episode"` so the renderer can badge them distinctly.
 *
 * This is intentionally lightweight — it only looks inside streaming episodes
 * AniList already returns for top search results, so it costs no extra API calls.
 */
content.get("/search/episodes", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (!q || q.length < 2) {
    return c.json(jsonOk([], { cache: "miss", ttlSec: 60, source: "anilist" }));
  }

  const page = num(c.req.query("page"), 1);
  const perPage = num(c.req.query("perPage"), 10);

  // Fetch a wide set of anime candidates for the query
  const res = await catalog.searchAnilist({ query: q, page: 1, perPage: 25 });

  const normalizedQ = q.toLowerCase();

  type EpisodeHit = {
    animeId: string;
    anilistId: number | null;
    malId: number | null;
    animeName: string;
    animePoster: string | null;
    episodeTitle: string;
    episodeThumbnail: string | null;
    episodeUrl: string | null;
    _matchType: "episode";
  };

  const hits: EpisodeHit[] = [];

  for (const media of res.media) {
    const episodes = (media as any).streamingEpisodes ?? [];
    for (const ep of episodes) {
      const title = String(ep?.title ?? "").trim();
      if (!title) continue;
      if (title.toLowerCase().includes(normalizedQ)) {
        hits.push({
          animeId: String(media.tatakaiId || media.anilistId || ""),
          anilistId: media.anilistId ?? null,
          malId: media.malId ?? null,
          animeName:
            (media as any).titleEnglish ||
            (media as any).titleRomaji ||
            (media as any).title?.english ||
            (media as any).title?.romaji ||
            "Unknown",
          animePoster:
            (media as any).coverImageLarge ||
            (media as any).coverImageMedium ||
            null,
          episodeTitle: title,
          episodeThumbnail: ep?.thumbnail ?? null,
          episodeUrl: ep?.url ?? null,
          _matchType: "episode",
        });
        if (hits.length >= perPage * page) break;
      }
    }
    if (hits.length >= perPage * page) break;
  }

  const pageStart = (page - 1) * perPage;
  const pageSlice = hits.slice(pageStart, pageStart + perPage);

  return c.json(
    jsonOk(pageSlice, {
      cache: "miss",
      ttlSec: 60,
      source: "anilist",
      page,
      perPage,
      hasNextPage: hits.length > pageStart + perPage,
    }),
  );
});

content.get("/:id", async (c) => {
  const id = c.req.param("id");
  const hit = await catalog.resolveIdParam(id);
  if (!hit) return c.json({ success: false, data: null, error: "Not found" }, 404);
  const wrapped = await attachMappingToMedia(hit.media);
  return c.json(jsonOk(wrapped, { cache: "miss", ttlSec: defaultTtlSec(), source: hit.source }));
});

export { content as contentRouter };
