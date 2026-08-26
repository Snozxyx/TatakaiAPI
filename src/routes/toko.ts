/**
 * TatakaiAPI — Toko routes.
 *
 * Stream/torrent sources are proxied to the toko-api service
 * (extension/toko/api, default port 8099) so the full provider set is
 * available without duplicating scraper code here.
 *
 * Falls back to justanime for the preview endpoint when toko-api is offline.
 *
 * Routes:
 *   GET /api/v3/toko/sources        — Full multi-provider sources (proxied)
 *   GET /api/v3/toko/stream         — Stream sources only (proxied)
 *   GET /api/v3/toko/torrent        — Torrent sources only (proxied)
 *   GET /api/v3/toko/debug          — Provider diagnostics (proxied)
 *   GET /api/v3/toko/preview        — AnimeLok/justanime preview for web
 *   GET /api/v3/toko/index/episodes — Episode index via Jikan
 *   GET /api/v3/toko/index/chapters — Stub (desktop only)
 *
 * Requirements: 7.1, 7.2, 7.3
 */

import { Hono } from "hono";
import { env } from "../config/env.js";
import { getJustAnimeStream } from "../providers/preview.js";
import { jikanClient } from "../providers/jikan/client.js";
import { resolveAnimeMappingByAniListId } from "../services/mapping/mappingResolver.js";

