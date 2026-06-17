import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import type { PlatformId, SkillKind } from "@/lib/content-creation-types";
import { migrateDatabase } from "@/lib/db/migrate";
import {
  createSkill,
  getSkillById,
  getSkillLearningResult,
  saveSkillLearningResult
} from "@/lib/db/repositories/skill-repository";

export const runtime = "nodejs";

const validPlatforms = new Set<PlatformId>([
  "wechat",
  "xiaohongshu",
  "twitter",
  "videoScript"
]);

function normalizePlatformHints(input: unknown) {
  if (!Array.isArray(input)) {
    return ["wechat"] satisfies PlatformId[];
  }

  const hints = input.filter((item): item is PlatformId =>
    typeof item === "string" && validPlatforms.has(item as PlatformId)
  );

  return hints.length > 0 ? hints : (["wechat"] satisfies PlatformId[]);
}

function normalizeSkillKind(input: unknown): SkillKind {
  return input === "image" ? "image" : "content";
}

function buildKeywords(name: string, description: string, instruction: string) {
  return Array.from(
    new Set(
      [name, description, instruction]
        .join(" ")
        .split(/[\s,，。；;、]+/u)
        .map((item) => item.trim())
        .filter((item) => item.length > 1)
        .slice(0, 12)
    )
  );
}

export async function POST(request: Request) {
  migrateDatabase();

  const body = (await request.json()) as {
    name?: string;
    description?: string;
    instruction?: string;
    platformHints?: unknown;
    skillKind?: unknown;
  };
  const name = body.name?.trim() ?? "";
  const description = body.description?.trim() ?? "";
  const instruction = body.instruction?.trim() ?? "";

  if (!name || !instruction) {
    return NextResponse.json(
      {
        message: "Prompt skill requires both name and instruction"
      },
      { status: 400 }
    );
  }

  const skillId = randomUUID();
  const summary = description || instruction.slice(0, 120);
  const skillKind = normalizeSkillKind(body.skillKind);
  const platformHints =
    body.platformHints === undefined && skillKind === "image"
      ? (["xiaohongshu"] satisfies PlatformId[])
      : normalizePlatformHints(body.platformHints);

  await createSkill({
    id: skillId,
    name,
    sourceType: "prompt",
    sourceRef: `prompt:${skillId}`,
    summary,
    status: "ready",
    skillKind
  });
  await saveSkillLearningResult(skillId, {
    summary,
    rules: [instruction],
    platformHints,
    keywords: buildKeywords(name, description, instruction),
    examplesSummary: [`Prompt skill: ${name}`]
  });

  return NextResponse.json(
    {
      skill: await getSkillById(skillId),
      learningResult: await getSkillLearningResult(skillId)
    },
    { status: 201 }
  );
}
