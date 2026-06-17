import { randomUUID } from "node:crypto";

import { after, NextResponse } from "next/server";

import { resolveGenerationContext } from "@/lib/content/generation-context-service";
import { generateTaskContentBundle } from "@/lib/content/mock-generation-service";
import { buildTaskGenerationTrace } from "@/lib/content/task-generation-trace";
import { searchWebForContent } from "@/lib/content/web-search-service";
import { generateWechatCoverImage } from "@/lib/content/wechat-cover-image-generation-service";
import { migrateDatabase } from "@/lib/db/migrate";
import {
  createMonitoringRepository,
  getTopicLibraryEntriesByIds,
  listTopicLibraryEntries,
  updateTopicLibraryEntryGenerationResult,
  type PersistedTopicLibraryEntry,
  type TopicLibraryCoverStatus
} from "@/lib/db/monitoring-repository";
import { upsertGeneratedDraft } from "@/lib/db/repositories/draft-repository";
import { createHistoryAction } from "@/lib/db/repositories/history-action-repository";
import {
  createTaskContents,
  updateTaskPlatformContent
} from "@/lib/db/repositories/task-content-repository";
import { createTask } from "@/lib/db/repositories/task-repository";

export const runtime = "nodejs";

type BatchGenerateBody = {
  entryIds?: string[];
  autoGenerateWechatCover?: boolean;
  enableWebSearch?: boolean;
};

type BatchGenerateResultItem = {
  entryId: string;
  title: string;
  success: boolean;
  generatedTaskId: string | null;
  coverStatus: TopicLibraryCoverStatus;
  message: string;
};

function normalizeBody(value: unknown): BatchGenerateBody {
  if (!value || typeof value !== "object") {
    return {};
  }

  const body = value as Record<string, unknown>;

  return {
    entryIds: Array.isArray(body.entryIds)
      ? body.entryIds
          .map((entryId) => (typeof entryId === "string" ? entryId.trim() : ""))
          .filter(Boolean)
      : undefined,
    autoGenerateWechatCover:
      typeof body.autoGenerateWechatCover === "boolean"
        ? body.autoGenerateWechatCover
        : undefined,
    enableWebSearch:
      typeof body.enableWebSearch === "boolean" ? body.enableWebSearch : undefined
  };
}

function buildTopicPrompt(entry: PersistedTopicLibraryEntry) {
  return [
    "你是内容创作与自动分发 Agent。",
    "请基于以下选题输出一篇可发布到公众号的完整文章草稿。",
    "",
    `分类：${entry.categoryName}`,
    `关键词：${entry.keyword}`,
    `选题标题：${entry.title}`,
    `选题简介：${entry.intro}`,
    `为什么现在做：${entry.whyNow}`,
    `爆点方向：${entry.hook}`,
    `增长方向：${entry.growth}`,
    "",
    "写作要求：",
    "1. 标题、摘要、正文结构完整。",
    "2. 给出清晰小标题和可执行观点。",
    "3. 不编造无法验证的数据。"
  ].join("\n");
}

function buildTopicDraftId(entryId: string) {
  return `topic-library-draft:${entryId}`;
}

async function createWechatTaskFromTopic(input: {
  entry: PersistedTopicLibraryEntry;
  enableWebSearch: boolean;
  autoGenerateWechatCover: boolean;
}) {
  const taskId = randomUUID();
  const prompt = buildTopicPrompt(input.entry);
  const platforms = ["wechat"] as const;
  const generationContext = await resolveGenerationContext([...platforms]);
  const webSearch = await searchWebForContent({
    enabled: input.enableWebSearch,
    prompt
  });
  const bundle = await generateTaskContentBundle({
    prompt,
    platforms: [...platforms],
    appliedSkillNamesByPlatform: generationContext.appliedRulesByPlatform,
    imageRulesByPlatform: generationContext.imageRulesByPlatform,
    enableXiaohongshuImageGeneration: false,
    webSearchResults: webSearch.results
  });
  const generationTrace = await buildTaskGenerationTrace({
    prompt,
    platforms: [...platforms],
    skills: generationContext.skillSnapshots,
    webSearch
  });
  const title = bundle.wechat?.title ?? input.entry.title.slice(0, 24);

  await createTask({
    id: taskId,
    title,
    userInput: prompt,
    selectedPlatforms: [...platforms],
    status: "ready"
  });
  await createTaskContents(taskId, bundle);
  await createHistoryAction({
    taskId,
    actionType: "task_created",
    payload: {
      title,
      platforms,
      sourceTopicLibraryEntryId: input.entry.id,
      enableWebSearch: input.enableWebSearch,
      enableXiaohongshuImageGeneration: false,
      generationTrace
    }
  });

  let coverStatus: TopicLibraryCoverStatus = "idle";
  let coverErrorMessage: string | null = null;

  if (input.autoGenerateWechatCover && bundle.wechat) {
    try {
      const coverResult = await generateWechatCoverImage({
        content: bundle.wechat
      });

      await updateTaskPlatformContent({
        taskId,
        platform: "wechat",
        title: coverResult.content.title,
        body: coverResult.content
      });
      await createHistoryAction({
        taskId,
        actionType: "wechat_cover_generated",
        payload: {
          candidateId: coverResult.coverImageAsset.id,
          provider: coverResult.coverImageAsset.provider,
          size: coverResult.coverImageAsset.size ?? null,
          status: coverResult.coverImageAsset.status ?? "ready"
        }
      });
      coverStatus = "generated";
    } catch (error) {
      coverStatus = "failed";
      coverErrorMessage =
        error instanceof Error ? error.message : "公众号首图自动生成失败";
    }
  }

  return {
    taskId,
    prompt,
    title,
    coverStatus,
    coverErrorMessage
  };
}

