/**
 * Merge canonical chapter skeletons with provider sources.
 * Hierarchy:
 *   Chapter
 *    ├── Extension providers (client-supplied)
 *    └── Tatakai Media (placeholder until translator system ships)
 */

export type ChapterSourceInput = {
  provider: string;
  chapterKey: string;
  providerChapterId: string;
  language?: string | null;
  scanlator?: string | null;
  releaseDate?: string | null;
  available?: boolean;
  comingSoon?: boolean;
};

export type ExtensionChapterInput = {
  number: number | null;
  title?: string | null;
  volume?: number | null;
  sources: ChapterSourceInput[];
};

export type BuildChapterHierarchyParams = {
  anilistId: number;
  totalChapters: number;
  extensionChapters?: ExtensionChapterInput[];
};

function tatakaiMediaSource(chapterKey: string): ChapterSourceInput {
  return {
    provider: "tatakai_media",
    chapterKey,
    providerChapterId: `tatakai:${chapterKey}`,
    language: null,
    scanlator: "Tatakai Media",
    releaseDate: null,
    available: false,
    comingSoon: true,
  };
}

export function buildChapterHierarchy(params: BuildChapterHierarchyParams) {
  const total = Math.max(0, Number(params.totalChapters ?? 0));
  const byNumber = new Map<number, ExtensionChapterInput>();

  for (const chapter of params.extensionChapters ?? []) {
    const num = Number(chapter.number);
    if (!Number.isFinite(num) || num <= 0) continue;
    byNumber.set(num, chapter);
  }

  const maxFromExtensions = byNumber.size
    ? Math.max(...Array.from(byNumber.keys()))
    : 0;
  const chapterCount = Math.max(total, maxFromExtensions);

  const chapters = [];
  const mappedChapters = [];
  const providersSeen = new Set<string>(["tatakai_media"]);

  for (let number = 1; number <= chapterCount; number += 1) {
    const key = String(number);
    const ext = byNumber.get(number);
    const extensionSources = (ext?.sources ?? []).map((source) => {
      providersSeen.add(source.provider);
      return {
        provider: source.provider,
        chapterKey: source.chapterKey || key,
        providerChapterId: source.providerChapterId || source.chapterKey || key,
        language: source.language ?? null,
        scanlator: source.scanlator ?? null,
        releaseDate: source.releaseDate ?? null,
        available: source.available !== false,
        comingSoon: Boolean(source.comingSoon),
      };
    });

    const sources = [
      ...extensionSources,
      tatakaiMediaSource(key),
    ];

    const primary = extensionSources[0];
    chapters.push({
      chapterKey: primary?.chapterKey ?? key,
      anilistId: params.anilistId,
      provider: primary?.provider ?? "tatakai_media",
      providerChapterId: primary?.providerChapterId ?? key,
      number,
      volume: ext?.volume ?? null,
      title: ext?.title ?? `Chapter ${number}`,
      language: primary?.language ?? null,
      scanlator: primary?.scanlator ?? null,
      releaseDate: primary?.releaseDate ?? null,
      pageCount: null,
      canonicalOrder: number,
      isOfficial: false,
      isPremium: false,
    });

    mappedChapters.push({
      chapterNumber: number,
      chapterTitle: ext?.title ?? `Chapter ${number}`,
      volume: ext?.volume ?? null,
      canonicalOrder: number,
      sources,
    });
  }

  return {
    anilistId: params.anilistId,
    partial: false,
    failedProviders: [] as string[],
    chapters,
    mappedChapters,
    providerStatus: [
      {
        provider: "tatakai_media",
        success: false,
        chapterCount: 0,
        latencyMs: 0,
        error: "coming_soon",
      },
      ...Array.from(providersSeen)
        .filter((p) => p !== "tatakai_media")
        .map((provider) => ({
          provider,
          success: true,
          chapterCount: chapters.filter((c) => c.provider === provider).length,
          latencyMs: 0,
        })),
    ],
    providersAvailable: Array.from(providersSeen),
  };
}
