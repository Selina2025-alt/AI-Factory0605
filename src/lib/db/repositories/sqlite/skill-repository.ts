import { openDatabase } from "@/lib/db/client";
import type { SkillKind, SkillLearningResultRecord, SkillRecord } from "@/lib/content-creation-types";

function mapSkillRow(row: {
  id: string;
  name: string;
  source_type: SkillRecord["sourceType"];
  source_ref: string;
  summary: string;
  status: string;
  skill_kind?: SkillKind;
  created_at: string;
  updated_at: string;
}): SkillRecord {
  return {
    id: row.id,
    name: row.name,
    sourceType: row.source_type,
    sourceRef: row.source_ref,
    summary: row.summary,
    status: row.status,
    skillKind: row.skill_kind ?? "content",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function isBuiltinSkillId(skillId: string) {
  return skillId.startsWith("builtin-");
}

export function listSkills() {
  const db = openDatabase();
  const rows = db
    .prepare(
      `SELECT id, name, source_type, source_ref, summary, status, skill_kind, created_at, updated_at
       FROM skills
       ORDER BY updated_at DESC`
    )
    .all() as Array<{
      id: string;
      name: string;
      source_type: SkillRecord["sourceType"];
      source_ref: string;
      summary: string;
      status: string;
      skill_kind: SkillKind;
      created_at: string;
      updated_at: string;
    }>;

  db.close();

  return rows.map(mapSkillRow);
}

export function createSkill(input: Omit<SkillRecord, "createdAt" | "updatedAt">) {
  const db = openDatabase();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO skills (
      id,
      name,
      source_type,
      source_ref,
      summary,
      status,
      skill_kind,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      source_type = excluded.source_type,
      source_ref = excluded.source_ref,
      summary = excluded.summary,
      status = excluded.status,
      skill_kind = excluded.skill_kind,
      updated_at = excluded.updated_at`
  ).run(
    input.id,
    input.name,
    input.sourceType,
    input.sourceRef,
    input.summary,
    input.status,
    input.skillKind ?? "content",
    now,
    now
  );

  db.close();
}

export function getSkillById(skillId: string) {
  const db = openDatabase();
  const row = db
    .prepare(
      `SELECT id, name, source_type, source_ref, summary, status, skill_kind, created_at, updated_at
       FROM skills
       WHERE id = ?`
    )
    .get(skillId) as
    | {
        id: string;
        name: string;
        source_type: SkillRecord["sourceType"];
        source_ref: string;
        summary: string;
        status: string;
        skill_kind: SkillKind;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  db.close();

  if (!row) {
    return null;
  }

  return mapSkillRow(row);
}

export function isBuiltinSkillDeleted(skillId: string) {
  const db = openDatabase();
  const row = db
    .prepare("SELECT skill_id FROM deleted_builtin_skills WHERE skill_id = ?")
    .get(skillId);

  db.close();

  return Boolean(row);
}

export function saveSkillLearningResult(
  skillId: string,
  input: Omit<SkillLearningResultRecord, "skillId" | "updatedAt">
) {
  const db = openDatabase();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO skill_learning_results (
      skill_id,
      summary,
      rules_json,
      platform_hints_json,
      keywords_json,
      examples_summary_json,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(skill_id) DO UPDATE SET
      summary = excluded.summary,
      rules_json = excluded.rules_json,
      platform_hints_json = excluded.platform_hints_json,
      keywords_json = excluded.keywords_json,
      examples_summary_json = excluded.examples_summary_json,
      updated_at = excluded.updated_at`
  ).run(
    skillId,
    input.summary,
    JSON.stringify(input.rules),
    JSON.stringify(input.platformHints),
    JSON.stringify(input.keywords),
    JSON.stringify(input.examplesSummary),
    now
  );

  db.close();
}

export function getSkillLearningResult(skillId: string) {
  const db = openDatabase();
  const row = db
    .prepare(
      `SELECT skill_id, summary, rules_json, platform_hints_json, keywords_json, examples_summary_json, updated_at
       FROM skill_learning_results
       WHERE skill_id = ?`
    )
    .get(skillId) as
    | {
        skill_id: string;
        summary: string;
        rules_json: string;
        platform_hints_json: string;
        keywords_json: string;
        examples_summary_json: string;
        updated_at: string;
      }
    | undefined;

  db.close();

  if (!row) {
    return null;
  }

  return {
    skillId: row.skill_id,
    summary: row.summary,
    rules: JSON.parse(row.rules_json) as string[],
    platformHints: JSON.parse(row.platform_hints_json) as string[],
    keywords: JSON.parse(row.keywords_json) as string[],
    examplesSummary: JSON.parse(row.examples_summary_json) as string[],
    updatedAt: row.updated_at
  };
}

export function deleteSkill(skillId: string) {
  const db = openDatabase();
  const now = new Date().toISOString();

  try {
    db.exec("BEGIN");

    if (isBuiltinSkillId(skillId)) {
      db.prepare(
        `INSERT INTO deleted_builtin_skills (skill_id, deleted_at)
         VALUES (?, ?)
         ON CONFLICT(skill_id) DO UPDATE SET deleted_at = excluded.deleted_at`
      ).run(skillId, now);
    }

    db.prepare("DELETE FROM skill_learning_results WHERE skill_id = ?").run(skillId);
    db.prepare("DELETE FROM skill_files WHERE skill_id = ?").run(skillId);
    db.prepare("DELETE FROM skill_bindings WHERE skill_id = ?").run(skillId);
    db.prepare("DELETE FROM skills WHERE id = ?").run(skillId);

    const platformRows = db
      .prepare(
        `SELECT platform, enabled_skill_ids_json, image_skill_ids_json
         FROM platform_settings`
      )
      .all() as Array<{
      platform: string;
      enabled_skill_ids_json: string;
      image_skill_ids_json: string;
    }>;

    for (const row of platformRows) {
      const currentIds = JSON.parse(row.enabled_skill_ids_json) as string[];
      const currentImageIds = JSON.parse(row.image_skill_ids_json) as string[];
      const nextIds = currentIds.filter((id) => id !== skillId);
      const nextImageIds = currentImageIds.filter((id) => id !== skillId);

      if (
        nextIds.length === currentIds.length &&
        nextImageIds.length === currentImageIds.length
      ) {
        continue;
      }

      db.prepare(
        `UPDATE platform_settings
         SET enabled_skill_ids_json = ?, image_skill_ids_json = ?, updated_at = ?
         WHERE platform = ?`
      ).run(JSON.stringify(nextIds), JSON.stringify(nextImageIds), now, row.platform);
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
}
