import { Hono } from "hono";
import { jsonOk } from "../../lib/envelope.js";
import { requireAdminSecret } from "../../middleware/auth.js";
import { ingestFribbMappings } from "../../services/mapping/fribbIngest.js";
import { getSupabase } from "../../lib/supabase.js";
import { upsertMangaMapping } from "../../services/mapping/mangaMapping.js";
import { anilistClient } from "../../providers/anilist/client.js";
import { QUERY_MANGA_BY_ID } from "../../providers/anilist/queries.js";
import type { AniListMedia } from "../../providers/anilist/types.js";

const adminMappings = new Hono();
adminMappings.use("*", requireAdminSecret);

adminMappings.get("/stats", async (c) => {
  const sb = getSupabase();
  if (!sb) return c.json(jsonOk({ configured: false }));
  const [{ count: animeCount }, { count: mangaCount }] = await Promise.all([
    sb.schema("mappings").from("anime_id_map").select("*", { count: "exact", head: true }),
    sb.schema("mappings").from("manga_id_map").select("*", { count: "exact", head: true }),
  ]);
  return c.json(jsonOk({ configured: true, animeCount: animeCount ?? 0, mangaCount: mangaCount ?? 0 }));
});

adminMappings.post("/ingest", async (c) => {
  const result = await ingestFribbMappings();
  return c.json(jsonOk(result));
});

adminMappings.post("/refresh-manga/:anilistId", async (c) => {
  const anilistId = Number(c.req.param("anilistId"));
  if (!Number.isFinite(anilistId)) {
    return c.json({ success: false, error: "Invalid AniList ID" }, 400);
  }
  const data = await anilistClient.query<{ Media: AniListMedia | null }>(QUERY_MANGA_BY_ID, { id: anilistId });
  if (!data.Media) return c.json({ success: false, error: "Manga not found" }, 404);
  const upserted = await upsertMangaMapping(data.Media);
  return c.json(jsonOk(upserted));
});

adminMappings.post("/refresh-manga-bulk", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const pages = Math.min(Math.max(Number(body?.pages) || 5, 1), 20);
  const perPage = Math.min(Math.max(Number(body?.perPage) || 50, 1), 50);
  const { bulkRefreshMangaMappings } = await import("../../services/mangaCatalog.js");
  const result = await bulkRefreshMangaMappings(pages, perPage);
  return c.json(jsonOk(result));
});

export { adminMappings as adminMappingsRouter };
