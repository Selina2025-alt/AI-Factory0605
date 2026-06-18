// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  createMonitoringRepository,
  initializeMonitoringDatabase,
  listCollectedContents,
  listCollectedContentsBySearchQuery,
  listKeywordTargets,
  listSearchQueries,
  upsertKeywordTarget
} from "@/lib/db/monitoring-repository";
import {
  listStoredContentForKeywordTarget,
  refreshKeywordTargetPlatform
} from "@/lib/monitoring-sync-service";
import type { ContentItem } from "@/lib/types";

describe("monitoring sync service", () => {
  it("refreshes xiaohongshu content and persists results", async () => {
    const repository = createMonitoringRepository(initializeMonitoringDatabase(":memory:"));

    upsertKeywordTarget(repository, {
      id: "target-1",
      categoryId: "claude",
      keyword: "openclaw",
      platformIds: ["xiaohongshu"],
      createdAt: "2026-03-31T09:00:00.000Z",
      lastRunAt: null,
      lastRunStatus: "idle",
      lastResultCount: 0
    });

    const searchXiaohongshu = vi.fn().mockResolvedValue({
      rawItems: [buildContentItem("note-older", "older", 1711700000, "xiaohongshu", 0)],
      items: [
        buildContentItem("note-newer", "newer", 1711900000, "xiaohongshu", 1),
        buildContentItem("note-older", "older", 1711700000, "xiaohongshu", 0)
      ]
    });

    const result = await refreshKeywordTargetPlatform({
      repository,
      categoryId: "claude",
      keywordTarget: {
        id: "target-1",
        categoryId: "claude",
        keyword: "openclaw",
        platformIds: ["xiaohongshu"],
        createdAt: "2026-03-31T09:00:00.000Z",
        lastRunAt: null,
        lastRunStatus: "idle",
        lastResultCount: 0
      },
      platformId: "xiaohongshu",
      xiaohongshuSearch: searchXiaohongshu,
      now: () => "2026-03-31T09:10:00.000Z",
      randomId: () => "run-1"
    });

    expect(searchXiaohongshu).toHaveBeenCalledWith("openclaw", 1, "week");
    expect(result.items.map((item) => item.title)).toEqual(["newer", "older"]);

    const stored = await listStoredContentForKeywordTarget({
      repository,
      categoryId: "claude",
      keywordTargetId: "target-1",
      platformId: "xiaohongshu"
    });
    expect(stored.map((item) => item.title)).toEqual(["newer", "older"]);

    const keywordTargets = listKeywordTargets(repository, "claude");
    expect(keywordTargets[0]).toMatchObject({
      lastRunStatus: "success",
      lastResultCount: 2,
      lastRunAt: "2026-03-31T09:10:00.000Z"
    });

    const searchQueries = listSearchQueries(repository, "claude");
    expect(searchQueries).toHaveLength(1);
    expect(searchQueries[0]).toMatchObject({
      id: "query-run-1",
      keywordTargetId: "target-1",
      keyword: "openclaw",
      platformScope: "xiaohongshu",
      triggerType: "manual_refresh",
      status: "success",
      fetchedCount: 2,
      cappedCount: 2,
      startedAt: "2026-03-31T09:10:00.000Z",
      finishedAt: "2026-03-31T09:10:00.000Z"
    });

    repository.database.close();
  });

  it("returns persisted content through the read helper", async () => {
    const repository = createMonitoringRepository(initializeMonitoringDatabase(":memory:"));

    upsertKeywordTarget(repository, {
      id: "target-1",
      categoryId: "claude",
      keyword: "openclaw",
      platformIds: ["wechat"],
      createdAt: "2026-03-31T09:00:00.000Z",
      lastRunAt: null,
      lastRunStatus: "idle",
      lastResultCount: 0
    });

    await refreshKeywordTargetPlatform({
      repository,
      categoryId: "claude",
      keywordTarget: {
        id: "target-1",
        categoryId: "claude",
        keyword: "openclaw",
        platformIds: ["wechat"],
        createdAt: "2026-03-31T09:00:00.000Z",
        lastRunAt: null,
        lastRunStatus: "idle",
        lastResultCount: 0
      },
      platformId: "wechat",
      wechatSearch: vi.fn().mockResolvedValue({
        rawItems: [],
        items: [buildContentItem("wx-1", "wechat newer", 1711900000, "wechat", 0)]
      }),
      now: () => "2026-03-31T09:20:00.000Z",
      randomId: () => "run-2"
    });

    const stored = listCollectedContents(repository, {
      categoryId: "claude",
      keywordTargetId: "target-1",
      platformId: "wechat"
    });

    expect(stored).toHaveLength(1);
    expect(stored[0]?.title).toBe("wechat newer");

    repository.database.close();
  });

  it("refreshes twitter content and writes the search query snapshot", async () => {
    const repository = createMonitoringRepository(initializeMonitoringDatabase(":memory:"));

    upsertKeywordTarget(repository, {
      id: "target-twitter",
      categoryId: "claude",
      keyword: "claude code",
      platformIds: ["twitter"],
      createdAt: "2026-03-31T09:00:00.000Z",
      lastRunAt: null,
      lastRunStatus: "idle",
      lastResultCount: 0
    });

    const searchTwitter = vi.fn().mockResolvedValue({
      rawItems: [
        buildContentItem("tweet-old", "tweet old", 1711872000, "twitter", 0),
        buildContentItem("tweet-new", "tweet new", 1711958400, "twitter", 1)
      ],
      items: [
        buildContentItem("tweet-new", "tweet new", 1711958400, "twitter", 1),
        buildContentItem("tweet-old", "tweet old", 1711872000, "twitter", 0)
      ]
    });

    const result = await refreshKeywordTargetPlatform({
      repository,
      categoryId: "claude",
      keywordTarget: {
        id: "target-twitter",
        categoryId: "claude",
        keyword: "claude code",
        platformIds: ["twitter"],
        createdAt: "2026-03-31T09:00:00.000Z",
        lastRunAt: null,
        lastRunStatus: "idle",
        lastResultCount: 0
      },
      platformId: "twitter",
      twitterSearch: searchTwitter,
      now: () => "2026-03-31T09:15:00.000Z",
      randomId: () => "run-twitter"
    });

    expect(searchTwitter).toHaveBeenCalledWith("claude code");
    expect(result.items.map((item) => item.title)).toEqual(["tweet new", "tweet old"]);

    const stored = listCollectedContents(repository, {
      categoryId: "claude",
      keywordTargetId: "target-twitter",
      platformId: "twitter"
    });
    expect(stored.map((item) => item.title)).toEqual(["tweet new", "tweet old"]);

    const snapshotItems = listCollectedContentsBySearchQuery(repository, {
      searchQueryId: result.searchQueryId,
      platformId: "twitter"
    });
    expect(snapshotItems.map((item) => item.title)).toEqual(["tweet old", "tweet new"]);

    const searchQueries = listSearchQueries(repository, "claude");
    expect(searchQueries[0]).toMatchObject({
      platformScope: "twitter",
      status: "success",
      fetchedCount: 2,
      cappedCount: 2
    });

    repository.database.close();
  });

  it("marks twitter sync runs as failed when the search throws", async () => {
    const repository = createMonitoringRepository(initializeMonitoringDatabase(":memory:"));

    upsertKeywordTarget(repository, {
      id: "target-twitter",
      categoryId: "claude",
      keyword: "claude code",
      platformIds: ["twitter"],
      createdAt: "2026-03-31T09:00:00.000Z",
      lastRunAt: null,
      lastRunStatus: "idle",
      lastResultCount: 0
    });

    const error = new Error("twitter search failed");

    await expect(
      refreshKeywordTargetPlatform({
      repository,
      categoryId: "claude",
      keywordTarget: {
        id: "target-twitter",
        categoryId: "claude",
        keyword: "claude code",
        platformIds: ["twitter"],
        createdAt: "2026-03-31T09:00:00.000Z",
          lastRunAt: null,
          lastRunStatus: "idle",
          lastResultCount: 0
        },
        platformId: "twitter",
        twitterSearch: vi.fn().mockRejectedValue(error),
        now: () => "2026-03-31T09:15:00.000Z",
        randomId: () => "run-twitter-failed"
      })
    ).rejects.toThrow("twitter search failed");

    const syncRun = repository.database
      .prepare(
        `SELECT status, result_count, error_message, finished_at
         FROM sync_runs
         WHERE id = ?`
      )
      .get("run-twitter-failed") as
      | {
          status: string;
          result_count: number;
          error_message: string | null;
          finished_at: string | null;
        }
      | undefined;

    const searchQuery = repository.database
      .prepare(
        `SELECT status, fetched_count, capped_count, error_message, finished_at
         FROM search_queries
         WHERE id = ?`
      )
      .get("query-run-twitter-failed") as
      | {
          status: string;
          fetched_count: number;
          capped_count: number;
          error_message: string | null;
          finished_at: string | null;
        }
      | undefined;

    const keywordTarget = listKeywordTargets(repository, "claude")[0];

    expect(syncRun).toMatchObject({
      status: "failed",
      result_count: 0,
      error_message: "twitter search failed",
      finished_at: "2026-03-31T09:15:00.000Z"
    });
    expect(searchQuery).toMatchObject({
      status: "failed",
      fetched_count: 0,
      capped_count: 0,
      error_message: "twitter search failed",
      finished_at: "2026-03-31T09:15:00.000Z"
    });
    expect(keywordTarget).toMatchObject({
      lastRunStatus: "failed",
      lastResultCount: 0,
      lastRunAt: "2026-03-31T09:15:00.000Z"
    });

    repository.database.close();
  });

  it("caps every keyword-platform snapshot at 20 items before persisting and reporting counts", async () => {
    const repository = createMonitoringRepository(initializeMonitoringDatabase(":memory:"));

    upsertKeywordTarget(repository, {
      id: "target-1",
      categoryId: "claude",
      keyword: "claude code",
      platformIds: ["xiaohongshu"],
      createdAt: "2026-03-31T09:00:00.000Z",
      lastRunAt: null,
      lastRunStatus: "idle",
      lastResultCount: 0
    });

    const items = Array.from({ length: 25 }, (_, index) =>
      buildContentItem(
        `note-${index + 1}`,
        `note-${index + 1}`,
        1711900000 - index * 60,
        "xiaohongshu",
        index
      )
    );

    const result = await refreshKeywordTargetPlatform({
      repository,
      categoryId: "claude",
      keywordTarget: {
        id: "target-1",
        categoryId: "claude",
        keyword: "claude code",
        platformIds: ["xiaohongshu"],
        createdAt: "2026-03-31T09:00:00.000Z",
        lastRunAt: null,
        lastRunStatus: "idle",
        lastResultCount: 0
      },
      platformId: "xiaohongshu",
      xiaohongshuSearch: vi.fn().mockResolvedValue({
        rawItems: items,
        items
      }),
      now: () => "2026-03-31T09:10:00.000Z",
      randomId: () => "run-capped"
    });

    expect(result.fetchedCount).toBe(25);
    expect(result.cappedCount).toBe(20);
    expect(result.items).toHaveLength(20);

    const stored = await listStoredContentForKeywordTarget({
      repository,
      categoryId: "claude",
      keywordTargetId: "target-1",
      platformId: "xiaohongshu"
    });
    expect(stored).toHaveLength(20);

    const keywordTargets = listKeywordTargets(repository, "claude");
    expect(keywordTargets[0]?.lastResultCount).toBe(20);

    repository.database.close();
  });
});

function buildContentItem(
  id: string,
  title: string,
  publishTimestamp: number,
  platformId: ContentItem["platformId"],
  rawOrderIndex: number
): ContentItem {
  const publishedAt =
    publishTimestamp === 1711900000 ? "2026-03-31 16:00:00" : "2026-03-29 10:00:00";

  return {
    id,
    date: publishedAt.slice(0, 10),
    timeOfDay: "涓婂崍",
    title,
    platformId,
    author: "Tester",
    publishedAt,
    publishTime: publishedAt,
    publishTimestamp,
    heatScore: 80,
    metrics: {
      likes: "10",
      comments: "5",
      saves: "3"
    },
    matchedTargets: ["openclaw"],
    aiSummary: `${title} summary`,
    linkedTopicIds: [],
    includedInDailyReport: false,
    inTopicPool: false,
    keyword: "openclaw",
    articleUrl: "",
    sourceUrl: "",
    rawOrderIndex
  };
}
