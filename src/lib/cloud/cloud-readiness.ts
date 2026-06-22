import {
  getAppDatabaseProvider,
  getAppStorageProvider,
  getSupabaseRuntimeConfig,
  type SupabaseRuntimeConfig
} from "@/lib/supabase/config";
import { probePostgresDatabase } from "@/lib/supabase/postgres-probe";

export type CloudReadinessStatus = "ready" | "blocked";
export type CloudReadinessCheckStatus = "ok" | "warning" | "error" | "skipped";

export interface CloudReadinessCheck {
  id: string;
  label: string;
  status: CloudReadinessCheckStatus;
  message: string;
  details?: Record<string, unknown>;
}

export interface CloudReadinessReport {
  status: CloudReadinessStatus;
  generatedAt: string;
  checks: CloudReadinessCheck[];
}

export interface CloudReadinessOptions {
  probeSupabase?: boolean;
}

export const REQUIRED_PRODUCTION_ENV_KEYS = [
  "APP_DATABASE_PROVIDER",
  "APP_STORAGE_PROVIDER",
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_STORAGE_BUCKET",
  "CRON_SECRET",
  "APP_BASE_URL",
  "ACF_BOOTSTRAP_EMAIL",
  "ACF_BOOTSTRAP_PASSWORD"
] as const;

export const SUPABASE_PUBLIC_KEY_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY"
] as const;

const DEFAULT_BOOTSTRAP_EMAIL = "admin@aicontentfactory.local";
const DEFAULT_BOOTSTRAP_PASSWORD = "Admin@123456";

function trimEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function hasEnv(name: string) {
  return trimEnv(name).length > 0;
}

function truncateDetail(detail: string) {
  return detail.replace(/\s+/g, " ").trim().slice(0, 300);
}

function createCheck(input: CloudReadinessCheck): CloudReadinessCheck {
  return input;
}

export function getBootstrapCredentialProblems() {
  const problems: string[] = [];
  const email = trimEnv("ACF_BOOTSTRAP_EMAIL").toLowerCase();
  const password = trimEnv("ACF_BOOTSTRAP_PASSWORD");

  if (!email) {
    problems.push("ACF_BOOTSTRAP_EMAIL is missing");
  }

  if (!password) {
    problems.push("ACF_BOOTSTRAP_PASSWORD is missing");
  }

  if (email === DEFAULT_BOOTSTRAP_EMAIL) {
    problems.push("ACF_BOOTSTRAP_EMAIL still uses the local default value");
  }

  if (password === DEFAULT_BOOTSTRAP_PASSWORD) {
    problems.push("ACF_BOOTSTRAP_PASSWORD still uses the local default value");
  }

  return problems;
}

export function assertSafeSupabaseBootstrapCredentials() {
  if (getAppDatabaseProvider() !== "supabase") {
    return;
  }

  const problems = getBootstrapCredentialProblems();

  if (problems.length > 0) {
    throw new Error(
      `Unsafe Supabase bootstrap credentials: ${problems.join("; ")}. Set private ACF_BOOTSTRAP_EMAIL and ACF_BOOTSTRAP_PASSWORD in Vercel.`
    );
  }
}

function buildEnvChecks() {
  const missingRequiredKeys = REQUIRED_PRODUCTION_ENV_KEYS.filter((key) => !hasEnv(key));
  const hasPublicKey = SUPABASE_PUBLIC_KEY_ENV_KEYS.some((key) => hasEnv(key));
  const databaseProvider = getAppDatabaseProvider();
  const storageProvider = getAppStorageProvider();
  const checks: CloudReadinessCheck[] = [];

  checks.push(
    createCheck({
      id: "required-env",
      label: "Required production environment variables",
      status: missingRequiredKeys.length === 0 && hasPublicKey ? "ok" : "error",
      message:
        missingRequiredKeys.length === 0 && hasPublicKey
          ? "All required production environment variable names are present."
          : "Some required production environment variables are missing.",
      details: {
        missing: missingRequiredKeys,
        oneOfRequired: SUPABASE_PUBLIC_KEY_ENV_KEYS,
        hasSupabasePublicKey: hasPublicKey
      }
    })
  );

  checks.push(
    createCheck({
      id: "runtime-provider",
      label: "Runtime provider switches",
      status: databaseProvider === "supabase" && storageProvider === "supabase" ? "ok" : "error",
      message:
        databaseProvider === "supabase" && storageProvider === "supabase"
          ? "Production runtime is configured for Supabase database and storage."
          : "Production runtime must use APP_DATABASE_PROVIDER=supabase and APP_STORAGE_PROVIDER=supabase.",
      details: {
        APP_DATABASE_PROVIDER: databaseProvider,
        APP_STORAGE_PROVIDER: storageProvider
      }
    })
  );

  const bootstrapProblems = getBootstrapCredentialProblems();

  checks.push(
    createCheck({
      id: "bootstrap-credentials",
      label: "Bootstrap admin credentials",
      status: bootstrapProblems.length === 0 ? "ok" : "error",
      message:
        bootstrapProblems.length === 0
          ? "Bootstrap admin credentials are explicitly configured."
          : "Production must not use missing or default bootstrap admin credentials.",
      details: {
        problems: bootstrapProblems
      }
    })
  );

  return checks;
}

