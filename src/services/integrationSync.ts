import { getSupabase } from "../lib/supabase.js";
import { env } from "../config/env.js";
import { log } from "../config/logger.js";

// Helper to retrieve MAL credentials
function getMalCredentials() {
  const clientId = env.MAL_CLIENT_ID || env.VITE_MAL_CLIENT_ID;
  const clientSecret = env.MAL_CLIENT_SECRET || env.VITE_MAL_CLIENT_SECRET;
  return { clientId, clientSecret };
}

// Helper to retrieve AniList credentials
function getAnilistCredentials() {
  const clientId = env.ANILIST_CLIENT_ID || env.VITE_ANILIST_CLIENT_ID;
  const clientSecret = env.ANILIST_CLIENT_SECRET || env.VITE_ANILIST_CLIENT_SECRET;
  return { clientId, clientSecret };
}

// Ensure MAL token is valid, refreshing it if expired
export async function getOrRefreshMalToken(sb: any, userId: string, profile: any): Promise<string> {
  let accessToken = profile.mal_access_token;
  const now = new Date();
  const expiresAt = profile.mal_token_expires_at ? new Date(profile.mal_token_expires_at) : null;

  if (expiresAt && now >= expiresAt && profile.mal_refresh_token) {
    log.info(`[MAL Token] Refreshing token for user ${userId}`);
    const { clientId, clientSecret } = getMalCredentials();
    const refreshParams = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret || "",
      grant_type: "refresh_token",
      refresh_token: profile.mal_refresh_token,
    });

    const refreshRes = await fetch("https://myanimelist.net/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: refreshParams.toString(),
    });

    const refreshData = await refreshRes.json();
    if (!refreshRes.ok) {
      log.error({ refreshData }, `[MAL Token] Refresh failed for user ${userId}`);
      throw new Error(`MAL token refresh failed`);
    }

    accessToken = refreshData.access_token;
    const newExpiresAt = new Date();
    newExpiresAt.setSeconds(newExpiresAt.getSeconds() + refreshData.expires_in);

    await sb.from("profiles").update({
      mal_access_token: refreshData.access_token,
      mal_refresh_token: refreshData.refresh_token,
      mal_token_expires_at: newExpiresAt.toISOString(),
    }).eq("user_id", userId);
  }

  return accessToken;
}

// Fetch all MyAnimeList anime entries
export async function fetchAllMALAnime(accessToken: string): Promise<any[]> {
  let url = "https://api.myanimelist.net/v2/users/@me/animelist?fields=list_status{status,score,num_watched_episodes},main_picture,title&limit=1000";
  const results: any[] = [];
  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`MAL anime fetch failed: ${res.statusText}`);
    }
    const data = await res.json();
    if (data.data) {
      results.push(...data.data);
    }
    url = data.paging?.next || "";
  }
  return results;
}

// Fetch all MyAnimeList manga entries
export async function fetchAllMALManga(accessToken: string): Promise<any[]> {
  let url = "https://api.myanimelist.net/v2/users/@me/mangalist?fields=list_status{status,score,num_chapters_read,num_volumes_read},main_picture,title&limit=1000";
  const results: any[] = [];
  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`MAL manga fetch failed: ${res.statusText}`);
    }
    const data = await res.json();
    if (data.data) {
      results.push(...data.data);
    }
    url = data.paging?.next || "";
  }
  return results;
}

// Fetch all AniList anime list entries
export async function fetchAllAniListAnime(accessToken: string, userId: number): Promise<any[]> {
  const query = `
    query ($userId: Int) {
      MediaListCollection(userId: $userId, type: ANIME) {
        lists {
          name
          status
          entries {
            id
            mediaId
            status
            progress
            score(format: POINT_10)
            media {
              id
              idMal
              title { romaji english native }
              coverImage { medium large }
              episodes
            }
          }
        }
      }
    }
  `;
  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query, variables: { userId } }),
  });
  if (!response.ok) {
    throw new Error(`AniList anime query failed: ${response.status}`);
  }
  const data = await response.json();
  if (data.errors) {
    throw new Error(data.errors[0].message);
  }
  return data.data?.MediaListCollection?.lists?.flatMap((list: any) => list.entries) || [];
}

