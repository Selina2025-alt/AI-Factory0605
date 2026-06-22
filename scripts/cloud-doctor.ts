import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

type CheckStatus = "ok" | "warning" | "error";

interface DoctorCheck {
  id: string;
  status: CheckStatus;
  message: string;
  details?: string[];
}

const projectRoot = process.cwd();
const args = new Set(process.argv.slice(2));
const strictMode = args.has("--strict");
const skipRemote = args.has("--skip-remote");
const productionUrl =
  process.env.CLOUD_DOCTOR_URL?.trim() || "https://ai-factory0605.vercel.app/api/health/cloud";

const requiredVercelKeys = [
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

const oneOfPublicKeyKeys = [
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY"
] as const;

function relative(...parts: string[]) {
  return path.join(projectRoot, ...parts);
}

function run(command: string, commandArgs: string[]) {
  if (process.platform === "win32" && command === "npm") {
    return spawnSync("cmd.exe", ["/d", "/s", "/c", ["npm", ...commandArgs].join(" ")], {
      cwd: projectRoot,
      encoding: "utf8",
      shell: false
    });
  }

  return spawnSync(command, commandArgs, {
    cwd: projectRoot,
    encoding: "utf8",
    shell: false
  });
}

function createCheck(check: DoctorCheck) {
  return check;
}

function checkSqlBundle(): DoctorCheck {
  const bundlePath = relative("supabase", "ai_factory_supabase_go_live.sql");

  if (!existsSync(bundlePath)) {
    return createCheck({
      id: "sql-bundle",
      status: "error",
      message: "Supabase go-live SQL bundle is missing.",
      details: ["Run npm run supabase:bundle-sql before go-live."]
    });
  }

  const result = run("npm", ["run", "supabase:bundle-sql:check", "--silent"]);

  if (result.status === 0) {
    return createCheck({
      id: "sql-bundle",
      status: "ok",
      message: "Supabase go-live SQL bundle exists and is up to date."
    });
  }

  return createCheck({
    id: "sql-bundle",
    status: "error",
    message: "Supabase go-live SQL bundle is out of date.",
    details: [
      "Run npm run supabase:bundle-sql.",
      String(result.stderr ?? result.stdout ?? result.error?.message ?? "").trim()
    ].filter(Boolean)
  });
}

function checkMigrationFiles(): DoctorCheck {
  const migrationDir = relative("supabase", "migrations");
  const expectedFiles = [
    "202606050001_initial_ai_factory_schema.sql",
    "202606050002_sqlite_integer_flags_compatibility.sql",
    "202606180001_lock_down_public_data_api.sql"
  ];
  const missing = expectedFiles.filter((fileName) => !existsSync(path.join(migrationDir, fileName)));

  return createCheck({
    id: "migration-files",
    status: missing.length === 0 ? "ok" : "error",
    message:
      missing.length === 0
        ? "Required Supabase migration files are present."
        : "Some required Supabase migration files are missing.",
    details: missing
  });
}

function checkVercelProjectLink(): DoctorCheck {
  const projectJsonPath = relative(".vercel", "project.json");

  if (!existsSync(projectJsonPath)) {
    return createCheck({
      id: "vercel-link",
      status: "warning",
      message: "Local Vercel project link is missing.",
      details: ["Run npx vercel link if you need to deploy from this machine."]
    });
  }

  try {
    const project = JSON.parse(readFileSync(projectJsonPath, "utf8")) as {
      orgId?: string;
      projectId?: string;
    };
    const expectedOrgId = "team_auS51iB35gcxjaZOZAZSeAiq";
    const expectedProjectId = "prj_Tb6uKrUyXcOOJd4DydNtTyHHhi6u";
    const mismatches: string[] = [];

    if (project.orgId !== expectedOrgId) {
      mismatches.push(`orgId is ${project.orgId || "<missing>"}, expected ${expectedOrgId}`);
    }

    if (project.projectId !== expectedProjectId) {
      mismatches.push(
        `projectId is ${project.projectId || "<missing>"}, expected ${expectedProjectId}`
      );
    }

    return createCheck({
      id: "vercel-link",
      status: mismatches.length === 0 ? "ok" : "warning",
      message:
        mismatches.length === 0
          ? "Local Vercel link points to ai-factory0605."
          : "Local Vercel link does not match the documented ai-factory0605 project.",
      details: mismatches
    });
  } catch (error) {
    return createCheck({
      id: "vercel-link",
      status: "error",
      message: "Could not parse .vercel/project.json.",
      details: [error instanceof Error ? error.message : String(error)]
    });
  }
}

function checkLocalEnvShape(): DoctorCheck {
  const missingRequired = requiredVercelKeys.filter((key) => !process.env[key]?.trim());
  const hasPublicKey = oneOfPublicKeyKeys.some((key) => process.env[key]?.trim());
  const details = [
    ...missingRequired.map((key) => `missing ${key}`),
    ...(hasPublicKey ? [] : [`missing one of ${oneOfPublicKeyKeys.join(" or ")}`])
  ];

  return createCheck({
    id: "local-env-shape",
    status: details.length === 0 ? "ok" : "warning",
    message:
      details.length === 0
        ? "Current shell has the required cloud environment variable names."
        : "Current shell is not fully configured for Supabase production checks.",
    details
  });
}

function summarizeRemoteHealthPayload(payload: unknown): DoctorCheck {
  if (!payload || typeof payload !== "object") {
    return createCheck({
      id: "remote-cloud-health",
      status: "error",
      message: "Cloud health endpoint did not return a JSON object."
    });
  }

  const report = payload as {
    status?: string;
    checks?: Array<{
      id?: string;
      status?: string;
      message?: string;
      details?: Record<string, unknown>;
    }>;
  };
  const failingChecks = (report.checks ?? []).filter((check) =>
    ["error", "skipped"].includes(check.status ?? "")
  );
  const details = failingChecks.map((check) => {
    const missing = Array.isArray(check.details?.missing)
      ? ` missing=${check.details?.missing.join(",")}`
      : "";

    return `${check.id || "unknown"}: ${check.status || "unknown"} - ${
      check.message || "no message"
    }${missing}`;
  });

  return createCheck({
    id: "remote-cloud-health",
    status: report.status === "ready" ? "ok" : "error",
    message:
      report.status === "ready"
        ? "Production cloud health reports ready."
        : "Production cloud health is not ready yet.",
    details
  });
}

async function checkRemoteHealth(): Promise<DoctorCheck> {
  if (skipRemote) {
    return createCheck({
      id: "remote-cloud-health",
      status: "warning",
      message: "Remote cloud health check was skipped."
    });
  }

  try {
    const text = await fetchRemoteHealthText(productionUrl);

    try {
      return summarizeRemoteHealthPayload(JSON.parse(text));
    } catch {
      return createCheck({
        id: "remote-cloud-health",
        status: "error",
        message: "Cloud health endpoint returned a non-JSON response.",
        details: [text.replace(/\s+/g, " ").trim().slice(0, 300)]
      });
    }
  } catch (error) {
    return createCheck({
      id: "remote-cloud-health",
      status: "error",
      message: "Could not reach the cloud health endpoint.",
      details: [error instanceof Error ? error.message : String(error)]
    });
  }
}

async function fetchRemoteHealthText(url: string) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    return await response.text();
  } catch (error) {
    const fallback = fetchRemoteHealthTextWithShell(url);

    if (fallback.ok) {
      return fallback.text;
    }

    const originalMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      [
        originalMessage,
        fallback.error ? `fallback: ${fallback.error}` : "",
        fallback.stderr ? `stderr: ${fallback.stderr}` : ""
      ]
        .filter(Boolean)
        .join("; ")
    );
  }
}

