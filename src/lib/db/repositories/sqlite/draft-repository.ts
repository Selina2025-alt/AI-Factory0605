import { openDatabase } from "@/lib/db/client";
import type { DraftRecord, DraftStatus, PlatformId } from "@/lib/content-creation-types";

type DraftRow = {
  id: string;
  title: string;
  prompt: string;
  selected_platforms_json: string;
  status: DraftStatus;
  last_generated_task_id: string | null;
  created_at: string;
  updated_at: string;
};

type DraftInput = {
  id: string;
  title: string;
  prompt: string;
  selectedPlatforms: PlatformId[];
  status: DraftStatus;
};

type UpsertGeneratedDraftInput = {
  id: string;
  title: string;
  prompt: string;
  selectedPlatforms: PlatformId[];
  lastGeneratedTaskId: string | null;
  status?: DraftStatus;
};

function mapDraftRow(row: DraftRow | undefined | null): DraftRecord | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    prompt: row.prompt,
    selectedPlatforms: JSON.parse(row.selected_platforms_json),
    status: row.status,
    lastGeneratedTaskId: row.last_generated_task_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function createDraft(input: DraftInput) {
  const db = openDatabase();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO drafts (
      id,
      title,
      prompt,
      selected_platforms_json,
      status,
      last_generated_task_id,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.id,
    input.title,
    input.prompt,
    JSON.stringify(input.selectedPlatforms),
    input.status,
    null,
    now,
    now
  );

  db.close();
}

export function listDrafts() {
  const db = openDatabase();
  const rows = db
    .prepare(
      `SELECT id, title, prompt, selected_platforms_json, status, last_generated_task_id, created_at, updated_at
       FROM drafts
       ORDER BY updated_at DESC`
    )
    .all() as DraftRow[];

  db.close();

  return rows.map((row) => mapDraftRow(row)).filter(Boolean) as DraftRecord[];
}

export function getDraftById(draftId: string) {
  const db = openDatabase();
  const row = db
    .prepare(
      `SELECT id, title, prompt, selected_platforms_json, status, last_generated_task_id, created_at, updated_at
       FROM drafts
       WHERE id = ?`
    )
    .get(draftId) as DraftRow | undefined;

  db.close();

  return mapDraftRow(row);
}

export function updateDraft(input: DraftInput) {
  const db = openDatabase();

  db.prepare(
    `UPDATE drafts
     SET title = ?, prompt = ?, selected_platforms_json = ?, status = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    input.title,
    input.prompt,
    JSON.stringify(input.selectedPlatforms),
    input.status,
    new Date().toISOString(),
    input.id
  );

  db.close();
}

export function markDraftGenerated(draftId: string, taskId: string) {
  const db = openDatabase();

  db.prepare(
    `UPDATE drafts
     SET status = ?, last_generated_task_id = ?, updated_at = ?
     WHERE id = ?`
  ).run("generated", taskId, new Date().toISOString(), draftId);

  db.close();
}

export function upsertGeneratedDraft(input: UpsertGeneratedDraftInput) {
  const db = openDatabase();
  const now = new Date().toISOString();
  const status = input.status ?? "generated";

  db.prepare(
    `INSERT INTO drafts (
      id,
      title,
      prompt,
      selected_platforms_json,
      status,
      last_generated_task_id,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      prompt = excluded.prompt,
      selected_platforms_json = excluded.selected_platforms_json,
      status = excluded.status,
      last_generated_task_id = excluded.last_generated_task_id,
      updated_at = excluded.updated_at`
  ).run(
    input.id,
    input.title,
    input.prompt,
    JSON.stringify(input.selectedPlatforms),
    status,
    input.lastGeneratedTaskId,
    now,
    now
  );

  db.close();
}

export function deleteDraft(draftId: string) {
  const db = openDatabase();

  db.prepare("DELETE FROM drafts WHERE id = ?").run(draftId);

  db.close();
}
