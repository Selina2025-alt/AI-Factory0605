import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { migrateDatabase } from "@/lib/db/migrate";
import {
  createDraft,
  listDrafts
} from "@/lib/db/repositories/draft-repository";
import type { PlatformId } from "@/lib/content-creation-types";

export const runtime = "nodejs";

export async function GET() {
  migrateDatabase();

  return NextResponse.json(await listDrafts());
}

export async function POST(request: Request) {
  migrateDatabase();

  const body = (await request.json()) as {
    title?: string;
    prompt: string;
    selectedPlatforms: PlatformId[];
  };

  const draftId = randomUUID();
  const title = body.title?.trim() || body.prompt.trim().slice(0, 24) || "未命名草稿";

  await createDraft({
    id: draftId,
    title,
    prompt: body.prompt,
    selectedPlatforms: body.selectedPlatforms,
    status: "draft"
  });

  return NextResponse.json((await listDrafts()).find((draft) => draft.id === draftId), {
    status: 201
  });
}
