import { randomUUID } from "node:crypto";

import { openDatabase } from "@/lib/db/client";
import type { HistoryActionRecord } from "@/lib/content-creation-types";

type HistoryActionRow = {
  id: string;
  task_id: string;
  action_type: string;
  payload_json: string;
  created_at: string;
};

type CreateHistoryActionInput = {
  taskId: string;
  actionType: string;
  payload: Record<string, unknown>;
};

function mapHistoryActionRow(row: HistoryActionRow): HistoryActionRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    actionType: row.action_type,
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at
  };
}

export function createHistoryAction(input: CreateHistoryActionInput) {
  const db = openDatabase();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO history_actions (
      id,
      task_id,
      action_type,
      payload_json,
      created_at
    ) VALUES (?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    input.taskId,
    input.actionType,
    JSON.stringify(input.payload),
    now
  );

  db.close();
}

export function listHistoryActions() {
  const db = openDatabase();
  const rows = db
    .prepare(
      `SELECT id, task_id, action_type, payload_json, created_at
       FROM history_actions
       ORDER BY created_at DESC`
    )
    .all() as HistoryActionRow[];

  db.close();

  return rows.map(mapHistoryActionRow);
}
