import { NextResponse } from "next/server";

import { toUserFacingError } from "@/lib/content/error-feedback";
import { regenerateXiaohongshuImageAsset } from "@/lib/content/xiaohongshu-image-generation-service";
import { migrateDatabase } from "@/lib/db/migrate";
import {
  getTaskBundle,
  updateTaskPlatformContent
} from "@/lib/db/repositories/task-content-repository";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ taskId: string; imageId: string }> }
) {
  migrateDatabase();

  const { taskId, imageId } = await context.params;
  const bundle = await getTaskBundle(taskId);

  if (!bundle.xiaohongshu) {
    return NextResponse.json(
      { message: "Xiaohongshu content not found" },
      { status: 404 }
    );
  }

  try {
    const result = await regenerateXiaohongshuImageAsset({
      content: bundle.xiaohongshu,
      imageId
    });

    await updateTaskPlatformContent({
      taskId,
      platform: "xiaohongshu",
      title: result.content.title,
      body: result.content
    });

    return NextResponse.json(result);
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
