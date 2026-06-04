import { NextRequest, NextResponse } from "next/server";

import { runDailyAnalysis } from "@/lib/analysis-daily-runner";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorizedCronRequest(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ message: "Unauthorized cron request" }, { status: 401 });
  }

  const result = await runDailyAnalysis();

  return NextResponse.json({
    ok: true,
    mode: "vercel-cron",
    result
  });
}
