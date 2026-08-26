import { Hono } from "hono";
import { jsonOk } from "../lib/envelope.js";
import {
  resolveAnimeMappingByAnidbId,
  resolveAnimeMappingByAniListId,
  resolveAnimeMappingByMalId,
  resolveMappingByTatakaiId,
  resolveMangaMappingByAniListId,
  resolveMangaMappingByMalId,
  attachMappingToMedia,
  isShallowMapping,
} from "../services/mapping/mappingResolver.js";
import * as catalog from "../services/catalog.js";
import { fetchAniZipMapping } from "../services/mapping/anizip.js";
import { fetchMangaBakaSeries } from "../services/mapping/mangabaka.js";
import { fetchKitsuChapterHierarchy } from "../services/mapping/kitsu.js";

const mappingRouter = new Hono();

// ── External enrichment ───────────────────────────────────────────────────────
//
// ani.zip / MangaBaka / Kitsu used to be called from the renderer. They live here
// now so there is one shared cache instead of one per client, one place to absorb
// each upstream's quirks, and no third-party host in the app's CSP.
//
// These must stay above the `/:tatakaiId` catch-all below — Hono matches in
// registration order, and although the paths are three segments deep and would
// not collide today, a future one-segment route would.

/** `?force=1` bypasses the cache. Handy when an upstream has just corrected a record. */
function isForced(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

/**
 * ani.zip episode metadata for an AniList anime id.
 *
 * Answers 404 rather than an empty envelope when ani.zip has no record: the
 * caller treats this as optional enrichment and a distinguishable miss lets it
 * cache the negative.
 */
mappingRouter.get("/anime/:anilistId/anizip", async (c) => {
  const anilistId = Number(c.req.param("anilistId"));
  if (!Number.isFinite(anilistId) || anilistId <= 0) {
    return c.json({ success: false, data: null, error: "Invalid AniList id" }, 400);
  }

  const mapping = await fetchAniZipMapping(anilistId, { force: isForced(c.req.query("force")) });
  if (!mapping) {
    return c.json({ success: false, data: null, error: "No ani.zip mapping for this id" }, 404);
  }
  return c.json(jsonOk(mapping, { cache: "hit", ttlSec: 3600, source: "mixed" }));
});

/** MangaBaka series record for an AniList manga id. */
mappingRouter.get("/manga/:anilistId/mangabaka", async (c) => {
  const anilistId = Number(c.req.param("anilistId"));
  if (!Number.isFinite(anilistId) || anilistId <= 0) {
    return c.json({ success: false, data: null, error: "Invalid AniList id" }, 400);
  }

  const series = await fetchMangaBakaSeries(anilistId, { force: isForced(c.req.query("force")) });
  if (!series) {
    return c.json({ success: false, data: null, error: "No MangaBaka record for this id" }, 404);
  }
  return c.json(jsonOk(series, { cache: "hit", ttlSec: 21600, source: "mixed" }));
});

/**
 * Volume → chapter hierarchy for an AniList manga id.
 *
 * Two hops: AniList id → MangaBaka → `source.kitsu.id` → Kitsu chapters. A caller
 * that already knows the Kitsu id can skip the first hop with `?kitsuId=`.
 */
mappingRouter.get("/manga/:anilistId/chapters", async (c) => {
  const anilistId = Number(c.req.param("anilistId"));
  const force = isForced(c.req.query("force"));
  const explicitKitsuId = String(c.req.query("kitsuId") ?? "").trim();

  let kitsuId = explicitKitsuId;
  if (!kitsuId) {
    if (!Number.isFinite(anilistId) || anilistId <= 0) {
      return c.json({ success: false, data: null, error: "Invalid AniList id" }, 400);
    }
    const series = await fetchMangaBakaSeries(anilistId, { force });
    if (!series?.kitsuId) {
      return c.json(
        { success: false, data: null, error: "No Kitsu id mapped for this manga" },
        404,
      );
    }
    kitsuId = String(series.kitsuId);
  }

  const maxChapters = Number(c.req.query("maxChapters"));
  const hierarchy = await fetchKitsuChapterHierarchy(kitsuId, {
    force,
    maxChapters: Number.isFinite(maxChapters) && maxChapters > 0 ? maxChapters : undefined,
  });
  if (!hierarchy) {
    return c.json({ success: false, data: null, error: "No Kitsu chapters for this manga" }, 404);
  }
  return c.json(jsonOk(hierarchy, { cache: "hit", ttlSec: 21600, source: "mixed" }));
});

mappingRouter.get("/by-anilist/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const mapping =
    (await resolveAnimeMappingByAniListId(id)) ?? (await resolveMangaMappingByAniListId(id));
  
  const isShallow = isShallowMapping(mapping);

  if (mapping && !isShallow) return c.json(jsonOk({ id: null, mapping }));

  // Fallback or Enhancement: fetch media and extract
  const hit = await catalog.getMediaByAnilistId(id);
  if (!hit) {
    if (mapping) return c.json(jsonOk({ id: null, mapping }));
    return c.json({ success: false, error: "not found" }, 404);
  }
  const wrapped = await attachMappingToMedia(hit.media);
  return c.json(jsonOk({ id: wrapped.id, mapping: wrapped.mapping }));
});

mappingRouter.get("/by-mal/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const mapping =
    (await resolveAnimeMappingByMalId(id)) ?? (await resolveMangaMappingByMalId(id));
  
  const isShallow = isShallowMapping(mapping);

  if (mapping && !isShallow) return c.json(jsonOk({ id: null, mapping }));

  // Fallback or Enhancement: fetch media and extract
  const hit = await catalog.getMediaByMalId(id);
  if (!hit) {
    if (mapping) return c.json(jsonOk({ id: null, mapping }));
    return c.json({ success: false, error: "not found" }, 404);
  }
  const wrapped = await attachMappingToMedia(hit.media);
  return c.json(jsonOk({ id: wrapped.id, mapping: wrapped.mapping }));
});

mappingRouter.get("/by-anidb/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const mapping = await resolveAnimeMappingByAnidbId(id);
  if (!mapping) return c.json({ success: false, error: "not found" }, 404);
  return c.json(jsonOk({ id: null, mapping }));
});

mappingRouter.get("/:tatakaiId", async (c) => {
  const tatakaiId = c.req.param("tatakaiId");
  const data = await resolveMappingByTatakaiId(tatakaiId);
  if (!data) return c.json({ success: false, error: "not found" }, 404);
  return c.json(jsonOk(data));
});

export { mappingRouter };