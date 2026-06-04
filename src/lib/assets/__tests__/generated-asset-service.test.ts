// @vitest-environment node

import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { persistGeneratedImage } from "@/lib/assets/generated-asset-service";

const originalDataRoot = process.env.CONTENT_CREATION_AGENT_DATA_ROOT;
const originalDatabaseProvider = process.env.APP_DATABASE_PROVIDER;
const originalStorageProvider = process.env.APP_STORAGE_PROVIDER;
const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const originalSupabaseStorageBucket = process.env.SUPABASE_STORAGE_BUCKET;

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

describe("generated asset service", () => {
  const dataRoot = path.join(process.cwd(), ".codex-data-tests", "generated-assets");

  beforeEach(() => {
    process.env.CONTENT_CREATION_AGENT_DATA_ROOT = dataRoot;
    rmSync(dataRoot, { recursive: true, force: true });
  });

  afterEach(() => {
    restoreEnv("CONTENT_CREATION_AGENT_DATA_ROOT", originalDataRoot);
    restoreEnv("APP_DATABASE_PROVIDER", originalDatabaseProvider);
    restoreEnv("APP_STORAGE_PROVIDER", originalStorageProvider);
    restoreEnv("SUPABASE_URL", originalSupabaseUrl);
    restoreEnv("SUPABASE_SERVICE_ROLE_KEY", originalSupabaseServiceRoleKey);
    restoreEnv("SUPABASE_STORAGE_BUCKET", originalSupabaseStorageBucket);
    rmSync(dataRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("downloads a remote generated image and returns a local asset URL", async () => {
    const imageBytes = Buffer.from("fake-png-bytes");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (name: string) => (name.toLowerCase() === "content-type" ? "image/png" : null)
      },
      arrayBuffer: async () => imageBytes.buffer.slice(
        imageBytes.byteOffset,
        imageBytes.byteOffset + imageBytes.byteLength
      )
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await persistGeneratedImage({
      src: "https://cdn.example.com/xhs-card.png",
      platform: "xiaohongshu",
      assetId: "image-1"
    });

    expect(result.src).toMatch(/^\/api\/assets\/xiaohongshu\/image-1-[a-f0-9-]+\.png$/);
    expect(result.originalSrc).toBe("https://cdn.example.com/xhs-card.png");
    expect(existsSync(result.filePath)).toBe(true);
    expect(readFileSync(result.filePath).toString()).toBe("fake-png-bytes");
  });

  it("persists base64 image data without refetching it", async () => {
    const fetchMock = vi.fn();

    vi.stubGlobal("fetch", fetchMock);

    const result = await persistGeneratedImage({
      src: `data:image/png;base64,${Buffer.from("inline-png").toString("base64")}`,
      platform: "xiaohongshu",
      assetId: "image-2"
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.src).toMatch(/^\/api\/assets\/xiaohongshu\/image-2-[a-f0-9-]+\.png$/);
    expect(readFileSync(result.filePath).toString()).toBe("inline-png");
  });

  it("uploads generated image bytes to Supabase Storage when enabled", async () => {
    process.env.APP_STORAGE_PROVIDER = "supabase";
    process.env.SUPABASE_URL = "https://demo.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.SUPABASE_STORAGE_BUCKET = "acf-assets";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => ""
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await persistGeneratedImage({
      src: `data:image/png;base64,${Buffer.from("cloud-png").toString("base64")}`,
      platform: "wechat",
      assetId: "cover-1"
    });

    expect(result.src).toMatch(/^\/api\/assets\/wechat\/cover-1-[a-f0-9-]+\.png$/);
    expect(result.filePath).toMatch(/^supabase:\/\/generated-assets\/wechat\/cover-1-/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toMatch(
      /^https:\/\/demo\.supabase\.co\/storage\/v1\/object\/acf-assets\/generated-assets\/wechat\/cover-1-/
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        apikey: "service-role-key",
        Authorization: "Bearer service-role-key",
        "Content-Type": "image/png",
        "x-upsert": "true"
      })
    });
  });
});
