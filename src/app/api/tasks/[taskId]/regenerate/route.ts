import { NextResponse } from "next/server";

import { resolveGenerationContext } from "@/lib/content/generation-context-service";
import { generateTaskContentBundle } from "@/lib/content/mock-generation-service";
import { toUserFacingError } from "@/lib/content/error-feedback";
import { buildTaskGenerationTrace } from "@/lib/content/task-generation-trace";
import { searchWebForContent } from "@/lib/content/web-search-service";
import { migrateDatabase } from "@/lib/db/migrate";
import {
  createHistoryAction,
  listHistoryActions
} from "@/lib/db/repositories/history-action-repository";
import {
  getTaskBundle,
  replaceTaskContents,
  upsertTaskPlatformContent
} from "@/lib/db/repositories/task-content-repository";
import {
  getTaskById,
  renameTask,
  updateTaskSelectedPlatforms
} from "@/lib/db/repositories/task-repository";
import type {
  GeneratedTaskContentBundle,
  PlatformId,
  TwitterMode
} from "@/lib/content-creation-types";

export const runtime = "nodejs";

const ALL_PLATFORMS: PlatformId[] = [
  "wechat",
  "xiaohongshu",
  "twitter",
  "videoScript"
];

async function readRegenerateBody(request: Request) {
  try {
    return (await request.json()) as {
      enableWebSearch?: boolean;
      enableXiaohongshuImageGeneration?: boolean;
      platform?: PlatformId;
      includePlatform?: boolean;
      twitterLanguage?: string;
      twitterModePreference?: TwitterMode;
    };
  } catch {
    return {};
  }
}

function normalizeTwitterModePreference(value: unknown): TwitterMode | undefined {
  return value === "auto" || value === "single" || value === "thread" ? value : undefined;
}

function normalizeTwitterLanguage(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : "English";
}

function normalizeRequestedPlatform(value: unknown) {
  return ALL_PLATFORMS.find((platform) => platform === value);
}

function normalizeBoolean(value: unknown) {
  return value === true;
}

function resolveTargetPlatform(input: {
  requestedPlatform: PlatformId | undefined;
  selectedPlatforms: PlatformId[];
  includePlatform: boolean;
}) {
  if (!input.requestedPlatform) {
    return undefined;
  }

  if (input.selectedPlatforms.includes(input.requestedPlatform)) {
    return input.requestedPlatform;
  }

  return input.includePlatform ? input.requestedPlatform : undefined;
}

function getContentMeta(
  platform: PlatformId,
  content: NonNullable<GeneratedTaskContentBundle[PlatformId]>
) {
  switch (platform) {
    case "wechat": {
      const article = content as NonNullable<GeneratedTaskContentBundle["wechat"]>;

      return {
        contentType: "article",
        title: article.title
      };
    }
    case "xiaohongshu": {
      const note = content as NonNullable<GeneratedTaskContentBundle["xiaohongshu"]>;

      return {
        contentType: "note",
        title: note.title
      };
    }
    case "twitter": {
      const twitter = content as NonNullable<GeneratedTaskContentBundle["twitter"]>;

      return {
        contentType: twitter.mode === "single" ? "tweet" : "thread",
        title: twitter.mode === "single" ? "Twitter Single" : "Twitter Thread"
      };
    }
    case "videoScript": {
      const script = content as NonNullable<GeneratedTaskContentBundle["videoScript"]>;

      return {
        contentType: "script",
        title: script.title
      };
    }
  }
}

async function getPreviousWebSearchPreference(taskId: string) {
  const previousGenerationAction = (await listHistoryActions()).find(
    (action) =>
      action.taskId === taskId &&
      (action.actionType === "task_regenerated" ||
        action.actionType === "task_created") &&
      typeof action.payload.enableWebSearch === "boolean"
  );

  return Boolean(previousGenerationAction?.payload.enableWebSearch);
}

