import type { AniListFuzzyDate, AniListMedia } from "../providers/anilist/types.js";
import type {
  Character,
  ExternalLink,
  MediaRanking,
  MediaRelation,
  MediaTag,
  NextAiringEpisode,
  StaffMember,
  StreamingEpisode,
  Studio,
  TatakaiMedia,
} from "../types/tatakaiMedia.js";

function sanitizeDescription(value?: string | null): string | undefined {
  if (!value) return undefined;
  const stripped = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return stripped || undefined;
}

function mapFormat(f?: string | null): TatakaiMedia["format"] {
  if (!f) return undefined;
  const v = f as TatakaiMedia["format"];
  return v;
}

function mapStatus(s?: string | null): TatakaiMedia["status"] {
  if (!s) return undefined;
  return s as TatakaiMedia["status"];
}

function mapSeason(s?: string | null): TatakaiMedia["season"] {
  if (!s) return undefined;
  return s as TatakaiMedia["season"];
}

function mapSource(s?: string | null): TatakaiMedia["source"] {
  if (!s) return undefined;
  return s.replace(/\s+/g, "_").toUpperCase() as TatakaiMedia["source"];
}

function fuzzyToPartial(fd?: AniListFuzzyDate | null): TatakaiMedia["startDate"] {
  if (!fd) return undefined;
  const out: Partial<{ year: number; month: number; day: number }> = {};
  if (fd.year != null) out.year = fd.year;
  if (fd.month != null) out.month = fd.month;
  if (fd.day != null) out.day = fd.day;
  return Object.keys(out).length ? out : undefined;
}

