import type { HistoryActionRecord } from "@/lib/content-creation-types";
import { getAppDatabaseProvider } from "@/lib/supabase/config";
import * as supabase from "@/lib/db/supabase-content-repository";
import * as sqlite from "@/lib/db/repositories/sqlite/history-action-repository";

type CreateHistoryActionInput = Parameters<typeof sqlite.createHistoryAction>[0];

function shouldUseSupabase() {
  return getAppDatabaseProvider() === "supabase";
}

export function createHistoryAction(input: CreateHistoryActionInput) {
  return (shouldUseSupabase() ? supabase.createHistoryAction(input) : sqlite.createHistoryAction(input)) as void;
}

export function listHistoryActions() {
  return (shouldUseSupabase() ? supabase.listHistoryActions() : sqlite.listHistoryActions()) as HistoryActionRecord[];
}

