import {
  createMonitoringRepository,
  getAnalysisSnapshotById,
  type MonitoringRepository,
  type PersistedAnalysisEvidenceItem,
  type PersistedKeywordTarget,
  upsertAnalysisEvidenceItems,
  upsertAnalysisSnapshot
} from "@/lib/db/monitoring-repository";
import { buildAnalysisArchiveSnapshot } from "@/lib/history-archive";
import {
  refreshKeywordTargetPlatform,
  type PlatformContentSnapshot,
  type SyncablePlatformId
} from "@/lib/monitoring-sync-service";
import type { ReplicaDailyReport } from "@/lib/replica-workbench-data";
import { createDefaultSiliconFlowClient } from "@/lib/siliconflow-client";
import { formatLocalDate, formatLocalDateTime, parseDateLike } from "@/lib/time-utils";
import type { ContentItem } from "@/lib/types";
import {
  buildTopicAnalysis,
  type AnalysisEvidenceDraft,
  type AnalysisSnapshotDraft
} from "@/lib/ai-analysis-service";

const MAX_ANALYSIS_INPUT_ITEMS = 12;

export interface AnalysisOrchestratorReportDetail {
  snapshot: {
    id: string;
    searchQueryId: string;
    categoryId: string;
    keyword: string;
    generatedAt: string;
    hotSummary: string;
    focusSummary: string;
    patternSummary: string;
    insightSummary: string;
  };
  topics: Array<{
    id: string;
    snapshotId: string;
    title: string;
    intro: string;
    whyNow: string;
    hook: string;
    growth: string;
    supportContentIds: string[];
  }>;
  evidenceItems: PersistedAnalysisEvidenceItem[];
}

export type TopicAnalysisRunResult =
  | {
      skipped: true;
      reason: string;
    }
  | {
      skipped: false;
      report: ReplicaDailyReport;
      snapshotDetail: AnalysisOrchestratorReportDetail;
      evidenceItems: PersistedAnalysisEvidenceItem[];
      contentItems: ContentItem[];
      refreshedPlatforms: SyncablePlatformId[];
    };

interface RunKeywordTopicAnalysisInput {
  repository: MonitoringRepository;
  categoryId: string;
  keywordTarget: PersistedKeywordTarget;
  platformIds: SyncablePlatformId[];
  mode: "manual" | "scheduled";
  refreshPlatform?: typeof refreshKeywordTargetPlatform;
  analyze?: typeof buildTopicAnalysis;
  client?: Parameters<typeof buildTopicAnalysis>[0]["client"];
  now?: () => string;
}

