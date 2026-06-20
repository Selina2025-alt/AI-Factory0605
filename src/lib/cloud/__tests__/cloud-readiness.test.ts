import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertSafeSupabaseBootstrapCredentials,
  getCloudReadinessReport,
  REQUIRED_PRODUCTION_ENV_KEYS,
  SUPABASE_PUBLIC_KEY_ENV_KEYS
} from "@/lib/cloud/cloud-readiness";

const envKeys = [
  ...REQUIRED_PRODUCTION_ENV_KEYS,
  ...SUPABASE_PUBLIC_KEY_ENV_KEYS,
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "ACF_BOOTSTRAP_NAME",
  "ACF_BOOTSTRAP_WORKSPACE_ID",
  "ACF_BOOTSTRAP_WORKSPACE_NAME"
];

function clearCloudEnv() {
  for (const key of envKeys) {
    delete process.env[key];
  }
}

function setReadyEnv() {
  process.env.APP_DATABASE_PROVIDER = "supabase";
  process.env.APP_STORAGE_PROVIDER = "supabase";
  process.env.DATABASE_URL = "postgresql://postgres.example:password@example.supabase.co:6543/postgres";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://demo.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  process.env.SUPABASE_STORAGE_BUCKET = "assets";
  process.env.CRON_SECRET = "cron-secret";
  process.env.APP_BASE_URL = "https://factory.example.com";
  process.env.ACF_BOOTSTRAP_EMAIL = "owner@example.com";
  process.env.ACF_BOOTSTRAP_PASSWORD = "not-the-local-default";
}

describe("cloud readiness", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    clearCloudEnv();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("reports missing production settings without leaking values", async () => {
    process.env.APP_DATABASE_PROVIDER = "supabase";
    process.env.APP_STORAGE_PROVIDER = "supabase";

    const report = await getCloudReadinessReport({ probeSupabase: false });
    const requiredEnvCheck = report.checks.find((check) => check.id === "required-env");
    const bootstrapCheck = report.checks.find((check) => check.id === "bootstrap-credentials");

    expect(report.status).toBe("blocked");
    expect(requiredEnvCheck?.status).toBe("error");
    expect(requiredEnvCheck?.details?.missing).toContain("DATABASE_URL");
    expect(requiredEnvCheck?.details?.missing).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(bootstrapCheck?.status).toBe("error");
    expect(JSON.stringify(report)).not.toContain("service-role-key");
  });

  it("passes readiness checks when required envs are configured and probes are skipped", async () => {
    setReadyEnv();

    const report = await getCloudReadinessReport({ probeSupabase: false });

    expect(report.status).toBe("ready");
    expect(report.checks.every((check) => check.status !== "error")).toBe(true);
  });

  it("probes Supabase REST and Storage when runtime credentials are present", async () => {
    setReadyEnv();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const report = await getCloudReadinessReport({ probeSupabase: true });

    expect(report.status).toBe("ready");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(report.checks.find((check) => check.id === "supabase-rest")?.status).toBe("ok");
    expect(report.checks.find((check) => check.id === "supabase-storage")?.status).toBe("ok");
  });

  it("blocks Supabase bootstrap when local default credentials are still used", () => {
    process.env.APP_DATABASE_PROVIDER = "supabase";
    process.env.ACF_BOOTSTRAP_EMAIL = "admin@aicontentfactory.local";
    process.env.ACF_BOOTSTRAP_PASSWORD = "Admin@123456";

    expect(() => assertSafeSupabaseBootstrapCredentials()).toThrow(
      /Unsafe Supabase bootstrap credentials/
    );
  });
});
