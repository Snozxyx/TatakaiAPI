/**
 * Cron: refresh content_feeds snapshots from AniList.
 * Run: npm run job:feeds --workspace @tatakai/api-v3
 */
import "dotenv/config";
import { anilistClient } from "../providers/anilist/client.js";
import { QUERY_TRENDING } from "../providers/anilist/queries.js";
import { anilistToTatakaiMedia } from "../services/normalize.js";
import { saveFeed } from "../services/contentFeeds.js";
import { hasSupabase } from "../config/env.js";
import { upsertFromAniListMedia } from "../services/contentIngestion.js";

async function main() {
  if (!hasSupabase) {
    console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(1);
  }
  const trending = await anilistClient.pageMedia({ page: 1, perPage: 50 }, QUERY_TRENDING);
  for (const raw of trending.media) {
    try {
      await upsertFromAniListMedia(raw);
    } catch {
      /* continue */
    }
  }
  const media = trending.media.map((m) => anilistToTatakaiMedia(m));
  await saveFeed(
    "trending",
    media.map((m) => ({ anilistId: m.anilistId, malId: m.malId, tatakaiId: m.tatakaiId })),
    null,
    null,
  );
  console.log("contentRefresh: done", media.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
