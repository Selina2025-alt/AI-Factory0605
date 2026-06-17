import {
  createMonitoringRepository,
  getGlobalAnalysisSettings,
  listAllKeywordTargets
} from "@/lib/db/monitoring-repository";
import { runKeywordTopicAnalysis } from "@/lib/analysis-orchestrator";

export interface DailyAnalysisRunItem {
  categoryId: string;
  keyword: string;
  status: "generated" | "skipped" | "failed";
  reportId: string | null;
  reason: string | null;
}

export interface DailyAnalysisRunResult {
  enabled: boolean;
  totalKeywordTargets: number;
  processedCount: number;
  generatedCount: number;
  skippedCount: number;
  failedCount: number;
  items: DailyAnalysisRunItem[];
}

export async function runDailyAnalysis(): Promise<DailyAnalysisRunResult> {
  const repository = createMonitoringRepository();
  const items: DailyAnalysisRunItem[] = [];

  try {
    const settings = await getGlobalAnalysisSettings(repository);

    if (!settings.enabled) {
      return {
        enabled: false,
        totalKeywordTargets: 0,
        processedCount: 0,
        generatedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        items
      };
    }

    const keywordTargets = await listAllKeywordTargets(repository);

    for (const keywordTarget of keywordTargets) {
      const platformIds = keywordTarget.platformIds.filter(
        (platformId): platformId is "wechat" | "xiaohongshu" | "twitter" =>
          platformId === "wechat" || platformId === "xiaohongshu" || platformId === "twitter"
      );

      if (platformIds.length === 0) {
        items.push({
          categoryId: keywordTarget.categoryId,
          keyword: keywordTarget.keyword,
          status: "skipped",
          reportId: null,
          reason: "No syncable platforms configured"
        });
        continue;
      }

      try {
        const result = await runKeywordTopicAnalysis({
          repository,
          categoryId: keywordTarget.categoryId,
          keywordTarget,
          platformIds,
          mode: "scheduled"
        });

        if (result.skipped) {
          items.push({
            categoryId: keywordTarget.categoryId,
            keyword: keywordTarget.keyword,
            status: "skipped",
            reportId: null,
            reason: result.reason
          });
          continue;
        }

        items.push({
          categoryId: keywordTarget.categoryId,
          keyword: keywordTarget.keyword,
          status: "generated",
          reportId: result.report.id,
          reason: null
        });
      } catch (error) {
        items.push({
          categoryId: keywordTarget.categoryId,
          keyword: keywordTarget.keyword,
          status: "failed",
          reportId: null,
          reason: error instanceof Error ? error.message : "Daily analysis failed"
        });
      }
    }

    return {
      enabled: true,
      totalKeywordTargets: keywordTargets.length,
      processedCount: items.length,
      generatedCount: items.filter((item) => item.status === "generated").length,
      skippedCount: items.filter((item) => item.status === "skipped").length,
      failedCount: items.filter((item) => item.status === "failed").length,
      items
    };
  } finally {
    repository.database.close();
  }
}
