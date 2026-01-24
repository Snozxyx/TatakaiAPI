import { Hono } from "hono";
import * as cheerio from "cheerio";
import { log } from "../../config/logger.js";
import { cache } from "../../config/cache.js";
import type { ServerContext } from "../../config/context.js";

const animelokRouter = new Hono<ServerContext>();

const BASE_URL = "https://animelok.to";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function fetchHtml(url: string): Promise<string> {
    const response = await fetch(url, {
        headers: {
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Referer": BASE_URL,
            "Origin": BASE_URL,
        },
    });
    return response.text();
}

async function fetchApi(url: string): Promise<any> {
    const response = await fetch(url, {
        headers: {
            "User-Agent": USER_AGENT,
            "Accept": "application/json, text/plain, */*",
            "Referer": BASE_URL,
            "Origin": BASE_URL,
            "X-Requested-With": "XMLHttpRequest"
        },
    });
    if (!response.ok) return null;
    return response.json();
}

// ========== HOME ==========
animelokRouter.get("/home", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");

    const data = await cache.getOrSet(async () => {
        log.info(`Fetching Animelok home: ${BASE_URL}/home`);
        const html = await fetchHtml(`${BASE_URL}/home`);
        const $ = cheerio.load(html);

        const sections: any[] = [];

        // Loop through all sections
        $("section").each((i, section) => {
            const title = $(section).find("h2").text().trim();
            log.debug(`Processing section ${i}: ${title}`);

            if (!title) return;

            const items: any[] = [];

            // Find all anime cards in this section
            $(section).find("a").each((_, link) => {
                const url = $(link).attr("href");
                if (!url || !url.includes("/anime/")) return;

                const id = url.split("/").pop(); // text-123456
                const poster = $(link).find("img").attr("src") || $(link).find("img").attr("data-src") || $(link).find("img").attr("srcset")?.split(" ")[0];
                const title = $(link).find("h3, .font-bold").first().text().trim();
                const rank = $(link).find("span").first().text().trim();
                const dubBadge = $(link).text().toLowerCase().includes("dub");

                if (title && id) {
                    items.push({
                        id,
                        title,
                        poster,
                        url,
                        rank: rank && !isNaN(parseInt(rank)) ? parseInt(rank) : undefined,
                        isDub: dubBadge
                    });
                }
            });

            if (items.length > 0) {
                sections.push({
                    title,
                    items
                });
            } else {
                log.warn(`No items found for section: ${title}`);
            }
        });

        if (sections.length === 0) {
            log.error("No sections found on Animelok home page");
        }

        return { sections };
    }, cacheConfig.key, cacheConfig.duration);

    return c.json({ provider: "Tatakai", status: 200, data });
});

// ========== SCHEDULE ==========
animelokRouter.get("/schedule", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");

    const data = await cache.getOrSet(async () => {
        const html = await fetchHtml(`${BASE_URL}/regional-schedule`);
        const $ = cheerio.load(html);

        const schedule: any[] = [];

        $(".schedule-day, .day-section").each((_, day) => {
            const dayName = $(day).find(".day-title, h3").first().text().trim();
            const anime: any[] = [];

            $(day).find(".anime-item, .schedule-item").each((_, item) => {
                const title = $(item).find(".title, a").first().text().trim();
                const time = $(item).find(".time").text().trim();
                const link = $(item).find("a").attr("href");
                const id = link?.match(/\/anime\/([^\/]+)/)?.[1];

                if (title) {
                    anime.push({ id, title, time, url: link });
                }
            });

            if (anime.length > 0) {
                schedule.push({ day: dayName, anime });
            }
        });

        return { schedule };
    }, cacheConfig.key, cacheConfig.duration);

    return c.json({ provider: "Tatakai", status: 200, data });
});

// ========== LANGUAGES ==========
animelokRouter.get("/languages", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");

    const data = await cache.getOrSet(async () => {
        const html = await fetchHtml(`${BASE_URL}/languages`);
        const $ = cheerio.load(html);

        const languages: any[] = [];

        $("a[href^='/languages/']").each((_, item) => {
            const name = $(item).find("h3").text().trim() || $(item).text().trim();
            const link = $(item).attr("href");
            const code = link?.split("/").pop();

            if (name && code) {
                languages.push({ name, code, url: link });
            }
        });

        // Filter unique languages
        const uniqueLanguages = Array.from(new Map(languages.map(l => [l.code, l])).values());

        return { languages: uniqueLanguages };
    }, cacheConfig.key, cacheConfig.duration);

    return c.json({ provider: "Tatakai", status: 200, data });
});

