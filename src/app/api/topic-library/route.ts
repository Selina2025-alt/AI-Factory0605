import { NextResponse } from "next/server";

import {
  createMonitoringRepository,
  listTopicLibraryEntries,
  softDeleteTopicLibraryEntries,
  updateTopicLibrarySelection,
  upsertTopicLibraryEntry
} from "@/lib/db/monitoring-repository";

type TopicPayload = {
  id: string;
  title: string;
  intro: string;
  whyNow: string;
  hook: string;
  growth: string;
  supportContentIds: string[];
};

type CreateTopicLibraryBody = {
  categoryId?: string;
  categoryName?: string;
  keyword?: string;
  reportDate?: string;
  sourceSnapshotId?: string;
  topics?: TopicPayload[];
};

type PatchTopicLibraryBody = {
  ids?: string[];
  selected?: boolean;
  isDeleted?: boolean;
};

function normalizeTopic(topic: TopicPayload) {
  return {
    id: topic.id.trim(),
    title: topic.title.trim(),
    intro: topic.intro.trim(),
    whyNow: topic.whyNow.trim(),
    hook: topic.hook.trim(),
    growth: topic.growth.trim(),
    supportContentIds: Array.from(
      new Set(
        (topic.supportContentIds ?? [])
          .map((contentId) => contentId.trim())
          .filter(Boolean)
      )
    )
  };
}

function normalizeCreateBody(value: unknown): CreateTopicLibraryBody {
  if (!value || typeof value !== "object") {
    return {};
  }

  const body = value as Record<string, unknown>;

  return {
    categoryId:
      typeof body.categoryId === "string" ? body.categoryId.trim() : undefined,
    categoryName:
      typeof body.categoryName === "string" ? body.categoryName.trim() : undefined,
    keyword: typeof body.keyword === "string" ? body.keyword.trim() : undefined,
    reportDate:
      typeof body.reportDate === "string" ? body.reportDate.trim() : undefined,
    sourceSnapshotId:
      typeof body.sourceSnapshotId === "string"
        ? body.sourceSnapshotId.trim()
        : undefined,
    topics: Array.isArray(body.topics)
      ? (body.topics as TopicPayload[])
      : undefined
  };
}

function normalizePatchBody(value: unknown): PatchTopicLibraryBody {
  if (!value || typeof value !== "object") {
    return {};
  }

  const body = value as Record<string, unknown>;

  return {
    ids: Array.isArray(body.ids)
      ? body.ids
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean)
      : undefined,
    selected: typeof body.selected === "boolean" ? body.selected : undefined,
    isDeleted: typeof body.isDeleted === "boolean" ? body.isDeleted : undefined
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const includeDeleted = searchParams.get("includeDeleted") === "true";
  const selectedOnly = searchParams.get("selectedOnly") === "true";
  const repository = createMonitoringRepository();

  try {
    const items = await listTopicLibraryEntries(repository, {
      includeDeleted,
      selectedOnly
    });

    return NextResponse.json({ items });
  } finally {
    repository.database.close();
  }
}

export async function POST(request: Request) {
  const repository = createMonitoringRepository();

  try {
    const body = normalizeCreateBody(await request.json());
    const categoryId = body.categoryId ?? "";
    const categoryName = body.categoryName ?? "";
    const keyword = body.keyword?.toLowerCase() ?? "";
    const topics = (body.topics ?? []).map(normalizeTopic).filter((topic) => topic.id);

    if (!categoryId || !categoryName || !keyword || topics.length === 0) {
      return NextResponse.json(
        {
          error:
            "categoryId, categoryName, keyword and topics are required to add topic library entries"
        },
        { status: 400 }
      );
    }

    for (const topic of topics) {
      await upsertTopicLibraryEntry(repository, {
        id: `topic-library:${topic.id}`,
        sourceTopicId: topic.id,
        sourceSnapshotId: body.sourceSnapshotId ?? null,
        categoryId,
        categoryName,
        keyword,
        reportDate: body.reportDate ?? null,
        title: topic.title,
        intro: topic.intro,
        whyNow: topic.whyNow,
        hook: topic.hook,
        growth: topic.growth,
        supportContentIds: topic.supportContentIds,
        selected: true,
        isDeleted: false,
        generationStatus: "idle",
        coverStatus: "idle",
        generatedTaskId: null,
        lastErrorMessage: null
      });
    }

    return NextResponse.json({
      items: await listTopicLibraryEntries(repository),
      upsertedCount: topics.length
    });
  } finally {
    repository.database.close();
  }
}

export async function PATCH(request: Request) {
  const repository = createMonitoringRepository();

  try {
    const body = normalizePatchBody(await request.json());
    const ids = body.ids ?? [];

    if (ids.length === 0) {
      return NextResponse.json(
        {
          error: "ids are required"
        },
        { status: 400 }
      );
    }

    if (typeof body.selected === "boolean") {
      await updateTopicLibrarySelection(repository, ids, body.selected);
    }

    if (typeof body.isDeleted === "boolean") {
      await softDeleteTopicLibraryEntries(repository, ids, body.isDeleted);
    }

    return NextResponse.json({
      items: await listTopicLibraryEntries(repository)
    });
  } finally {
    repository.database.close();
  }
}
