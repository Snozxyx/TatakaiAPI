/** GraphQL document strings for AniList */

export const MEDIA_FIELDS = `
fragment MediaFields on Media {
  id
  idMal
  title { romaji english native userPreferred }
  coverImage { extraLarge large medium }
  bannerImage
  description(asHtml: false)
  episodes
  chapters
  volumes
  duration
  format
  status
  season
  seasonYear
  averageScore
  meanScore
  popularity
  favourites
  genres
  synonyms
  isAdult
  countryOfOrigin
  source
  startDate { year month day }
  endDate { year month day }
  nextAiringEpisode { episode airingAt timeUntilAiring }
  trailer { id site thumbnail }
  externalLinks { url site }
  rankings { id rank type format year season allTime context }
  tags { id name rank isGeneralSpoiler isMediaSpoiler isAdult }
  studios { edges { isMain node { id name siteUrl } } }
  characters(sort: [ROLE, FAVOURITES_DESC], perPage: 8) {
    edges { role node { id name { full } image { large } } }
  }
  staff(perPage: 10) {
    edges { role node { id name { full } image { large } } }
  }
  relations {
    edges {
      relationType
      node {
        ... on Media {
          id
          title { romaji english }
          coverImage { large }
          format
          status
        }
      }
    }
  }
  streamingEpisodes { title thumbnail url site }
}
`;

export const QUERY_PAGE = `
${MEDIA_FIELDS}
query Page($page: Int, $perPage: Int, $sort: [MediaSort], $season: MediaSeason, $seasonYear: Int, $status: MediaStatus, $format: MediaFormat) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total perPage currentPage lastPage hasNextPage }
    media(sort: $sort, season: $season, seasonYear: $seasonYear, status: $status, format: $format, type: ANIME) {
      ...MediaFields
    }
  }
}
`;

export const QUERY_TRENDING = `
${MEDIA_FIELDS}
query Trending($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total perPage currentPage lastPage hasNextPage }
    media(sort: TRENDING_DESC, type: ANIME) { ...MediaFields }
  }
}
`;

export const QUERY_SEARCH = `
${MEDIA_FIELDS}
query Search($page: Int, $perPage: Int, $search: String, $genres: [String], $season: MediaSeason, $seasonYear: Int, $format: [MediaFormat], $status: [MediaStatus], $isAdult: Boolean, $sort: [MediaSort], $averageScoreGreater: Int, $averageScoreLesser: Int, $episodesGreater: Int, $episodesLesser: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total perPage currentPage lastPage hasNextPage }
    media(
      search: $search
      genre_in: $genres
      season: $season
      seasonYear: $seasonYear
      format_in: $format
      status_in: $status
      isAdult: $isAdult
      sort: $sort
      averageScore_greater: $averageScoreGreater
      averageScore_lesser: $averageScoreLesser
      episodes_greater: $episodesGreater
      episodes_lesser: $episodesLesser
      type: ANIME
    ) { ...MediaFields }
  }
}
`;

export const QUERY_MANGA_BY_ID = `
${MEDIA_FIELDS}
query MangaById($id: Int!) {
  Media(id: $id, type: MANGA) { ...MediaFields }
}
`;

export const QUERY_MANGA_BY_MAL = `
${MEDIA_FIELDS}
query MangaByMal($idMal: Int!) {
  Media(idMal: $idMal, type: MANGA) { ...MediaFields }
}
`;

export const QUERY_MANGA_SEARCH = `
${MEDIA_FIELDS}
query MangaSearch(
  $page: Int
  $perPage: Int
  $search: String
  $isAdult: Boolean
  $sort: [MediaSort]
  $genres: [String]
  $countryOfOrigin: CountryCode
  $format: MediaFormat
  $status: MediaStatus
) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total perPage currentPage lastPage hasNextPage }
    media(
      type: MANGA
      search: $search
      sort: $sort
      isAdult: $isAdult
      genre_in: $genres
      countryOfOrigin: $countryOfOrigin
      format: $format
      status: $status
    ) {
      ...MediaFields
    }
  }
}
`;

export const QUERY_MANGA_PAGE = `
${MEDIA_FIELDS}
query MangaPage($page: Int, $perPage: Int, $sort: [MediaSort], $countryOfOrigin: CountryCode, $isAdult: Boolean) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total perPage currentPage lastPage hasNextPage }
    media(type: MANGA, sort: $sort, countryOfOrigin: $countryOfOrigin, isAdult: $isAdult) {
      ...MediaFields
    }
  }
}
`;

export const QUERY_MEDIA = `
${MEDIA_FIELDS}
query MediaById($id: Int) {
  Media(id: $id, type: ANIME) { ...MediaFields }
}
`;

export const QUERY_MEDIA_BY_MAL = `
${MEDIA_FIELDS}
query MediaByMal($idMal: Int) {
  Media(idMal: $idMal, type: ANIME) { ...MediaFields }
}
`;

export const QUERY_GENRE_COLLECTION = `
query GenreCollection {
  GenreCollection { genre }
}
`;
