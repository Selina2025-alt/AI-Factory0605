import { openDatabase } from "@/lib/db/client";
import type { LibraryEntryRecord, PlatformId } from "@/lib/content-creation-types";

type LibraryEntryRow = {
  task_id: string;
  source_draft_id: string | null;
  platform: PlatformId;
  created_at: string;
  updated_at: string;
};

function mapLibraryEntryRow(
  row: LibraryEntryRow | undefined | null
): LibraryEntryRecord | null {
  if (!row) {
    return null;
  }

  return {
    taskId: row.task_id,
    sourceDraftId: row.source_draft_id,
    platform: row.platform,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function createLibraryEntry(input: {
  taskId: string;
  sourceDraftId: string | null;
  platform: PlatformId;
}) {
  const db = openDatabase();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO library_entries (
      task_id,
      source_draft_id,
      platform,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(task_id) DO UPDATE SET
      source_draft_id = excluded.source_draft_id,
      platform = excluded.platform,
      updated_at = excluded.updated_at`
  ).run(input.taskId, input.sourceDraftId, input.platform, now, now);

  db.close();
}

export function getLibraryEntry(taskId: string) {
  const db = openDatabase();
  const row = db
    .prepare(
      `SELECT task_id, source_draft_id, platform, created_at, updated_at
       FROM library_entries
       WHERE task_id = ?`
    )
    .get(taskId) as LibraryEntryRow | undefined;

  db.close();

  return mapLibraryEntryRow(row);
}

export function listLibraryEntries(platform?: PlatformId) {
  const db = openDatabase();
  const rows = platform
    ? (db
        .prepare(
          `SELECT task_id, source_draft_id, platform, created_at, updated_at
           FROM library_entries
           WHERE platform = ?
           ORDER BY updated_at DESC`
        )
        .all(platform) as LibraryEntryRow[])
    : (db
        .prepare(
          `SELECT task_id, source_draft_id, platform, created_at, updated_at
           FROM library_entries
           ORDER BY updated_at DESC`
        )
        .all() as LibraryEntryRow[]);

  db.close();

  return rows
    .map((row) => mapLibraryEntryRow(row))
    .filter(Boolean) as LibraryEntryRecord[];
}

export function deleteLibraryEntry(taskId: string) {
  const db = openDatabase();

  db.prepare("DELETE FROM library_entries WHERE task_id = ?").run(taskId);

  db.close();
}
