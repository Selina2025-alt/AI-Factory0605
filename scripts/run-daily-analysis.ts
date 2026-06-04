import { runDailyAnalysis } from "../src/lib/analysis-daily-runner";

async function main() {
  const result = await runDailyAnalysis();

  if (!result.enabled) {
    console.log("Daily analysis disabled.");
    return;
  }

  if (result.totalKeywordTargets === 0) {
    console.log("No keyword targets configured.");
    return;
  }

  for (const item of result.items) {
    if (item.status === "generated") {
      console.log(`[${item.categoryId}] ${item.keyword}: report generated (${item.reportId})`);
      continue;
    }

    console.log(`[${item.categoryId}] ${item.keyword}: ${item.status} (${item.reason})`);
  }

  console.log(
    `Daily analysis finished: generated=${result.generatedCount}, skipped=${result.skippedCount}, failed=${result.failedCount}`
  );
}

void main();
