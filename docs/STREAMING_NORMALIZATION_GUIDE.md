# TatakaiAPI - Streaming Sources Normalization Guide

## Overview

TatakaiAPI provides a unified interface to access anime streaming data from multiple sources. This guide explains how to normalize streaming sources and access comprehensive anime information.

## 🎯 Core Architecture

### Primary Data Source: Jikan API (MyAnimeList)
- **Reliable**: Official MyAnimeList data
- **Comprehensive**: Full metadata, ratings, genres, etc.
- **Real-time**: Current season schedules, top rankings
- **Universal**: MAL IDs as primary identifiers

### Streaming Sources Integration
Each anime entry includes normalized streaming URLs for all supported providers:

```json
{
  "streaming": {
    "hianime": "https://tatakaiapi.vercel.app/api/v1/hianime/anime/{mal_id}",
    "animelok": "https://tatakaiapi.vercel.app/api/v1/animelok/anime/{mal_id}",
    "watchanimeworld": "https://tatakaiapi.vercel.app/api/v1/watchanimeworld/anime/{mal_id}",
    "gogoanime": "https://tatakaiapi.vercel.app/api/v1/anime/gogoanime/{title}",
    "allServers": "https://tatakaiapi.vercel.app/api/v1/streaming/{mal_id}"
  }
}
```

## 📺 Working Endpoints

### ✅ Schedule Endpoints

#### Current Season Schedule
```bash
GET /api/v1/hianime/schedule
GET /api/v1/anime/schedules?filter=monday
```
- **Source**: Jikan API only
- **Response**: Real-time anime schedule with streaming URLs
- **Features**: Day filtering, timezone support
- **Includes**: MAL ID, title, time, genres, images, streaming URLs

#### Season Data
```bash
GET /api/v1/anime/seasons/now          # Current season
GET /api/v1/anime/seasons/2024/winter   # Specific season
GET /api/v1/anime/seasons               # All seasons list
GET /api/v1/anime/seasons/upcoming      # Upcoming season
```

### ✅ Top Rankings
```bash
GET /api/v1/anime/top/anime?limit=10
GET /api/v1/anime/top/manga?limit=10
GET /api/v1/anime/top/people?limit=10
GET /api/v1/anime/top/characters?limit=10
GET /api/v1/anime/top/reviews?limit=5
```

## 🔧 Normalization Strategy

### 1. Universal Identifier: MAL ID
- **Primary Key**: `mal_id` from MyAnimeList
- **Consistent**: Same across all streaming sources
- **Searchable**: Use MAL ID for precise lookups

### 2. Streaming Source URLs
Each anime provides direct access to all streaming providers:

#### HiAnime (Primary)
- **URL**: `/api/v1/hianime/anime/{mal_id}`
- **Best for**: Latest episodes, high-quality streams
- **Features**: Episode servers, multiple sources

#### Animelok (Hindi Dubbed)
- **URL**: `/api/v1/animelok/anime/{mal_id}`
- **Best for**: Hindi dubbed content
- **Features**: Regional content, schedule data

#### WatchAnimeWorld
- **URL**: `/api/v1/watchanimeworld/anime/{mal_id}`
- **Best for**: Alternative streams
- **Features**: Multiple server options

#### GogoAnime
- **URL**: `/api/v1/anime/gogoanime/{title}`
- **Best for**: Quick search by title
- **Features**: Fast streaming, broad library

### 3. Unified Streaming Endpoint
```bash
GET /api/v1/streaming/{mal_id}
```
**Proposed endpoint** that aggregates all available sources for a given anime.

## 📊 Response Structure

### Schedule Response
```json
{
  "provider": "Tatakai",
  "status": 200,
  "data": {
    "schedule": [
      {
        "day": "wednesday",
        "anime": [
          {
            "id": "61924",
            "title": "Muzik Tiger In Forest 2nd Season",
            "time": "19:59",
            "url": "https://myanimelist.net/anime/61924/...",
            "episodes": null,
            "rating": "G - All Ages",
            "season": "fall",
            "year": 2025,
            "genres": ["Slice of Life"],
            "image": "https://cdn.myanimelist.net/images/anime/1336/152128.jpg",
            "streaming": {
              "hianime": "https://tatakaiapi.vercel.app/api/v1/hianime/anime/61924",
              "animelok": "https://tatakaiapi.vercel.app/api/v1/animelok/anime/61924",
              "watchanimeworld": "https://tatakaiapi.vercel.app/api/v1/watchanimeworld/anime/61924",
              "gogoanime": "https://tatakaiapi.vercel.app/api/v1/anime/gogoanime/Muzik Tiger In Forest 2nd Season",
              "allServers": "https://tatakaiapi.vercel.app/api/v1/streaming/61924"
            }
          }
        ]
      }
    ]
  }
}
```

## 🚀 Use Cases

### One Piece Example
```bash
# Step 1: Get schedule
curl "http://localhost:4000/api/v1/hianime/schedule"

# Step 2: Find One Piece in response
# Look for anime with "title": "One Piece"
# Note the mal_id and streaming URLs

# Step 3: Access from any source
curl "https://tatakaiapi.vercel.app/api/v1/hianime/anime/52991"
curl "https://tatakaiapi.vercel.app/api/v1/animelok/anime/52991"
curl "https://tatakaiapi.vercel.app/api/v1/watchanimeworld/anime/52991"
curl "https://tatakaiapi.vercel.app/api/v1/anime/gogoanime/One Piece"
```

### Benefits
1. **Unified Access**: Single API for all streaming needs
2. **Source Redundancy**: Multiple providers for reliability
3. **Normalized Data**: Consistent structure across sources
4. **Rich Metadata**: Full anime information from MAL
5. **Direct Streaming**: Immediate access to watch URLs

## 🔍 Search Strategy

### By MAL ID (Recommended)
```bash
GET /api/v1/hianime/anime/52991    # Precise lookup
```

### By Title
```bash
GET /api/v1/anime/gogoanime/One Piece    # Fuzzy search
GET /api/v1/hianime/search?q=One Piece  # Advanced search
```

### By Schedule
```bash
GET /api/v1/hianime/schedule?filter=monday    # Browse by day
GET /api/v1/anime/seasons/now              # Current season
```

## 📝 Implementation Notes

### Current Status
- ✅ **Jikan API**: Fully integrated and working
- ✅ **Schedule Data**: Real-time, reliable
- ✅ **Streaming URLs**: Normalized across providers
- ✅ **Metadata**: Rich anime information
- ✅ **Caching**: Optimized performance

### Next Steps
1. **Unified Streaming Endpoint**: Implement `/api/v1/streaming/{mal_id}`
2. **Source Status**: Add availability status for each provider
3. **Quality Metrics**: Include stream quality information
4. **User Preferences**: Favorite sources, quality settings

## 🎯 Key Advantages

1. **Single Source of Truth**: Jikan API as authoritative data source
2. **Multi-Provider Access**: All streaming options from one response
3. **Consistent IDs**: MAL IDs work across all providers
4. **Rich Context**: Genres, ratings, seasons, images included
5. **Developer Friendly**: Standardized JSON structure

---

**Last Updated**: January 21, 2026  
**Status**: Production Ready  
**API Version**: v1.1.0
