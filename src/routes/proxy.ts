import { Hono } from "hono";
import { env } from "../config/env.js";
import { ProxyBalancer } from "../lib/proxyBalancer.js";

const DEFAULT_STREAM_PROXY_URLS = ["http://localhost:3000/api/v1/streamingProxy"];
const configuredProxyUrls = (env.STREAM_PROXY_URLS || "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);
const balancerUrls = configuredProxyUrls.length ? configuredProxyUrls : DEFAULT_STREAM_PROXY_URLS;
const balancer = new ProxyBalancer(balancerUrls);
const proxyRouter = new Hono();

const DEFAULT_REFERER = "https://megacloud.club/";
const RAW_GITHUB_HOSTS = new Set([
  "raw.githubusercontent.com",
  "raw.github.com",
  "gist.githubusercontent.com",
  "cdn.jsdelivr.net",
  "github.com",
]);

const resolveUrl = (target: string, base: string) => {
  try { return new URL(target, base).toString(); } catch { return target; }
};

const isAllowedRawGithubUrl = (value: string) => {
  try {
    const url = new URL(value);
    return RAW_GITHUB_HOSTS.has(url.hostname.toLowerCase()) && (url.protocol === "https:" || url.protocol === "http:");
  } catch {
    return false;
  }
};

const copyProxyHeaders = (upstream: Response, extra: Record<string, string> = {}) => {
  const headers = new Headers(extra);
  const headerNames = ["content-type", "content-range", "accept-ranges", "content-length", "etag", "last-modified"];

  for (const headerName of headerNames) {
    const value = upstream.headers.get(headerName);
    if (value) headers.set(headerName, value);
  }

  return headers;
};

const rewritePlaylistUrls = (
  playlistText: string,
  baseUrl: string,
  proxyEndpointPath: string,
  referer: string,
  userAgent?: string,
  proxyPassword?: string,
) => {
  return playlistText.split("\n").map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    const rewrite = (targetUrl: string) => {
      const resolved = resolveUrl(targetUrl, baseUrl);
      const params = new URLSearchParams({ url: resolved });
      if (referer) params.set("referer", referer);
      if (userAgent) params.set("userAgent", userAgent);
      if (proxyPassword) params.set("password", proxyPassword);
      params.set("type", "video");
      return `${proxyEndpointPath}?${params.toString()}`;
    };

    if (trimmed.startsWith("#")) {
      return trimmed.replace(/URI="([^"]+)"/g, (_m, p1) => `URI="${rewrite(p1)}"`);
    }

    return rewrite(trimmed);
  }).join("\n");
};

proxyRouter.get("/status", (c) => {
  return c.json({ success: true, nodes: balancer.getStats() });
});

proxyRouter.get("/m3u8-streaming-proxy", async (c) => {
  const targetUrl = String(c.req.query("url") || "").trim();
  if (!targetUrl) return c.json({ success: false, message: "Missing url query param" }, 400);

  const referer = String(c.req.query("referer") || DEFAULT_REFERER).trim();
  const userAgent = String(c.req.query("userAgent") || "").trim() ||
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

  const headers: Record<string, string> = {
    "User-Agent": userAgent,
    Referer: referer,
    Accept: "*/*",
  };

  let upstream: Response;
  try {
    upstream = balancer.hasNodes
      ? await balancer.fetch(targetUrl, { method: "GET", headers }, 9000, {
          referer,
          userAgent,
          type: "video",
          password: env.STREAM_PROXY_PASSWORD,
        })
      : await fetch(targetUrl, { method: "GET", headers });
  } catch (error) {
    return c.json({ success: false, message: (error as Error).message }, 502);
  }

  const contentType = upstream.headers.get("content-type") || "";
  const isPlaylist = contentType.includes("mpegurl") || targetUrl.includes(".m3u8");

  if (isPlaylist) {
    const playlist = await upstream.text();
    const rewritten = rewritePlaylistUrls(
      playlist,
      targetUrl,
      "/api/proxy/m3u8-streaming-proxy",
      referer,
      userAgent,
      env.STREAM_PROXY_PASSWORD,
    );

    return new Response(rewritten, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "no-store",
      },
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": contentType || "application/octet-stream",
      "Cache-Control": "no-store",
    },
  });
});

proxyRouter.get("/subtitle", async (c) => {
  const targetUrl = String(c.req.query("url") || "").trim();
  if (!targetUrl) return c.json({ success: false, message: "Missing url query param" }, 400);

  // Only allow http/https URLs
  if (!/^https?:\/\//i.test(targetUrl)) {
    return c.json({ success: false, message: "Only http/https URLs are allowed" }, 400);
  }

  const referer = String(c.req.query("referer") || DEFAULT_REFERER).trim();
  const userAgent = String(c.req.query("userAgent") || "").trim() ||
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

  const headers: Record<string, string> = {
    "User-Agent": userAgent,
    "Referer": referer,
    "Accept": "text/vtt, text/plain, text/x-ass, application/octet-stream, */*",
  };

  let upstream: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    upstream = await fetch(targetUrl, { method: "GET", headers, signal: controller.signal });
    clearTimeout(timeout);
  } catch (error) {
    return c.json({ success: false, message: (error as Error).message }, 502);
  }

  if (!upstream.ok) {
    return c.json({ success: false, message: `Upstream error: ${upstream.status}` }, upstream.status as any);
  }

  const upstreamContentType = upstream.headers.get("content-type") || "";
  let contentType = upstreamContentType;
  if (!contentType || contentType.includes("octet-stream")) {
    if (targetUrl.includes(".vtt")) contentType = "text/vtt; charset=utf-8";
    else if (targetUrl.includes(".ass") || targetUrl.includes(".ssa")) contentType = "text/plain; charset=utf-8";
    else if (targetUrl.includes(".srt")) contentType = "text/plain; charset=utf-8";
    else contentType = "text/plain; charset=utf-8";
  }

  const body = await upstream.arrayBuffer();

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
      "Content-Length": String(body.byteLength),
    },
  });
});

proxyRouter.get("/raw", async (c) => {
  const targetUrl = String(c.req.query("url") || "").trim();
  if (!targetUrl) return c.json({ success: false, message: "Missing url query param" }, 400);
  if (!isAllowedRawGithubUrl(targetUrl)) {
    return c.json({ success: false, message: "Only raw GitHub URLs are allowed" }, 400);
  }

  const range = String(c.req.header("range") || c.req.header("Range") || "").trim();
  const headers: Record<string, string> = {
    Accept: "*/*",
  };

  if (range) headers.Range = range;

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, { method: "GET", headers });
  } catch (error) {
    return c.json({ success: false, message: (error as Error).message }, 502);
  }

  const contentType = upstream.headers.get("content-type") || "application/octet-stream";
  const responseHeaders = copyProxyHeaders(upstream, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
});

export { proxyRouter };