// @vitest-environment node

import { rmSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST as installSkill } from "@/app/api/skills/install/route";
import { POST as uploadSkill } from "@/app/api/skills/upload/route";

const originalDataRoot = process.env.CONTENT_CREATION_AGENT_DATA_ROOT;
const originalStorageProvider = process.env.APP_STORAGE_PROVIDER;

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

describe("skill install cloud storage guard", () => {
  const dataRoot = path.join(process.cwd(), ".codex-data-tests", "skill-cloud-storage-guard");

  beforeEach(() => {
    process.env.CONTENT_CREATION_AGENT_DATA_ROOT = dataRoot;
    process.env.APP_STORAGE_PROVIDER = "supabase";
    rmSync(dataRoot, { recursive: true, force: true });
  });

  afterEach(() => {
    rmSync(dataRoot, { recursive: true, force: true });
    restoreEnv("CONTENT_CREATION_AGENT_DATA_ROOT", originalDataRoot);
    restoreEnv("APP_STORAGE_PROVIDER", originalStorageProvider);
  });

  it("rejects custom skill ZIP uploads in Supabase storage mode", async () => {
    const response = await uploadSkill(
      new Request("http://localhost/api/skills/upload", {
        method: "POST"
      })
    );

    expect(response.status).toBe(501);
    expect(await response.json()).toMatchObject({
      code: "SKILL_FILE_INSTALL_LOCAL_ONLY"
    });
  });

  it("rejects custom GitHub skill installs in Supabase storage mode", async () => {
    const response = await installSkill(
      new Request("http://localhost/api/skills/install", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          repo: "owner/repo",
          path: "skills/demo"
        })
      })
    );

    expect(response.status).toBe(501);
    expect(await response.json()).toMatchObject({
      code: "SKILL_FILE_INSTALL_LOCAL_ONLY"
    });
  });
});