async function getPreviousXiaohongshuImageGenerationPreference(taskId: string) {
  const previousGenerationAction = (await listHistoryActions()).find(
    (action) =>
      action.taskId === taskId &&
      (action.actionType === "task_regenerated" ||
        action.actionType === "task_created") &&
      typeof action.payload.enableXiaohongshuImageGeneration === "boolean"
  );

  return Boolean(previousGenerationAction?.payload.enableXiaohongshuImageGeneration);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ taskId: string }> }
) {
  migrateDatabase();

  const { taskId } = await context.params;
  const task = await getTaskById(taskId);

  if (!task) {
    return NextResponse.json({ message: "Task not found" }, { status: 404 });
  }

  try {
    const body = await readRegenerateBody(request);
    const includePlatform = normalizeBoolean(body.includePlatform);
    const requestedPlatform = normalizeRequestedPlatform(body.platform);
    const targetPlatform = resolveTargetPlatform({
      requestedPlatform,
      selectedPlatforms: task.selectedPlatforms,
      includePlatform
    });

    if (body.platform && !requestedPlatform) {
      return NextResponse.json(
        { message: "Unknown target platform" },
        { status: 400 }
      );
    }

    if (requestedPlatform && !targetPlatform) {
      return NextResponse.json(
        {
          message:
            "Requested platform is not enabled for this task. Pass includePlatform=true to add it."
        },
        { status: 400 }
      );
    }

    let selectedPlatforms = task.selectedPlatforms;

    if (
      targetPlatform &&
      includePlatform &&
      !task.selectedPlatforms.includes(targetPlatform)
    ) {
      selectedPlatforms = [...task.selectedPlatforms, targetPlatform];
      await updateTaskSelectedPlatforms(taskId, selectedPlatforms);
    }

    const targetPlatforms = targetPlatform ? [targetPlatform] : task.selectedPlatforms;
    const twitterModePreference = normalizeTwitterModePreference(
      body.twitterModePreference
    );
    const twitterLanguage =
      targetPlatforms.includes("twitter")
        ? normalizeTwitterLanguage(body.twitterLanguage)
        : undefined;
    const enableWebSearch =
      typeof body.enableWebSearch === "boolean"
        ? body.enableWebSearch
        : await getPreviousWebSearchPreference(taskId);
    const enableXiaohongshuImageGeneration =
      typeof body.enableXiaohongshuImageGeneration === "boolean"
        ? body.enableXiaohongshuImageGeneration
        : await getPreviousXiaohongshuImageGenerationPreference(taskId);
    const generationContext = await resolveGenerationContext(targetPlatforms);
    const webSearch = await searchWebForContent({
      enabled: enableWebSearch,
      prompt: task.userInput
    });
    const bundle = await generateTaskContentBundle({
      prompt: task.userInput,
      platforms: targetPlatforms,
      appliedSkillNamesByPlatform: generationContext.appliedRulesByPlatform,
      imageRulesByPlatform: generationContext.imageRulesByPlatform,
      enableXiaohongshuImageGeneration,
      twitterLanguage,
      twitterModePreference,
      webSearchResults: webSearch.results
    });
    const generationTrace = await buildTaskGenerationTrace({
      prompt: task.userInput,
      platforms: targetPlatforms,
      skills: generationContext.skillSnapshots,
      webSearch
    });
    let title =
      bundle.wechat?.title ??
      bundle.xiaohongshu?.title ??
      bundle.videoScript?.title ??
      task.title;

    if (targetPlatform) {
      const generatedContent = bundle[targetPlatform];

      if (!generatedContent) {
        throw new Error("Target platform did not return generated content");
      }

      const meta = getContentMeta(targetPlatform, generatedContent);

      await upsertTaskPlatformContent({
        taskId,
        platform: targetPlatform,
        contentType: meta.contentType,
        title: meta.title,
        body: generatedContent
      });

      title = targetPlatform === "twitter" ? task.title : meta.title;
    } else {
      await replaceTaskContents(taskId, bundle);
    }

    await renameTask(taskId, title);
    await createHistoryAction({
      taskId,
      actionType: "task_regenerated",
      payload: {
        title,
        platforms: targetPlatforms,
        targetPlatform: targetPlatform ?? null,
        includePlatform,
        selectedPlatforms,
        enableWebSearch,
        enableXiaohongshuImageGeneration,
        twitterLanguage,
        twitterModePreference,
        generationTrace
      }
    });

    return NextResponse.json({
      task: await getTaskById(taskId),
      bundle: await getTaskBundle(taskId),
      trace: generationTrace
    });
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