export function anilistToTatakaiMedia(m: AniListMedia, source: "anilist" | "jikan" = "anilist"): TatakaiMedia {
  const title = m.title ?? {};
  const romaji = title.romaji || title.userPreferred || title.english || title.native || "Untitled";
  const studios: Studio[] =
    m.studios?.edges?.map((e) => ({
      id: e.node.id,
      name: e.node.name,
      isMain: e.isMain,
      siteUrl: e.node.siteUrl ?? undefined,
    })) ?? [];

  const tags: MediaTag[] =
    m.tags?.map((t) => ({
      id: t.id,
      name: t.name,
      rank: t.rank ?? undefined,
      isGeneralSpoiler: t.isGeneralSpoiler ?? undefined,
      isMediaSpoiler: t.isMediaSpoiler ?? undefined,
      isAdult: t.isAdult ?? undefined,
    })) ?? [];

  const characters: Character[] | undefined = m.characters?.edges?.map((e) => {
    const r = (e.role ?? "").toUpperCase();
    const role: Character["role"] =
      r === "MAIN" ? "MAIN" : r.includes("SUPPORT") ? "SUPPORTING" : "BACKGROUND";
    return {
      id: e.node.id,
      name: e.node.name?.full ?? "",
      imageUrl: e.node.image?.large ?? undefined,
      role,
    };
  });

  const staff: StaffMember[] | undefined = m.staff?.edges?.map((e) => ({
    id: e.node.id,
    name: e.node.name?.full ?? "",
    role: e.role ?? "",
    imageUrl: e.node.image?.large ?? undefined,
  }));

  const relations: MediaRelation[] | undefined = m.relations?.edges
    ?.map((e) => {
      const node = e.node;
      if (!node || !node.id) return null;
      return {
        id: node.id,
        relationType: e.relationType ?? "",
        titleRomaji: node.title?.romaji ?? "",
        titleEnglish: node.title?.english ?? undefined,
        coverImage: node.coverImage?.large ?? undefined,
        format: mapFormat(node.format),
        status: mapStatus(node.status),
      } satisfies MediaRelation;
    })
    .filter(Boolean) as MediaRelation[] | undefined;

  const rankings: MediaRanking[] | undefined = m.rankings?.map((r) => ({
    id: r.id,
    rank: r.rank,
    type: r.type as MediaRanking["type"],
    format: mapFormat(r.format) ?? "TV",
    year: r.year ?? undefined,
    season: r.season ? mapSeason(r.season) : undefined,
    allTime: r.allTime ?? undefined,
    context: r.context,
  }));

  const externalLinks: ExternalLink[] | undefined = m.externalLinks?.map((l) => ({
    url: l.url,
    site: l.site,
  }));

  const streamingEpisodes: StreamingEpisode[] | undefined = m.streamingEpisodes?.map((s) => ({
    title: s.title ?? undefined,
    thumbnail: s.thumbnail ?? undefined,
    url: s.url ?? undefined,
    site: s.site ?? undefined,
  }));

  let nextAiring: NextAiringEpisode | undefined;
  if (m.nextAiringEpisode?.airingAt != null) {
    nextAiring = {
      episode: m.nextAiringEpisode.episode ?? 0,
      airingAt: m.nextAiringEpisode.airingAt,
      timeUntilAiring: m.nextAiringEpisode.timeUntilAiring ?? 0,
    };
  }

  const trailerUrl =
    m.trailer?.site?.toLowerCase() === "youtube" && m.trailer.id
      ? `https://www.youtube.com/watch?v=${m.trailer.id}`
      : m.trailer?.thumbnail ?? undefined;

  return {
    anilistId: m.id,
    malId: m.idMal ?? undefined,
    titleRomaji: romaji,
    titleEnglish: title.english ?? undefined,
    titleNative: title.native ?? undefined,
    synonyms: m.synonyms ?? [],
    coverImageLarge: m.coverImage?.extraLarge ?? m.coverImage?.large ?? undefined,
    coverImageMedium: m.coverImage?.medium ?? undefined,
    bannerImage: m.bannerImage ?? undefined,
    format: mapFormat(m.format),
    status: mapStatus(m.status),
    season: mapSeason(m.season),
    seasonYear: m.seasonYear ?? undefined,
    episodes: m.episodes ?? undefined,
    chapters: m.chapters ?? undefined,
    volumes: m.volumes ?? undefined,
    duration: m.duration ?? undefined,
    startDate: fuzzyToPartial(m.startDate),
    endDate: fuzzyToPartial(m.endDate),
    description: sanitizeDescription(m.description),
    averageScore: m.averageScore ?? undefined,
    meanScore: m.meanScore ?? undefined,
    popularity: m.popularity ?? undefined,
    favourites: m.favourites ?? undefined,
    genres: m.genres ?? [],
    tags,
    source: mapSource(m.source),
    isAdult: Boolean(m.isAdult),
    countryOfOrigin: m.countryOfOrigin ?? undefined,
    nextAiringEpisode: nextAiring,
    trailerUrl,
    externalLinks,
    streamingEpisodes,
    rankings,
    studios,
    characters,
    staff,
    relations,
    source_api: source,
    fetchedAt: Date.now(),
  };
}

/** DB row shape for content_items upsert */
export function tatakaiMediaToDbRow(m: TatakaiMedia, tatakaiId?: string) {
  return {
    ...(tatakaiId ? { tatakai_id: tatakaiId } : {}),
    anilist_id: m.anilistId && m.anilistId > 0 ? m.anilistId : null,
    mal_id: m.malId ?? null,
    title_romaji: m.titleRomaji,
    title_english: m.titleEnglish ?? null,
    title_native: m.titleNative ?? null,
    description: sanitizeDescription(m.description) ?? null,
    cover_image_large: m.coverImageLarge ?? null,
    cover_image_medium: m.coverImageMedium ?? null,
    banner_image: m.bannerImage ?? null,
    color: m.color ?? null,
    format: m.format ?? null,
    status: m.status ?? null,
    season: m.season ?? null,
    season_year: m.seasonYear ?? null,
    episodes: m.episodes ?? null,
    chapters: m.chapters ?? null,
    volumes: m.volumes ?? null,
    duration: m.duration ?? null,
    episode_sub_count: m.episodeSubCount ?? null,
    episode_dub_count: m.episodeDubCount ?? null,
    start_date: m.startDate ?? null,
    end_date: m.endDate ?? null,
    average_score: m.averageScore ?? null,
    mean_score: m.meanScore ?? null,
    popularity: m.popularity ?? null,
    favourites: m.favourites ?? null,
    rating: m.rating ?? null,
    genres: m.genres,
    tags: m.tags,
    source: m.source ?? null,
    is_adult: m.isAdult,
    country_of_origin: m.countryOfOrigin ?? null,
    next_airing_episode: m.nextAiringEpisode ?? null,
    trailer_url: m.trailerUrl ?? null,
    synonyms: m.synonyms,
    relations: m.relations ?? null,
    characters: m.characters ?? null,
    staff: m.staff ?? null,
    external_links: m.externalLinks ?? null,
    streaming_episodes: m.streamingEpisodes ?? null,
    rankings: m.rankings ?? null,
    studios: m.studios,
    last_synced_from: m.source_api,
    updated_at: new Date().toISOString(),
  };
}

