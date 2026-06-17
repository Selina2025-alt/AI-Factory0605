import type {
  GeneratedTaskContentBundle,
  PersistedGeneratedTaskContentBundle,
  PlatformContentRecord,
  PlatformId,
  PublishStatus
} from "@/lib/content-creation-types";
import { getAppDatabaseProvider } from "@/lib/supabase/config";
import * as supabase from "@/lib/db/supabase-content-repository";
import * as sqlite from "@/lib/db/repositories/sqlite/task-content-repository";

function shouldUseSupabase() {
  return getAppDatabaseProvider() === "supabase";
}

export function createTaskContents(taskId: string, bundle: GeneratedTaskContentBundle) {
  return (shouldUseSupabase() ? supabase.createTaskContents(taskId, bundle) : sqlite.createTaskContents(taskId, bundle)) as void;
}

export function replaceTaskContents(taskId: string, bundle: GeneratedTaskContentBundle) {
  return (shouldUseSupabase() ? supabase.replaceTaskContents(taskId, bundle) : sqlite.replaceTaskContents(taskId, bundle)) as void;
}

export function listTaskContents(taskId: string) {
  return (shouldUseSupabase() ? supabase.listTaskContents(taskId) : sqlite.listTaskContents(taskId)) as PlatformContentRecord[];
}

export function getTaskBundle(taskId: string) {
  return (shouldUseSupabase() ? supabase.getTaskBundle(taskId) : sqlite.getTaskBundle(taskId)) as PersistedGeneratedTaskContentBundle;
}

export function updatePublishStatus(
  taskId: string,
  platform: Exclude<PlatformId, "videoScript">,
  publishStatus: PublishStatus
) {
  return (shouldUseSupabase()
    ? supabase.updatePublishStatus(taskId, platform, publishStatus)
    : sqlite.updatePublishStatus(taskId, platform, publishStatus)) as void;
}

export function updateTaskPlatformContent(input: {
  taskId: string;
  platform: PlatformId;
  contentType?: string;
  title: string;
  body: object;
}) {
  return (shouldUseSupabase()
    ? supabase.updateTaskPlatformContent(input)
    : sqlite.updateTaskPlatformContent(input)) as void;
}

export function upsertTaskPlatformContent(input: {
  taskId: string;
  platform: PlatformId;
  contentType: string;
  title: string;
  body: object;
}) {
  return (shouldUseSupabase()
    ? supabase.upsertTaskPlatformContent(input)
    : sqlite.upsertTaskPlatformContent(input)) as void;
}

