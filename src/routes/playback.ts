import { Hono } from "hono";
import { jsonOk } from "../lib/envelope.js";
import { getSupabase } from "../lib/supabase.js";
import * as repo from "../services/contentRepository.js";
import * as catalog from "../services/catalog.js";
import { listApprovedManifests } from "../services/extensionRegistry.js";
import { insertTelemetryBatch } from "../services/playbackTelemetry.js";

const playback = new Hono();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** True for anything that is a URL rather than an internal identifier. */
function looksLikeUrl(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) || value.startsWith("//");
}

function parseEpisodeNumberFromEpisodeId(rawEpisodeId: unknown): number {
  const value = String(rawEpisodeId || "").trim();
  if (!value) return 0;

  const fromQuery = value.match(/[?&]ep(?:isode)?=(\d{1,5})/i);
  if (fromQuery) return Number(fromQuery[1]);

  const fromSuffix = value.match(/(?:^|[:/_-])ep(?:isode)?[:/_-]?(\d{1,5})(?:$|[?&#])/i);
  if (fromSuffix) return Number(fromSuffix[1]);

  return 0;
}

function extractTatakaiIdCandidate(rawTatakaiId: unknown, rawEpisodeId: unknown): string {
  const tatakai = String(rawTatakaiId || "").trim();
  if (tatakai && !looksLikeUrl(tatakai)) return tatakai;

  const episodeId = String(rawEpisodeId || "").trim();
  if (!episodeId) return "";

  // An off-site watch page (AniList `streamingEpisodes[].url`) is not an id.
  // These used to arrive here as the whole episodeId and produced a bare
  // "Missing tatakaiId or episodeNumber" 400 with no hint as to why.
  if (looksLikeUrl(episodeId)) return "";

  // Pattern from frontend fallback episodes: "<id>?ep=12"
  const qIndex = episodeId.indexOf("?");
  if (qIndex > 0) return episodeId.slice(0, qIndex);

  return /^[\w:-]+$/.test(episodeId) ? episodeId : "";
}

/** Resolve whatever the client sent into a canonical tatakaiId, or "" if impossible. */
async function resolveTatakaiId(
  candidate: string,
  anilistId: number,
  malId: number,
): Promise<string> {
  if (candidate && UUID_RE.test(candidate)) return candidate;

  // A numeric candidate is an AniList id, not a tatakaiId.
  if (candidate && /^\d+$/.test(candidate)) {
    const m = await catalog.getMediaByAnilistId(Number(candidate));
    if (m?.media.tatakaiId) return m.media.tatakaiId;
  }

  // Fall through to the explicit ids even when a candidate existed: a candidate
  // that resolves to nothing is worth less than an AniList id that resolves.
  if (anilistId > 0) {
    const m = await catalog.getMediaByAnilistId(anilistId);
    if (m?.media.tatakaiId) return m.media.tatakaiId;
  }
  if (malId > 0) {
    const m = await catalog.getMediaByMalId(malId);
    if (m?.media.tatakaiId) return m.media.tatakaiId;
  }

  return candidate && !/^\d+$/.test(candidate) ? candidate : "";
}

/** Extension list, Toko first. */
async function buildExtensionsToTry() {
  const extensionsToTry = (await listApprovedManifests()).map((m) => ({
    id: m.extension_id,
    name: m.name,
    version: m.version,
    type: m.type,
    mainUrl: m.main_url,
    updateUrl: m.update_url,
    permissions: m.permissions ?? [],
    signature: m.signature,
    signedBy: m.signed_by,
  }));

  const TOKO_ID = "tatakai.extension.toko";
  const tokoIdx = extensionsToTry.findIndex((e) => e.id === TOKO_ID);
  if (tokoIdx > 0) {
    const [toko] = extensionsToTry.splice(tokoIdx, 1);
    extensionsToTry.unshift(toko);
  }
  return extensionsToTry;
}

/**
 * Assemble the dispatch payload for a resolved (tatakaiId, episodeNumber).
 *
 * `fallbackTitles` keeps the response useful when the series is not in the
 * catalogue yet: the extensions search by title, so a dispatch that carries
 * titles and an extension list still resolves streams. Returning 404 there is
 * what produced "0 sources / No available servers" on the watch page for
 * anything not yet ingested.
 */
async function buildDispatchPayload(
  tatakaiId: string,
  episodeNumber: number,
  hints: { audioPreference: string; resolution: string },
  fallbackTitles: string[] = [],
) {
  const media = tatakaiId ? await repo.findByTatakaiId(tatakaiId) : null;

  const sb = getSupabase();
  const titlesRows = tatakaiId
    ? (await sb?.from("content_titles").select("title").eq("tatakai_id", tatakaiId))?.data ?? []
    : [];

  const titles = [
    media?.titleRomaji,
    media?.titleEnglish,
    media?.titleNative,
    ...(media?.synonyms ?? []),
    ...(titlesRows as { title: string }[]).map((r) => r.title),
    ...fallbackTitles,
  ].filter(Boolean) as string[];

  if (!media && titles.length === 0) return null;

  const episodeRow = tatakaiId ? await repo.getEpisode(tatakaiId, episodeNumber) : null;
  const episode =
    episodeRow ??
    ({
      tatakai_id: tatakaiId || null,
      episode_number: episodeNumber,
      episode_internal_id: `tatakai:${tatakaiId || "unmapped"}:ep:${episodeNumber}`,
      title: null,
    } as Record<string, unknown>);

  return {
    episode,
    titles: [...new Set(titles)],
    providerMappings: tatakaiId ? await repo.getProviderMappings(tatakaiId) : [],
    extensionsToTry: await buildExtensionsToTry(),
    hints,
    /** False when the series is not in the catalogue and titles came from the client. */
    catalogued: Boolean(media),
  };
}

playback.get("/dispatch/:tatakaiId/:episodeNumber", async (c) => {
  const episodeNumber = Number(c.req.param("episodeNumber"));
  const tatakaiId = await resolveTatakaiId(c.req.param("tatakaiId"), 0, 0);

  const payload = await buildDispatchPayload(tatakaiId, episodeNumber, {
    audioPreference: c.req.query("audio") ?? "sub",
    resolution: c.req.query("resolution") ?? "1080",
  });
  if (!payload) return c.json({ success: false, data: null, error: "Unknown tatakaiId" }, 404);

  return c.json(jsonOk(payload, { cache: "miss", ttlSec: 60, source: "db" }));
});

playback.post("/dispatch", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;

  const episodeId = String(body.episodeId || "").trim();
  const candidate = extractTatakaiIdCandidate(body.tatakaiId, episodeId);
  const anilistId = Number(body.anilistId ?? 0) || 0;
  const malId = Number(body.malId ?? 0) || 0;

  let episodeNumber = Number(body.episodeNumber ?? 0);
  if (!Number.isFinite(episodeNumber) || episodeNumber <= 0) {
    episodeNumber = parseEpisodeNumberFromEpisodeId(episodeId);
  }

  const tatakaiId = await resolveTatakaiId(candidate, anilistId, malId);

  if (!tatakaiId || !episodeNumber) {
    // Say which half is missing — the old message named both and identified
    // neither, which made a malformed episodeId indistinguishable from an
    // unmapped series.
    const missing = [
      !tatakaiId ? "tatakaiId (no id resolved from tatakaiId/episodeId/anilistId/malId)" : null,
      !episodeNumber ? "episodeNumber (not supplied and not parseable from episodeId)" : null,
    ].filter(Boolean);
    return c.json(
      {
        success: false,
        data: null,
        error: `Cannot dispatch playback — missing ${missing.join(" and ")}`,
        details: { episodeId, candidate, anilistId, malId, episodeNumber },
      },
      400,
    );
  }

  const fallbackTitles = [String(body.animeName || "").trim()].filter(Boolean);
  const payload = await buildDispatchPayload(
    tatakaiId,
    episodeNumber,
    {
      audioPreference: String(body.category || body.audio || "sub").trim(),
      resolution: String(body.resolution || "1080").trim(),
    },
    fallbackTitles,
  );
  if (!payload) {
    return c.json(
      { success: false, data: null, error: `Unknown tatakaiId "${tatakaiId}" and no title to search by` },
      404,
    );
  }

  return c.json(jsonOk(payload, { cache: "miss", ttlSec: 60, source: "db" }));
});

playback.post("/telemetry", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    events?: {
      tatakaiId?: string;
      anilistId?: number;
      episodeNumber?: number;
      sourceExtensionId?: string;
      event?: string;
      latencyMs?: number;
      errorCode?: string;
      ok?: boolean;
    }[];
  };
  const events = body.events ?? [];
  await insertTelemetryBatch(
    events.map((e) => ({
      tatakaiId: e.tatakaiId,
      anilistId: e.anilistId,
      episodeNumber: e.episodeNumber,
      sourceExtensionId: e.sourceExtensionId,
      event: e.event ?? "unknown",
      latencyMs: e.latencyMs,
      errorCode: e.errorCode,
      ok: e.ok,
    })),
    null,
  );
  return c.json(jsonOk({ ok: true }));
});

playback.post("/session", async (c) => {
  return c.json(jsonOk({ stub: true, message: "Cross-device sync not implemented" }));
});

export { playback as playbackRouter };
