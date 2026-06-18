import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import MonitoringWorkbench from "@/components/workbench/monitoring-workbench";
import ReplicaSettingsPanel from "@/components/workbench/replica-settings-panel";
import { initialReplicaCategories, type ReplicaTrackedPlatformId } from "@/lib/replica-workbench-data";
import type { ContentItem } from "@/lib/types";

function createTwitterContent(keyword: string): ContentItem {
  return {
    id: "twitter-1",
    date: "2026-03-31",
    timeOfDay: "涓婂崍",
    title: `Twitter/X signal for ${keyword}`,
    platformId: "twitter",
    author: "X Author",
    authorName: "X Author",
    authorId: "x-author",
    publishedAt: "2026-03-31 10:20:00",
    publishTime: "2026-03-31 10:20:00",
    publishTimestamp: 1711880400,
    heatScore: 93,
    metrics: { likes: "21", comments: "4", saves: "2" },
    matchedTargets: [keyword],
    aiSummary: "twitter summary",
    summary: "twitter summary",
    linkedTopicIds: [],
    includedInDailyReport: false,
    inTopicPool: false,
    rawOrderIndex: 0,
    articleUrl: "https://x.com/example/status/1"
  };
}

describe("replica workbench fetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("updates the topbar date and content timeline to today after refresh", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T09:30:00+08:00"));

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url === "/api/keyword-targets?categoryId=claude") {
          return {
            ok: true,
            json: async () => ({
              keywordTargets: [
                {
                  id: "claude-keyword-1",
                  keyword: "claude code",
                  platformIds: ["wechat", "xiaohongshu", "twitter"],
                  createdAt: "2026-03-31T08:00:00.000Z",
                  lastRunAt: null,
                  lastRunStatus: "idle",
                  lastResultCount: 0
                }
              ]
            })
          };
        }

        if (url === "/api/content/refresh") {
          const body = JSON.parse(String(init?.body));

          expect(body.platformId).toBe("wechat");

          return {
            ok: true,
            json: async () => ({
              rawItems: [
                {
                  id: "wx-1",
                  date: "2026-04-02",
                  timeOfDay: "涓嬪崍",
                  title: "fresh wechat article",
                  platformId: "wechat",
                  author: "Persisted Author",
                  authorName: "Persisted Author",
                  authorId: "persisted-author",
                  publishedAt: "2026-04-02 13:30:01",
                  publishTime: "2026-04-02 13:30:01",
                  publishTimestamp: 1775107801,
                  heatScore: 91,
                  metrics: { likes: "12", comments: "4", saves: "7" },
                  matchedTargets: ["claude code"],
                  aiSummary: "persisted summary",
                  summary: "persisted summary",
                  linkedTopicIds: [],
                  includedInDailyReport: false,
                  inTopicPool: false,
                  rawOrderIndex: 0
                }
              ],
              items: [
                {
                  id: "wx-1",
                  date: "2026-04-02",
                  timeOfDay: "涓嬪崍",
                  title: "fresh wechat article",
                  platformId: "wechat",
                  author: "Persisted Author",
                  authorName: "Persisted Author",
                  authorId: "persisted-author",
                  publishedAt: "2026-04-02 13:30:01",
                  publishTime: "2026-04-02 13:30:01",
                  publishTimestamp: 1775107801,
                  heatScore: 91,
                  metrics: { likes: "12", comments: "4", saves: "7" },
                  matchedTargets: ["claude code"],
                  aiSummary: "persisted summary",
                  summary: "persisted summary",
                  linkedTopicIds: [],
                  includedInDailyReport: false,
                  inTopicPool: false,
                  rawOrderIndex: 0
                }
              ],
              meta: {
                source: "wechat",
                sortedBy: "publish_time_desc",
                persisted: true,
                fetchedCount: 1,
                cappedCount: 1
              }
            })
          };
        }

        if (url.startsWith("/api/content/list")) {
          return {
            ok: true,
            json: async () => ({
              items: [],
              meta: {
                source: "wechat",
                sortedBy: "publish_time_desc",
                persisted: true,
                fetchedCount: 0,
                cappedCount: 0
              }
            })
          };
        }

        throw new Error(`Unexpected fetch url: ${url}`);
      })
    );

    render(<MonitoringWorkbench />);

    screen.getByTestId("platform-filter-wechat").click();
    screen.getByRole("button", { name: /一键更新/i }).click();
    await vi.advanceTimersByTimeAsync(50);
    await Promise.resolve();

    expect(screen.getByText("fresh wechat article")).toBeInTheDocument();
    expect(screen.getByText(/更新于 2026-04-03 09:30:00/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /最新 3 周五/ })).toBeInTheDocument();

  }, 10000);

  it("loads the latest persisted analysis report when switching to analysis", async () => {
    const user = userEvent.setup();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url === "/api/keyword-targets?categoryId=claude") {
          return {
            ok: true,
            json: async () => ({
              keywordTargets: [
                {
                  id: "claude-keyword-1",
                  keyword: "claude code",
                  platformIds: ["wechat"],
                  createdAt: "2026-03-31T08:00:00.000Z",
                  lastRunAt: "2026-04-03T01:45:48.282Z",
                  lastRunStatus: "success",
                  lastResultCount: 20
                }
              ]
            })
          };
        }

        if (
          url ===
          "/api/content/list?categoryId=claude&keywordTargetId=claude-keyword-1&platformId=wechat"
        ) {
          return {
            ok: true,
            json: async () => ({
              items: [],
              meta: {
                source: "wechat",
                sortedBy: "publish_time_desc",
                persisted: true,
                fetchedCount: 0,
                cappedCount: 0
              }
            })
          };
        }

        if (url === "/api/analysis/reports?categoryId=claude&keyword=claude+code&limit=14") {
          return {
            ok: true,
            json: async () => ({
              reports: [
                {
                  id: "report-2026-04-03",
                  date: "2026-04-03",
                  label: "2026-04-03",
                  hotSummary: "fresh hot summary",
                  focusSummary: "fresh focus summary",
                  patternSummary: "fresh pattern summary",
                  insightSummary: "fresh insight summary",
                  suggestions: []
                }
              ]
            })
          };
        }

        throw new Error(`Unexpected fetch url: ${url}`);
      })
    );

    render(<MonitoringWorkbench />);

    await user.click(screen.getByRole("button", { name: /选题分析/i }));

    expect(await screen.findByRole("button", { name: "2026-04-03" })).toBeInTheDocument();
    expect(screen.getByText("fresh hot summary")).toBeInTheDocument();
  });

  it("uses the unified refresh api for the current platform and shows xiaohongshu results", async () => {
    const user = userEvent.setup();

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "/api/keyword-targets?categoryId=claude") {
        return {
          ok: true,
          json: async () => ({
            keywordTargets: [
              {
                id: "claude-keyword-1",
                keyword: "claude code",
                platformIds: ["wechat", "xiaohongshu", "twitter"],
                createdAt: "2026-03-31T08:00:00.000Z",
                lastRunAt: null,
                lastRunStatus: "idle",
                lastResultCount: 0
              }
            ]
          })
        };
      }

      if (url === "/api/content/refresh") {
        const body = JSON.parse(String(init?.body));

        expect(body.platformId).toBe("xiaohongshu");
        expect(body.keyword).toBe("claude code");

        return {
          ok: true,
          json: async () => ({
            rawItems: [
              {
                id: "xhs-older",
                date: "2026-03-29",
                timeOfDay: "涓婂崍",
                title: "older note",
                platformId: "xiaohongshu",
                author: "Old Author",
                authorName: "Old Author",
                authorId: "old-user",
                publishedAt: "2026-03-29 08:00:00",
                publishTime: "2026-03-29 08:00:00",
                publishTimestamp: 1711670400,
                heatScore: 77,
                metrics: { likes: "9", comments: "1", saves: "10" },
                matchedTargets: ["claude code"],
                aiSummary: "old summary",
                summary: "old summary",
                linkedTopicIds: [],
                includedInDailyReport: false,
                inTopicPool: false,
                rawOrderIndex: 0
              }
            ],
            items: [
              {
                id: "xhs-new",
                date: "2026-03-31",
                timeOfDay: "涓婂崍",
                title: "Claude Code 灏忕孩涔︽柊鏍锋湰",
                platformId: "xiaohongshu",
                author: "XHS Author",
                authorName: "XHS Author",
                authorId: "xhs-user",
                publishedAt: "2026-03-31 09:00:00",
                publishTime: "2026-03-31 09:00:00",
                publishTimestamp: 1711846800,
                heatScore: 88,
                metrics: { likes: "12", comments: "3", saves: "14" },
                matchedTargets: ["claude code"],
                aiSummary: "summary",
                summary: "summary",
                linkedTopicIds: [],
                includedInDailyReport: false,
                inTopicPool: false,
                rawOrderIndex: 1
              }
            ],
            meta: {
              source: "xiaohongshu",
              sortedBy: "publish_time_desc",
              persisted: true
            }
          })
        };
      }

      if (url.startsWith("/api/content/list")) {
        return {
          ok: true,
          json: async () => ({
            items: [],
            meta: {
              source: "xiaohongshu",
              sortedBy: "publish_time_desc",
              persisted: true
            }
          })
        };
      }

      throw new Error(`Unexpected fetch url: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<MonitoringWorkbench />);

    await user.click(screen.getByTestId("platform-filter-xiaohongshu"));
    await user.click(document.querySelector(".replica-shell__update-button") as HTMLButtonElement);

    const articleTitle = await screen.findByText("Claude Code 灏忕孩涔︽柊鏍锋湰");
    const card = articleTitle.closest(".replica-shell__content-card");

    expect(screen.getByText("按点赞数排序 · 真实数据")).toBeInTheDocument();
    expect(screen.getByText(/当前来源：小红书原文/)).toBeInTheDocument();
    expect(within(card as HTMLElement).queryByRole("link", { name: "查看笔记原文" })).toBeNull();
  });

  it("keeps mock content and shows the api error when update fails", async () => {
    const user = userEvent.setup();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url === "/api/keyword-targets?categoryId=claude") {
          return {
            ok: true,
            json: async () => ({
              keywordTargets: [
                {
                  id: "claude-keyword-1",
                  keyword: "claude code",
                  platformIds: ["wechat", "xiaohongshu", "twitter"],
                  createdAt: "2026-03-31T08:00:00.000Z",
                  lastRunAt: null,
                  lastRunStatus: "idle",
                  lastResultCount: 0
                }
              ]
            })
          };
        }

        return {
          ok: false,
          json: async () => ({
            error: "Xiaohongshu monitor request failed with status 403: QUOTA_EXCEEDED"
          })
        };
      })
    );

    render(<MonitoringWorkbench />);

    await user.click(screen.getByTestId("platform-filter-xiaohongshu"));
    await user.click(document.querySelector(".replica-shell__update-button") as HTMLButtonElement);

    await waitFor(() => {
      expect(screen.getAllByText(/QUOTA_EXCEEDED/).length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText(/QUOTA_EXCEEDED/).length).toBeGreaterThan(0);
  });

  it("refreshes twitter when the selected platform is twitter even if the persisted keyword target started with wechat only", async () => {
    const user = userEvent.setup();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url === "/api/keyword-targets?categoryId=claude") {
          return {
            ok: true,
            json: async () => ({
              keywordTargets: [
                {
                  id: "claude-keyword-1",
                  keyword: "claude code",
                  platformIds: ["wechat"],
                  createdAt: "2026-03-31T08:00:00.000Z",
                  lastRunAt: null,
                  lastRunStatus: "idle",
                  lastResultCount: 0
                }
              ]
            })
          };
        }

        if (url === "/api/content/refresh") {
          const body = JSON.parse(String(init?.body)) as { platformId: string };
          const item = createTwitterContent("claude code");

          expect(body.platformId).toBe("twitter");

          return {
            ok: true,
            json: async () => ({
              rawItems: [item],
              items: [item],
              meta: {
                source: "twitter",
                sortedBy: "publish_time_desc",
                persisted: true,
                fetchedCount: 1,
                cappedCount: 1
              }
            })
          };
        }

        if (url.startsWith("/api/content/list")) {
          return {
            ok: true,
            json: async () => ({
              items: [createTwitterContent("claude code")],
              meta: {
                source: "twitter",
                sortedBy: "publish_time_desc",
                persisted: true,
                fetchedCount: 1,
                cappedCount: 1
              }
            })
          };
        }

        throw new Error(`Unexpected fetch url: ${url}`);
      })
    );

    render(<MonitoringWorkbench />);

    await user.click(screen.getByTestId("platform-filter-twitter"));
    await user.click(screen.getByRole("button", { name: /一键更新/i }));

    expect(await screen.findByText("Twitter/X signal for claude code")).toBeInTheDocument();
  });

  it("rehydrates persisted keyword target metadata and loads stored content after a reload", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "/api/keyword-targets?categoryId=claude") {
        return {
          ok: true,
          json: async () => ({
            keywordTargets: [
              {
                id: "claude-keyword-1",
                keyword: "claude code",
                platformIds: ["wechat", "xiaohongshu"],
                createdAt: "2026-03-31T08:00:00.000Z",
                lastRunAt: "2026-03-31T09:05:00.000Z",
                lastRunStatus: "success",
                lastResultCount: 1
              }
            ]
          })
        };
      }

      if (
        url ===
        "/api/content/list?categoryId=claude&keywordTargetId=claude-keyword-1&platformId=wechat"
      ) {
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                id: "wx-persisted",
                date: "2026-03-31",
                timeOfDay: "涓婂崍",
                title: "Persisted wechat article",
                platformId: "wechat",
                author: "Persisted Author",
                authorName: "Persisted Author",
                authorId: "persisted-author",
                publishedAt: "2026-03-31 09:00:00",
                publishTime: "2026-03-31 09:00:00",
                publishTimestamp: 1711846800,
                heatScore: 91,
                metrics: { likes: "12", comments: "4", saves: "7" },
                matchedTargets: ["claude code"],
                aiSummary: "persisted summary",
                summary: "persisted summary",
                linkedTopicIds: [],
                includedInDailyReport: false,
                inTopicPool: false,
                rawOrderIndex: 0
              }
            ],
            meta: {
              source: "wechat",
              sortedBy: "publish_time_desc",
              persisted: true
            }
          })
        };
      }

      throw new Error(`Unexpected fetch url: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<MonitoringWorkbench />);

    expect(await screen.findByText("Persisted wechat article")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/keyword-targets?categoryId=claude", {
      cache: "no-store"
    });
  });

  it("still refreshes the explicitly selected platform even after the category-level switch was disabled", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "/api/keyword-targets?categoryId=claude") {
        return {
          ok: true,
          json: async () => ({ keywordTargets: [] })
        };
      }

      if (url.startsWith("/api/content/list")) {
        return {
          ok: true,
          json: async () => ({
            items: [],
            meta: {
              source: "xiaohongshu",
              sortedBy: "publish_time_desc",
              persisted: true
            }
          })
        };
      }

      if (url === "/api/content/refresh") {
        const body = JSON.parse(String(init?.body));

        expect(body.platformId).toBe("xiaohongshu");

        return {
          ok: true,
          json: async () => ({
            items: [
              {
                id: "xhs-manual-1",
                date: "2026-03-31",
                timeOfDay: "上午",
                title: "manual xiaohongshu refresh",
                platformId: "xiaohongshu",
                author: "manual author",
                authorName: "manual author",
                authorId: "manual-author",
                publishedAt: "2026-03-31 10:00:00",
                publishTime: "2026-03-31 10:00:00",
                publishTimestamp: 1711846800,
                heatScore: 80,
                metrics: { likes: "1", comments: "1", saves: "1" },
                matchedTargets: ["claude code"],
                aiSummary: "manual summary",
                summary: "manual summary",
                linkedTopicIds: [],
                includedInDailyReport: false,
                inTopicPool: false,
                rawOrderIndex: 0
              }
            ],
            rawItems: [],
            meta: {
              source: "xiaohongshu",
              sortedBy: "publish_time_desc",
              persisted: true
            }
          })
        };
      }

      throw new Error(`Unexpected fetch url: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<MonitoringWorkbench />);

    await user.click(screen.getByRole("button", { name: "监控设置" }));
    await user.click(screen.getByTestId("settings-platform-xiaohongshu"));
    await user.click(screen.getByRole("button", { name: "内容" }));
    await user.click(screen.getByTestId("platform-filter-xiaohongshu"));
    await user.click(document.querySelector(".replica-shell__update-button") as HTMLButtonElement);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([url]) => String(url) === "/api/content/refresh")
      ).toHaveLength(1);
    });
    expect(await screen.findByText("manual xiaohongshu refresh")).toBeInTheDocument();
  });

  it("keeps sidebar, top summary, and content counts aligned to the displayed capped results", async () => {
    const user = userEvent.setup();

    const xiaohongshuItems = Array.from({ length: 20 }, (_, index) => ({
      id: `xhs-${index + 1}`,
      date: "2026-03-31",
      timeOfDay: "涓婂崍",
      title: `xiaohongshu item ${index + 1}`,
      platformId: "xiaohongshu",
      author: `author ${index + 1}`,
      authorName: `author ${index + 1}`,
      authorId: `author-${index + 1}`,
      publishedAt: `2026-03-31 ${`${9 + Math.floor(index / 2)}`.padStart(2, "0")}:${`${index % 2}`.padStart(2, "0")}:00`,
      publishTime: `2026-03-31 ${`${9 + Math.floor(index / 2)}`.padStart(2, "0")}:${`${index % 2}`.padStart(2, "0")}:00`,
      publishTimestamp: 1711846800 - index * 60,
      heatScore: 90,
      metrics: { likes: `${index + 1}`, comments: `${index + 1}`, saves: `${index + 1}` },
      matchedTargets: ["claude code"],
      aiSummary: `summary ${index + 1}`,
      summary: `summary ${index + 1}`,
      linkedTopicIds: [],
      includedInDailyReport: false,
      inTopicPool: false,
      rawOrderIndex: index
    }));

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "/api/keyword-targets?categoryId=claude") {
        return {
          ok: true,
          json: async () => ({ keywordTargets: [] })
        };
      }

      if (url === "/api/content/refresh") {
        const body = JSON.parse(String(init?.body));

        expect(body.platformId).toBe("xiaohongshu");

        return {
          ok: true,
          json: async () => ({
            rawItems: xiaohongshuItems,
            items: xiaohongshuItems,
            meta: {
              source: "xiaohongshu",
              sortedBy: "publish_time_desc",
              persisted: true,
              fetchedCount: 25,
              cappedCount: 20
            }
          })
        };
      }

      if (url.startsWith("/api/content/list")) {
        return {
          ok: true,
          json: async () => ({
            items: [],
            meta: {
              source: "weibo",
              sortedBy: "publish_time_desc",
              persisted: true,
              fetchedCount: 0,
              cappedCount: 0
            }
          })
        };
      }

      throw new Error(`Unexpected fetch url: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<MonitoringWorkbench />);

    await user.click(screen.getByTestId("platform-filter-xiaohongshu"));
    await user.click(container.querySelector(".replica-shell__update-button") as HTMLButtonElement);

    await screen.findByText("xiaohongshu item 1");

    expect(
      container.querySelector(".replica-shell__category-card.is-active .replica-shell__category-meta")?.textContent
    ).toContain("20");
    expect(container.querySelector(".replica-shell__summary-row")?.textContent).toContain("20");
    expect(container.querySelector(".replica-shell__content-head h3")?.textContent).toContain("20");

    await user.click(screen.getByTestId("platform-filter-weibo"));

    await waitFor(() => {
      expect(screen.getByText(/当前筛选下暂无内容/)).toBeInTheDocument();
    });
    expect(screen.queryByText("xiaohongshu item 1")).not.toBeInTheDocument();
    expect(
      container.querySelector(".replica-shell__category-card.is-active .replica-shell__category-meta")?.textContent
    ).toContain("0");
    expect(container.querySelector(".replica-shell__summary-row")?.textContent).toContain("0");
    expect(container.querySelector(".replica-shell__content-head h3")?.textContent).toContain("0");
  });

  it("refreshes every collectable platform when the all-platform view is selected", async () => {
    const user = userEvent.setup();

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "/api/keyword-targets?categoryId=claude") {
        return {
          ok: true,
          json: async () => ({
            keywordTargets: [
              {
                id: "claude-keyword-1",
                keyword: "claude code",
                platformIds: ["wechat", "xiaohongshu", "twitter"],
                createdAt: "2026-03-31T08:00:00.000Z",
                lastRunAt: null,
                lastRunStatus: "idle",
                lastResultCount: 0
              }
            ]
          })
        };
      }

      if (url === "/api/content/refresh") {
        const body = JSON.parse(String(init?.body));

        return {
          ok: true,
          json: async () => ({
            rawItems: [],
            items: [
              {
                id: `${body.platformId}-1`,
                date: "2026-03-31",
                timeOfDay: "涓婂崍",
                title: `${body.platformId} item`,
                platformId: body.platformId,
                author: `${body.platformId} author`,
                authorName: `${body.platformId} author`,
                authorId: `${body.platformId}-author`,
                publishedAt: "2026-03-31 10:00:00",
                publishTime: "2026-03-31 10:00:00",
                publishTimestamp: 1711846800,
                heatScore: 80,
                metrics: { likes: "1", comments: "1", saves: "1" },
                matchedTargets: ["claude code"],
                aiSummary: `${body.platformId} summary`,
                summary: `${body.platformId} summary`,
                linkedTopicIds: [],
                includedInDailyReport: false,
                inTopicPool: false,
                rawOrderIndex: 0
              }
            ],
            meta: {
              source: body.platformId,
              sortedBy: "publish_time_desc",
              persisted: true,
              fetchedCount: 1,
              cappedCount: 1
            }
          })
        };
      }

      if (url.startsWith("/api/content/list")) {
        return {
          ok: true,
          json: async () => ({
            items: [],
            meta: {
              source: "all",
              sortedBy: "publish_time_desc",
              persisted: true,
              fetchedCount: 0,
              cappedCount: 0
            }
          })
        };
      }

      throw new Error(`Unexpected fetch url: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<MonitoringWorkbench />);

    await user.click(screen.getByRole("button", { name: "监控设置" }));
    await user.click(screen.getByTestId("settings-platform-twitter"));
    await user.click(screen.getByRole("button", { name: "内容" }));
    await user.click(screen.getByTestId("platform-filter-all"));
    await user.click(screen.getByRole("button", { name: /一键更新/i }));

    const refreshCalls = fetchMock.mock.calls.filter(([url]) => String(url) === "/api/content/refresh");
    expect(refreshCalls).toHaveLength(3);
    expect(refreshCalls.map(([, init]) => JSON.parse(String(init?.body)).platformId)).toEqual(
      expect.arrayContaining(["wechat", "xiaohongshu", "twitter"])
    );
  });

  it("keeps twitter/x keyword selection disabled when the category has not enabled it", () => {
    render(
      <ReplicaSettingsPanel
        category={initialReplicaCategories[0]!}
        onTogglePlatform={vi.fn()}
        onAddKeywordTarget={vi.fn()}
        onRemoveKeywordTarget={vi.fn()}
        onAddCreator={vi.fn()}
        onRemoveCreator={vi.fn()}
        onDeleteCategory={vi.fn()}
      />
    );

    expect(screen.getByTestId("keyword-platform-twitter")).toBeDisabled();
  });

  it("submits twitter/x keywords only after the category enables twitter/x", async () => {
    const user = userEvent.setup();
    const onAddKeywordTarget = vi.fn();
    const enabledCategory = {
      ...initialReplicaCategories[0]!,
      platforms: initialReplicaCategories[0]!.platforms.map((platform) =>
        platform.id === "twitter" ? { ...platform, enabled: true } : platform
      )
    };

    render(
      <ReplicaSettingsPanel
        category={enabledCategory}
        onTogglePlatform={vi.fn()}
        onAddKeywordTarget={onAddKeywordTarget}
        onRemoveKeywordTarget={vi.fn()}
        onAddCreator={vi.fn()}
        onRemoveCreator={vi.fn()}
        onDeleteCategory={vi.fn()}
      />
    );

    await user.click(screen.getByTestId("keyword-platform-wechat"));
    await user.click(screen.getByTestId("keyword-platform-twitter"));
    await user.type(screen.getByPlaceholderText("输入新的监控关键词"), "twitter launch");
    await user.click(screen.getByRole("button", { name: "新增关键词" }));

    expect(onAddKeywordTarget).toHaveBeenCalledWith({
      keyword: "twitter launch",
      platformIds: expect.arrayContaining(["twitter"] as ReplicaTrackedPlatformId[])
    });
  });

  it("shows twitter/x content cards with the correct label and article link", async () => {
    const user = userEvent.setup();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url === "/api/keyword-targets?categoryId=claude") {
          return {
            ok: true,
            json: async () => ({
              keywordTargets: [
                {
                  id: "claude-keyword-1",
                  keyword: "claude code",
                  platformIds: ["wechat", "xiaohongshu", "twitter"],
                  createdAt: "2026-03-31T08:00:00.000Z",
                  lastRunAt: null,
                  lastRunStatus: "idle",
                  lastResultCount: 0
                }
              ]
            })
          };
        }

        if (url === "/api/content/refresh") {
          const body = JSON.parse(String(init?.body)) as { keyword: string; platformId: string };
          const item = createTwitterContent(body.keyword);

          expect(body.platformId).toBe("twitter");

          return {
            ok: true,
            json: async () => ({
              rawItems: [item],
              items: [item],
              meta: {
                source: "twitter",
                sortedBy: "publish_time_desc",
                persisted: true,
                fetchedCount: 1,
                cappedCount: 1
              }
            })
          };
        }

        if (url.startsWith("/api/content/list")) {
          return {
            ok: true,
            json: async () => ({
              items: [],
              meta: {
                source: "twitter",
                sortedBy: "publish_time_desc",
                persisted: true
              }
            })
          };
        }

        throw new Error(`Unexpected fetch url: ${url}`);
      })
    );

    render(<MonitoringWorkbench />);

    await user.click(screen.getByRole("button", { name: "监控设置" }));
    await waitFor(() => {
      const targetCard = screen.getByText("claude code").closest(".replica-shell__keyword-target-item");
      expect(targetCard).not.toBeNull();
      expect(within(targetCard as HTMLElement).getByText(/Twitter\/X/)).toBeInTheDocument();
    });
    await user.click(screen.getByTestId("settings-platform-twitter"));
    await user.click(screen.getByRole("button", { name: "内容" }));
    await user.click(screen.getByTestId("platform-filter-twitter"));
    await user.click(document.querySelector(".replica-shell__update-button") as HTMLButtonElement);

    const articleTitle = await screen.findByText("Twitter/X signal for claude code");
    const card = articleTitle.closest(".replica-shell__content-card") as HTMLElement;

    expect(within(card).getByText("Twitter/X")).toBeInTheDocument();
    expect(within(card).getByRole("link")).toHaveAttribute("href", "https://x.com/example/status/1");
  });

  it("does not refresh twitter/x when the category has not enabled it", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "/api/keyword-targets?categoryId=claude") {
        return {
          ok: true,
          json: async () => ({
            keywordTargets: [
              {
                id: "claude-keyword-1",
                keyword: "claude code",
                platformIds: ["wechat", "xiaohongshu", "twitter"],
                createdAt: "2026-03-31T08:00:00.000Z",
                lastRunAt: null,
                lastRunStatus: "idle",
                lastResultCount: 0
              }
            ]
          })
        };
      }

      if (url.startsWith("/api/content/list")) {
        return {
          ok: true,
          json: async () => ({
            items: [],
            meta: {
              source: "wechat",
              sortedBy: "publish_time_desc",
              persisted: true
            }
          })
        };
      }

      if (url === "/api/content/refresh") {
        const body = JSON.parse(String(init?.body)) as { platformId: string };

        expect(body.platformId).not.toBe("twitter");

        return {
          ok: true,
          json: async () => ({
            rawItems: [],
            items: [],
            meta: {
              source: body.platformId,
              sortedBy: "publish_time_desc",
              persisted: true,
              fetchedCount: 0,
              cappedCount: 0
            }
          })
        };
      }

      throw new Error(`Unexpected fetch url: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<MonitoringWorkbench />);

    await user.click(screen.getByRole("button", { name: "内容" }));
    await user.click(screen.getByTestId("platform-filter-all"));
    await user.click(document.querySelector(".replica-shell__update-button") as HTMLButtonElement);

    const refreshCalls = fetchMock.mock.calls.filter(([url]) => String(url) === "/api/content/refresh");

    expect(refreshCalls).toHaveLength(2);
    expect(refreshCalls.map(([, init]) => JSON.parse(String(init?.body)).platformId)).toEqual(
      expect.arrayContaining(["wechat", "xiaohongshu"])
    );
    expect(
      refreshCalls.map(([, init]) => JSON.parse(String(init?.body)).platformId)
    ).not.toContain("twitter");
  });
});