async function probeSupabaseTable(config: SupabaseRuntimeConfig): Promise<CloudReadinessCheck> {
  const response = await fetch(`${config.url}/rest/v1/auth_users?select=id&limit=1`, {
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`
    },
    cache: "no-store"
  });

  if (response.ok) {
    return createCheck({
      id: "supabase-rest",
      label: "Supabase REST/Data API",
      status: "ok",
      message: "Supabase REST/Data API can read the auth_users table with service-role access."
    });
  }

  const detail = truncateDetail(await response.text().catch(() => ""));

  return createCheck({
    id: "supabase-rest",
    label: "Supabase REST/Data API",
    status: "error",
    message: "Supabase REST/Data API probe failed. Check SQL migrations and service-role environment variable.",
    details: {
      status: response.status,
      detail
    }
  });
}

async function probeSupabaseStorage(config: SupabaseRuntimeConfig): Promise<CloudReadinessCheck> {
  const response = await fetch(
    `${config.url}/storage/v1/bucket/${encodeURIComponent(config.storageBucket)}`,
    {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`
      },
      cache: "no-store"
    }
  );

  if (response.ok) {
    return createCheck({
      id: "supabase-storage",
      label: "Supabase Storage bucket",
      status: "ok",
      message: `Supabase Storage bucket "${config.storageBucket}" is reachable.`
    });
  }

  const detail = truncateDetail(await response.text().catch(() => ""));

  return createCheck({
    id: "supabase-storage",
    label: "Supabase Storage bucket",
    status: "error",
    message: `Supabase Storage bucket "${config.storageBucket}" is not reachable.`,
    details: {
      status: response.status,
      detail
    }
  });
}

async function probePostgres(): Promise<CloudReadinessCheck> {
  const result = await probePostgresDatabase();

  if (result.ok) {
    return createCheck({
      id: "supabase-postgres",
      label: "Supabase Postgres DATABASE_URL",
      status: "ok",
      message: "DATABASE_URL can connect to Supabase Postgres and run a lightweight query.",
      details: result.summary ? { connection: result.summary } : undefined
    });
  }

  return createCheck({
    id: "supabase-postgres",
    label: "Supabase Postgres DATABASE_URL",
    status: hasEnv("DATABASE_URL") ? "error" : "skipped",
    message: hasEnv("DATABASE_URL")
      ? "DATABASE_URL probe failed. Check the Supabase pooler connection string, password and SSL settings."
      : "DATABASE_URL probe was skipped because DATABASE_URL is missing.",
    details: {
      ...(result.summary ? { connection: result.summary } : {}),
      error: result.error
    }
  });
}

async function buildSupabaseProbeChecks(enabled: boolean) {
  const config = getSupabaseRuntimeConfig();

  if (!enabled) {
    return [
      createCheck({
        id: "supabase-probes",
        label: "Supabase runtime probes",
        status: "skipped",
        message: "Supabase network probes were skipped."
      })
    ];
  }

  const postgresCheck = await probePostgres();

  if (!config) {
    return [
      postgresCheck,
      createCheck({
        id: "supabase-probes",
        label: "Supabase runtime probes",
        status: "skipped",
        message:
          "Supabase runtime probes were skipped because NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing."
      })
    ];
  }

  try {
    return [
      postgresCheck,
      ...(await Promise.all([probeSupabaseTable(config), probeSupabaseStorage(config)]))
    ];
  } catch (error) {
    return [
      postgresCheck,
      createCheck({
        id: "supabase-probes",
        label: "Supabase runtime probes",
        status: "error",
        message: "Supabase runtime probe failed before a response was received.",
        details: {
          error: error instanceof Error ? error.message : String(error)
        }
      })
    ];
  }
}

export async function getCloudReadinessReport(
  options: CloudReadinessOptions = {}
): Promise<CloudReadinessReport> {
  const checks = [
    ...buildEnvChecks(),
    ...(await buildSupabaseProbeChecks(options.probeSupabase ?? true))
  ];
  const hasError = checks.some((check) => check.status === "error");

  return {
    status: hasError ? "blocked" : "ready",
    generatedAt: new Date().toISOString(),
    checks
  };
}
