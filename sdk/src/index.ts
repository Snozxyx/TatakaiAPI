export interface TatakaiConfig {
    baseUrl?: string;
    apiKey?: string;
}

export class TatakaiClient {
    private baseUrl: string;
    private apiKey?: string;

    constructor(config?: TatakaiConfig) {
        this.baseUrl = config?.baseUrl || process.env.BASE_URL || "http://localhost:4000/api/v1";
        this.apiKey = config?.apiKey;
    }

    public async request<T>(path: string, options?: RequestInit): Promise<T> {
        const url = `${this.baseUrl}${path}`;
        const headers = {
            "Content-Type": "application/json",
            ...(this.apiKey ? { "Authorization": `Bearer ${this.apiKey}` } : {}),
            ...(options?.headers || {}),
        };

        const response = await fetch(url, { ...options, headers });

        if (!response.ok) {
            throw new Error(`Tatakai API Error: ${response.status} ${response.statusText}`);
        }

        return response.json() as Promise<T>;
    }

    // --- HiAnime ---
    readonly hianime = {
        getHome: () => this.request("/hianime/home"),
        getInfo: (id: string) => this.request(`/hianime/info/${id}`),
        getEpisodes: (id: string) => this.request(`/hianime/episode/sources?animeEpisodeId=${id}`),
        search: (query: string, page: number = 1) => this.request(`/hianime/search?q=${query}&page=${page}`),
    };

    // --- Consumet ---
    readonly consumet = {
        anime: {
            search: (provider: string, query: string) => this.request(`/consumet/anime/${provider}/${query}`),
            watch: (provider: string, episodeId: string) => this.request(`/consumet/anime/${provider}/watch/${episodeId}`),
        },
        manga: {
            search: (provider: string, query: string) => this.request(`/consumet/manga/${provider}/${query}`),
            read: (provider: string, chapterId: string) => this.request(`/consumet/manga/${provider}/read/${chapterId}`),
        }
    };

    // --- Regional ---
    readonly regional = {
        animelok: {
            getHome: () => this.request("/animelok/home"),
            watch: (id: string, ep: number = 1) => this.request(`/animelok/watch/${id}?ep=${ep}`),
        },
        watchaw: {
            getEpisode: (id: string) => this.request(`/watchaw/episode?id=${id}`),
        },
        hindiDubbed: {
            search: (title: string) => this.request(`/hindidubbed/search?title=${title}`),
        }
    };

    // --- Utility ---
    readonly utility = {
        trace: (imageUrl: string) => this.request("/anime-api/trace", { method: "POST", body: JSON.stringify({ imageUrl }) }),
        getRandomQuote: (anime?: string) => this.request(`/anime-api/quotes/random${anime ? `?anime=${anime}` : ""}`),
        getImages: (type: string) => this.request(`/anime-api/images/${type}`),
        getFacts: (anime: string) => this.request(`/anime-api/facts/${anime}`),
    };
}
