import { NextResponse } from "next/server";

import { getTaskGenerationTrace } from "@/lib/content/task-generation-trace";
import { migrateDatabase } from "@/lib/db/migrate";
import { getTaskBundle } from "@/lib/db/repositories/task-content-repository";
import {
  deleteTask,
  getTaskById,
  renameTask
} from "@/lib/db/repositories/task-repository";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ taskId: string }> }
) {
  migrateDatabase();

  const { taskId } = await context.params;
  const task = await getTaskById(taskId);

  if (!task) {
    return NextResponse.json({ message: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({
    task,
    bundle: await getTaskBundle(taskId),
    trace: await getTaskGenerationTrace(taskId)
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ taskId: string }> }
) {
  migrateDatabase();

  const { taskId } = await context.params;
  const body = (await request.json()) as { title?: string };

  if (body.title?.trim()) {
    await renameTask(taskId, body.title.trim());
  }

  return NextResponse.json(await getTaskById(taskId));
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ taskId: string }> }
) {
  migrateDatabase();

  const { taskId } = await context.params;
  await deleteTask(taskId);

  return NextResponse.json({ success: true });
}