export function dbRowToTatakaiMedia(row: Record<string, unknown>): TatakaiMedia {
  return {
    tatakaiId: String(row.tatakai_id),
    anilistId: (row.anilist_id as number) ?? 0,
    malId: (row.mal_id as number) ?? undefined,
    titleRomaji: String(row.title_romaji),
    titleEnglish: (row.title_english as string) ?? undefined,
    titleNative: (row.title_native as string) ?? undefined,
    synonyms: (row.synonyms as string[]) ?? [],
    coverImageLarge: (row.cover_image_large as string) ?? undefined,
    coverImageMedium: (row.cover_image_medium as string) ?? undefined,
    bannerImage: (row.banner_image as string) ?? undefined,
    color: (row.color as string) ?? undefined,
    format: row.format as TatakaiMedia["format"],
    status: row.status as TatakaiMedia["status"],
    season: row.season as TatakaiMedia["season"],
    seasonYear: (row.season_year as number) ?? undefined,
    episodes: (row.episodes as number) ?? undefined,
    chapters: (row.chapters as number) ?? undefined,
    volumes: (row.volumes as number) ?? undefined,
    duration: (row.duration as number) ?? undefined,
    episodeSubCount: (row.episode_sub_count as number) ?? undefined,
    episodeDubCount: (row.episode_dub_count as number) ?? undefined,
    startDate: (row.start_date as TatakaiMedia["startDate"]) ?? undefined,
    endDate: (row.end_date as TatakaiMedia["endDate"]) ?? undefined,
    description: sanitizeDescription((row.description as string) ?? undefined),
    averageScore: (row.average_score as number) ?? undefined,
    meanScore: (row.mean_score as number) ?? undefined,
    popularity: (row.popularity as number) ?? undefined,
    favourites: (row.favourites as number) ?? undefined,
    rating: (row.rating as string) ?? undefined,
    genres: (row.genres as string[]) ?? [],
    tags: (row.tags as MediaTag[]) ?? [],
    source: row.source as TatakaiMedia["source"],
    isAdult: Boolean(row.is_adult),
    countryOfOrigin: (row.country_of_origin as string) ?? undefined,
    nextAiringEpisode: (row.next_airing_episode as NextAiringEpisode) ?? undefined,
    trailerUrl: (row.trailer_url as string) ?? undefined,
    externalLinks: (row.external_links as ExternalLink[]) ?? undefined,
    streamingEpisodes: (row.streaming_episodes as StreamingEpisode[]) ?? undefined,
    rankings: (row.rankings as MediaRanking[]) ?? undefined,
    studios: (row.studios as Studio[]) ?? [],
    characters: (row.characters as Character[]) ?? undefined,
    staff: (row.staff as StaffMember[]) ?? undefined,
    relations: (row.relations as MediaRelation[]) ?? undefined,
    source_api: "tatakai",
    fetchedAt: Date.now(),
  };
}
