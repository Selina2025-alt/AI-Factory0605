import { NextRequest, NextResponse } from "next/server";

import { createMonitoringRepository } from "@/lib/db/monitoring-repository";
import { listStoredContentForKeywordTarget } from "@/lib/monitoring-sync-service";
import type { ContentItem } from "@/lib/types";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("categoryId")?.trim() ?? "";
  const keywordTargetId = searchParams.get("keywordTargetId")?.trim() ?? "";
  const platformId = (searchParams.get("platformId")?.trim() as ContentItem["platformId"] | null) ?? undefined;
  const parsedLimit = Number.parseInt(searchParams.get("limit") ?? "100", 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : 100;

  if (!categoryId || !keywordTargetId) {
    return NextResponse.json(
      {
        error: "categoryId and keywordTargetId are required",
        items: []
      },
      { status: 400 }
    );
  }

  const repository = createMonitoringRepository();

  try {
    const items = await listStoredContentForKeywordTarget({
      repository,
      categoryId,
      keywordTargetId,
      platformId,
      limit
    });

    return NextResponse.json({
      items,
      meta: {
        source: platformId ?? "all",
        persisted: true,
        sortedBy: "publish_time_desc",
        fetchedCount: items.length,
        cappedCount: items.length
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        error: message,
        items: [],
        meta: null
      },
      { status: 500 }
    );
  } finally {
    repository.database.close();
  }
}
