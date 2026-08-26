/** Raw AniList GraphQL shapes (subset) */

export interface AniListTitle {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
  userPreferred?: string | null;
}

export interface AniListCoverImage {
  extraLarge?: string | null;
  large?: string | null;
  medium?: string | null;
}

export interface AniListFuzzyDate {
  year?: number | null;
  month?: number | null;
  day?: number | null;
}

export interface AniListPageInfo {
  total: number;
  perPage: number;
  currentPage: number;
  lastPage: number;
  hasNextPage: boolean;
}

export interface AniListMedia {
  id: number;
  idMal?: number | null;
  title: AniListTitle;
  coverImage?: AniListCoverImage | null;
  bannerImage?: string | null;
  description?: string | null;
  episodes?: number | null;
  duration?: number | null;
  format?: string | null;
  status?: string | null;
  season?: string | null;
  seasonYear?: number | null;
  averageScore?: number | null;
  meanScore?: number | null;
  popularity?: number | null;
  favourites?: number | null;
  genres?: string[] | null;
  synonyms?: string[] | null;
  isAdult?: boolean | null;
  countryOfOrigin?: string | null;
  source?: string | null;
  startDate?: AniListFuzzyDate | null;
  endDate?: AniListFuzzyDate | null;
  nextAiringEpisode?: {
    episode?: number | null;
    airingAt?: number | null;
    timeUntilAiring?: number | null;
  } | null;
  trailer?: { id?: string | null; site?: string | null; thumbnail?: string | null } | null;
  externalLinks?: { url: string; site: string }[] | null;
  rankings?: {
    id: number;
    rank: number;
    type: string;
    format: string;
    year?: number | null;
    season?: string | null;
    allTime?: boolean | null;
    context: string;
  }[] | null;
  tags?: {
    id: number;
    name: string;
    rank?: number | null;
    isGeneralSpoiler?: boolean | null;
    isMediaSpoiler?: boolean | null;
    isAdult?: boolean | null;
  }[] | null;
  studios?: {
    edges?: { isMain: boolean; node: { id: number; name: string; siteUrl?: string | null } }[] | null;
  } | null;
  characters?: {
    edges?: {
      role?: string | null;
      node: { id: number; name?: { full?: string | null } | null; image?: { large?: string | null } | null };
    }[] | null;
  } | null;
  staff?: {
    edges?: {
      role?: string | null;
      node: { id: number; name?: { full?: string | null } | null; image?: { large?: string | null } | null };
    }[] | null;
  } | null;
  relations?: {
    edges?: {
      relationType?: string | null;
      node?: AniListMedia | null;
    }[] | null;
  } | null;
  chapters?: number | null;
  volumes?: number | null;
  streamingEpisodes?: { title?: string | null; thumbnail?: string | null; url?: string | null; site?: string | null }[] | null;
}

export type AniListManga = AniListMedia & {
  chapters?: number | null;
  volumes?: number | null;
};

export interface AniListPage<T> {
  pageInfo: AniListPageInfo;
  media: T[];
}
