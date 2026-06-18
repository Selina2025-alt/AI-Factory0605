// @vitest-environment node

import { rmSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/lib/db/migrate";
import { createHistoryAction } from "@/lib/db/repositories/history-action-repository";
import { createLibraryEntry } from "@/lib/db/repositories/library-entry-repository";
import { createTaskContents } from "@/lib/db/repositories/task-content-repository";
import { createTask } from "@/lib/db/repositories/task-repository";
import {
  getWechatLibraryDetail,
  getWechatLibraryPayload
} from "@/lib/library/wechat-library-service";

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
  "wechat-library-service"
);

describe("wechat library service", () => {
  beforeEach(() => {
    process.env.CONTENT_CREATION_AGENT_DATA_ROOT = dataRoot;
    process.env.APP_DATABASE_PROVIDER = "sqlite";
    process.env.APP_STORAGE_PROVIDER = "local";
    rmSync(dataRoot, { recursive: true, force: true });
    migrateDatabase();
  });

  afterEach(() => {
    rmSync(dataRoot, { recursive: true, force: true });
    restoreEnv("CONTENT_CREATION_AGENT_DATA_ROOT", originalDataRoot);
    restoreEnv("APP_DATABASE_PROVIDER", originalDatabaseProvider);
    restoreEnv("APP_STORAGE_PROVIDER", originalStorageProvider);
  });

  it("keeps generated wechat tasks out of the library until they are explicitly added", async () => {
    createTask({
      id: "task-1",
      title: "AI Agent Longform",
      userInput: "Write a WeChat article about AI agents",
      selectedPlatforms: ["wechat"],
      status: "ready"
    });
    createTaskContents("task-1", {
      wechat: {
        title: "AI Agent Longform",
        summary: "Summary before library add",
        body: "Body before library add"
      },
      xiaohongshu: null,
      twitter: null,
      videoScript: null
    });
    createHistoryAction({
      taskId: "task-1",
      actionType: "task_created",
      payload: {
        title: "AI Agent Longform"
      }
    });

    const payload = await getWechatLibraryPayload();

    expect(payload.items).toHaveLength(0);
    expect(payload.recentActions[0]).toMatchObject({
      taskId: "task-1",
      actionType: "task_created"
    });
  });

  it("returns saved library items and full wechat detail after archiving", async () => {
    createTask({
      id: "task-1",
      title: "Five Efficiency Principles",
      userInput: "Write about improving work efficiency",
      selectedPlatforms: ["wechat"],
      status: "ready"
    });
    createTaskContents("task-1", {
      wechat: {
        title: "Five Efficiency Principles",
        summary: "A short summary about focus and systems.",
        body: "Paragraph one.\n\nParagraph two."
      },
      xiaohongshu: null,
      twitter: null,
      videoScript: null
    });
    createLibraryEntry({
      taskId: "task-1",
      platform: "wechat",
      sourceDraftId: "draft-1"
    });

    const payload = await getWechatLibraryPayload();
    const detail = await getWechatLibraryDetail("task-1");

    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      taskId: "task-1",
      title: "Five Efficiency Principles",
      summary: "A short summary about focus and systems."
    });

    expect(detail).toMatchObject({
      taskId: "task-1",
      title: "Five Efficiency Principles",
      summary: "A short summary about focus and systems.",
      body: "Paragraph one.\n\nParagraph two."
    });
  });
});
