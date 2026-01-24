import { Hono } from "hono";
import * as cheerio from "cheerio";
import { cache } from "../../config/cache.js";
import { log } from "../../config/logger.js";
import type { ServerContext } from "../../config/context.js";

const desidubanimeRouter = new Hono<ServerContext>();

const BASE_URL = "https://www.desidubanime.me";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function fetchHtml(url: string): Promise<string> {
    log.info(`Fetching: ${url}`);
    const response = await fetch(url, {
        headers: {
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Referer": BASE_URL,
        },
    });
    if (!response.ok) {
        log.error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
        const error = new Error(`Failed to fetch ${url}`);
        (error as any).status = response.status;
        throw error;
    }
    return response.text();
}

// ========== HOME ==========
desidubanimeRouter.get("/home", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");

    const data = await cache.getOrSet(async () => {
        const html = await fetchHtml(BASE_URL);
        const $ = cheerio.load(html);

        const spotlight: any[] = [];
        const trending: any[] = [];
        const latest: any[] = [];

        // Spotlight
        $(".swiper-slide").each((_, slide) => {
            const title = $(slide).find("h2 span[data-nt-title], h2 span[data-en-title]").first().text().trim();
            const description = $(slide).find(".text-\\[13px\\].line-clamp-2").text().trim();
            const poster = $(slide).find("img").attr("data-src") || $(slide).find("img").attr("src");
            const link = $(slide).find("a[href*='/anime/']").attr("href");
            const id = link?.split("/anime/")[1]?.replace(/\/$/, "");

            if (title && id) {
                const isDub = true;
                spotlight.push({ id, title, description, poster, url: link, isDub });
            }
        });

        // Trending
        $(".swiper-trending .swiper-slide").each((_, slide) => {
            const title = $(slide).find("span[data-nt-title], span[data-en-title]").first().text().trim();
            const poster = $(slide).find("img").attr("data-src") || $(slide).find("img").attr("src");
            const link = $(slide).find("a").attr("href");
            const id = link?.split("/anime/")[1]?.replace(/\/$/, "");
            const rank = $(slide).find("span.absolute").text().trim();

            if (title && id) {
                trending.push({ id, title, poster, url: link, rank: parseInt(rank) || undefined });
            }
        });

        // Latest/Sections
        $("section").each((_, section) => {
            const sectionTitle = $(section).find("h2").text().trim();
            if (sectionTitle.includes("Trending") || sectionTitle.includes("Spotlight")) return;

            const items: any[] = [];
            $(section).find("li.odd\\:bg-tertiary, .grid div").each((_, item) => {
                const link = $(item).find("a").attr("href");
                const title = $(item).find("h3, .dynamic-name").text().trim();
                const poster = $(item).find("img").attr("data-src") || $(item).find("img").attr("src");
                const id = link?.split("/anime/")[1]?.replace(/\/$/, "");
                const ep = $(item).find("span:contains('E ')").text().trim().replace("E ", "");

                if (title && id) {
                    items.push({ id, title, poster, url: link, latestEpisode: ep ? parseInt(ep) : undefined });
                }
            });

            if (items.length > 0) {
                latest.push({ title: sectionTitle, items });
            }
        });

        return { spotlight, trending, latest };
    }, cacheConfig.key, cacheConfig.duration);

    return c.json({ provider: "Desidubanime", status: 200, data });
});

// ========== SEARCH ==========
desidubanimeRouter.get("/search/:query", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");
    const query = c.req.param("query");
    const page = c.req.query("page") || "1";

    const data = await cache.getOrSet(async () => {
        const searchUrl = `${BASE_URL}/page/${page}/?s=${encodeURIComponent(query)}`;
        const html = await fetchHtml(searchUrl);
        const $ = cheerio.load(html);

        const results: any[] = [];

        $("div#archive-content article").each((_, article) => {
            const title = $(article).find("h3, .entry-title").text().trim();
            const link = $(article).find("a").attr("href");
            const poster = $(article).find("img").attr("src") || $(article).find("img").attr("data-src");
            const id = link?.split("/anime/")[1]?.replace(/\/$/, "");

            if (title && link) {
                const finalId = id || link.split("/").filter(Boolean).pop();
                results.push({ id: finalId, title, poster, url: link });
            }
        });

        return { results, page: parseInt(page), hasNextPage: $(".pagination .next").length > 0 };

    }, cacheConfig.key, cacheConfig.duration);

    return c.json({ provider: "Desidubanime", status: 200, data });
});

