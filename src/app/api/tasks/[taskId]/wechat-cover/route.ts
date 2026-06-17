import { NextResponse } from "next/server";

import { toUserFacingError } from "@/lib/content/error-feedback";
import { generateWechatCoverImage } from "@/lib/content/wechat-cover-image-generation-service";
import { migrateDatabase } from "@/lib/db/migrate";
import { createHistoryAction } from "@/lib/db/repositories/history-action-repository";
import {
  getTaskBundle,
  updateTaskPlatformContent
} from "@/lib/db/repositories/task-content-repository";

export const runtime = "nodejs";

type RequestBody = {
  candidateId?: string;
};

function normalizeRequestBody(value: unknown): RequestBody {
  if (!value || typeof value !== "object") {
    return {};
  }

  const body = value as Record<string, unknown>;

  return {
    candidateId: typeof body.candidateId === "string" ? body.candidateId.trim() : undefined
  };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ taskId: string }> }
) {
  migrateDatabase();

  const { taskId } = await context.params;
  const bundle = await getTaskBundle(taskId);

  if (!bundle.wechat) {
    return NextResponse.json(
      { message: "Wechat content not found" },
      { status: 404 }
    );
  }

  let rawBody: unknown = {};

  try {
    rawBody = await request.json();
  } catch {
    rawBody = {};
  }

  const body = normalizeRequestBody(rawBody);

  try {
    const result = await generateWechatCoverImage({
      content: bundle.wechat,
      candidateId: body.candidateId
    });

    await updateTaskPlatformContent({
      taskId,
      platform: "wechat",
      title: result.content.title,
      body: result.content
    });
    await createHistoryAction({
      taskId,
      actionType: "wechat_cover_generated",
      payload: {
        candidateId: result.coverImageAsset.id,
        provider: result.coverImageAsset.provider,
        size: result.coverImageAsset.size ?? null,
        status: result.coverImageAsset.status ?? "ready"
      }
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