function createAnalysisRunId() {
  return `analysis-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildPersistedEvidenceItems(
  snapshotId: string,
  keyword: string,
  generatedAt: string,
  evidenceItems: AnalysisEvidenceDraft[]
): PersistedAnalysisEvidenceItem[] {
  return evidenceItems.map((item, index) => ({
    id: `${snapshotId}-evidence-${index + 1}`,
    snapshotId,
    contentId: item.contentId,
    keyword,
    platformId: item.platform as ContentItem["platformId"],
    title: item.title,
    briefSummary: item.briefSummary,
    keyFacts: item.keyFacts,
    keywords: item.keywords,
    highlights: item.highlights,
    attentionSignals: item.attentionSignals,
    topicAngles: item.topicAngles,
    createdAt: generatedAt
  }));
}

function buildReplicaReport(
  snapshotId: string,
  generatedAt: string,
  draft: AnalysisSnapshotDraft
): ReplicaDailyReport {
  const date = formatLocalDate(generatedAt);

  return {
    id: snapshotId,
    date,
    label: date,
    hotSummary: draft.hotSummary,
    focusSummary: draft.focusSummary,
    patternSummary: draft.patternSummary,
    insightSummary: draft.insightSummary,
    suggestions: draft.topics.map((topic, index) => ({
      id: `${snapshotId}-topic-${index + 1}`,
      title: topic.title,
      intro: topic.intro,
      whyNow: topic.whyNow,
      hook: topic.hook,
      growth: topic.growth,
      supportContentIds: topic.supportContentIds
    }))
  };
}

function dedupeAndSortItems(items: ContentItem[]) {
  const unique = new Map<string, ContentItem>();

  for (const item of items) {
    const key = `${item.platformId}:${item.id}`;

    if (!unique.has(key)) {
      unique.set(key, item);
    }
  }

  return [...unique.values()].sort((left, right) => {
    if ((right.heatScore ?? 0) !== (left.heatScore ?? 0)) {
      return (right.heatScore ?? 0) - (left.heatScore ?? 0);
    }

    return (right.publishTimestamp ?? 0) - (left.publishTimestamp ?? 0);
  });
}

function filterScheduledItems(items: ContentItem[], generatedAt: string) {
  const anchorDate = parseDateLike(generatedAt) ?? new Date(generatedAt);
  const previousDay = new Date(anchorDate);
  previousDay.setDate(previousDay.getDate() - 1);
  const previousDate = formatLocalDate(previousDay);

  return items.filter((item) => {
    const publishedAt = item.publishTime ?? item.publishedAt ?? item.publishTimestamp ?? null;
    return formatLocalDate(publishedAt) === previousDate;
  });
}

export async function runKeywordTopicAnalysis(
  input: RunKeywordTopicAnalysisInput
): Promise<TopicAnalysisRunResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const refreshPlatform = input.refreshPlatform ?? refreshKeywordTargetPlatform;
  const analyze = input.analyze ?? buildTopicAnalysis;
  const generatedAt = now();
  const analysisRunId = createAnalysisRunId();
  const refreshedPlatforms = [...new Set(input.platformIds)];
  const refreshedSnapshots: PlatformContentSnapshot[] = [];

  for (const platformId of refreshedPlatforms) {
    const snapshot = await refreshPlatform({
      repository: input.repository,
      categoryId: input.categoryId,
      keywordTarget: input.keywordTarget,
      platformId,
      triggerType: "manual_refresh"
    });

    refreshedSnapshots.push(snapshot);
  }

  const mergedItems = dedupeAndSortItems(refreshedSnapshots.flatMap((snapshot) => snapshot.items));
  const analysisSourceItems =
    input.mode === "scheduled"
      ? filterScheduledItems(mergedItems, generatedAt)
      : mergedItems;

  if (analysisSourceItems.length === 0) {
    return {
      skipped: true,
      reason:
        input.mode === "scheduled"
          ? "No eligible content from the previous day"
          : "No content available for analysis"
    };
  }

  const analysisItems = analysisSourceItems.slice(0, MAX_ANALYSIS_INPUT_ITEMS);
  const client = input.client ?? createDefaultSiliconFlowClient();
  const topicAnalysis = await analyze({
    keyword: input.keywordTarget.keyword,
    items: analysisItems,
    client
  });

  if (!topicAnalysis) {
    return {
      skipped: true,
      reason: "No content available for analysis"
    };
  }

  const searchQueryId =
    refreshedSnapshots.length === 1
      ? refreshedSnapshots[0]!.searchQueryId
      : analysisRunId;
  const report = buildReplicaReport(`${searchQueryId}-analysis`, generatedAt, topicAnalysis.snapshot);
  const archive = buildAnalysisArchiveSnapshot({
    searchQueryId,
    categoryId: input.categoryId,
    keyword: input.keywordTarget.keyword,
    reports: [report],
    generatedAt: formatLocalDateTime(generatedAt)
  });
  const evidenceItems = buildPersistedEvidenceItems(
    archive.snapshot.id,
    input.keywordTarget.keyword,
    formatLocalDateTime(generatedAt),
    topicAnalysis.evidenceItems
  );

  await upsertAnalysisSnapshot(input.repository, archive);
  await upsertAnalysisEvidenceItems(input.repository, {
    snapshotId: archive.snapshot.id,
    items: evidenceItems
  });

  const persistedSnapshot = await getAnalysisSnapshotById(input.repository, archive.snapshot.id);

  return {
    skipped: false,
    report,
    snapshotDetail: {
      ...(persistedSnapshot ?? {
        snapshot: archive.snapshot,
        topics: archive.topics
      }),
      evidenceItems
    },
    evidenceItems,
    contentItems: mergedItems,
    refreshedPlatforms
  };
}

export async function runKeywordTopicAnalysisWithNewRepository(
  input: Omit<RunKeywordTopicAnalysisInput, "repository">
) {
  const repository = createMonitoringRepository();

  try {
    return await runKeywordTopicAnalysis({
      ...input,
      repository
    });
  } finally {
    repository.database.close();
  }
}
