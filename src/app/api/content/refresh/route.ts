import { NextRequest, NextResponse } from "next/server";

import {
  createMonitoringRepository,
  getKeywordTargetById,
  type PersistedKeywordTarget,
  upsertAnalysisSnapshot
} from "@/lib/db/monitoring-repository";
import { buildFreshAnalysisReport } from "@/lib/analysis-report";
import { buildAnalysisArchiveSnapshot } from "@/lib/history-archive";
import { refreshKeywordTargetPlatform, type SyncablePlatformId } from "@/lib/monitoring-sync-service";
import type { ReplicaDailyReport, ReplicaTrackedPlatformId } from "@/lib/replica-workbench-data";

interface RefreshRequestBody {
  categoryId?: string;
  keywordTargetId?: string;
  keyword?: string;
  platformId?: ReplicaTrackedPlatformId;
  platformIds?: ReplicaTrackedPlatformId[];
  createdAt?: string;
  lastRunAt?: string | null;
  lastRunStatus?: "idle" | "running" | "success" | "failed";
  lastResultCount?: number;
  reports?: ReplicaDailyReport[];
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as RefreshRequestBody;
  const categoryId = body.categoryId?.trim() ?? "";
  const keywordTargetId = body.keywordTargetId?.trim() ?? "";
  const keyword = body.keyword?.trim().toLowerCase() ?? "";
  const platformId = body.platformId;
  const platformIds = Array.isArray(body.platformIds) ? body.platformIds : platformId ? [platformId] : [];

  if (!categoryId || !keywordTargetId || !keyword || !platformId) {
    return NextResponse.json(
      {
        error: "categoryId, keywordTargetId, keyword, and platformId are required",
        items: []
      },
      { status: 400 }
    );
  }

  if (platformId !== "wechat" && platformId !== "xiaohongshu" && platformId !== "twitter") {
    return NextResponse.json(
      {
        error: "Only wechat, xiaohongshu, and twitter refresh are supported right now",
        items: []
      },
      { status: 400 }
    );
  }

  const repository = createMonitoringRepository();

  try {
    const persistedKeywordTarget = await getKeywordTargetById(repository, categoryId, keywordTargetId);
    const fallbackKeywordTarget: PersistedKeywordTarget = {
      id: keywordTargetId,
      categoryId,
      keyword,
      platformIds,
      createdAt: body.createdAt?.trim() || new Date().toISOString(),
      lastRunAt: body.lastRunAt ?? null,
      lastRunStatus: body.lastRunStatus ?? "idle",
      lastResultCount: body.lastResultCount ?? 0
    };
    const mergedPlatformIds = Array.from(
      new Set<ReplicaTrackedPlatformId>([
        ...(persistedKeywordTarget?.platformIds ?? fallbackKeywordTarget.platformIds),
        ...platformIds,
        platformId
      ])
    );
    const keywordTarget = {
      ...(persistedKeywordTarget ?? fallbackKeywordTarget),
      platformIds: mergedPlatformIds
    };

    const snapshot = await refreshKeywordTargetPlatform({
      repository,
      categoryId,
      keywordTarget,
      platformId: platformId as SyncablePlatformId
    });

    const freshReport = buildFreshAnalysisReport(keyword, snapshot.items, new Date());

    await upsertAnalysisSnapshot(
      repository,
      buildAnalysisArchiveSnapshot({
        searchQueryId: snapshot.searchQueryId,
        categoryId,
        keyword,
        reports: [freshReport],
        generatedAt: freshReport.date
      })
    );

    return NextResponse.json({
      items: snapshot.items,
      rawItems: snapshot.rawItems,
      report: freshReport,
      meta: {
        source: platformId,
        sortedBy: "publish_time_desc",
        persisted: true,
        fetchedCount: snapshot.fetchedCount,
        cappedCount: snapshot.cappedCount
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        error: message,
        items: [],
        rawItems: [],
        meta: null
      },
      { status: 502 }
    );
  } finally {
    repository.database.close();
  }
}
