// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";

import { syncDailyAnalysisTask } from "@/lib/analysis-scheduler";

const originalDatabaseProvider = process.env.APP_DATABASE_PROVIDER;
const originalVercel = process.env.VERCEL;

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

describe("syncDailyAnalysisTask", () => {
  afterEach(() => {
    restoreEnv("APP_DATABASE_PROVIDER", originalDatabaseProvider);
    restoreEnv("VERCEL", originalVercel);
  });

  it("treats Supabase production as Vercel Cron managed instead of Windows schtasks", () => {
    process.env.APP_DATABASE_PROVIDER = "supabase";

    const result = syncDailyAnalysisTask({
      enabled: true,
      time: "09:30",
      taskName: "ContentPulseDailyAnalysis-default-workspace"
    });

    expect(result).toMatchObject({
      ok: true,
      taskName: "ContentPulseDailyAnalysis-default-workspace"
    });
    expect(result.message).toContain("Vercel Cron is managed by vercel.json");
    expect(result.message).toContain("09:30");
  });

  it("still validates time before reporting a cloud-managed schedule", () => {
    process.env.VERCEL = "1";

    expect(() =>
      syncDailyAnalysisTask({
        enabled: true,
        time: "25:00"
      })
    ).toThrow("Invalid time value");
  });
});
