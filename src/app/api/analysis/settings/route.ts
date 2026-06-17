import { NextRequest, NextResponse } from "next/server";

import { DEFAULT_SILICONFLOW_MODEL } from "@/lib/analysis-models";
import {
  createMonitoringRepository,
  getGlobalAnalysisSettings,
  saveGlobalAnalysisSettings
} from "@/lib/db/monitoring-repository";
import { syncDailyAnalysisTask } from "@/lib/analysis-scheduler";
import { resolveAuthRequestContext } from "@/lib/auth/request-context";

interface AnalysisSettingsRequestBody {
  enabled?: boolean;
  time?: string;
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

export async function GET(request: NextRequest) {
  const repository = createMonitoringRepository();

  try {
    const authContext = await resolveAuthRequestContext(repository, request);

    if (!authContext) {
      return NextResponse.json({ error: "authentication required" }, { status: 401 });
    }

    const workspaceId = authContext.user.workspaceId;
    const settings = await getGlobalAnalysisSettings(repository, workspaceId);

    return NextResponse.json({ settings });
  } finally {
    repository.database.close();
  }
}

export async function POST(request: NextRequest) {
  const repository = createMonitoringRepository();

  try {
    const authContext = await resolveAuthRequestContext(repository, request);

    if (!authContext) {
      return NextResponse.json({ error: "authentication required" }, { status: 401 });
    }

    const workspaceId = authContext.user.workspaceId;
    const body = (await request.json()) as AnalysisSettingsRequestBody;
    const settings = {
      enabled: body.enabled ?? true,
      time: normalizeTime(body.time ?? "08:00"),
      provider: "SiliconFlow",
      model: DEFAULT_SILICONFLOW_MODEL
    };

    await saveGlobalAnalysisSettings(repository, settings, workspaceId);
    const taskResult = syncDailyAnalysisTask({
      enabled: settings.enabled,
      time: settings.time,
      taskName: `ContentPulseDailyAnalysis-${workspaceId}`
    });

    return NextResponse.json({
      settings,
      task: taskResult
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save analysis settings";

    return NextResponse.json(
      {
        error: message
      },
      { status: 500 }
    );
  } finally {
    repository.database.close();
  }
}
