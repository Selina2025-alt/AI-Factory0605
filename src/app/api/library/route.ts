import { NextResponse } from "next/server";

import { migrateDatabase } from "@/lib/db/migrate";
import { getDraftById } from "@/lib/db/repositories/draft-repository";
import {
  createHistoryAction,
  listHistoryActions
} from "@/lib/db/repositories/history-action-repository";
import {
  createLibraryEntry,
  getLibraryEntry
} from "@/lib/db/repositories/library-entry-repository";
import { getTaskBundle } from "@/lib/db/repositories/task-content-repository";
import { getTaskById } from "@/lib/db/repositories/task-repository";
import {
  getWechatLibraryItem,
  getWechatLibraryPayload
} from "@/lib/library/wechat-library-service";

export const runtime = "nodejs";

export async function GET() {
  migrateDatabase();

  return NextResponse.json(await getWechatLibraryPayload());
}

export async function POST(request: Request) {
  migrateDatabase();

  const body = (await request.json()) as {
    draftId?: string;
    taskId?: string;
  };

  if (!body.draftId && !body.taskId) {
    return NextResponse.json(
      { message: "draftId or taskId is required" },
      { status: 400 }
    );
  }

  let sourceDraftId: string | null = null;
  let taskId: string | null = null;

  if (body.draftId) {
    const draft = await getDraftById(body.draftId);

    if (!draft?.lastGeneratedTaskId) {
      return NextResponse.json(
        { message: "Draft has no generated article to archive yet" },
        { status: 400 }
      );
    }

    sourceDraftId = draft.id;
    taskId = draft.lastGeneratedTaskId;
  } else if (body.taskId) {
    taskId = body.taskId;

    const createdAction = (await listHistoryActions()).find(
      (action) => action.taskId === body.taskId && action.actionType === "task_created"
    );
    const rawSourceDraftId = createdAction?.payload.sourceDraftId;

    sourceDraftId = typeof rawSourceDraftId === "string" ? rawSourceDraftId : null;
  }

  if (!taskId) {
    return NextResponse.json(
      { message: "Could not resolve a task for this library action" },
      { status: 400 }
    );
  }

  const task = await getTaskById(taskId);
  const bundle = await getTaskBundle(taskId);

  if (!task || !bundle.wechat) {
    return NextResponse.json(
      { message: "Generated wechat article not found for this task" },
      { status: 404 }
    );
  }

  const existingEntry = await getLibraryEntry(task.id);

  await createLibraryEntry({
    taskId: task.id,
    sourceDraftId,
    platform: "wechat"
  });

  if (!existingEntry) {
    await createHistoryAction({
      taskId: task.id,
      actionType: "library_saved",
      payload: {
        title: bundle.wechat.title,
        sourceDraftId,
        platform: "wechat"
      }
    });
  }

  return NextResponse.json(
    {
      item: await getWechatLibraryItem(task.id)
    },
    { status: existingEntry ? 200 : 201 }
  );
}