async function processTopicGenerationInBackground(input: {
  entry: PersistedTopicLibraryEntry;
  autoGenerateWechatCover: boolean;
  enableWebSearch: boolean;
}) {
  try {
    const created = await createWechatTaskFromTopic({
      entry: input.entry,
      enableWebSearch: input.enableWebSearch,
      autoGenerateWechatCover: input.autoGenerateWechatCover
    });

    const repository = createMonitoringRepository();
    try {
      await updateTopicLibraryEntryGenerationResult(repository, {
        id: input.entry.id,
        generationStatus: "generated",
        coverStatus: created.coverStatus,
        generatedTaskId: created.taskId,
        lastErrorMessage: created.coverErrorMessage,
        selected: false
      });
    } finally {
      repository.database.close();
    }

    await upsertGeneratedDraft({
      id: buildTopicDraftId(input.entry.id),
      title: created.title,
      prompt: created.prompt,
      selectedPlatforms: ["wechat"],
      status: "generated",
      lastGeneratedTaskId: created.taskId
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "鎵归噺鐢熸垚澶辫触";
    const repository = createMonitoringRepository();

    try {
      await updateTopicLibraryEntryGenerationResult(repository, {
        id: input.entry.id,
        generationStatus: "failed",
        coverStatus: "failed",
        generatedTaskId: null,
        lastErrorMessage: errorMessage
      });
    } finally {
      repository.database.close();
    }

    await upsertGeneratedDraft({
      id: buildTopicDraftId(input.entry.id),
      title: input.entry.title,
      prompt: buildTopicPrompt(input.entry),
      selectedPlatforms: ["wechat"],
      status: "failed",
      lastGeneratedTaskId: null
    });
  }
}

async function runBatchGenerationInBackground(input: {
  entries: PersistedTopicLibraryEntry[];
  autoGenerateWechatCover: boolean;
  enableWebSearch: boolean;
}) {
  for (const entry of input.entries) {
    await processTopicGenerationInBackground({
      entry,
      autoGenerateWechatCover: input.autoGenerateWechatCover,
      enableWebSearch: input.enableWebSearch
    });
  }
}

export async function POST(request: Request) {
  migrateDatabase();
  const repository = createMonitoringRepository();

  try {
    const body = normalizeBody(await request.json());
    const autoGenerateWechatCover = body.autoGenerateWechatCover ?? true;
    const enableWebSearch = body.enableWebSearch ?? true;
    const targetEntries =
      body.entryIds && body.entryIds.length > 0
        ? await getTopicLibraryEntriesByIds(repository, body.entryIds)
        : await listTopicLibraryEntries(repository, { selectedOnly: true });
    const entries = targetEntries.filter((entry) => !entry.isDeleted);

    if (entries.length === 0) {
      return NextResponse.json(
        {
          message: "没有可批量生成的选题，请先在选题库勾选。",
          results: []
        },
        { status: 400 }
      );
    }

    for (const entry of entries) {
      await updateTopicLibraryEntryGenerationResult(repository, {
        id: entry.id,
        generationStatus: "generating",
        coverStatus: "idle",
        generatedTaskId: null,
        lastErrorMessage: null
      });

      await upsertGeneratedDraft({
        id: buildTopicDraftId(entry.id),
        title: entry.title,
        prompt: buildTopicPrompt(entry),
        selectedPlatforms: ["wechat"],
        status: "generating",
        lastGeneratedTaskId: null
      });
    }

    const queuedResults: BatchGenerateResultItem[] = entries.map((entry) => ({
      entryId: entry.id,
      title: entry.title,
      success: true,
      generatedTaskId: null,
      coverStatus: "idle",
      message: "已加入后台生成队列"
    }));

    after(() =>
      runBatchGenerationInBackground({
        entries,
        autoGenerateWechatCover,
        enableWebSearch
      })
    );

    return NextResponse.json(
      {
        total: entries.length,
        queuedCount: entries.length,
        successCount: 0,
        failedCount: 0,
        coverGeneratedCount: 0,
        coverFailedCount: 0,
        message: `已开始后台批量生成（${entries.length} 个选题）。可前往内容创作工作台，在需求草稿箱查看“生成中”状态。`,
        results: queuedResults
      },
      { status: 202 }
    );
  } finally {
    repository.database.close();
  }
}
