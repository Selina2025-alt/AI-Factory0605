import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { resolveGenerationContext } from "@/lib/content/generation-context-service";
import { generateTaskContentBundle } from "@/lib/content/mock-generation-service";
import { toUserFacingError } from "@/lib/content/error-feedback";
import { buildTaskGenerationTrace } from "@/lib/content/task-generation-trace";
import { searchWebForContent } from "@/lib/content/web-search-service";
import { migrateDatabase } from "@/lib/db/migrate";
import { markDraftGenerated } from "@/lib/db/repositories/draft-repository";
import { createHistoryAction } from "@/lib/db/repositories/history-action-repository";
import { createTaskContents } from "@/lib/db/repositories/task-content-repository";
import { createTask, listTasks } from "@/lib/db/repositories/task-repository";
import type { PlatformId } from "@/lib/content-creation-types";

export const runtime = "nodejs";

export async function GET() {
  migrateDatabase();

  return NextResponse.json(await listTasks());
}

export async function POST(request: Request) {
  migrateDatabase();

  try {
    const body = (await request.json()) as {
      prompt: string;
      platforms: PlatformId[];
      sourceDraftId?: string;
      enableWebSearch?: boolean;
      enableXiaohongshuImageGeneration?: boolean;
    };

    const taskId = randomUUID();
    const generationContext = await resolveGenerationContext(body.platforms);
    const webSearch = await searchWebForContent({
      enabled: Boolean(body.enableWebSearch),
      prompt: body.prompt
    });
    const bundle = await generateTaskContentBundle({
      prompt: body.prompt,
      platforms: body.platforms,
      appliedSkillNamesByPlatform: generationContext.appliedRulesByPlatform,
      imageRulesByPlatform: generationContext.imageRulesByPlatform,
      enableXiaohongshuImageGeneration: Boolean(
        body.enableXiaohongshuImageGeneration
      ),
      webSearchResults: webSearch.results
    });
    const generationTrace = await buildTaskGenerationTrace({
      prompt: body.prompt,
      platforms: body.platforms,
      skills: generationContext.skillSnapshots,
      webSearch
    });

    const title =
      bundle.wechat?.title ??
      bundle.xiaohongshu?.title ??
      bundle.videoScript?.title ??
      body.prompt.slice(0, 24);

    await createTask({
      id: taskId,
      title,
      userInput: body.prompt,
      selectedPlatforms: body.platforms,
      status: "ready"
    });
    await createTaskContents(taskId, bundle);
    await createHistoryAction({
      taskId,
      actionType: "task_created",
      payload: {
        title,
        platforms: body.platforms,
        sourceDraftId: body.sourceDraftId ?? null,
        enableWebSearch: Boolean(body.enableWebSearch),
        enableXiaohongshuImageGeneration: Boolean(
          body.enableXiaohongshuImageGeneration
        ),
        generationTrace
      }
    });

    if (body.sourceDraftId) {
      await markDraftGenerated(body.sourceDraftId, taskId);
    }

    return NextResponse.json({ id: taskId, title, bundle }, { status: 201 });
  } catch (error) {
    const mappedError = toUserFacingError(error);

    return NextResponse.json(
      {
        code: mappedError.code,
        message: mappedError.message,
        detail: mappedError.detail
      },
      { status: 502 }
    );
  }
}
