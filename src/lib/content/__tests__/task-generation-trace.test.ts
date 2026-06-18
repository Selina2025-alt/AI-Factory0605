// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";

import { buildTaskGenerationTrace } from "@/lib/content/task-generation-trace";

const originalApiKey = process.env.SILICONFLOW_API_KEY;
const originalModel = process.env.SILICONFLOW_MODEL;
const originalImageModel = process.env.SILICONFLOW_IMAGE_MODEL;
const originalDatabaseProvider = process.env.APP_DATABASE_PROVIDER;
const originalStorageProvider = process.env.APP_STORAGE_PROVIDER;

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

describe("task generation trace", () => {
  afterEach(() => {
    restoreEnv("SILICONFLOW_API_KEY", originalApiKey);
    restoreEnv("SILICONFLOW_MODEL", originalModel);
    restoreEnv("SILICONFLOW_IMAGE_MODEL", originalImageModel);
    restoreEnv("APP_DATABASE_PROVIDER", originalDatabaseProvider);
    restoreEnv("APP_STORAGE_PROVIDER", originalStorageProvider);
  });

  it("shows the configured image model when Xiaohongshu image generation is enabled", async () => {
    process.env.SILICONFLOW_API_KEY = "test-api-key";
    process.env.SILICONFLOW_MODEL = "Pro/zai-org/GLM-4.7";
    process.env.SILICONFLOW_IMAGE_MODEL = "Qwen/Qwen-Image-Edit-2509";
    process.env.APP_DATABASE_PROVIDER = "sqlite";
    process.env.APP_STORAGE_PROVIDER = "local";

    const trace = await buildTaskGenerationTrace({
      prompt: "Write a Xiaohongshu AI learning note",
      platforms: ["xiaohongshu"],
      skills: []
    });

    expect(trace.providerLabel).toContain("Qwen/Qwen-Image-Edit-2509");
    expect(trace.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "image-generate",
          status: "completed"
        })
      ])
    );
  });

  it("treats Twitter as model-backed when SiliconFlow is configured", async () => {
    process.env.SILICONFLOW_API_KEY = "test-api-key";
    process.env.SILICONFLOW_MODEL = "Pro/zai-org/GLM-4.7";
    delete process.env.SILICONFLOW_IMAGE_MODEL;
    process.env.APP_DATABASE_PROVIDER = "sqlite";
    process.env.APP_STORAGE_PROVIDER = "local";

    const trace = await buildTaskGenerationTrace({
      prompt: "Write a Twitter thread about AI learning",
      platforms: ["twitter"],
      skills: []
    });

    expect(trace.providerLabel).toContain("Pro/zai-org/GLM-4.7");
    expect(trace.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "twitter-built-in-skill",
          detail: expect.stringContaining("public-clis/twitter-cli")
        })
      ])
    );
  });
});