// Fetch all AniList manga list entries
export async function fetchAllAniListManga(accessToken: string, userId: number): Promise<any[]> {
  const query = `
    query ($userId: Int) {
      MediaListCollection(userId: $userId, type: MANGA) {
        lists {
          name
          status
          entries {
            id
            mediaId
            status
            progress
            score(format: POINT_10)
            media {
              id
              idMal
              title { romaji english native }
              coverImage { medium large }
              chapters
              volumes
            }
          }
        }
      }
    }
  `;
  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query, variables: { userId } }),
  });
  if (!response.ok) {
    throw new Error(`AniList manga query failed: ${response.status}`);
  }
  const data = await response.json();
  if (data.errors) {
    throw new Error(data.errors[0].message);
  }
  return data.data?.MediaListCollection?.lists?.flatMap((list: any) => list.entries) || [];
}

// Map MyAnimeList status strings to local Tatakai watchlist status
export function mapMalStatusToTatakai(status: string): string {
  const map: Record<string, string> = {
    watching: "watching",
    completed: "completed",
    plan_to_watch: "plan_to_watch",
    dropped: "dropped",
    on_hold: "on_hold",
  };
  return map[status] || "plan_to_watch";
}

// Map local Tatakai watchlist status to MyAnimeList status
export function mapTatakaiStatusToMal(status: string): string {
  const map: Record<string, string> = {
    watching: "watching",
    completed: "completed",
    plan_to_watch: "plan_to_watch",
    dropped: "dropped",
    on_hold: "on_hold",
  };
  return map[status] || "plan_to_watch";
}

// Map AniList status strings to local Tatakai watchlist status
export function mapAniListStatusToTatakai(status: string): string {
  const map: Record<string, string> = {
    CURRENT: "watching",
    COMPLETED: "completed",
    PLANNING: "plan_to_watch",
    DROPPED: "dropped",
    PAUSED: "on_hold",
    REPEATING: "watching",
  };
  return map[status] || "plan_to_watch";
}

// Map local Tatakai watchlist status to AniList status
export function mapTatakaiStatusToAniList(status: string): string {
  const map: Record<string, string> = {
    watching: "CURRENT",
    completed: "COMPLETED",
    plan_to_watch: "PLANNING",
    dropped: "DROPPED",
    on_hold: "PAUSED",
  };
  return map[status] || "PLANNING";
}

