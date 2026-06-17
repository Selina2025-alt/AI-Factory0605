import { NextResponse } from "next/server";

import { createMonitoringRepository, listSearchQueries } from "@/lib/db/monitoring-repository";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("categoryId")?.trim() ?? "";

  const repository = createMonitoringRepository();

  try {
    const queries = await listSearchQueries(repository, categoryId || undefined);

    return NextResponse.json({ queries });
  } finally {
    repository.database.close();
  }
}
