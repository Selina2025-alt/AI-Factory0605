import { NextResponse } from "next/server";

import { migrateDatabase } from "@/lib/db/migrate";
import {
  deleteDraft,
  getDraftById,
  updateDraft
} from "@/lib/db/repositories/draft-repository";
import type { PlatformId } from "@/lib/content-creation-types";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ draftId: string }> }
) {
  migrateDatabase();

  const { draftId } = await context.params;
  const existingDraft = await getDraftById(draftId);

  if (!existingDraft) {
    return NextResponse.json({ message: "Draft not found" }, { status: 404 });
  }

  const body = (await request.json()) as {
    title?: string;
    prompt?: string;
    selectedPlatforms?: PlatformId[];
  };

  await updateDraft({
    id: draftId,
    title: body.title?.trim() || existingDraft.title,
    prompt: body.prompt ?? existingDraft.prompt,
    selectedPlatforms: body.selectedPlatforms ?? existingDraft.selectedPlatforms,
    status: existingDraft.status
  });

  return NextResponse.json(await getDraftById(draftId));
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ draftId: string }> }
) {
  migrateDatabase();

  const { draftId } = await context.params;
  await deleteDraft(draftId);

  return NextResponse.json({ id: draftId, deleted: true });
}