const toko = new Hono();

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Calculate a random timestamp in [floor(d*0.60), floor(d*0.80)]. */
function calcPreviewTimestamp(durationSec: number = 1440): number {
  const lo = Math.floor(durationSec * 0.6);
  const hi = Math.floor(durationSec * 0.8);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

/**
 * Proxy a request to the toko-api service, forwarding all query params.
 * Returns null when toko-api is unreachable.
 */
async function proxyToTokoApi(
  path: string,
  query: Record<string, string | string[] | undefined>,
): Promise<unknown | null> {
  const base = env.TOKO_API_URL?.trim();
  if (!base) return null;

  try {
    const url = new URL(`${base}${path}`);
    for (const [k, v] of Object.entries(query)) {
      if (v == null) continue;
      if (Array.isArray(v)) {
        v.forEach((item) => url.searchParams.append(k, item));
      } else {
        url.searchParams.set(k, v);
      }
    }
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ── Toko-api proxy routes ─────────────────────────────────────────────────────

/**
 * GET /api/v3/toko/sources
 * Full multi-provider stream + torrent sources.
 * Proxied to toko-api; falls back to empty on failure.
 */
toko.get("/sources", async (c) => {
  const query = c.req.query() as Record<string, string>;
  // Force JSON mode (no SSE) from the toko-api
  const proxied = await proxyToTokoApi("/api/v3/toko/sources", { ...query, stream: "0" });
  if (proxied) return c.json(proxied);

  // Fallback: justanime only
  const anilistId = Number(query.anilistId ?? 0);
  const episode = Number(query.episode ?? 1);
  const streamIndex = Number(query.stream ?? 0);
  if (!anilistId) return c.json({ sources: [], selectedIndex: streamIndex, count: 0 });

  try {
    const stream = await getJustAnimeStream(anilistId, episode);
    if (stream) {
      const sources = [{
        provider: "justanime",
        source: "justanime",
        url: stream.url,
        quality: "auto",
        isHls: stream.isHls,
        headers: stream.headers ?? {},
        subtitles: [],
        audioLanguage: "ja",
        sourceType: stream.isHls ? "hls" : "mp4",
      }];
      return c.json({ sources, selectedIndex: Math.min(streamIndex, 0), count: 1 });
    }
  } catch { /* ignore */ }
  return c.json({ sources: [], selectedIndex: 0, count: 0 });
});

/**
 * GET /api/v3/toko/stream — stream sources only.
 */
toko.get("/stream", async (c) => {
  const query = c.req.query() as Record<string, string>;
  const proxied = await proxyToTokoApi("/api/v3/toko/stream", { ...query, stream: "0" });
  if (proxied) return c.json(proxied);
  return c.json({ sources: [], count: 0 });
});

/**
 * GET /api/v3/toko/torrent — torrent sources only.
 */
toko.get("/torrent", async (c) => {
  const query = c.req.query() as Record<string, string>;
  const proxied = await proxyToTokoApi("/api/v3/toko/torrent", { ...query, stream: "0" });
  if (proxied) return c.json(proxied);
  return c.json({ sources: [], count: 0 });
});

/**
 * GET /api/v3/toko/debug — provider diagnostics.
 */
toko.get("/debug", async (c) => {
  const query = c.req.query() as Record<string, string>;
  const proxied = await proxyToTokoApi("/api/v3/toko/debug", query);
  if (proxied) return c.json(proxied);
  return c.json({ results: [], diagnostics: [] });
});

// ── Preview ───────────────────────────────────────────────────────────────────

/**
 * GET /api/v3/toko/preview — AnimeLok-backed preview for web users.
 * Requirements: 7.1
 */
toko.get("/preview", async (c) => {
  const anilistId = Number(c.req.query("anilistId") ?? 0);
  const episode = Number(c.req.query("episode") ?? 1);
  const durationParam = Number(c.req.query("duration") ?? 0);
  const durationSec = durationParam > 0 ? durationParam : 1440;
  const previewTimestampSec = calcPreviewTimestamp(durationSec);

  if (!anilistId) {
    return c.json({ provider: null, streamUrl: null, isHls: false, previewTimestampSec });
  }

  try {
    const stream = await getJustAnimeStream(anilistId, episode);
    if (stream) {
      return c.json({
        provider: "justanime",
        streamUrl: stream.url,
        isHls: stream.isHls,
        streamHeaders: stream.headers ?? null,
        previewTimestampSec,
      });
    }
  } catch (err) {
    console.error("[toko/preview] error:", err);
  }
  return c.json({ provider: null, streamUrl: null, isHls: false, previewTimestampSec });
});

// ── Episode index ─────────────────────────────────────────────────────────────

/**
 * GET /api/v3/toko/index/episodes — Jikan-backed episode index.
 * Requirements: 2.5.1, 2.5.2, 2.5.3
 */
toko.get("/index/episodes", async (c) => {
  const NULL_RESPONSE = {
    provider: null as null,
    episodeCount: 0,
    episodes: [] as Array<{ number: number; title?: string; aired?: string }>,
  };

  const anilistIdParam = c.req.query("anilistId");
  const malIdParam = c.req.query("malId");

  try {
    let malId: number | null = malIdParam ? Number(malIdParam) : null;

    if (!malId && anilistIdParam) {
      const anilistId = Number(anilistIdParam);
      if (anilistId) {
        const mapping = await resolveAnimeMappingByAniListId(anilistId);
        malId = mapping?.mal_id ?? null;
      }
    }

    if (!malId) return c.json(NULL_RESPONSE);

    const MAX_PAGES = 5;
    const allEpisodes: Array<{ number: number; title?: string; aired?: string }> = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
      const result = await jikanClient.getAnimeEpisodes(malId, page);
      const episodes = result?.data ?? [];

      for (const ep of episodes) {
        allEpisodes.push({
          number: ep.mal_id,
          ...(ep.title ? { title: ep.title } : {}),
          ...(ep.aired ? { aired: ep.aired } : {}),
        });
      }

      if (!result?.pagination?.has_next_page) break;
    }

    if (allEpisodes.length === 0) return c.json(NULL_RESPONSE);

    return c.json({
      provider: "jikan" as const,
      episodeCount: allEpisodes.length,
      episodes: allEpisodes,
    });
  } catch (err) {
    console.error("[toko/index/episodes] error:", err);
    return c.json(NULL_RESPONSE);
  }
});

/**
 * GET /api/v3/toko/index/chapters — Desktop only stub.
 * Requirements: 7.3
 */
toko.get("/index/chapters", async (c) => {
  return c.json({
    provider: null,
    chapterCount: 0,
    chapters: [] as Array<{ number: number; title?: string; scanlator?: string; releaseDate?: string }>,
  });
});

export { toko as tokoRouter };