// ========== ANIME INFO ==========
desidubanimeRouter.get("/anime/:id", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");
    const id = c.req.param("id");

    const data = await cache.getOrSet(async () => {
        const url = `${BASE_URL}/anime/${id}/`;
        const html = await fetchHtml(url);
        const $ = cheerio.load(html);

        const title = $("h1.entry-title").text().trim();
        const description = $(".entry-content p").first().text().trim();
        const poster = $(".entry-content img").first().attr("src");

        const episodes: any[] = [];

        $(".episode-list-display-box .episode-list-item").each((_, item) => {
            const href = $(item).attr("href");
            const epNum = $(item).attr("data-episode-search-query");
            const epTitle = $(item).find(".episode-list-item-title").text().trim();
            const epUrlId = href?.split("/watch/")[1]?.replace(/\/$/, "");

            if (href && epNum) {
                episodes.push({
                    number: parseInt(epNum),
                    title: epTitle || `Episode ${epNum}`,
                    url: href,
                    id: epUrlId
                });
            }
        });

        if (episodes.length === 0) {
            $(".swiper-slide a[href*='/watch/']").each((_, link) => {
                const href = $(link).attr("href");
                const text = $(link).find("span").text().trim();
                if (href) {
                    const epNumMatch = text.match(/(\d+)/);
                    const epNum = epNumMatch ? parseInt(epNumMatch[1]) : episodes.length + 1;
                    episodes.push({
                        number: epNum,
                        title: text,
                        url: href,
                        id: href.split("/watch/")[1]?.replace(/\/$/, "")
                    });
                }
            });
        }

        const uniqueEpisodes = Array.from(new Map(episodes.map(e => [e.number, e])).values()).sort((a, b) => a.number - b.number);

        return { id, title, description, poster, episodes: uniqueEpisodes };
    }, cacheConfig.key, cacheConfig.duration);

    return c.json({ provider: "Desidubanime", status: 200, data });
});

// ========== WATCH ==========
desidubanimeRouter.get("/watch/:id", async (c) => {
    const cacheConfig = c.get("CACHE_CONFIG");
    const id = c.req.param("id");

    try {
        const data = await cache.getOrSet(async () => {
            const url = `${BASE_URL}/watch/${id}/`;
            log.info(`Fetching watch page: ${url}`);

            const html = await fetchHtml(url);
            log.debug(`Fetched HTML length: ${html.length}`);

            const $ = cheerio.load(html);

            let title = $("h1").text().trim();
            if (!title) {
                title = $("title").text().replace(" - Desi Dub Anime", "").trim();
            }
            log.debug(`Parsed title: ${title}`);

            const sources: any[] = [];

            // 1. Check for iframes
            log.debug("Checking for iframes...");
            $("iframe").each((i, iframe) => {
                const src = $(iframe).attr("src") || $(iframe).attr("data-src");
                if (src && !src.includes("google") && !src.includes("disqus")) {
                    log.debug(`Found iframe source: ${src}`);
                    sources.push({ url: src, name: "Iframe", type: "iframe" });
                }
            });

            // 2. Check for js_configs (Encrypted)
            log.debug("Checking for js_configs...");
            let jsConfigMatch: RegExpMatchArray | null = null;

            const scriptTags = $("script");
            scriptTags.each((i, s) => {
                try {
                    const scriptContent = $(s).html();
                    if (scriptContent && scriptContent.includes("var js_configs")) {
                        // Safety: Limit search/match to reasonably sized strings if chunk available
                        // Or just run match
                        jsConfigMatch = scriptContent.match(/var js_configs\s*=\s*["']([^"']+)["']/);
                        if (jsConfigMatch) {
                            log.debug("Found js_configs match.");
                            return false; // break loop
                        }
                    }
                } catch (err: any) {
                    log.warn(`Error parsing script ${i}: ${err.message}`);
                }
            });

            if (jsConfigMatch) {
                sources.push({
                    type: "encrypted",
                    config: jsConfigMatch[1],
                    description: "Encrypted player config. Requires decryption (AES/Salted)."
                });
            }

            return { id, title, sources };
        }, cacheConfig.key, cacheConfig.duration);

        return c.json({ provider: "Desidubanime", status: 200, data });
    } catch (e: any) {
        log.error(`Error in Desidubanime watch handler: ${e.message}`);
        log.error(e.stack);
        const status = e.status || 500;
        return c.json({ provider: "Desidubanime", status, message: e.message || "Internal Server Error" }, status);
    }
});

export { desidubanimeRouter };