function fetchRemoteHealthTextWithShell(url: string) {
  if (process.platform === "win32") {
    const command = [
      "$ErrorActionPreference='Stop';",
      "$u=$env:CLOUD_DOCTOR_REMOTE_URL;",
      "try {",
      "  (Invoke-WebRequest -UseBasicParsing -Uri $u -TimeoutSec 20).Content",
      "} catch {",
      "  if ($_.Exception.Response) {",
      "    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream());",
      "    $reader.ReadToEnd()",
      "  } else {",
      "    throw",
      "  }",
      "}"
    ].join(" ");
    const result = spawnSync("powershell", ["-NoProfile", "-Command", command], {
      cwd: projectRoot,
      encoding: "utf8",
      shell: false,
      env: {
        ...process.env,
        CLOUD_DOCTOR_REMOTE_URL: url
      }
    });

    return {
      ok: result.status === 0 && Boolean(result.stdout.trim()),
      text: result.stdout,
      stderr: String(result.stderr ?? "").trim(),
      error: result.error?.message
    };
  }

  const result = spawnSync("curl", ["--location", "--silent", "--show-error", "--max-time", "20", url], {
    cwd: projectRoot,
    encoding: "utf8",
    shell: false
  });

  return {
    ok: result.status === 0 && Boolean(result.stdout.trim()),
    text: result.stdout,
    stderr: String(result.stderr ?? "").trim(),
    error: result.error?.message
  };
}

function printChecks(checks: DoctorCheck[]) {
  const symbolByStatus: Record<CheckStatus, string> = {
    ok: "OK",
    warning: "WARN",
    error: "ERROR"
  };

  for (const check of checks) {
    console.log(`[${symbolByStatus[check.status]}] ${check.id}: ${check.message}`);

    for (const detail of check.details ?? []) {
      console.log(`  - ${detail}`);
    }
  }
}

async function main() {
  const checks = [
    checkMigrationFiles(),
    checkSqlBundle(),
    checkVercelProjectLink(),
    checkLocalEnvShape(),
    await checkRemoteHealth()
  ];

  console.log("AI Content Factory cloud doctor");
  console.log(`Project root: ${projectRoot}`);
  console.log(`Remote health: ${skipRemote ? "<skipped>" : productionUrl}`);
  console.log("");
  printChecks(checks);

  const hasError = checks.some((check) => check.status === "error");
  const hasWarning = checks.some((check) => check.status === "warning");

  console.log("");

  if (!hasError && !hasWarning) {
    console.log("Cloud doctor result: ready");
    return;
  }

  if (hasError) {
    console.log("Cloud doctor result: blocked");
  } else {
    console.log("Cloud doctor result: needs attention");
  }

  if (strictMode && hasError) {
    process.exitCode = 1;
  }
}

main();
