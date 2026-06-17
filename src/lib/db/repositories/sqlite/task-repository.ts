import { openDatabase } from "@/lib/db/client";
import type { TaskRecord, TaskStatus } from "@/lib/content-creation-types";

type TaskRow = {
  id: string;
  title: string;
  user_input: string;
  selected_platforms_json: string;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
};

type CreateTaskInput = {
  id: string;
  title: string;
  userInput: string;
  selectedPlatforms: TaskRecord["selectedPlatforms"];
  status: TaskStatus;
};

function mapTaskRow(row: TaskRow | undefined | null): TaskRecord | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    userInput: row.user_input,
    selectedPlatforms: JSON.parse(row.selected_platforms_json),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function createTask(input: CreateTaskInput) {
  const db = openDatabase();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO tasks (
      id,
      title,
      user_input,
      selected_platforms_json,
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.id,
    input.title,
    input.userInput,
    JSON.stringify(input.selectedPlatforms),
    input.status,
    now,
    now
  );

  db.close();
}

export function listTasks() {
  const db = openDatabase();
  const rows = db
    .prepare(
      `SELECT id, title, user_input, selected_platforms_json, status, created_at, updated_at
       FROM tasks
       ORDER BY updated_at DESC`
    )
    .all() as TaskRow[];

  db.close();

  return rows.map((row) => mapTaskRow(row)).filter(Boolean) as TaskRecord[];
}

export function getTaskById(taskId: string) {
  const db = openDatabase();
  const row = db
    .prepare(
      `SELECT id, title, user_input, selected_platforms_json, status, created_at, updated_at
       FROM tasks
       WHERE id = ?`
    )
    .get(taskId) as TaskRow | undefined;

  db.close();

  return mapTaskRow(row);
}

export function renameTask(taskId: string, title: string) {
  const db = openDatabase();

  db.prepare("UPDATE tasks SET title = ?, updated_at = ? WHERE id = ?").run(
    title,
    new Date().toISOString(),
    taskId
  );

  db.close();
}

export function updateTaskSelectedPlatforms(
  taskId: string,
  selectedPlatforms: TaskRecord["selectedPlatforms"]
) {
  const db = openDatabase();

  db.prepare(
    "UPDATE tasks SET selected_platforms_json = ?, updated_at = ? WHERE id = ?"
  ).run(JSON.stringify(selectedPlatforms), new Date().toISOString(), taskId);

  db.close();
}

export function deleteTask(taskId: string) {
  const db = openDatabase();

  db.prepare("DELETE FROM history_actions WHERE task_id = ?").run(taskId);
  db.prepare("DELETE FROM library_entries WHERE task_id = ?").run(taskId);
  db.prepare("DELETE FROM task_contents WHERE task_id = ?").run(taskId);
  db.prepare("DELETE FROM tasks WHERE id = ?").run(taskId);

  db.close();
}
