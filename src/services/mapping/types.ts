export type AnimeMapping = {
  type?: string | null;
  anidb_id?: number | null;
  anilist_id?: number | null;
  "anime-planet_id"?: string | null;
  animecountdown_id?: number | null;
  animenewsnetwork_id?: number | null;
  anisearch_id?: number | null;
  imdb_id?: string | null;
  kitsu_id?: number | null;
  livechart_id?: number | null;
  mal_id?: number | null;
  simkl_id?: number | null;
  themoviedb_id?: number | null;
  tvdb_id?: number | null;
  season?: { tmdb?: number | null; tvdb?: number | null };
};

export type MangaMapping = {
  anilist_id?: number | null;
  mal_id?: number | null;
  kitsu_id?: number | null;
  "anime-planet_id"?: string | null;
  mangaupdates_id?: number | null;
  mangadex_slug?: string | null;
};

export type MappingEnvelope = {
  id: string;
  mapping: AnimeMapping | MangaMapping | null;
};