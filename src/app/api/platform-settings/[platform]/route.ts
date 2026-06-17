import { NextResponse } from "next/server";

import {
  isSupportedSiliconFlowImageModel,
  normalizeSiliconFlowImageModel
} from "@/lib/content/siliconflow-image-models";
import type { PlatformId } from "@/lib/content-creation-types";
import { migrateDatabase } from "@/lib/db/migrate";
import {
  getPlatformSetting,
  upsertPlatformSetting
} from "@/lib/db/repositories/platform-settings-repository";

export const runtime = "nodejs";

const allowedPlatforms = new Set<PlatformId>([
  "wechat",
  "xiaohongshu",
  "twitter",
  "videoScript"
]);

export async function GET(
  _request: Request,
  context: { params: Promise<{ platform: string }> }
) {
  migrateDatabase();

  const { platform } = await context.params;

  if (!allowedPlatforms.has(platform as PlatformId)) {
    return NextResponse.json({ message: "Unsupported platform" }, { status: 400 });
  }

  return NextResponse.json(await getPlatformSetting(platform as PlatformId));
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ platform: string }> }
) {
  migrateDatabase();

  const { platform } = await context.params;
  const body = (await request.json()) as {
    baseRules?: string[];
    enabledSkillIds?: string[];
    imageSkillIds?: string[];
    imageModel?: string;
  };

  if (!allowedPlatforms.has(platform as PlatformId)) {
    return NextResponse.json({ message: "Unsupported platform" }, { status: 400 });
  }

  if (body.imageModel && !isSupportedSiliconFlowImageModel(body.imageModel)) {
    return NextResponse.json(
      { message: "Unsupported image model" },
      { status: 400 }
    );
  }

  await upsertPlatformSetting({
    platform: platform as PlatformId,
    baseRulesJson: JSON.stringify(body.baseRules ?? []),
    enabledSkillIdsJson: JSON.stringify(body.enabledSkillIds ?? []),
    imageSkillIdsJson: Array.isArray(body.imageSkillIds)
      ? JSON.stringify(body.imageSkillIds)
      : undefined,
    imageModel: normalizeSiliconFlowImageModel(body.imageModel)
  });

  return NextResponse.json({ ok: true });
}
