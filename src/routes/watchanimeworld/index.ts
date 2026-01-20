import { Hono } from "hono";
import { cache } from "../../config/cache.js";
import type { ServerContext } from "../../config/context.js";
import { log } from "../../config/logger.js";
import { env } from "../../config/env.js";

const watchawRouter = new Hono<ServerContext>();

export interface ParsedEpisodeUrl {
    slug: string;
    animeSlug: string;
    season: number;
    episode: number;
    fullUrl: string;
}

export interface LanguageInfo {
    name: string;
    code: string; // ISO 639-1 code
    isDub: boolean;
}

export interface WatchAnimeWorldServer {
    language: string;
    link: string;
    providerName?: string;
}

export interface ResolvedSource {
    url: string;
    isM3U8: boolean;
    quality?: string;
    language?: string;
    langCode?: string;
    isDub?: boolean;
    providerName?: string;
    needsHeadless?: boolean;
}

export interface Subtitle {
    lang: string;
    url: string;
    label?: string;
}

// Language mapping: normalize to canonical names and ISO codes
const LANGUAGE_MAP: Record<string, LanguageInfo> = {
    'hindi': { name: 'Hindi', code: 'hi', isDub: true },
    'tamil': { name: 'Tamil', code: 'ta', isDub: true },
    'telugu': { name: 'Telugu', code: 'te', isDub: true },
    'malayalam': { name: 'Malayalam', code: 'ml', isDub: true },
    'bengali': { name: 'Bengali', code: 'bn', isDub: true },
    'marathi': { name: 'Marathi', code: 'mr', isDub: true },
    'kannada': { name: 'Kannada', code: 'kn', isDub: true },
    'english': { name: 'English', code: 'en', isDub: true },
    'japanese': { name: 'Japanese', code: 'ja', isDub: false },
    'korean': { name: 'Korean', code: 'ko', isDub: true },
    'chinese': { name: 'Chinese', code: 'zh', isDub: true },
    'und': { name: 'Unknown', code: 'und', isDub: false },
};

/**
 * Normalize language string to canonical LanguageInfo
 */
export function normalizeLanguage(lang: string): LanguageInfo {
    const normalized = lang.toLowerCase().trim();
    return LANGUAGE_MAP[normalized] || {
        name: lang,
        code: 'und',
        isDub: normalized !== 'japanese' && normalized !== 'jpn',
    };
}

/**
 * Parse episode URL to extract anime slug, season, and episode
 * @param urlOrSlug - Full URL or slug like "naruto-shippuden-1x1"
 * @returns Parsed episode information
 */
export function parseEpisodeUrl(urlOrSlug: string): ParsedEpisodeUrl | null {
    try {
        let slug = urlOrSlug;
        let fullUrl = urlOrSlug;

        // If it's a full URL, extract the slug
        if (urlOrSlug.startsWith('http')) {
            const url = new URL(urlOrSlug);
            const pathMatch = url.pathname.match(/\/episode\/([^\/]+)\/?$/);
            if (!pathMatch) return null;
            slug = pathMatch[1];
            fullUrl = urlOrSlug;
        } else {
            fullUrl = `https://watchanimeworld.in/episode/${slug}/`;
        }

        // Extract season and episode: e.g., "naruto-shippuden-1x1"
        const seasonEpisodeMatch = slug.match(/^(.+?)-(\d+)x(\d+)$/);
        if (!seasonEpisodeMatch) return null;

        const [, animeSlug, seasonStr, episodeStr] = seasonEpisodeMatch;
        const season = parseInt(seasonStr, 10);
        const episode = parseInt(episodeStr, 10);

        if (isNaN(season) || isNaN(episode)) return null;

        return {
            slug,
            animeSlug,
            season,
            episode,
            fullUrl,
        };
    } catch (error) {
        log.error(`Error parsing episode URL: ${error}`);
        return null;
    }
}


async function fetchWithRetry(url: string, options: RequestInit = {}, retries = 3): Promise<Response> {
    let lastError: Error | null = null;

    for (let i = 0; i <retries; i++) {
        try {
            const response = await fetch(url, {
                ...options,
                signal: AbortSignal.timeout(30000),
            });

            if (response.ok || response.status === 206 || response.status === 302) {
                return response;
            }

            if (response.status >= 400 && response.status <500 && response.status !== 429) {
                // If 404, throw explicitly to avoid retrying if resource really missing
                if (response.status === 404) throw new Error("HTTP 404: Not Found");
                return response;
            }

            lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
        } catch (error) {
            lastError = error as Error;
            log.warn(`Fetch attempt ${i + 1} failed: ${lastError.message}`);
        }

        if (i <retries - 1) {
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 500));
        }
    }

    throw lastError || new Error("Failed to fetch after retries");
}


