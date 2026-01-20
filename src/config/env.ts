import "dotenv/config";
import { cleanEnv, str, port, num } from "envalid";

export enum DeploymentEnv {
    NODEJS = "nodejs",
    VERCEL = "vercel",
    CLOUDFLARE_WORKERS = "cloudflare-workers",
    RENDER = "render",
}

export const SERVERLESS_ENVIRONMENTS = [
    DeploymentEnv.VERCEL,
    DeploymentEnv.CLOUDFLARE_WORKERS,
] as const;

export const env = cleanEnv(process.env, {
    // Server
    PORT: port({ default: 4000, desc: "Server port" }),
    NODE_ENV: str({
        choices: ["development", "production", "test"],
        default: "development",
    }),

    // Redis
    REDIS_URL: str({ default: "", desc: "Redis connection URL (optional)" }),

    // CORS
    CORS_ALLOWED_ORIGINS: str({
        default: "*",
        desc: "Comma-separated allowed origins",
    }),

    // Rate Limiting
    RATE_LIMIT_WINDOW_MS: num({
        default: 60000,
        desc: "Rate limit window in milliseconds",
    }),
    RATE_LIMIT_MAX_REQUESTS: num({
        default: 100,
        desc: "Max requests per window",
    }),

    // Cache
    CACHE_TTL_SECONDS: num({ default: 300, desc: "Default cache TTL" }),

    // Deployment
    API_HOSTNAME: str({ default: "", desc: "API hostname for health checks" }),
    DEPLOYMENT_ENV: str({
        choices: Object.values(DeploymentEnv),
        default: DeploymentEnv.NODEJS,
    }),

    // Base URL
    BASE_URL: str({ default: "http://localhost:4000/api/v1", desc: "API base URL" }),

    // External APIs
    TMDB_KEY: str({ default: "", desc: "TMDB API key" }),
    SUPABASE_URL: str({ default: "", desc: "Supabase Edge Function URL for WatchAnimeWorld scraper" }),
    SUPABASE_AUTH_KEY: str({ default: "", desc: "Supabase authentication key" }),
});

// Convenience flags
export const isDev = env.NODE_ENV === "development";
export const isProd = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
