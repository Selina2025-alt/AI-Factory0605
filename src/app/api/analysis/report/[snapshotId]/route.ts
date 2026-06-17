import { NextResponse } from "next/server";

import {
  createMonitoringRepository,
  getAnalysisEvidenceItemsBySnapshotId,
  getAnalysisSnapshotById
} from "@/lib/db/monitoring-repository";

export async function GET(
  _request: Request,
  context: { params: Promise<{ snapshotId: string }> }
) {
  const { snapshotId } = await context.params;
  const repository = createMonitoringRepository();

  try {
    const detail = await getAnalysisSnapshotById(repository, snapshotId);

    if (!detail) {
      return NextResponse.json({ error: "Analysis report not found" }, { status: 404 });
    }

    const evidenceItems = await getAnalysisEvidenceItemsBySnapshotId(repository, snapshotId);

    return NextResponse.json({
      snapshot: detail.snapshot,
      topics: detail.topics,
      evidenceItems
    });
  } finally {
    repository.database.close();
  }
}
