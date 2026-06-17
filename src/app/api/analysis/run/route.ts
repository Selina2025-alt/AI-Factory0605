import { NextRequest, NextResponse } from "next/server";

import {
  createMonitoringRepository,
  getKeywordTargetById,
  type PersistedKeywordTarget
} from "@/lib/db/monitoring-repository";
import { runKeywordTopicAnalysis } from "@/lib/analysis-orchestrator";
import type { ReplicaTrackedPlatformId } from "@/lib/replica-workbench-data";
import type { SyncablePlatformId } from "@/lib/monitoring-sync-service";

interface AnalysisRunRequestBody {
  categoryId?: string;
  keywordTargetId?: string;
  keyword?: string;
  platformIds?: ReplicaTrackedPlatformId[];
  createdAt?: string;
  lastRunAt?: string | null;
  lastRunStatus?: "idle" | "running" | "success" | "failed";
  lastResultCount?: number;
  mode?: "manual" | "scheduled";
}

function toSyncablePlatforms(platformIds: ReplicaTrackedPlatformId[]) {
  return platformIds.filter(
    (platformId): platformId is SyncablePlatformId =>
      platformId === "wechat" || platformId === "xiaohongshu" || platformId === "twitter"
  );
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as AnalysisRunRequestBody;
  const categoryId = body.categoryId?.trim() ?? "";
  const keywordTargetId = body.keywordTargetId?.trim() ?? "";
  const keyword = body.keyword?.trim().toLowerCase() ?? "";

  if (!categoryId || !keywordTargetId || !keyword) {
    return NextResponse.json(
      {
        error: "categoryId, keywordTargetId, and keyword are required"
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
      platformIds: body.platformIds ?? ["wechat"],
      createdAt: body.createdAt?.trim() || new Date().toISOString(),
      lastRunAt: body.lastRunAt ?? null,
      lastRunStatus: body.lastRunStatus ?? "idle",
      lastResultCount: body.lastResultCount ?? 0
    };

    const keywordTarget = persistedKeywordTarget ?? fallbackKeywordTarget;
    const platformIds = toSyncablePlatforms(
      Array.from(new Set(body.platformIds?.length ? body.platformIds : keywordTarget.platformIds))
    );

    if (platformIds.length === 0) {
      return NextResponse.json(
        {
          error: "At least one enabled collectable platform is required"
        },
        { status: 400 }
      );
    }

    const result = await runKeywordTopicAnalysis({
      repository,
      categoryId,
      keywordTarget,
      platformIds,
      mode: body.mode ?? "manual"
    });

    if (result.skipped) {
      return NextResponse.json({
        report: null,
        detail: null,
        meta: {
          refreshedPlatforms: platformIds,
          skipped: true,
          reason: result.reason
        }
      });
    }

    return NextResponse.json({
      report: result.report,
      detail: {
        ...result.snapshotDetail,
        evidenceItems: result.evidenceItems
      },
      meta: {
        refreshedPlatforms: result.refreshedPlatforms,
        skipped: false
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis run failed";

    return NextResponse.json(
      {
        error: message
      },
      { status: 502 }
    );
  } finally {
    repository.database.close();
  }
}
