/** Jikan v4 subset */

export interface JikanPagination {
  last_visible_page: number;
  has_next_page: boolean;
  current_page: number;
  items: { count: number; total: number; per_page: number };
}

export interface JikanImage {
  image_url?: string | null;
  small_image_url?: string | null;
  large_image_url?: string | null;
}

export interface JikanCommon {
  mal_id: number;
  url?: string;
  images?: { jpg?: JikanImage; webp?: JikanImage };
  approved?: boolean;
  titles?: { type?: string; title?: string }[];
  title?: string;
  title_english?: string | null;
  title_japanese?: string | null;
  title_synonyms?: string[];
  type?: string | null;
  status?: string | null;
  score?: number | null;
  scored_by?: number | null;
  rank?: number | null;
  popularity?: number | null;
  members?: number | null;
  favorites?: number | null;
  synopsis?: string | null;
  background?: string | null;
  genres?: { mal_id: number; name: string }[];
  explicit_genres?: { mal_id: number; name: string }[];
  themes?: { mal_id: number; name: string }[];
  demographics?: { mal_id: number; name: string }[];
}

export interface JikanAnime extends JikanCommon {
  trailer?: { embed_url?: string | null; url?: string | null };
  source?: string | null;
  episodes?: number | null;
  airing?: boolean;
  aired?: { from?: string | null; to?: string | null; prop?: unknown };
  duration?: string | null;
  rating?: string | null;
  season?: string | null;
  year?: number | null;
  broadcast?: unknown;
  producers?: { mal_id: number; name: string }[];
  licensors?: { mal_id: number; name: string }[];
  studios?: { mal_id: number; name: string }[];
}

export interface JikanAnimeFull extends JikanAnime {
  relations?: { entry: { mal_id: number; type: string; name: string; url: string }[]; relation: string }[];
  external?: { name: string; url: string }[];
  streaming?: { name: string; url: string }[];
}

export interface JikanManga extends JikanCommon {
  chapters?: number | null;
  volumes?: number | null;
  publishing?: boolean;
  published?: { from?: string | null; to?: string | null; prop?: unknown };
  authors?: { mal_id: number; name: string }[];
  serializations?: { mal_id: number; name: string }[];
}

export interface JikanMangaFull extends JikanManga {
  relations?: { entry: { mal_id: number; type: string; name: string; url: string }[]; relation: string }[];
  external?: { name: string; url: string }[];
}

export interface JikanEpisode {
  mal_id: number;
  url?: string;
  title?: string;
  title_japanese?: string | null;
  title_romanji?: string | null;
  aired?: string | null;
  score?: number | null;
  filler?: boolean;
  recap?: boolean;
  forum_url?: string | null;
}

export interface JikanCharacter {
  character: {
    mal_id: number;
    url: string;
    images?: { jpg?: JikanImage; webp?: JikanImage };
    name: string;
  };
  role: string;
}
