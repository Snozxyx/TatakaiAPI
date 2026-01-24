# Regional Scrapers (Hindi, Tamil, Telugu)

Specialized scrapers for Indian regional languages and dubbed content.

## 1. Animelok

Next-gen scraper for `animelok.to` using HiAnime-style IDs.

### Homepage

- **URL**: `/animelok/home`
- **Method**: `GET`

#### 🧪 Example Request

```bash
curl -X GET "http://localhost:4000/api/v1/animelok/home"
```

### Watch Episode

- **URL**: `/animelok/watch/:id`
- **Method**: `GET`
- **Query Params**: `ep` (episode number)

#### 🧪 Example Request

```bash
# Watch specific episode (ep query param)
curl -X GET "http://localhost:4000/api/v1/animelok/watch/naruto-shippuden-112233?ep=1"
```

---

## 2. WatchAnimeWorld (Supabase Proxy)

Proxy-enabled scraper for `watchanimeworld.in` to bypass geoblocking.

### Get Episode Sources

- **URL**: `/watchaw/episode`
- **Query Params**:
  - `id`: Slug (e.g., `naruto-shippuden-1x1`) OR
  - `episodeUrl`: Full URL

#### 🧪 Test Module

```bash
curl -X GET "<http://localhost:4000/api/v1/watchaw/episode?id=naruto-shippuden-1x1>"
```

#### 📄 Result

```json
{
  "status": 200,
  "data": {
    "sources": [
      {
        "url": "https://...",
        "language": "Hindi",
        "isDub": true
      }
    ]
  }
}
```

#### 📦 Response Schema

```typescript
interface WatchAnimeResponse {
    status: number;
    data: {
        sources: Array<{
            url: string;      // Stream URL
            isM3U8: boolean;  // True if HLS stream
            quality?: string; // e.g. "auto", "1080p"
            language: string; // e.g. "Hindi", "Tamil"
            isDub: boolean;
        }>;
    }
}
```

---

## 3. AnimeHindiDubbed

Classic scraper for `animehindidubbed.in`.

### Homepage

Retrieves latest additions from the homepage.

- **URL**: `/hindidubbed/home`
- **Method**: `GET`

### Category

Browse anime by category (e.g., `hindi-anime-movies`, `cartoon-shows`).

- **URL**: `/hindidubbed/category/:name`
- **Method**: `GET`

#### 🧪 Test Module

```bash
curl -X GET "<http://localhost:4000/api/v1/hindidubbed/category/hindi-anime-movies>"
```

### Search

Search for specific anime titles.

- **URL**: `/hindidubbed/search`
- **Query Params**: `title`

#### 🧪 Test Module

```bash
curl -X GET "<http://localhost:4000/api/v1/hindidubbed/search?title=doraemon>"
```

### Anime Info

Get details and server links for a specific anime.

- **URL**: `/hindidubbed/anime/:slug`
- **Method**: `GET`

#### 🧪 Test Module

```bash
curl -X GET "<http://localhost:4000/api/v1/hindidubbed/anime/doraemon-movie>"
```

---

## 4. Desidubanime

Advanced scraper for `desidubanime.me` with encrypted source handling.

### Home / Spotlight / Trending

- **URL**: `/desidubanime/home`
- **Method**: `GET`
- **Description**: Returns spotlight items, trending anime, and latest updates categorized by section.

#### 🧪 Test Module

```bash
curl -X GET "http://localhost:4000/api/v1/desidubanime/home"
```

### Search

- **URL**: `/desidubanime/search/:query`
- **Method**: `GET`
- **Query Params**: `page` (optional, default: 1)

#### 🧪 Test Module

```bash
curl -X GET "http://localhost:4000/api/v1/desidubanime/search/naruto"
```

### Anime Info

- **URL**: `/desidubanime/anime/:id`
- **Method**: `GET`
- **Description**: Returns detailed anime information and episode list.

#### 🧪 Test Module

```bash
curl -X GET "http://localhost:4000/api/v1/desidubanime/anime/naruto-shippuden-hindi-dubbed"
```

### Watch Episode

- **URL**: `/desidubanime/watch/:id`
- **Method**: `GET`
- **Description**: Returns video sources. Handles upstream 404s gracefully. Note that some sources may be encrypted (`type: "encrypted"`).

#### 🧪 Test Module

```bash
curl -X GET "http://localhost:4000/api/v1/desidubanime/watch/naruto-shippuden-episode-323"
```