// Exchange MAL OAuth authorization code
export async function exchangeMalCode(sb: any, userId: string, code: string, codeVerifier: string, redirectUri: string) {
  const { clientId, clientSecret } = getMalCredentials();
  const tokenParams = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret || "",
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
  });

  const res = await fetch("https://myanimelist.net/v1/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenParams.toString(),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`MAL exchange failed: ${JSON.stringify(data)}`);
  }

  const expiresAt = new Date();
  expiresAt.setSeconds(expiresAt.getSeconds() + data.expires_in);

  // Fetch MAL username
  const userRes = await fetch("https://api.myanimelist.net/v2/users/@me", {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  const userData = await userRes.json();
  const malUserId = userData?.name || null;

  await sb.from("profiles").update({
    mal_access_token: data.access_token,
    mal_refresh_token: data.refresh_token,
    mal_token_expires_at: expiresAt.toISOString(),
    mal_user_id: malUserId,
  }).eq("user_id", userId);

  return { success: true, username: malUserId };
}

// Exchange AniList OAuth authorization code
export async function exchangeAniListCode(sb: any, userId: string, code: string, redirectUri: string) {
  const { clientId, clientSecret } = getAnilistCredentials();
  const response = await fetch("https://anilist.co/api/v2/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`AniList exchange failed: ${JSON.stringify(data)}`);
  }

  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  // Fetch Viewer Info
  const query = `
    query {
      Viewer {
        id
        name
      }
    }
  `;
  const viewerRes = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.access_token}`,
    },
    body: JSON.stringify({ query }),
  });
  const viewerData = await viewerRes.json();
  const viewer = viewerData?.data?.Viewer;

  await sb.from("profiles").update({
    anilist_access_token: data.access_token,
    anilist_token_expires_at: expiresAt.toISOString(),
    anilist_user_id: viewer?.id ? String(viewer.id) : null,
    anilist_username: viewer?.name || null,
  }).eq("user_id", userId);

  return { success: true, username: viewer?.name };
}

export interface SyncProposalItem {
  id: string; // Composite unique key
  mediaId: string | number;
  malId?: number | null;
  anilistId?: number | null;
  title: string;
  poster: string | null;
  type: "anime" | "manga";
  direction: "import" | "export" | "conflict";
  localStatus?: string | null;
  localProgress?: number | null;
  remoteStatus?: string | null;
  remoteProgress?: number | null;
  actionText: string;
}

// Build Sync Proposal representing difference between Tatakai local DB and external list
export async function buildSyncProposal(
  sb: any,
  userId: string,
  integration: "mal" | "anilist",
  mediaType: "anime" | "manga"
): Promise<SyncProposalItem[]> {
  const { data: profile } = await sb.from("profiles").select("*").eq("user_id", userId).single();
  if (!profile) throw new Error("Profile not found");

  const proposal: SyncProposalItem[] = [];

  if (integration === "mal") {
    const accessToken = await getOrRefreshMalToken(sb, userId, profile);
    if (!accessToken) throw new Error("MAL not connected");

    if (mediaType === "anime") {
      const malList = await fetchAllMALAnime(accessToken);
      const { data: watchlist } = await sb.from("watchlist").select("*").eq("user_id", userId);
      const localWatchlist = watchlist || [];

      // Query local progress
      const { data: history } = await sb.from("watch_history").select("anime_id, episode_number").eq("user_id", userId);
      const localProgressMap = new Map<string, number>();
      if (history) {
        for (const h of history) {
          const epNum = Number(h.episode_number || 0);
          const currentMax = localProgressMap.get(h.anime_id) || 0;
          if (epNum > currentMax) localProgressMap.set(h.anime_id, epNum);
        }
      }

      const localByMalId = new Map<number, any>();
      const localByAnimeId = new Map<string, any>();
      for (const item of localWatchlist) {
        if (item.mal_id) localByMalId.set(Number(item.mal_id), item);
        localByAnimeId.set(item.anime_id, item);
      }

      const matchedRemoteIds = new Set<number>();

      // 1. Process MAL list for Import/Update
      for (const malItem of malList) {
        const node = malItem.node;
        const listStatus = malItem.list_status;
        const malId = Number(node.id);
        const title = node.title;
        const poster = node.main_picture?.large || node.main_picture?.medium || null;
        matchedRemoteIds.add(malId);

        const localItem = localByMalId.get(malId);
        const remoteStatus = mapMalStatusToTatakai(listStatus.status);
        const remoteProgress = Number(listStatus.num_watched_episodes || 0);

        if (localItem) {
          const localStatus = localItem.status;
          const localProgress = localProgressMap.get(localItem.anime_id) || 0;

          if (localStatus !== remoteStatus || localProgress !== remoteProgress) {
            proposal.push({
              id: `update:mal:anime:${malId}`,
              mediaId: localItem.anime_id,
              malId,
              title,
              poster,
              type: "anime",
              direction: localProgress > remoteProgress ? "export" : "import",
              localStatus,
              localProgress,
              remoteStatus,
              remoteProgress,
              actionText: localProgress > remoteProgress 
                ? `Export progress to MAL (${localStatus} - Ep ${localProgress})`
                : `Import progress from MAL (${remoteStatus} - Ep ${remoteProgress})`,
            });
          }
        } else {
          // Add to local Tatakai
          proposal.push({
            id: `import:mal:anime:${malId}`,
            mediaId: `mal:${malId}`,
            malId,
            title,
            poster,
            type: "anime",
            direction: "import",
            remoteStatus,
            remoteProgress,
            actionText: `Import from MAL to watchlist as ${remoteStatus} (Ep ${remoteProgress})`,
          });
        }
      }

      // 2. Export local items not on MAL
      for (const localItem of localWatchlist) {
        if (localItem.mal_id && !matchedRemoteIds.has(Number(localItem.mal_id))) {
          const localProgress = localProgressMap.get(localItem.anime_id) || 0;
          proposal.push({
            id: `export:mal:anime:${localItem.anime_id}`,
            mediaId: localItem.anime_id,
            malId: Number(localItem.mal_id),
            title: localItem.anime_name,
            poster: localItem.anime_poster,
            type: "anime",
            direction: "export",
            localStatus: localItem.status,
            localProgress,
            actionText: `Export to MAL as ${localItem.status} (Ep ${localProgress})`,
          });
        }
      }
    } else {
      // Manga MAL Sync
      const malManga = await fetchAllMALManga(accessToken);
      const { data: readlist } = await sb.from("manga_readlist").select("*").eq("user_id", userId);
      const localReadlist = readlist || [];

      const localByMalId = new Map<number, any>();
      for (const item of localReadlist) {
        if (item.mal_id) localByMalId.set(Number(item.mal_id), item);
      }

      const matchedRemoteIds = new Set<number>();

      for (const malItem of malManga) {
        const node = malItem.node;
        const listStatus = malItem.list_status;
        const malId = Number(node.id);
        const title = node.title;
        const poster = node.main_picture?.large || node.main_picture?.medium || null;
        matchedRemoteIds.add(malId);

        const localItem = localByMalId.get(malId);
        const remoteStatus = mapMalStatusToTatakai(listStatus.status);
        const remoteProgress = Number(listStatus.num_chapters_read || 0);

        if (localItem) {
          const localStatus = localItem.status;
          const localProgress = Number(localItem.last_chapter_number || 0);

          if (localStatus !== remoteStatus || localProgress !== remoteProgress) {
            proposal.push({
              id: `update:mal:manga:${malId}`,
              mediaId: localItem.manga_id,
              malId,
              title,
              poster,
              type: "manga",
              direction: localProgress > remoteProgress ? "export" : "import",
              localStatus,
              localProgress,
              remoteStatus,
              remoteProgress,
              actionText: localProgress > remoteProgress
                ? `Export chapter progress to MAL (${localStatus} - Ch ${localProgress})`
                : `Import chapter progress from MAL (${remoteStatus} - Ch ${remoteProgress})`,
            });
          }
        } else {
          proposal.push({
            id: `import:mal:manga:${malId}`,
            mediaId: `mal:${malId}`,
            malId,
            title,
            poster,
            type: "manga",
            direction: "import",
            remoteStatus,
            remoteProgress,
            actionText: `Import from MAL to readlist as ${remoteStatus} (Ch ${remoteProgress})`,
          });
        }
      }

      for (const localItem of localReadlist) {
        if (localItem.mal_id && !matchedRemoteIds.has(Number(localItem.mal_id))) {
          const localProgress = Number(localItem.last_chapter_number || 0);
          proposal.push({
            id: `export:mal:manga:${localItem.manga_id}`,
            mediaId: localItem.manga_id,
            malId: Number(localItem.mal_id),
            title: localItem.manga_title,
            poster: localItem.manga_poster,
            type: "manga",
            direction: "export",
            localStatus: localItem.status,
            localProgress,
            actionText: `Export to MAL as ${localItem.status} (Ch ${localProgress})`,
          });
        }
      }
    }
  } else if (integration === "anilist") {
    const accessToken = profile.anilist_access_token;
    const aniListUserId = Number(profile.anilist_user_id);
    if (!accessToken || !aniListUserId) throw new Error("AniList not connected");

    if (mediaType === "anime") {
      const aniList = await fetchAllAniListAnime(accessToken, aniListUserId);
      const { data: watchlist } = await sb.from("watchlist").select("*").eq("user_id", userId);
      const localWatchlist = watchlist || [];

      // Query local progress
      const { data: history } = await sb.from("watch_history").select("anime_id, episode_number").eq("user_id", userId);
      const localProgressMap = new Map<string, number>();
      if (history) {
        for (const h of history) {
          const epNum = Number(h.episode_number || 0);
          const currentMax = localProgressMap.get(h.anime_id) || 0;
          if (epNum > currentMax) localProgressMap.set(h.anime_id, epNum);
        }
      }

      const localByAniListId = new Map<number, any>();
      for (const item of localWatchlist) {
        if (item.anilist_id) localByAniListId.set(Number(item.anilist_id), item);
      }

      const matchedRemoteIds = new Set<number>();

      for (const aniItem of aniList) {
        const media = aniItem.media;
        const anilistId = Number(media.id);
        const title = media.title.english || media.title.romaji || media.title.native;
        const poster = media.coverImage.large || media.coverImage.medium || null;
        matchedRemoteIds.add(anilistId);

        const localItem = localByAniListId.get(anilistId);
        const remoteStatus = mapAniListStatusToTatakai(aniItem.status);
        const remoteProgress = Number(aniItem.progress || 0);

        if (localItem) {
          const localStatus = localItem.status;
          const localProgress = localProgressMap.get(localItem.anime_id) || 0;

          if (localStatus !== remoteStatus || localProgress !== remoteProgress) {
            proposal.push({
              id: `update:anilist:anime:${anilistId}`,
              mediaId: localItem.anime_id,
              anilistId,
              title,
              poster,
              type: "anime",
              direction: localProgress > remoteProgress ? "export" : "import",
              localStatus,
              localProgress,
              remoteStatus,
              remoteProgress,
              actionText: localProgress > remoteProgress
                ? `Export progress to AniList (${localStatus} - Ep ${localProgress})`
                : `Import progress from AniList (${remoteStatus} - Ep ${remoteProgress})`,
            });
          }
        } else {
          proposal.push({
            id: `import:anilist:anime:${anilistId}`,
            mediaId: `anilist:${anilistId}`,
            anilistId,
            title,
            poster,
            type: "anime",
            direction: "import",
            remoteStatus,
            remoteProgress,
            actionText: `Import from AniList to watchlist as ${remoteStatus} (Ep ${remoteProgress})`,
          });
        }
      }

      for (const localItem of localWatchlist) {
        if (localItem.anilist_id && !matchedRemoteIds.has(Number(localItem.anilist_id))) {
          const localProgress = localProgressMap.get(localItem.anime_id) || 0;
          proposal.push({
            id: `export:anilist:anime:${localItem.anime_id}`,
            mediaId: localItem.anime_id,
            anilistId: Number(localItem.anilist_id),
            title: localItem.anime_name,
            poster: localItem.anime_poster,
            type: "anime",
            direction: "export",
            localStatus: localItem.status,
            localProgress,
            actionText: `Export to AniList as ${localItem.status} (Ep ${localProgress})`,
          });
        }
      }
    } else {
      // Manga AniList Sync
      const aniList = await fetchAllAniListManga(accessToken, aniListUserId);
      const { data: readlist } = await sb.from("manga_readlist").select("*").eq("user_id", userId);
      const localReadlist = readlist || [];

      const localByAniListId = new Map<number, any>();
      for (const item of localReadlist) {
        if (item.anilist_id) localByAniListId.set(Number(item.anilist_id), item);
      }

      const matchedRemoteIds = new Set<number>();

      for (const aniItem of aniList) {
        const media = aniItem.media;
        const anilistId = Number(media.id);
        const title = media.title.english || media.title.romaji || media.title.native;
        const poster = media.coverImage.large || media.coverImage.medium || null;
        matchedRemoteIds.add(anilistId);

        const localItem = localByAniListId.get(anilistId);
        const remoteStatus = mapAniListStatusToTatakai(aniItem.status);
        const remoteProgress = Number(aniItem.progress || 0);

        if (localItem) {
          const localStatus = localItem.status;
          const localProgress = Number(localItem.last_chapter_number || 0);

          if (localStatus !== remoteStatus || localProgress !== remoteProgress) {
            proposal.push({
              id: `update:anilist:manga:${anilistId}`,
              mediaId: localItem.manga_id,
              anilistId,
              title,
              poster,
              type: "manga",
              direction: localProgress > remoteProgress ? "export" : "import",
              localStatus,
              localProgress,
              remoteStatus,
              remoteProgress,
              actionText: localProgress > remoteProgress
                ? `Export progress to AniList (${localStatus} - Ch ${localProgress})`
                : `Import progress from AniList (${remoteStatus} - Ch ${remoteProgress})`,
            });
          }
        } else {
          proposal.push({
            id: `import:anilist:manga:${anilistId}`,
            mediaId: `anilist:${anilistId}`,
            anilistId,
            title,
            poster,
            type: "manga",
            direction: "import",
            remoteStatus,
            remoteProgress,
            actionText: `Import from AniList to readlist as ${remoteStatus} (Ch ${remoteProgress})`,
          });
        }
      }

      for (const localItem of localReadlist) {
        if (localItem.anilist_id && !matchedRemoteIds.has(Number(localItem.anilist_id))) {
          const localProgress = Number(localItem.last_chapter_number || 0);
          proposal.push({
            id: `export:anilist:manga:${localItem.manga_id}`,
            mediaId: localItem.manga_id,
            anilistId: Number(localItem.anilist_id),
            title: localItem.manga_title,
            poster: localItem.manga_poster,
            type: "manga",
            direction: "export",
            localStatus: localItem.status,
            localProgress,
            actionText: `Export to AniList as ${localItem.status} (Ch ${localProgress})`,
          });
        }
      }
    }
  }

  return proposal;
}

// Apply selected actions in proposal
export async function applySyncActions(
  sb: any,
  userId: string,
  integration: "mal" | "anilist",
  actions: SyncProposalItem[]
) {
  const { data: profile } = await sb.from("profiles").select("*").eq("user_id", userId).single();
  if (!profile) throw new Error("Profile not found");

  const malToken = integration === "mal" ? await getOrRefreshMalToken(sb, userId, profile) : null;
  const anilistToken = integration === "anilist" ? profile.anilist_access_token : null;

  for (const action of actions) {
    try {
      if (action.direction === "import") {
        if (action.type === "anime") {
          // Import/Update locally in watchlist
          const animeId = String(action.mediaId);
          const upsertPayload: any = {
            user_id: userId,
            anime_id: animeId,
            anime_name: action.title,
            anime_poster: action.poster,
            status: action.remoteStatus || "plan_to_watch",
            updated_at: new Date().toISOString(),
          };
          if (action.malId) upsertPayload.mal_id = action.malId;
          if (action.anilistId) upsertPayload.anilist_id = action.anilistId;

          await sb.from("watchlist").upsert(upsertPayload, { onConflict: "user_id,anime_id" });

          // Write dummy completed history up to remote progress
          if (action.remoteProgress && action.remoteProgress > 0) {
            const historyRows = Array.from({ length: action.remoteProgress }, (_, i) => ({
              user_id: userId,
              anime_id: animeId,
              anime_name: action.title,
              anime_poster: action.poster,
              episode_id: `${animeId}?ep=${i + 1}`,
              episode_number: i + 1,
              completed: true,
              watched_at: new Date().toISOString(),
              mal_id: action.malId || null,
            }));
            await sb.from("watch_history").upsert(historyRows, { onConflict: "user_id,episode_id" });
          }
        } else {
          // Import/Update locally in manga readlist
          const mangaId = String(action.mediaId);
          const upsertPayload: any = {
            user_id: userId,
            manga_id: mangaId,
            manga_title: action.title,
            manga_poster: action.poster,
            status: action.remoteStatus || "plan_to_read",
            last_chapter_number: action.remoteProgress || 0,
            updated_at: new Date().toISOString(),
          };
          if (action.malId) upsertPayload.mal_id = action.malId;
          if (action.anilistId) upsertPayload.anilist_id = action.anilistId;

          await sb.from("manga_readlist").upsert(upsertPayload, { onConflict: "user_id,manga_id" });
        }
      } else if (action.direction === "export") {
        if (integration === "mal" && malToken) {
          if (action.type === "anime" && action.malId) {
            const updateParams = new URLSearchParams({
              status: mapTatakaiStatusToMal(action.localStatus || "plan_to_watch"),
              num_watched_episodes: String(action.localProgress || 0),
            });
            await fetch(`https://api.myanimelist.net/v2/anime/${action.malId}/my_list_status`, {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${malToken}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: updateParams.toString(),
            });
          } else if (action.type === "manga" && action.malId) {
            const updateParams = new URLSearchParams({
              status: mapTatakaiStatusToMal(action.localStatus || "plan_to_read"),
              num_chapters_read: String(action.localProgress || 0),
            });
            await fetch(`https://api.myanimelist.net/v2/manga/${action.malId}/my_list_status`, {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${malToken}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: updateParams.toString(),
            });
          }
        } else if (integration === "anilist" && anilistToken) {
          const mediaId = Number(action.anilistId);
          if (mediaId) {
            const aniStatus = mapTatakaiStatusToAniList(action.localStatus || "plan_to_watch");
            const progress = action.localProgress || 0;
            const query = `
              mutation ($mediaId: Int, $status: MediaListStatus, $progress: Int) {
                SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress) {
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
                Authorization: `Bearer ${anilistToken}`,
              },
              body: JSON.stringify({ query, variables: { mediaId, status: aniStatus, progress } }),
            });
          }
        }
      }
    } catch (err) {
      log.error({ err, action }, "Failed to apply sync action");
    }
  }
}
