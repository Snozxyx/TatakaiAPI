/**
 * Cron: ingest trending page into content_items (expand later to paginated catalog).
 * Run: npm run job:ingest --workspace @tatakai/api-v3
 */
import "dotenv/config";
import { anilistClient } from "../providers/anilist/client.js";
import { QUERY_TRENDING } from "../providers/anilist/queries.js";
import { hasSupabase } from "../config/env.js";
import { upsertFromAniListMedia } from "../services/contentIngestion.js";

async function main() {
  if (!hasSupabase) {
    console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(1);
  }
  const trending = await anilistClient.pageMedia({ page: 1, perPage: 50 }, QUERY_TRENDING);
  let ok = 0;
  for (const raw of trending.media) {
    try {
      await upsertFromAniListMedia(raw);
      ok++;
    } catch {
      /* skip */
    }
  }
  console.log("ingestionWorker: upserted", ok, "/", trending.media.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
