/** Mirrors frontend `TatakaiMedia` in src/core/content/types.ts */

export type MediaFormat =
  | "TV"
  | "TV_SHORT"
  | "MOVIE"
  | "OVA"
  | "ONA"
  | "SPECIAL"
  | "MUSIC";

export type MediaStatus =
  | "FINISHED"
  | "RELEASING"
  | "NOT_YET_RELEASED"
  | "CANCELLED"
  | "HIATUS";

export type MediaSeason = "WINTER" | "SPRING" | "SUMMER" | "FALL";

export type MediaSource =
  | "ORIGINAL"
  | "MANGA"
  | "LIGHT_NOVEL"
  | "VISUAL_NOVEL"
  | "VIDEO_GAME"
  | "OTHER";

export interface MediaTag {
  id: number;
  name: string;
  category?: string;
  rank?: number;
  isGeneralSpoiler?: boolean;
  isMediaSpoiler?: boolean;
  isAdult?: boolean;
}

export interface Studio {
  id: number;
  name: string;
  isMain: boolean;
  siteUrl?: string;
}

export interface Character {
  id: number;
  name: string;
  imageUrl?: string;
  role: "MAIN" | "SUPPORTING" | "BACKGROUND";
}

export interface StaffMember {
  id: number;
  name: string;
  role: string;
  imageUrl?: string;
}

export interface MediaRelation {
  id: number;
  relationType: string;
  titleRomaji: string;
  titleEnglish?: string;
  coverImage?: string;
  format?: MediaFormat;
  status?: MediaStatus;
}

export interface NextAiringEpisode {
  episode: number;
  airingAt: number;
  timeUntilAiring: number;
}

export interface ExternalLink {
  id?: number;
  url: string;
  site: string;
  type?: string;
  color?: string;
  icon?: string;
}

export interface StreamingEpisode {
  title?: string;
  thumbnail?: string;
  url?: string;
  site?: string;
}

export interface MediaRanking {
  id: number;
  rank: number;
  type: "RATED" | "POPULAR";
  format: MediaFormat;
  year?: number;
  season?: MediaSeason;
  allTime?: boolean;
  context: string;
}

export interface TatakaiMedia {
  anilistId: number;
  malId?: number;
  tatakaiId?: string;
  titleRomaji: string;
  titleEnglish?: string;
  titleNative?: string;
  synonyms: string[];
  coverImageLarge?: string;
  coverImageMedium?: string;
  bannerImage?: string;
  color?: string;
  format?: MediaFormat;
  status?: MediaStatus;
  season?: MediaSeason;
  seasonYear?: number;
  episodes?: number;
  chapters?: number;
  volumes?: number;
  duration?: number;
  episodeSubCount?: number;
  episodeDubCount?: number;
  startDate?: Partial<{ year: number; month: number; day: number }>;
  endDate?: Partial<{ year: number; month: number; day: number }>;
  description?: string;
  averageScore?: number;
  meanScore?: number;
  popularity?: number;
  favourites?: number;
  rating?: string;
  genres: string[];
  tags: MediaTag[];
  source?: MediaSource;
  isAdult: boolean;
  countryOfOrigin?: string;
  nextAiringEpisode?: NextAiringEpisode;
  trailerUrl?: string;
  externalLinks?: ExternalLink[];
  streamingEpisodes?: StreamingEpisode[];
  rankings?: MediaRanking[];
  studios: Studio[];
  characters?: Character[];
  staff?: StaffMember[];
  relations?: MediaRelation[];
  source_api: "anilist" | "jikan" | "tatakai";
  fetchedAt: number;
}

export interface ContentSearchResult {
  media: TatakaiMedia[];
  pageInfo: {
    total: number;
    currentPage: number;
    lastPage: number;
    hasNextPage: boolean;
    perPage: number;
  };
}

export interface HomePageBundle {
  spotlight: TatakaiMedia[];
  trending: TatakaiMedia[];
  topAiring: TatakaiMedia[];
  popular: TatakaiMedia[];
  topUpcoming: TatakaiMedia[];
  latestCompleted: TatakaiMedia[];
  top10: { today: TatakaiMedia[]; week: TatakaiMedia[]; month: TatakaiMedia[] };
  genres: string[];
  fetchedAt: number;
}
