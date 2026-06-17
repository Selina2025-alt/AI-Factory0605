import { NextRequest, NextResponse } from "next/server";

import {
  createMonitoringRepository,
  listAnalysisSnapshotsByKeyword
} from "@/lib/db/monitoring-repository";
import {
  mapPersistedAnalysisSnapshotToReport,
  mergePersistedReportsIntoReports
} from "@/lib/analysis-report";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("categoryId")?.trim() ?? "";
  const keyword = searchParams.get("keyword")?.trim().toLowerCase() ?? "";
  const limit = Number.parseInt(searchParams.get("limit") ?? "14", 10);

  if (!categoryId || !keyword) {
    return NextResponse.json(
      {
        error: "categoryId and keyword are required",
        reports: []
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }

  const repository = createMonitoringRepository();

  try {
    const reportLimit = Number.isNaN(limit) ? 14 : limit;
    const details = await listAnalysisSnapshotsByKeyword(repository, categoryId, keyword, reportLimit);
    const reports = mergePersistedReportsIntoReports(
      [],
      details.map(mapPersistedAnalysisSnapshotToReport),
      reportLimit
    );

    return NextResponse.json(
      {
        reports
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        error: message,
        reports: []
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } finally {
    repository.database.close();
  }
}
