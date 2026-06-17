import { listHistoryActions } from "@/lib/db/repositories/history-action-repository";
import {
  getLibraryEntry,
  listLibraryEntries
} from "@/lib/db/repositories/library-entry-repository";
import { getTaskBundle } from "@/lib/db/repositories/task-content-repository";
import { getTaskById } from "@/lib/db/repositories/task-repository";
import type {
  WechatLibraryDetail,
  WechatLibraryItem,
  WechatLibraryPayload
} from "@/lib/content-creation-types";

export async function getWechatLibraryItem(taskId: string): Promise<WechatLibraryItem | null> {
  const task = await getTaskById(taskId);
  const bundle = await getTaskBundle(taskId);

  if (!task || !bundle.wechat) {
    return null;
  }

  return {
    taskId,
    title: bundle.wechat.title,
    summary: bundle.wechat.summary,
    publishStatus: bundle.wechat.publishStatus,
    userInput: task.userInput,
    updatedAt: task.updatedAt
  };
}

export async function getWechatLibraryPayload(): Promise<WechatLibraryPayload> {
  const entries = await listLibraryEntries("wechat");
  const items = (
    await Promise.all(entries.map((entry) => getWechatLibraryItem(entry.taskId)))
  ).filter(Boolean) as WechatLibraryItem[];

  return {
    items,
    recentActions: (await listHistoryActions()).slice(0, 12)
  };
}

export async function getWechatLibraryDetail(taskId: string): Promise<WechatLibraryDetail | null> {
  const libraryEntry = await getLibraryEntry(taskId);
  const task = await getTaskById(taskId);
  const bundle = await getTaskBundle(taskId);

  if (!libraryEntry || libraryEntry.platform !== "wechat" || !task || !bundle.wechat) {
    return null;
  }

  return {
    taskId,
    title: bundle.wechat.title,
    summary: bundle.wechat.summary,
    body: bundle.wechat.body,
    publishStatus: bundle.wechat.publishStatus,
    userInput: task.userInput,
    updatedAt: task.updatedAt
  };
}
