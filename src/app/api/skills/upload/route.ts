import { NextResponse } from "next/server";

import type { SkillKind } from "@/lib/content-creation-types";
import { migrateDatabase } from "@/lib/db/migrate";
import {
  createSkill,
  getSkillById,
  getSkillLearningResult,
  saveSkillLearningResult
} from "@/lib/db/repositories/skill-repository";
import { ingestSkillZip } from "@/lib/skills/zip-skill-ingestion-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  migrateDatabase();

  const formData = await request.formData();
  const file = formData.get("file");
  const skillKind: SkillKind = formData.get("skillKind") === "image" ? "image" : "content";

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Missing zip file" }, { status: 400 });
  }

  try {
    const result = await ingestSkillZip(
      Buffer.from(await file.arrayBuffer()),
      file.name
    );

    await createSkill({
      id: result.id,
      name: result.name,
      sourceType: "zip",
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
      error instanceof Error ? error.message : "Failed to ingest skill zip";

    return NextResponse.json({ message }, { status: 400 });
  }
}
