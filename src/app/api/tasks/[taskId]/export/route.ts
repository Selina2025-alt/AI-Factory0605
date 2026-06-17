import { NextResponse } from "next/server";

import { toUserFacingError } from "@/lib/content/error-feedback";
import { migrateDatabase } from "@/lib/db/migrate";
import { getTaskBundle } from "@/lib/db/repositories/task-content-repository";
import { getTaskById } from "@/lib/db/repositories/task-repository";
import {
  buildTaskExportPayload,
  type TaskExportFormat
} from "@/lib/export/task-export-service";

export const runtime = "nodejs";

const supportedFormats: TaskExportFormat[] = [
  "markdown",
  "html",
  "image-package",
  "video-script-doc"
];

function getRequestedFormat(request: Request) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");

  if (!format || !supportedFormats.includes(format as TaskExportFormat)) {
    return null;
  }

  return format as TaskExportFormat;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ taskId: string }> }
) {
  migrateDatabase();

  const format = getRequestedFormat(request);

  if (!format) {
    return NextResponse.json(
      {
        code: "invalid_request",
        message:
          "Invalid export format. Use markdown, html, image-package, or video-script-doc."
      },
      { status: 400 }
    );
  }

  const { taskId } = await context.params;
  const task = await getTaskById(taskId);

  if (!task) {
    return NextResponse.json({ message: "Task not found" }, { status: 404 });
  }

  try {
    const bundle = await getTaskBundle(taskId);
    const payload = await buildTaskExportPayload({
      format,
      task,
      bundle
    });

    const body = new Uint8Array(payload.body);

    return new Response(body, {
      headers: {
        "Content-Type": payload.contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(payload.fileName)}`
      }
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
