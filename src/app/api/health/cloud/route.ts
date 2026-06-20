import { NextResponse } from "next/server";

import { getCloudReadinessReport } from "@/lib/cloud/cloud-readiness";

export const dynamic = "force-dynamic";

export async function GET() {
  const report = await getCloudReadinessReport({ probeSupabase: true });

  return NextResponse.json(report, {
    status: report.status === "ready" ? 200 : 503,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
