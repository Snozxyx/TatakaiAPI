import { getSupabase } from "../lib/supabase.js";
import { log } from "../config/logger.js";

export interface TelemetryEvent {
  tatakaiId?: string;
  anilistId?: number;
  episodeNumber?: number;
  sourceExtensionId?: string;
  event: string;
  latencyMs?: number;
  errorCode?: string;
  ok?: boolean;
}

export async function insertTelemetryBatch(events: TelemetryEvent[], userId?: string | null) {
  const sb = getSupabase();
  if (!sb || !events.length) return;
  const rows = events.map((e) => ({
    event_type: e.event,
    anime_id: e.anilistId != null ? String(e.anilistId) : e.tatakaiId ?? null,
    episode_id: e.episodeNumber != null ? String(e.episodeNumber) : null,
    category: e.sourceExtensionId ?? "extension",
    server_name: e.sourceExtensionId ?? null,
    ok: e.ok ?? true,
    latency_ms: e.latencyMs ?? null,
    user_id: userId ?? null,
    metadata: { errorCode: e.errorCode, tatakaiId: e.tatakaiId } as object,
  }));
  const { error } = await sb.from("playback_telemetry").insert(rows);
  if (error) log.warn({ error }, "telemetry insert failed");
}
