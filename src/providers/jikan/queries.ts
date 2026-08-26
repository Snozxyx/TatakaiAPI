/** REST path builders */

export const jikanPaths = {
  animeFull: (id: number) => `/anime/${id}/full`,
  animeSearch: (q: string, page: number, limit: number) =>
    `/anime?q=${encodeURIComponent(q)}&page=${page}&limit=${limit}&order_by=members&sort=desc`,
  topAnime: (page: number, limit: number, filter: string) =>
    `/top/anime?page=${page}&limit=${limit}&filter=${filter}`,
  season: (year: number, season: string, page: number, limit: number) =>
    `/seasons/${year}/${season.toLowerCase()}?page=${page}&limit=${limit}`,
};
