import { NextResponse } from "next/server";
import { rmSync } from "node:fs";
import path from "node:path";

import { migrateDatabase } from "@/lib/db/migrate";
import {
  deleteSkill,
  getSkillById,
  getSkillLearningResult
} from "@/lib/db/repositories/skill-repository";
import {
  getSkillUnpackedDirectory,
  getSkillsUnpackedPath
} from "@/lib/fs/app-paths";
import {
  listSkillFiles,
  readSkillFile
} from "@/lib/skills/skill-file-browser-service";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ skillId: string }> }
) {
  migrateDatabase();

  const { skillId } = await context.params;
  const skill = await getSkillById(skillId);

  if (!skill) {
    return NextResponse.json({ message: "Skill not found" }, { status: 404 });
  }

  const files = listSkillFiles(skillId);
  const selectedPath =
    new URL(request.url).searchParams.get("file") ?? files[0] ?? null;
  let selectedFile = null;

  if (selectedPath) {
    try {
      selectedFile = {
        path: selectedPath,
        content: readSkillFile(skillId, selectedPath)
      };
    } catch {
      return NextResponse.json(
        { message: "Requested skill file could not be loaded" },
        { status: 400 }
      );
    }
  }

  return NextResponse.json({
    skill,
    learningResult: await getSkillLearningResult(skillId),
    files,
    selectedFile
  });
}

function removeUnpackedSkillDirectory(skillId: string) {
  const unpackedRoot = path.resolve(getSkillsUnpackedPath());
  const skillDirectory = path.resolve(getSkillUnpackedDirectory(skillId));

  if (
    skillDirectory === unpackedRoot ||
    !skillDirectory.startsWith(`${unpackedRoot}${path.sep}`)
  ) {
    throw new Error("Refusing to delete a path outside the skills directory");
  }

  rmSync(skillDirectory, { recursive: true, force: true });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ skillId: string }> }
) {
  migrateDatabase();

  const { skillId } = await context.params;
  const skill = await getSkillById(skillId);

  if (!skill) {
    return NextResponse.json({ message: "Skill not found" }, { status: 404 });
  }

  await deleteSkill(skillId);
  removeUnpackedSkillDirectory(skillId);

  return NextResponse.json({ ok: true });
}
