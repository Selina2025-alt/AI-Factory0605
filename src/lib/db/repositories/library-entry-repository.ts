import type { LibraryEntryRecord, PlatformId } from "@/lib/content-creation-types";
import { getAppDatabaseProvider } from "@/lib/supabase/config";
import * as supabase from "@/lib/db/supabase-content-repository";
import * as sqlite from "@/lib/db/repositories/sqlite/library-entry-repository";

type CreateLibraryEntryInput = Parameters<typeof sqlite.createLibraryEntry>[0];

function shouldUseSupabase() {
  return getAppDatabaseProvider() === "supabase";
}

export function createLibraryEntry(input: CreateLibraryEntryInput) {
  return (shouldUseSupabase() ? supabase.createLibraryEntry(input) : sqlite.createLibraryEntry(input)) as void;
}

export function getLibraryEntry(taskId: string) {
  return (shouldUseSupabase() ? supabase.getLibraryEntry(taskId) : sqlite.getLibraryEntry(taskId)) as LibraryEntryRecord | null;
}

export function listLibraryEntries(platform?: PlatformId) {
  return (shouldUseSupabase() ? supabase.listLibraryEntries(platform) : sqlite.listLibraryEntries(platform)) as LibraryEntryRecord[];
}

export function deleteLibraryEntry(taskId: string) {
  return (shouldUseSupabase() ? supabase.deleteLibraryEntry(taskId) : sqlite.deleteLibraryEntry(taskId)) as void;
}

