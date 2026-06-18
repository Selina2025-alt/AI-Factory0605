// @vitest-environment node

import { rmSync } from "node:fs";
import path from "node:path";

import AdmZip from "adm-zip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as exportTask } from "@/app/api/tasks/[taskId]/export/route";
import { migrateDatabase } from "@/lib/db/migrate";
import {
  createTaskContents,
  replaceTaskContents
} from "@/lib/db/repositories/task-content-repository";
import { createTask } from "@/lib/db/repositories/task-repository";
import type { GeneratedTaskContentBundle } from "@/lib/content-creation-types";

const originalDataRoot = process.env.CONTENT_CREATION_AGENT_DATA_ROOT;
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

describe("task export route", () => {
  const dataRoot = path.join(process.cwd(), ".codex-data-tests", "task-export-route");

  beforeEach(() => {
    process.env.CONTENT_CREATION_AGENT_DATA_ROOT = dataRoot;
    rmSync(dataRoot, { recursive: true, force: true });
    migrateDatabase();

    createTask({
      id: "task-1",
      title: "AI workflow",
      userInput: "Write about AI workflow",
      selectedPlatforms: ["wechat", "xiaohongshu", "twitter", "videoScript"],
      status: "ready"
    });

    const bundle: GeneratedTaskContentBundle = {
      wechat: {
        title: "Wechat title",
        summary: "Wechat summary",
        body: "Wechat body"
      },
      xiaohongshu: {
        title: "XHS title",
        caption: "XHS caption",
        imageSuggestions: Array.from({ length: 2 }, (_, index) => `image ${index + 1}`),
        imageAssets: [
          {
            id: "xhs-image-1",
            title: "Image 1",
            prompt: "prompt 1",
            alt: "Image 1",
            src: "data:image/png;base64,aGVsbG8=",
            provider: "local-svg",
            status: "ready"
          },
          {
            id: "xhs-image-2",
            title: "Image 2",
            prompt: "prompt 2",
            alt: "Image 2",
            src: "data:image/png;base64,d29ybGQ=",
            provider: "local-svg",
            status: "ready"
          }
        ],
        hashtags: ["ai", "workflow"]
      },
      twitter: {
        mode: "single",
        language: "English",
        tweets: ["AI is useful when it fits your existing workflow."]
      },
      videoScript: {
        title: "Video script",
        scenes: [
          {
            shot: "01",
            copy: "Open with a concrete pain point.",
            visual: "Creator staring at too many tabs.",
            subtitle: "Too many tabs, no output",
            pace: "Medium",
            audio: "Light beat",
            effect: "Title pop-in"
          }
        ]
      }
    };

    createTaskContents("task-1", bundle);
  });

  afterEach(() => {
    rmSync(dataRoot, { recursive: true, force: true });
    restoreEnv("CONTENT_CREATION_AGENT_DATA_ROOT", originalDataRoot);
    restoreEnv("APP_STORAGE_PROVIDER", originalStorageProvider);
    restoreEnv("SUPABASE_URL", originalSupabaseUrl);
    restoreEnv("SUPABASE_SERVICE_ROLE_KEY", originalSupabaseServiceRoleKey);
    restoreEnv("SUPABASE_STORAGE_BUCKET", originalSupabaseStorageBucket);
    vi.unstubAllGlobals();
  });

  it("exports markdown and html files", async () => {
    const markdownResponse = await exportTask(
      new Request("http://localhost/api/tasks/task-1/export?format=markdown"),
      {
        params: Promise.resolve({ taskId: "task-1" })
      }
    );
    const htmlResponse = await exportTask(
      new Request("http://localhost/api/tasks/task-1/export?format=html"),
      {
        params: Promise.resolve({ taskId: "task-1" })
      }
    );

    expect(markdownResponse.status).toBe(200);
    expect(htmlResponse.status).toBe(200);
    expect(markdownResponse.headers.get("content-disposition")).toContain(".md");
    expect(htmlResponse.headers.get("content-disposition")).toContain(".html");

    const markdownText = await markdownResponse.text();
    const htmlText = await htmlResponse.text();

    expect(markdownText).toContain("Wechat title");
    expect(markdownText).toContain("XHS title");
    expect(markdownText).toContain("AI is useful when it fits your existing workflow.");

    expect(htmlText).toContain("<h2>Twitter</h2>");
  });

  it("exports xiaohongshu image package zip", async () => {
    const response = await exportTask(
      new Request("http://localhost/api/tasks/task-1/export?format=image-package"),
      {
        params: Promise.resolve({ taskId: "task-1" })
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/zip");

    const zipBuffer = Buffer.from(await response.arrayBuffer());
    const zip = new AdmZip(zipBuffer);
    const entryNames = zip.getEntries().map((entry) => entry.entryName);

    expect(entryNames).toContain("manifest.json");
    expect(entryNames).toContain("images/image-01.png");
    expect(entryNames).toContain("images/image-02.png");
  });

  it("exports image packages from Supabase-backed asset URLs", async () => {
    process.env.APP_STORAGE_PROVIDER = "supabase";
    process.env.SUPABASE_URL = "https://demo.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.SUPABASE_STORAGE_BUCKET = "assets";

    const imageBytes = Buffer.from("cloud-image-bytes");
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

    replaceTaskContents("task-1", {
      wechat: null,
      xiaohongshu: {
        title: "Cloud XHS title",
        caption: "Cloud XHS caption",
        imageSuggestions: ["cloud image"],
        imageAssets: [
          {
            id: "cloud-image-1",
            title: "Cloud Image 1",
            prompt: "cloud prompt",
            alt: "Cloud Image 1",
            src: "/api/assets/xiaohongshu/cloud-image-1.png",
            provider: "siliconflow",
            status: "ready"
          }
        ],
        hashtags: ["cloud"]
      },
      twitter: null,
      videoScript: null
    });

    const response = await exportTask(
      new Request("http://localhost/api/tasks/task-1/export?format=image-package"),
      {
        params: Promise.resolve({ taskId: "task-1" })
      }
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://demo.supabase.co/storage/v1/object/assets/generated-assets/xiaohongshu/cloud-image-1.png",
      expect.objectContaining({
        headers: expect.objectContaining({
          apikey: "service-role-key",
          Authorization: "Bearer service-role-key"
        })
      })
    );

    const zipBuffer = Buffer.from(await response.arrayBuffer());
    const zip = new AdmZip(zipBuffer);
    const imageEntry = zip.getEntry("images/image-01.png");

    expect(imageEntry?.getData().toString()).toBe("cloud-image-bytes");
  });
  it("returns 400 for invalid export format", async () => {
    const response = await exportTask(
      new Request("http://localhost/api/tasks/task-1/export?format=pdf"),
      {
        params: Promise.resolve({ taskId: "task-1" })
      }
    );

    expect(response.status).toBe(400);
  });
});
