import { NextResponse } from "next/server";

import type { SkillKind } from "@/lib/content-creation-types";
import { migrateDatabase } from "@/lib/db/migrate";
import {
  createSkill,
  getSkillById,
  getSkillLearningResult,
  saveSkillLearningResult
} from "@/lib/db/repositories/skill-repository";
import { installSkillFromGithub } from "@/lib/skills/github-skill-install-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  migrateDatabase();

  const body = (await request.json()) as {
    command?: string;
    path?: string;
    ref?: string;
    repo?: string;
    skillKind?: unknown;
  };
  const skillKind: SkillKind = body.skillKind === "image" ? "image" : "content";

  if (!body.command && !(body.repo && body.path)) {
    return NextResponse.json(
      { message: "Missing GitHub install command or repo/path" },
      { status: 400 }
    );
  }

  try {
    const result = await installSkillFromGithub(
      body.command
        ? { command: body.command, ref: body.ref }
        : {
            repo: body.repo!,
            path: body.path!,
            ref: body.ref
          }
    );

    await createSkill({
      id: result.id,
      name: result.name,
      sourceType: "github",
      sourceRef: result.sourceRef,
      summary: result.learningResult.summary,
      status: "ready",
      skillKind
    });
    await saveSkillLearningResult(result.id, result.learningResult);

    const skill = await getSkillById(result.id);
    const learningResult = await getSkillLearningResult(result.id);

    if (!skill || !learningResult) {
      return NextResponse.json(
        { message: "Skill saved but could not be reloaded" },
        { status: 500 }
      );
    }

    return NextResponse.json({ skill, learningResult }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to install skill";

    return NextResponse.json({ message }, { status: 400 });
  }
}
