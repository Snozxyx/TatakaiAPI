import { env } from "../../config/env.js";
import { log } from "../../config/logger.js";
import { anilistLimiter } from "../../lib/rateLimiter.js";
import type { AniListMedia, AniListPage } from "./types.js";

const ENDPOINT = "https://graphql.anilist.co";

export class AniListClient {
  async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    await anilistLimiter.acquire(1);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    const token = env.ANILIST_TOKEN?.trim();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
    });

    const json = (await res.json()) as {
      data?: T;
      errors?: { message: string }[];
    };

    if (!res.ok || json.errors?.length) {
      const msg = json.errors?.map((e) => e.message).join("; ") || res.statusText;
      log.warn({ msg, status: res.status }, "AniList GraphQL error");
      throw new Error(msg || "AniList request failed");
    }
    if (!json.data) throw new Error("AniList empty response");
    return json.data;
  }

  async pageMedia(
    variables: Record<string, unknown>,
    document: string,
  ): Promise<AniListPage<AniListMedia>> {
    const data = await this.query<{ Page: AniListPage<AniListMedia> }>(document, variables);
    return data.Page;
  }
}

export const anilistClient = new AniListClient();
