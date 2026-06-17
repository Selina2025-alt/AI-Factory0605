import {
  createSearchQuery,
  createSyncRun,
  finishSearchQuery,
  finishSyncRun,
  listCollectedContents,
  type MonitoringRepository,
  replaceSearchQueryContents,
  upsertCollectedContents,
  upsertKeywordTarget,
  type PersistedKeywordTarget
} from "@/lib/db/monitoring-repository";
import type { ReplicaTrackedPlatformId } from "@/lib/replica-workbench-data";
import {
  searchWechatArticlesSnapshotByKeyword,
  type WechatArticlesSnapshot
} from "@/lib/wechat-monitor";
import {
  searchXiaohongshuNotesSnapshotByKeyword,
  type XiaohongshuNotesSnapshot
} from "@/lib/xiaohongshu-monitor";
import {
  searchTwitterPostsSnapshotByKeyword,
  type TwitterPostsSnapshot
} from "@/lib/twitter-monitor";
import type { ContentItem } from "@/lib/types";

export type SyncablePlatformId = "wechat" | "xiaohongshu" | "twitter";

interface RefreshKeywordTargetPlatformInput {
  repository: MonitoringRepository;
  categoryId: string;
  keywordTarget: PersistedKeywordTarget;
  platformId: SyncablePlatformId;
  triggerType?: "manual_refresh" | "keyword_created";
  wechatSearch?: typeof searchWechatArticlesSnapshotByKeyword;
  xiaohongshuSearch?: typeof searchXiaohongshuNotesSnapshotByKeyword;
  twitterSearch?: typeof searchTwitterPostsSnapshotByKeyword;
  now?: () => string;
  randomId?: () => string;
}

interface StoredContentQuery {
  repository: MonitoringRepository;
  categoryId: string;
  keywordTargetId: string;
  platformId?: ContentItem["platformId"];
  limit?: number;
}

type PlatformSearchSnapshot = WechatArticlesSnapshot | XiaohongshuNotesSnapshot;
type PlatformSearchSnapshotWithTwitter = PlatformSearchSnapshot | TwitterPostsSnapshot;

interface PlatformContentSnapshotBase {
  fetchedCount: number;
  cappedCount: number;
  rawItems: ContentItem[];
  items: ContentItem[];
}

export interface WechatContentSnapshot extends PlatformContentSnapshotBase {
  platformId: "wechat";
}

export interface XiaohongshuContentSnapshot extends PlatformContentSnapshotBase {
  platformId: "xiaohongshu";
}

export interface TwitterContentSnapshot extends PlatformContentSnapshotBase {
  searchQueryId: string;
  platformId: "twitter";
}

export type PlatformContentSnapshot = PlatformContentSnapshotBase & {
  searchQueryId: string;
  platformId: SyncablePlatformId;
};
export const MAX_CONTENT_ITEMS_PER_KEYWORD_PLATFORM = 20;

