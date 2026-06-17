import type { SkillLearningResultRecord, SkillRecord } from "@/lib/content-creation-types";
import { getAppDatabaseProvider } from "@/lib/supabase/config";
import * as supabase from "@/lib/db/supabase-content-repository";
import * as sqlite from "@/lib/db/repositories/sqlite/skill-repository";

type CreateSkillInput = Parameters<typeof sqlite.createSkill>[0];
type SaveSkillLearningResultInput = Omit<SkillLearningResultRecord, "skillId" | "updatedAt">;

function shouldUseSupabase() {
  return getAppDatabaseProvider() === "supabase";
}

export function listSkills() {
  return (shouldUseSupabase() ? supabase.listSkills() : sqlite.listSkills()) as SkillRecord[];
}

export function createSkill(input: CreateSkillInput) {
  return (shouldUseSupabase() ? supabase.createSkill(input) : sqlite.createSkill(input)) as void;
}

export function getSkillById(skillId: string) {
  return (shouldUseSupabase() ? supabase.getSkillById(skillId) : sqlite.getSkillById(skillId)) as SkillRecord | null;
}

export function isBuiltinSkillDeleted(skillId: string) {
  return (shouldUseSupabase() ? supabase.isBuiltinSkillDeleted(skillId) : sqlite.isBuiltinSkillDeleted(skillId)) as boolean;
}

export function saveSkillLearningResult(skillId: string, input: SaveSkillLearningResultInput) {
  return (shouldUseSupabase() ? supabase.saveSkillLearningResult(skillId, input) : sqlite.saveSkillLearningResult(skillId, input)) as void;
}

export function getSkillLearningResult(skillId: string) {
  return (shouldUseSupabase() ? supabase.getSkillLearningResult(skillId) : sqlite.getSkillLearningResult(skillId)) as SkillLearningResultRecord | null;
}

export function deleteSkill(skillId: string) {
  return (shouldUseSupabase() ? supabase.deleteSkill(skillId) : sqlite.deleteSkill(skillId)) as void;
}