async function getEpisodeSources(episodeIdentifier: string): Promise<any> {
    const parsed = parseEpisodeUrl(episodeIdentifier);
    if (!parsed) {
        throw new Error("Invalid episode URL/slug format");
    }

    log.info(`Fetching WatchAnimeWorld episode via Supabase: ${parsed.slug}`);

    // Proxy to Supabase Edge Function (bypasses geoblocking/timeout)
    const SUPABASE_URL = env.SUPABASE_URL;
    const AUTH_KEY = env.SUPABASE_AUTH_KEY;

    try {
        const response = await fetchWithRetry(`${SUPABASE_URL}?episodeUrl=${parsed.slug}`, {
            method: "POST", // Endpoint accepts POST
            headers: {
                "Authorization": AUTH_KEY,
                "apikey": "sb_publishable_hiKONZyoLpTAkFpQL5DWIQ_1_OWjmj3",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ name: "TatakaAPI Proxy" })
        });

        const data = await response.json();

        // Supabase function returns the formatted source object directly
        return data;

    } catch (error) {
        log.error(`Supabase proxy failed: ${error}`);
        throw new Error("Failed to fetch sources via proxy");
    }
}


// Routes

// ========== HOME ==========
watchawRouter.get("/home", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");
    const data = await cache.getOrSet(async () => {
        const response = await fetchWithRetry("https://watchanimeworld.in/", {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "text/html",
            },
        });
        const html = await response.text();
        const animeCardRegex = /<a[^>]*href="([^"]*\/episode\/([^"]+))"[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"[^>]*>[\s\S]*?<[^>]*>([^<]+)/gi;
        const featured: any[] = [];
        let match;
        while ((match = animeCardRegex.exec(html)) !== null) {
            featured.push({
                url: match[1],
                slug: match[2],
                poster: match[3],
                title: match[4].trim(),
            });
        }
        return { featured: featured.slice(0, 20) };
    }, cacheConfig.key, cacheConfig.duration);
    return c.json({ provider: "Tatakai", status: 200, data });
});

// ========== SEARCH ==========
watchawRouter.get("/search", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");
    const query = c.req.query("q");
    if (!query) return c.json({ provider: "Tatakai", status: 400, error: "Missing q parameter" }, 400);

    const data = await cache.getOrSet(async () => {
        const response = await fetchWithRetry(`https://watchanimeworld.in/?s=${encodeURIComponent(query)}`, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "text/html",
            },
        });
        const html = await response.text();
        const results: any[] = [];
        const resultRegex = /<a[^>]*href="([^"]*\/episode\/([^"]+))"[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"[^>]*>[\s\S]*?<[^>]*title[^>]*>([^<]+)/gi;
        let match;
        while ((match = resultRegex.exec(html)) !== null) {
            results.push({
                url: match[1],
                slug: match[2],
                poster: match[3],
                title: match[4].trim(),
            });
        }
        return { results };
    }, cacheConfig.key, cacheConfig.duration);
    return c.json({ provider: "Tatakai", status: 200, data });
});

// ========== PARSE SLUG ==========
watchawRouter.get("/parse/:slug", (c) => {
    const slug = c.req.param("slug");
    const parsed = parseEpisodeUrl(slug);
    if (!parsed) return c.json({ provider: "Tatakai", status: 400, error: "Invalid slug format" }, 400);
    return c.json({ provider: "Tatakai", status: 200, data: parsed });
});

// /api/v1/watchaw/episode?id={naruto-shippuden-1x1} OR ?episodeUrl={url}
watchawRouter.get("/episode", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");
    const episodeUrl = c.req.query("episodeUrl");
    const id = c.req.query("id");

    const identifier = id || episodeUrl;

    if (!identifier) {
        return c.json({ provider: "Tatakai", status: 400, error: "Missing id or episodeUrl parameter" }, 400);
    }

    const data = await cache.getOrSet(
        () => getEpisodeSources(identifier),
        cacheConfig.key,
        cacheConfig.duration
    );
    return c.json({ provider: "Tatakai", status: 200, data }, 200);
});

// ========== ROOT ==========
watchawRouter.get("/", (c) => {
    return c.json({ provider: "Tatakai",
        status: 200,
        message: "WatchAnimeWorld Scraper - Multi-Language Dubbed Anime",
        endpoints: {
            home: "/api/v1/watchaw/home",
            search: "/api/v1/watchaw/search?q={query}",
            parse: "/api/v1/watchaw/parse/:slug",
            episode: "/api/v1/watchaw/episode?id={slug}",
        },
    });
});

export { watchawRouter };
