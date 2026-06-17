import type {
  GeneratedTaskContentBundle,
  PlatformContentRecord,
  PlatformId,
  PersistedGeneratedTaskContentBundle,
  PublishStatus
} from "@/lib/content-creation-types";
import { openDatabase } from "@/lib/db/client";

type TaskContentRow = {
  id: string;
  task_id: string;
  platform: PlatformId;
  content_type: string;
  title: string;
  body_json: string;
  publish_status: PublishStatus;
  version: number;
  created_at: string;
  updated_at: string;
};

function buildRecord(
  taskId: string,
  platform: PlatformId,
  contentType: string,
  title: string,
  body: object
): PlatformContentRecord {
  const now = new Date().toISOString();

  return {
    id: `${taskId}:${platform}`,
    taskId,
    platform,
    contentType,
    title,
    bodyJson: JSON.stringify(body),
    publishStatus: "idle",
    version: 1,
    createdAt: now,
    updatedAt: now
  };
}

function mapTaskContentRow(row: TaskContentRow): PlatformContentRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    platform: row.platform,
    contentType: row.content_type,
    title: row.title,
    bodyJson: row.body_json,
    publishStatus: row.publish_status,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function createTaskContents(
  taskId: string,
  bundle: GeneratedTaskContentBundle
) {
  const records: PlatformContentRecord[] = [];

  if (bundle.wechat) {
    records.push(
      buildRecord(taskId, "wechat", "article", bundle.wechat.title, bundle.wechat)
    );
  }

  if (bundle.xiaohongshu) {
    records.push(
      buildRecord(
        taskId,
        "xiaohongshu",
        "note",
        bundle.xiaohongshu.title,
        bundle.xiaohongshu
      )
    );
  }

  if (bundle.twitter) {
    records.push(
      buildRecord(taskId, "twitter", "thread", "Twitter Thread", bundle.twitter)
    );
  }

  if (bundle.videoScript) {
    records.push(
      buildRecord(
        taskId,
        "videoScript",
        "script",
        bundle.videoScript.title,
        bundle.videoScript
      )
    );
  }

  const db = openDatabase();
  const statement = db.prepare(
    `INSERT INTO task_contents (
      id,
      task_id,
      platform,
      content_type,
      title,
      body_json,
      publish_status,
      version,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (const record of records) {
    statement.run(
      record.id,
      record.taskId,
      record.platform,
      record.contentType,
      record.title,
      record.bodyJson,
      record.publishStatus,
      record.version,
      record.createdAt,
      record.updatedAt
    );
  }

  db.close();
}

export function replaceTaskContents(
  taskId: string,
  bundle: GeneratedTaskContentBundle
) {
  const db = openDatabase();

  db.prepare("DELETE FROM task_contents WHERE task_id = ?").run(taskId);
  db.close();

  createTaskContents(taskId, bundle);
}

export function listTaskContents(taskId: string) {
  const db = openDatabase();
  const rows = db
    .prepare(
      `SELECT id, task_id, platform, content_type, title, body_json, publish_status, version, created_at, updated_at
       FROM task_contents
       WHERE task_id = ?
       ORDER BY created_at ASC`
    )
    .all(taskId) as TaskContentRow[];

  db.close();

  return rows.map(mapTaskContentRow);
}

export function getTaskBundle(taskId: string) {
  const rows = listTaskContents(taskId);
  const bundle: PersistedGeneratedTaskContentBundle = {
    wechat: null,
    xiaohongshu: null,
    twitter: null,
    videoScript: null
  };

  for (const row of rows) {
    const content = {
      ...(JSON.parse(row.bodyJson) as Record<string, unknown>),
      publishStatus: row.publishStatus
    };

    switch (row.platform) {
      case "wechat":
        bundle.wechat = content as PersistedGeneratedTaskContentBundle["wechat"];
        break;
      case "xiaohongshu":
        bundle.xiaohongshu =
          content as PersistedGeneratedTaskContentBundle["xiaohongshu"];
        break;
      case "twitter":
        bundle.twitter = content as PersistedGeneratedTaskContentBundle["twitter"];
        break;
      case "videoScript":
        bundle.videoScript =
          content as PersistedGeneratedTaskContentBundle["videoScript"];
        break;
      default:
        break;
    }
  }

  return bundle;
}

export function updatePublishStatus(
  taskId: string,
  platform: Exclude<PlatformId, "videoScript">,
  publishStatus: PublishStatus
) {
  const db = openDatabase();

  db.prepare(
    `UPDATE task_contents
     SET publish_status = ?, updated_at = ?
     WHERE task_id = ? AND platform = ?`
  ).run(publishStatus, new Date().toISOString(), taskId, platform);

  db.close();
}

export function updateTaskPlatformContent(input: {
  taskId: string;
  platform: PlatformId;
  contentType?: string;
  title: string;
  body: object;
}) {
  const db = openDatabase();

  db.prepare(
    `UPDATE task_contents
     SET title = ?, body_json = ?, version = version + 1, updated_at = ?
     WHERE task_id = ? AND platform = ?`
  ).run(
    input.title,
    JSON.stringify(input.body),
    new Date().toISOString(),
    input.taskId,
    input.platform
  );

  db.close();
}

export function upsertTaskPlatformContent(input: {
  taskId: string;
  platform: PlatformId;
  contentType: string;
  title: string;
  body: object;
}) {
  const db = openDatabase();
  const now = new Date().toISOString();
  const id = `${input.taskId}:${input.platform}`;

  db.prepare(
    `INSERT INTO task_contents (
      id,
      task_id,
      platform,
      content_type,
      title,
      body_json,
      publish_status,
      version,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      content_type = excluded.content_type,
      title = excluded.title,
      body_json = excluded.body_json,
      publish_status = excluded.publish_status,
      version = task_contents.version + 1,
      updated_at = excluded.updated_at`
  ).run(
    id,
    input.taskId,
    input.platform,
    input.contentType,
    input.title,
    JSON.stringify(input.body),
    "idle",
    1,
    now,
    now
  );

  db.close();
}
