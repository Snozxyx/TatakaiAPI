/**
 * JustAnime provider for server-side preview scraping (web users only).
 *
 * API: GET https://core.justanime.to/api/watch/{anilistId}/episode/{ep}/{server}
 *
 * Servers tried in priority order for preview:
 *   megaplay  → HLS m3u8 (preferred — direct CDN)
 *   animegg   → MP4 (fallback)
 */

const BASE_URL = 'https://core.justanime.to';

const HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.5',
  'Origin': 'https://justanime.to',
  'Referer': 'https://justanime.to/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
  'sec-ch-ua': '"Not;A=Brand";v="8", "Chromium";v="150", "Brave";v="150"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
  'Sec-GPC': '1',
};

interface JustAnimeSource {
  url: string;
  quality: string;
  isM3U8: boolean;
  headers?: Record<string, string>;
}

interface JustAnimeTrack {
  file: string;
  label: string;
  kind: string;
  default?: boolean;
}

interface JustAnimeStream {
  sources: JustAnimeSource[];
  subtitles?: JustAnimeTrack[];
  tracks?: JustAnimeTrack[];
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
  headers?: Record<string, string>;
}

interface JustAnimeResponse {
  sub?: JustAnimeStream;
  dub?: JustAnimeStream;
}

/** Fetch one server's response from JustAnime core API. */
async function fetchServer(
  anilistId: number,
  episode: number,
  server: string,
): Promise<JustAnimeResponse | null> {
  try {
    const url = `${BASE_URL}/api/watch/${anilistId}/episode/${episode}/${server}`;
    const res = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.json() as JustAnimeResponse;
  } catch {
    return null;
  }
}

/** Pick the best source from a stream object. Prefer HLS, then highest quality MP4. */
function pickSource(stream: JustAnimeStream | undefined): { url: string; isHls: boolean; headers?: Record<string, string> } | null {
  if (!stream?.sources?.length) return null;

  // Prefer HLS
  const hls = stream.sources.find(s => s.isM3U8 && s.url);
  if (hls) return { url: hls.url, isHls: true, headers: stream.headers };

  // Fallback: highest quality MP4
  const qualityOrder = ['1080p', '720p', '480p', '360p'];
  for (const q of qualityOrder) {
    const mp4 = stream.sources.find(s => s.quality === q && s.url);
    if (mp4) return { url: mp4.url, isHls: false, headers: mp4.headers ?? stream.headers };
  }

  // Last resort: first available
  const first = stream.sources.find(s => s.url);
  return first ? { url: first.url, isHls: false, headers: first.headers ?? stream.headers } : null;
}

/**
 * Get a preview stream URL from JustAnime for a given anime.
 * Tries megaplay (HLS) first, falls back to animegg (MP4).
 */
export async function getJustAnimeStream(
  anilistId: number,
  episode: number = 1,
): Promise<{ url: string; isHls: boolean; headers?: Record<string, string> } | null> {
  if (!anilistId) return null;

  // Try servers in priority order
  const servers = ['megaplay', 'animegg'];

  for (const server of servers) {
    const data = await fetchServer(anilistId, episode, server);
    if (!data) continue;

    // Prefer sub, fall back to dub
    const source = pickSource(data.sub) ?? pickSource(data.dub);
    if (source?.url) return source;
  }

  return null;
}