// ========== ANIME BY LANGUAGE ==========
animelokRouter.get("/languages/:language", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");
    const language = c.req.param("language");
    const page = c.req.query("page") || "1";

    const data = await cache.getOrSet(async () => {
        const html = await fetchHtml(`${BASE_URL}/languages/${language}?page=${page}`);
        const $ = cheerio.load(html);

        const anime: any[] = [];

        $("a[href^='/anime/']").each((_, item) => {
            const title = $(item).find("h3").text().trim();
            const poster = $(item).find("img").attr("src") || $(item).find("img").attr("data-src");
            const url = $(item).attr("href");
            const id = url?.split("/").pop();

            // Metadata extraction
            const meta: string[] = [];
            $(item).find("span").each((_, s) => {
                const text = $(s).text().trim();
                if (text && !text.includes(title)) meta.push(text);
            });

            if (title && id) {
                anime.push({
                    id,
                    title,
                    poster,
                    url,
                    meta: meta.length > 0 ? meta : undefined
                });
            }
        });

        // Pagination info
        const hasNextPage = $(".flex.items-center.justify-center button:contains('Next'), .flex.items-center.justify-center a:contains('Next')").length > 0 ||
            $(".flex.items-center.justify-center button").last().text().trim() === ">";

        return { language, page: parseInt(page), anime, hasNextPage };
    }, cacheConfig.key, cacheConfig.duration);

    return c.json({ provider: "Tatakai", status: 200, data });
});

// ========== ANIME INFO ==========
animelokRouter.get("/anime/:id", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");
    const id = c.req.param("id");

    const data = await cache.getOrSet(async () => {
        const htmlPromise = fetchHtml(`${BASE_URL}/anime/${id}`);
        const apiPromise = fetchApi(`${BASE_URL}/api/anime/${id}/episodes-range?page=0&lang=JAPANESE&pageSize=100`);

        const [html, apiData] = await Promise.all([htmlPromise, apiPromise]);
        const $ = cheerio.load(html);

        const title = $("h1").first().text().trim() || $("meta[property='og:title']").attr("content")?.split(" - Animelok")[0] || "";
        const description = $(".description, .synopsis, [class*='desc'], p.text-sm").first().text().trim();
        const poster = $(".poster img, .cover img").attr("src") || $("meta[property='og:image']").attr("content");
        const rating = $(".rating, .score, .bg-white\\/20").first().text().trim();

        // Extract seasons/episodes from API
        const episodes: any[] = [];
        if (apiData && apiData.episodes) {
            apiData.episodes.forEach((ep: any) => {
                episodes.push({
                    number: ep.number,
                    title: ep.name,
                    url: `/watch/${id}?ep=${ep.number}`,
                    image: ep.img,
                    isFiller: ep.isFiller
                });
            });
        }

        const seasons = episodes.length > 0 ? [{ title: "Season 1", episodes }] : [];

        return { id, title, description, poster, rating, seasons };
    }, cacheConfig.key, cacheConfig.duration);

    return c.json({ provider: "Tatakai", status: 200, data });
});

// ========== WATCH (Episode Sources) ==========
animelokRouter.get("/watch/:id", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");
    const id = c.req.param("id");
    const ep = c.req.query("ep") || "1";

    const data = await cache.getOrSet(async () => {
        const apiData = await fetchApi(`${BASE_URL}/api/anime/${id}/episodes/${ep}`);

        if (!apiData || !apiData.episode) {
            // Fallback or empty data
            return { id, episode: ep, title: "", servers: [], subtitles: [] };
        }

        const episode = apiData.episode;
        const title = episode.name || "";
        const servers = (episode.servers || []).map((s: any) => ({
            name: s.name,
            url: s.url,
            language: s.languages?.[0] || "Unknown",
            tip: s.tip
        }));

        const subtitles = (episode.subtitles || []).map((sub: any) => ({
            label: sub.name,
            src: sub.url
        }));

        return { id, episode: ep, title, servers, subtitles };
    }, cacheConfig.key, cacheConfig.duration);

    return c.json({ provider: "Tatakai", status: 200, data });
});

// ========== ROOT ==========
animelokRouter.get("/", (c) => {
    return c.json({
        provider: "Tatakai",
        status: 200,
        message: "Animelok Scraper - Hindi Dubbed Anime with HiAnime-style IDs",
        endpoints: {
            home: "/api/v1/animelok/home",
            schedule: "/api/v1/animelok/schedule",
            languages: "/api/v1/animelok/languages",
            languageDetails: "/api/v1/animelok/languages/:language?page=1",
            anime: "/api/v1/animelok/anime/:id",
            watch: "/api/v1/animelok/watch/:id?ep=1",
        },
    });
});

export { animelokRouter };