function createRunId() {
  return `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function runPlatformSearch(
  platformId: SyncablePlatformId,
  keyword: string,
  services: {
    wechatSearch: typeof searchWechatArticlesSnapshotByKeyword;
    xiaohongshuSearch: typeof searchXiaohongshuNotesSnapshotByKeyword;
    twitterSearch: typeof searchTwitterPostsSnapshotByKeyword;
  }
): Promise<PlatformSearchSnapshotWithTwitter> {
  if (platformId === "wechat") {
    return services.wechatSearch(keyword, 1, 7);
  }

  if (platformId === "xiaohongshu") {
    return services.xiaohongshuSearch(keyword, 1, "week");
  }

  if (platformId === "twitter") {
    return services.twitterSearch(keyword);
  }

  throw new Error(`Unsupported platform sync: ${platformId}`);
}

function capSnapshot(snapshot: PlatformSearchSnapshot): PlatformContentSnapshotBase {
  const fetchedCount = snapshot.items.length;
  const items = snapshot.items.slice(0, MAX_CONTENT_ITEMS_PER_KEYWORD_PLATFORM);
  const keptIds = new Set(items.map((item) => item.id));
  const rawItems = snapshot.rawItems
    .filter((item) => keptIds.has(item.id))
    .sort((left, right) => (left.rawOrderIndex ?? 0) - (right.rawOrderIndex ?? 0));

  return {
    rawItems,
    items,
    fetchedCount,
    cappedCount: items.length
  };
}

export async function refreshKeywordTargetPlatform(
  input: RefreshKeywordTargetPlatformInput
) {
  const now = input.now ?? (() => new Date().toISOString());
  const randomId = input.randomId ?? createRunId;
  const runId = randomId();
  const searchQueryId = `query-${runId}`;
  const startedAt = now();
  const triggerType = input.triggerType ?? "manual_refresh";

  await upsertKeywordTarget(input.repository, {
    ...input.keywordTarget,
    categoryId: input.categoryId,
    lastRunAt: input.keywordTarget.lastRunAt,
    lastRunStatus: "running",
      lastResultCount: input.keywordTarget.lastResultCount
  });

  await createSearchQuery(input.repository, {
    id: searchQueryId,
    categoryId: input.categoryId,
    keywordTargetId: input.keywordTarget.id,
    keyword: input.keywordTarget.keyword,
    platformScope: input.platformId,
    triggerType,
    status: "running",
    fetchedCount: 0,
    cappedCount: 0,
    startedAt,
    finishedAt: null,
    errorMessage: null
  });

  await createSyncRun(input.repository, {
    id: runId,
    categoryId: input.categoryId,
    keywordTargetId: input.keywordTarget.id,
    platformId: input.platformId,
    status: "running",
    resultCount: 0,
    errorMessage: null,
    startedAt,
    finishedAt: null
  });

  try {
    const rawSnapshot = await runPlatformSearch(input.platformId, input.keywordTarget.keyword, {
      wechatSearch: input.wechatSearch ?? searchWechatArticlesSnapshotByKeyword,
      xiaohongshuSearch: input.xiaohongshuSearch ?? searchXiaohongshuNotesSnapshotByKeyword,
      twitterSearch: input.twitterSearch ?? searchTwitterPostsSnapshotByKeyword
    });
    const snapshot = {
      ...capSnapshot(rawSnapshot),
      searchQueryId,
      platformId: input.platformId
    } satisfies PlatformContentSnapshot;
    const finishedAt = now();

    await upsertCollectedContents(input.repository, {
      categoryId: input.categoryId,
      keywordTargetId: input.keywordTarget.id,
      platformId: input.platformId,
      syncRunId: runId,
      items: snapshot.items,
      collectedAt: finishedAt
    });

    await replaceSearchQueryContents(input.repository, {
      searchQueryId,
      categoryId: input.categoryId,
      keywordTargetId: input.keywordTarget.id,
      platformId: input.platformId,
      items: snapshot.items,
      collectedAt: finishedAt
    });

    await finishSyncRun(input.repository, {
      id: runId,
      status: "success",
      resultCount: snapshot.cappedCount,
      errorMessage: null,
      finishedAt
    });

    await finishSearchQuery(input.repository, {
      id: searchQueryId,
      status: "success",
      fetchedCount: snapshot.fetchedCount,
      cappedCount: snapshot.cappedCount,
      finishedAt,
      errorMessage: null
    });

    return snapshot;
  } catch (error) {
    const finishedAt = now();
    const message = error instanceof Error ? error.message : "Unknown sync error";

    await finishSyncRun(input.repository, {
      id: runId,
      status: "failed",
      resultCount: 0,
      errorMessage: message,
      finishedAt
    });

    await finishSearchQuery(input.repository, {
      id: searchQueryId,
      status: "failed",
      fetchedCount: 0,
      cappedCount: 0,
      finishedAt,
      errorMessage: message
    });

    throw error;
  }
}

export async function listStoredContentForKeywordTarget(input: StoredContentQuery) {
  return await listCollectedContents(input.repository, {
    categoryId: input.categoryId,
    keywordTargetId: input.keywordTargetId,
    platformId: input.platformId,
    limit: input.limit
  });
}
