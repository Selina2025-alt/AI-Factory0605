import type { TaskRecord } from "@/lib/content-creation-types";
import { getAppDatabaseProvider } from "@/lib/supabase/config";
import * as supabase from "@/lib/db/supabase-content-repository";
import * as sqlite from "@/lib/db/repositories/sqlite/task-repository";

type CreateTaskInput = Parameters<typeof sqlite.createTask>[0];

function shouldUseSupabase() {
  return getAppDatabaseProvider() === "supabase";
}

export function createTask(input: CreateTaskInput) {
  return (shouldUseSupabase() ? supabase.createTask(input) : sqlite.createTask(input)) as void;
}

export function listTasks() {
  return (shouldUseSupabase() ? supabase.listTasks() : sqlite.listTasks()) as TaskRecord[];
}

export function getTaskById(taskId: string) {
  return (shouldUseSupabase() ? supabase.getTaskById(taskId) : sqlite.getTaskById(taskId)) as TaskRecord | null;
}

export function renameTask(taskId: string, title: string) {
  return (shouldUseSupabase() ? supabase.renameTask(taskId, title) : sqlite.renameTask(taskId, title)) as void;
}

export function updateTaskSelectedPlatforms(taskId: string, selectedPlatforms: TaskRecord["selectedPlatforms"]) {
  return (shouldUseSupabase()
    ? supabase.updateTaskSelectedPlatforms(taskId, selectedPlatforms)
    : sqlite.updateTaskSelectedPlatforms(taskId, selectedPlatforms)) as void;
}

export function deleteTask(taskId: string) {
  return (shouldUseSupabase() ? supabase.deleteTask(taskId) : sqlite.deleteTask(taskId)) as void;
}

