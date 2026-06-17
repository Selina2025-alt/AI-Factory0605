import type { DraftRecord } from "@/lib/content-creation-types";
import { getAppDatabaseProvider } from "@/lib/supabase/config";
import * as supabase from "@/lib/db/supabase-content-repository";
import * as sqlite from "@/lib/db/repositories/sqlite/draft-repository";

type DraftInput = Parameters<typeof sqlite.createDraft>[0];
type UpsertGeneratedDraftInput = Parameters<typeof sqlite.upsertGeneratedDraft>[0];

function shouldUseSupabase() {
  return getAppDatabaseProvider() === "supabase";
}

export function createDraft(input: DraftInput) {
  return (shouldUseSupabase() ? supabase.createDraft(input) : sqlite.createDraft(input)) as void;
}

export function listDrafts() {
  return (shouldUseSupabase() ? supabase.listDrafts() : sqlite.listDrafts()) as DraftRecord[];
}

export function getDraftById(draftId: string) {
  return (shouldUseSupabase() ? supabase.getDraftById(draftId) : sqlite.getDraftById(draftId)) as DraftRecord | null;
}

export function updateDraft(input: DraftInput) {
  return (shouldUseSupabase() ? supabase.updateDraft(input) : sqlite.updateDraft(input)) as void;
}

export function markDraftGenerated(draftId: string, taskId: string) {
  return (shouldUseSupabase() ? supabase.markDraftGenerated(draftId, taskId) : sqlite.markDraftGenerated(draftId, taskId)) as void;
}

export function upsertGeneratedDraft(input: UpsertGeneratedDraftInput) {
  return (shouldUseSupabase() ? supabase.upsertGeneratedDraft(input) : sqlite.upsertGeneratedDraft(input)) as void;
}

export function deleteDraft(draftId: string) {
  return (shouldUseSupabase() ? supabase.deleteDraft(draftId) : sqlite.deleteDraft(draftId)) as void;
}

