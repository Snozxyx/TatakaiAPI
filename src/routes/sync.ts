import { Hono } from "hono";
import { jsonOk, jsonError } from "../lib/envelope.js";
import { getSupabase } from "../lib/supabase.js";
import { createMiddleware } from "hono/factory";
import * as syncService from "../services/integrationSync.js";

const syncRouter = new Hono();

// Auth Middleware: Resolve Bearer token to user ID using Supabase Auth
export const requireUserAuth = createMiddleware(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) {
    return c.json(jsonError("Missing Authorization header"), 401);
  }
  const token = authHeader.replace("Bearer ", "");
  const sb = getSupabase();
  if (!sb) {
    return c.json(jsonError("Database not configured"), 500);
  }
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) {
    return c.json(jsonError("Unauthorized"), 401);
  }
  c.set("userId", user.id);
  await next();
});

// Protect all sync routes under user auth
syncRouter.use("*", requireUserAuth);

// 1. Exchange MAL / AniList authorization code
syncRouter.post("/exchange", async (c) => {
  const userId = c.get("userId");
  const sb = getSupabase()!;
  try {
    const body = await c.req.json();
    const { integration, code, codeVerifier, redirectUri } = body;

    if (integration === "mal") {
      const res = await syncService.exchangeMalCode(sb, userId, code, codeVerifier, redirectUri);
      return c.json(jsonOk(res));
    } else if (integration === "anilist") {
      const res = await syncService.exchangeAniListCode(sb, userId, code, redirectUri);
      return c.json(jsonOk(res));
    } else {
      return c.json(jsonError("Invalid integration type"), 400);
    }
  } catch (err: any) {
    return c.json(jsonError(err.message || "Exchange failed"), 400);
  }
});

// 2. Generate a preview of differences to apply (Import/Export diff list)
syncRouter.post("/preview", async (c) => {
  const userId = c.get("userId");
  const sb = getSupabase()!;
  try {
    const body = await c.req.json();
    const { integration, mediaType } = body; // integration: "mal" | "anilist", mediaType: "anime" | "manga"

    if (!["mal", "anilist"].includes(integration) || !["anime", "manga"].includes(mediaType)) {
      return c.json(jsonError("Invalid parameters"), 400);
    }

    const proposal = await syncService.buildSyncProposal(sb, userId, integration, mediaType);
    return c.json(jsonOk(proposal));
  } catch (err: any) {
    return c.json(jsonError(err.message || "Failed to generate sync preview"), 400);
  }
});

// 3. Apply user-confirmed actions
syncRouter.post("/apply", async (c) => {
  const userId = c.get("userId");
  const sb = getSupabase()!;
  try {
    const body = await c.req.json();
    const { integration, actions } = body;

    if (!["mal", "anilist"].includes(integration) || !Array.isArray(actions)) {
      return c.json(jsonError("Invalid parameters"), 400);
    }

    await syncService.applySyncActions(sb, userId, integration, actions);
    return c.json(jsonOk({ success: true }));
  } catch (err: any) {
    return c.json(jsonError(err.message || "Failed to apply sync actions"), 400);
  }
});

// 4. real-time single item synchronization (e.g. smart watch progress sync triggers)
syncRouter.post("/single-sync", async (c) => {
  const userId = c.get("userId");
  const sb = getSupabase()!;
  try {
    const body = await c.req.json();
    const { type, malId, anilistId, status, progress, score } = body;

    const { data: profile } = await sb.from("profiles").select("*").eq("user_id", userId).single();
    if (!profile) {
      return c.json(jsonError("Profile not found"), 404);
    }

    // Sync to MAL if connected
    if (profile.mal_access_token && malId) {
      try {
        const malToken = await syncService.getOrRefreshMalToken(sb, userId, profile);
        if (type === "anime") {
          const updateParams = new URLSearchParams({
            status: syncService.mapTatakaiStatusToMal(status || "watching"),
            num_watched_episodes: String(progress || 0),
          });
          if (score) updateParams.append("score", String(score));

          await fetch(`https://api.myanimelist.net/v2/anime/${malId}/my_list_status`, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${malToken}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: updateParams.toString(),
          });
        } else {
          const updateParams = new URLSearchParams({
            status: syncService.mapTatakaiStatusToMal(status || "reading"),
            num_chapters_read: String(progress || 0),
          });
          if (score) updateParams.append("score", String(score));

          await fetch(`https://api.myanimelist.net/v2/manga/${malId}/my_list_status`, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${malToken}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: updateParams.toString(),
          });
        }
      } catch (malErr) {
        log.warn({ malErr }, "Realtime MAL sync failed");
      }
    }

    // Sync to AniList if connected
    if (profile.anilist_access_token && anilistId) {
      try {
        const mediaId = Number(anilistId);
        const aniStatus = syncService.mapTatakaiStatusToAniList(status);
        const query = `
          mutation ($mediaId: Int, $status: MediaListStatus, $progress: Int, $score: Float) {
            SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress, score: $score) {
              id
              status
              progress
            }
          }
        `;
        await fetch("https://graphql.anilist.co", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${profile.anilist_access_token}`,
          },
          body: JSON.stringify({ query, variables: { mediaId, status: aniStatus, progress: progress || 0, score } }),
        });
      } catch (aniErr) {
        log.warn({ aniErr }, "Realtime AniList sync failed");
      }
    }

    return c.json(jsonOk({ success: true }));
  } catch (err: any) {
    return c.json(jsonError(err.message || "Failed realtime item sync"), 400);
  }
});

export { syncRouter };
