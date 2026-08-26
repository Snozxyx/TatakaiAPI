import { cleanEnv, str, port, bool, num } from "envalid";

export const env = cleanEnv(
  process.env,
  {
  NODE_ENV: str({ choices: ["development", "test", "production"], default: "development" }),
  PORT: port({ default: 4001 }),
  /** Supabase project URL */
  SUPABASE_URL: str({ default: "" }),
  /** Service role key — server only */
  SUPABASE_SERVICE_ROLE_KEY: str({ default: "" }),
  /** Optional AniList OAuth token for 90 req/min */
  ANILIST_TOKEN: str({ default: "" }),
  JIKAN_BASE_URL: str({ default: "https://api.jikan.moe/v4" }),
  REDIS_URL: str({ default: "" }),
  /** Admin API secret (X-Admin-Secret header) */
  TATAKAI_ADMIN_API_SECRET: str({ default: "" }),
  /** If false, catalog routes are public; admin still requires secret */
  REQUIRE_ADMIN_FOR_CATALOG: bool({ default: false }),
  /** Default stale TTL for in-memory cache (seconds) */
  CACHE_DEFAULT_TTL_SEC: num({ default: 300 }),
  RELAY_TICKET_SECRET: str({ default: "" }),
  STREAM_PROXY_URLS: str({ default: "" }),
  STREAM_PROXY_PASSWORD: str({ default: "" }),
  
  // Integrations (AniList / MyAnimeList)
  MAL_CLIENT_ID: str({ default: "" }),
  MAL_CLIENT_SECRET: str({ default: "" }),
  VITE_MAL_CLIENT_ID: str({ default: "" }),
  VITE_MAL_CLIENT_SECRET: str({ default: "" }),
  
  ANILIST_CLIENT_ID: str({ default: "" }),
  ANILIST_CLIENT_SECRET: str({ default: "" }),
  VITE_ANILIST_CLIENT_ID: str({ default: "" }),
  VITE_ANILIST_CLIENT_SECRET: str({ default: "" }),
  VITE_ANILIST_REDIRECT_URI: str({ default: "" }),

  /**
   * Base URL of the running toko-api service (extension/toko/api).
   * When set, TatakaiAPI proxies /toko/sources, /toko/stream, /toko/debug to it.
   * Default: the standard local dev port used by `npm run api` in extension/toko.
   */
  TOKO_API_URL: str({ default: "http://127.0.0.1:8099" }),
  },
);

export const hasSupabase =
  Boolean(env.SUPABASE_URL?.trim()) && Boolean(env.SUPABASE_SERVICE_ROLE_KEY?.trim());

