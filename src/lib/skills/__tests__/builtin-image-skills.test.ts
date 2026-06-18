import { existsSync, rmSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/lib/db/migrate";
import {
  deleteSkill,
  getSkillById,
  getSkillLearningResult,
  listSkills
} from "@/lib/db/repositories/skill-repository";
import { getSkillUnpackedDirectory } from "@/lib/fs/app-paths";
import { ensureBuiltinImageSkills } from "@/lib/skills/builtin-image-skills";
import { listSkillFiles, readSkillFile } from "@/lib/skills/skill-file-browser-service";

const originalDataRoot = process.env.CONTENT_CREATION_AGENT_DATA_ROOT;
const originalDatabaseProvider = process.env.APP_DATABASE_PROVIDER;
const originalStorageProvider = process.env.APP_STORAGE_PROVIDER;

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

const dataRoot = path.join(
  process.cwd(),
  ".codex-data-tests",
  "builtin-image-skills"
);

describe("builtin image skills", () => {
  beforeEach(() => {
    process.env.CONTENT_CREATION_AGENT_DATA_ROOT = dataRoot;
    process.env.APP_DATABASE_PROVIDER = "sqlite";
    process.env.APP_STORAGE_PROVIDER = "local";
    rmSync(dataRoot, {
      recursive: true,
      force: true
    });
    migrateDatabase();
  });

  afterEach(() => {
    rmSync(dataRoot, { recursive: true, force: true });
    restoreEnv("CONTENT_CREATION_AGENT_DATA_ROOT", originalDataRoot);
    restoreEnv("APP_DATABASE_PROVIDER", originalDatabaseProvider);
    restoreEnv("APP_STORAGE_PROVIDER", originalStorageProvider);
  });

  it("seeds the built-in code drawing skills as image skills with previewable files", async () => {
    await ensureBuiltinImageSkills();

    const imageSkills = listSkills().filter((skill) => skill.skillKind === "image");

    expect(imageSkills.map((skill) => skill.id)).toEqual(
      expect.arrayContaining([
        "builtin-image-wechat-baoyu-cover",
        "builtin-image-wechat-md2wechat-cover",
        "builtin-image-satori-resvg",
        "builtin-image-rough-js",
        "builtin-image-excalidraw",
        "builtin-image-mermaid",
        "builtin-image-generative-canvas",
        "builtin-image-d3-visx"
      ])
    );

    const wechatCoverLearning = getSkillLearningResult("builtin-image-wechat-baoyu-cover");
    const roughSkill = getSkillById("builtin-image-rough-js");
    const roughLearning = getSkillLearningResult("builtin-image-rough-js");

    expect(wechatCoverLearning?.platformHints).toContain("wechat");
    expect(roughSkill).toMatchObject({
      name: "Rough.js Hand-drawn Knowledge Card",
      sourceType: "github",
      skillKind: "image",
      status: "ready"
    });
    expect(roughLearning?.platformHints).toContain("xiaohongshu");
    expect(roughLearning?.rules.join("\n")).toContain("hand-drawn");
    expect(listSkillFiles("builtin-image-rough-js")).toContain("SKILL.md");
    expect(readSkillFile("builtin-image-rough-js", "SKILL.md")).toContain(
      "rough-stuff/rough"
    );
    expect(existsSync(getSkillUnpackedDirectory("builtin-image-rough-js"))).toBe(
      true
    );
  });

  it("does not recreate a deleted built-in image skill", async () => {
    await ensureBuiltinImageSkills();

    deleteSkill("builtin-image-rough-js");
    await ensureBuiltinImageSkills();

    expect(getSkillById("builtin-image-rough-js")).toBeNull();
  });
});
