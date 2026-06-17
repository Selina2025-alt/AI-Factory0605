import { NextRequest, NextResponse } from "next/server";

import { createMonitoringRepository, listKeywordTargets } from "@/lib/db/monitoring-repository";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("categoryId")?.trim() ?? "";

  if (!categoryId) {
    return NextResponse.json(
      {
        error: "categoryId is required",
        keywordTargets: []
      },
      { status: 400 }
    );
  }

  const repository = createMonitoringRepository();

  try {
    const keywordTargets = await listKeywordTargets(repository, categoryId);

    return NextResponse.json({
      keywordTargets
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        error: message,
        keywordTargets: []
      },
      { status: 500 }
    );
  } finally {
    repository.database.close();
  }
}
