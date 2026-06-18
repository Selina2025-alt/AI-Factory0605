import path from "node:path";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const DEFAULT_TASK_NAME = "ContentPulseDailyAnalysis";
const VERCEL_CRON_SCHEDULE_LABEL = "0 0 * * * UTC / 08:00 Asia/Shanghai";

function resolveRunnerScript(projectRoot = process.cwd()) {
  return path.join(projectRoot, "scripts", "run-daily-analysis.cmd");
}

export interface SyncDailyAnalysisTaskInput {
  enabled: boolean;
  time: string;
  projectRoot?: string;
  taskName?: string;
}

export interface SyncDailyAnalysisTaskResult {
  ok: boolean;
  taskName: string;
  message: string;
}

function normalizeTime(input: string) {
  const match = input.trim().match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    throw new Error("Invalid time format. Expected HH:mm");
  }

  const hours = Number.parseInt(match[1] ?? "0", 10);
  const minutes = Number.parseInt(match[2] ?? "0", 10);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error("Invalid time value. Expected HH:mm");
  }

  return `${`${hours}`.padStart(2, "0")}:${`${minutes}`.padStart(2, "0")}`;
}

function isVercelCronManagedRuntime() {
  return (
    process.env.VERCEL === "1" ||
    process.env.APP_DATABASE_PROVIDER?.trim().toLowerCase() === "supabase"
  );
}

function runSchtasks(args: string[]) {
  return execFileSync("schtasks.exe", args, {
    encoding: "utf8",
    windowsHide: true
  });
}

export function syncDailyAnalysisTask(
  input: SyncDailyAnalysisTaskInput
): SyncDailyAnalysisTaskResult {
  const taskName = input.taskName ?? DEFAULT_TASK_NAME;
  const time = normalizeTime(input.time);

  if (isVercelCronManagedRuntime()) {
    return {
      ok: true,
      taskName,
      message: input.enabled
        ? `Vercel Cron is managed by vercel.json (${VERCEL_CRON_SCHEDULE_LABEL}). Saved preferred analysis time ${time}; update vercel.json and redeploy to change the actual production schedule.`
        : "Daily analysis disabled in app settings; the Vercel Cron route will skip while settings remain disabled."
    };
  }

  if (process.platform !== "win32") {
    return {
      ok: false,
      taskName,
      message: "Daily analysis task is only supported on Windows outside Vercel"
    };
  }

  const projectRoot = input.projectRoot ?? process.cwd();
  const runnerScript = resolveRunnerScript(projectRoot);

  if (!existsSync(runnerScript)) {
    throw new Error(`Missing daily analysis runner script: ${runnerScript}`);
  }

  if (!input.enabled) {
    try {
      runSchtasks(["/Delete", "/TN", taskName, "/F"]);
    } catch {
      return {
        ok: true,
        taskName,
        message: "Daily analysis task disabled"
      };
    }

    return {
      ok: true,
      taskName,
      message: "Daily analysis task disabled"
    };
  }

  const taskCommand = `cmd.exe /c "${runnerScript}"`;

  runSchtasks([
    "/Create",
    "/TN",
    taskName,
    "/SC",
    "DAILY",
    "/ST",
    time,
    "/TR",
    taskCommand,
    "/F"
  ]);

  return {
    ok: true,
    taskName,
    message: `Daily analysis task scheduled at ${time}`
  };
}
