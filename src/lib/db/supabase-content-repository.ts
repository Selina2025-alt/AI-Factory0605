import { randomUUID } from "node:crypto";

import { normalizeSiliconFlowImageModel } from "@/lib/content/siliconflow-image-models";
import type {
  DraftRecord,
  DraftStatus,
  GeneratedTaskContentBundle,
  HistoryActionRecord,
  LibraryEntryRecord,
  PlatformContentRecord,
  PlatformId,
  PersistedGeneratedTaskContentBundle,
  PublishStatus,
  SkillKind,
  SkillLearningResultRecord,
  SkillRecord,
  TaskRecord,
  TaskStatus
} from "@/lib/content-creation-types";
import {
  deleteRows,
  eq,
  insertRows,
  orderBy,
  parseJsonArray,
  selectOne,
  selectRows,
  updateRows,
  upsertRows
} from "@/lib/supabase/data-api";

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

type TaskRow = {
  id: string;
  title: string;
  user_input: string;
  selected_platforms_json: string;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
};

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

type HistoryActionRow = {
  id: string;
  task_id: string;
  action_type: string;
  payload_json: string;
  created_at: string;
};

type LibraryEntryRow = {
  task_id: string;
  source_draft_id: string | null;
  platform: PlatformId;
  created_at: string;
  updated_at: string;
};

type SkillRow = {
  id: string;
  name: string;
  source_type: SkillRecord["sourceType"];
  source_ref: string;
  summary: string;
  status: string;
  skill_kind?: SkillKind;
  created_at: string;
  updated_at: string;
};

function mapDraftRow(row: DraftRow | null): DraftRecord | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    prompt: row.prompt,
    selectedPlatforms: JSON.parse(row.selected_platforms_json) as PlatformId[],
    status: row.status,
    lastGeneratedTaskId: row.last_generated_task_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapTaskRow(row: TaskRow | null): TaskRecord | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    userInput: row.user_input,
    selectedPlatforms: JSON.parse(row.selected_platforms_json) as PlatformId[],
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
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

function mapHistoryActionRow(row: HistoryActionRow): HistoryActionRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    actionType: row.action_type,
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at
  };
}

function mapLibraryEntryRow(row: LibraryEntryRow | null): LibraryEntryRecord | null {
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

function mapSkillRow(row: SkillRow): SkillRecord {
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

function buildTaskContentRecord(
  taskId: string,
  platform: PlatformId,
  contentType: string,
  title: string,
  body: object
): TaskContentRow {
  const now = new Date().toISOString();

  return {
    id: `${taskId}:${platform}`,
    task_id: taskId,
    platform,
    content_type: contentType,
    title,
    body_json: JSON.stringify(body),
    publish_status: "idle",
    version: 1,
    created_at: now,
    updated_at: now
  };
}

function buildContentRows(taskId: string, bundle: GeneratedTaskContentBundle) {
  const records: TaskContentRow[] = [];

  if (bundle.wechat) {
    records.push(buildTaskContentRecord(taskId, "wechat", "article", bundle.wechat.title, bundle.wechat));
  }

  if (bundle.xiaohongshu) {
    records.push(buildTaskContentRecord(taskId, "xiaohongshu", "note", bundle.xiaohongshu.title, bundle.xiaohongshu));
  }

  if (bundle.twitter) {
    records.push(buildTaskContentRecord(taskId, "twitter", "thread", "Twitter Thread", bundle.twitter));
  }

  if (bundle.videoScript) {
    records.push(buildTaskContentRecord(taskId, "videoScript", "script", bundle.videoScript.title, bundle.videoScript));
  }

  return records;
}

function isBuiltinSkillId(skillId: string) {
  return skillId.startsWith("builtin-");
}

export async function createDraft(input: {
  id: string;
  title: string;
  prompt: string;
  selectedPlatforms: PlatformId[];
  status: DraftStatus;
}) {
  const now = new Date().toISOString();
  await insertRows("drafts", {
    id: input.id,
    title: input.title,
    prompt: input.prompt,
    selected_platforms_json: JSON.stringify(input.selectedPlatforms),
    status: input.status,
    last_generated_task_id: null,
    created_at: now,
    updated_at: now
  });
}

export async function listDrafts() {
  const rows = await selectRows<DraftRow>("drafts", { order: orderBy("updated_at", "desc") });
  return rows.map((row) => mapDraftRow(row)).filter(Boolean) as DraftRecord[];
}

export async function getDraftById(draftId: string) {
  return mapDraftRow(await selectOne<DraftRow>("drafts", { filters: { id: eq(draftId) } }));
}

export async function updateDraft(input: {
  id: string;
  title: string;
  prompt: string;
  selectedPlatforms: PlatformId[];
  status: DraftStatus;
}) {
  await updateRows("drafts", { id: eq(input.id) }, {
    title: input.title,
    prompt: input.prompt,
    selected_platforms_json: JSON.stringify(input.selectedPlatforms),
    status: input.status,
    updated_at: new Date().toISOString()
  });
}

export async function markDraftGenerated(draftId: string, taskId: string) {
  await updateRows("drafts", { id: eq(draftId) }, {
    status: "generated",
    last_generated_task_id: taskId,
    updated_at: new Date().toISOString()
  });
}

export async function upsertGeneratedDraft(input: {
  id: string;
  title: string;
  prompt: string;
  selectedPlatforms: PlatformId[];
  lastGeneratedTaskId: string | null;
  status?: DraftStatus;
}) {
  const now = new Date().toISOString();
  await upsertRows("drafts", {
    id: input.id,
    title: input.title,
    prompt: input.prompt,
    selected_platforms_json: JSON.stringify(input.selectedPlatforms),
    status: input.status ?? "generated",
    last_generated_task_id: input.lastGeneratedTaskId,
    created_at: now,
    updated_at: now
  }, "id");
}

export async function deleteDraft(draftId: string) {
  await deleteRows("drafts", { id: eq(draftId) });
}

export async function createTask(input: {
  id: string;
  title: string;
  userInput: string;
  selectedPlatforms: TaskRecord["selectedPlatforms"];
  status: TaskStatus;
}) {
  const now = new Date().toISOString();
  await insertRows("tasks", {
    id: input.id,
    title: input.title,
    user_input: input.userInput,
    selected_platforms_json: JSON.stringify(input.selectedPlatforms),
    status: input.status,
    created_at: now,
    updated_at: now
  });
}

export async function listTasks() {
  const rows = await selectRows<TaskRow>("tasks", { order: orderBy("updated_at", "desc") });
  return rows.map((row) => mapTaskRow(row)).filter(Boolean) as TaskRecord[];
}

export async function getTaskById(taskId: string) {
  return mapTaskRow(await selectOne<TaskRow>("tasks", { filters: { id: eq(taskId) } }));
}

export async function renameTask(taskId: string, title: string) {
  await updateRows("tasks", { id: eq(taskId) }, { title, updated_at: new Date().toISOString() });
}

export async function updateTaskSelectedPlatforms(taskId: string, selectedPlatforms: TaskRecord["selectedPlatforms"]) {
  await updateRows("tasks", { id: eq(taskId) }, {
    selected_platforms_json: JSON.stringify(selectedPlatforms),
    updated_at: new Date().toISOString()
  });
}

export async function deleteTask(taskId: string) {
  await deleteRows("history_actions", { task_id: eq(taskId) });
  await deleteRows("library_entries", { task_id: eq(taskId) });
  await deleteRows("task_contents", { task_id: eq(taskId) });
  await deleteRows("tasks", { id: eq(taskId) });
}

export async function createTaskContents(taskId: string, bundle: GeneratedTaskContentBundle) {
  const records = buildContentRows(taskId, bundle);

  if (records.length > 0) {
    await insertRows("task_contents", records);
  }
}

export async function replaceTaskContents(taskId: string, bundle: GeneratedTaskContentBundle) {
  await deleteRows("task_contents", { task_id: eq(taskId) });
  await createTaskContents(taskId, bundle);
}

export async function listTaskContents(taskId: string) {
  const rows = await selectRows<TaskContentRow>("task_contents", {
    filters: { task_id: eq(taskId) },
    order: orderBy("created_at", "asc")
  });
  return rows.map(mapTaskContentRow);
}

export async function getTaskBundle(taskId: string) {
  const rows = await listTaskContents(taskId);
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
        bundle.xiaohongshu = content as PersistedGeneratedTaskContentBundle["xiaohongshu"];
        break;
      case "twitter":
        bundle.twitter = content as PersistedGeneratedTaskContentBundle["twitter"];
        break;
      case "videoScript":
        bundle.videoScript = content as PersistedGeneratedTaskContentBundle["videoScript"];
        break;
      default:
        break;
    }
  }

  return bundle;
}

export async function updatePublishStatus(
  taskId: string,
  platform: Exclude<PlatformId, "videoScript">,
  publishStatus: PublishStatus
) {
  await updateRows("task_contents", { task_id: eq(taskId), platform: eq(platform) }, {
    publish_status: publishStatus,
    updated_at: new Date().toISOString()
  });
}

export async function updateTaskPlatformContent(input: {
  taskId: string;
  platform: PlatformId;
  contentType?: string;
  title: string;
  body: object;
}) {
  const existing = await selectOne<TaskContentRow>("task_contents", {
    filters: { task_id: eq(input.taskId), platform: eq(input.platform) }
  });

  await updateRows("task_contents", { task_id: eq(input.taskId), platform: eq(input.platform) }, {
    title: input.title,
    body_json: JSON.stringify(input.body),
    version: (existing?.version ?? 0) + 1,
    updated_at: new Date().toISOString()
  });
}

export async function upsertTaskPlatformContent(input: {
  taskId: string;
  platform: PlatformId;
  contentType: string;
  title: string;
  body: object;
}) {
  const now = new Date().toISOString();
  const id = `${input.taskId}:${input.platform}`;
  const existing = await selectOne<TaskContentRow>("task_contents", { filters: { id: eq(id) } });

  await upsertRows("task_contents", {
    id,
    task_id: input.taskId,
    platform: input.platform,
    content_type: input.contentType,
    title: input.title,
    body_json: JSON.stringify(input.body),
    publish_status: "idle",
    version: existing ? existing.version + 1 : 1,
    created_at: existing?.created_at ?? now,
    updated_at: now
  }, "id");
}

export async function createHistoryAction(input: {
  taskId: string;
  actionType: string;
  payload: Record<string, unknown>;
}) {
  await insertRows("history_actions", {
    id: randomUUID(),
    task_id: input.taskId,
    action_type: input.actionType,
    payload_json: JSON.stringify(input.payload),
    created_at: new Date().toISOString()
  });
}

export async function listHistoryActions() {
  const rows = await selectRows<HistoryActionRow>("history_actions", {
    order: orderBy("created_at", "desc")
  });
  return rows.map(mapHistoryActionRow);
}

export async function createLibraryEntry(input: {
  taskId: string;
  sourceDraftId: string | null;
  platform: PlatformId;
}) {
  const now = new Date().toISOString();
  const existing = await selectOne<LibraryEntryRow>("library_entries", {
    filters: { task_id: eq(input.taskId) }
  });

  await upsertRows("library_entries", {
    task_id: input.taskId,
    source_draft_id: input.sourceDraftId,
    platform: input.platform,
    created_at: existing?.created_at ?? now,
    updated_at: now
  }, "task_id");
}

export async function getLibraryEntry(taskId: string) {
  return mapLibraryEntryRow(await selectOne<LibraryEntryRow>("library_entries", { filters: { task_id: eq(taskId) } }));
}

export async function listLibraryEntries(platform?: PlatformId) {
  const rows = await selectRows<LibraryEntryRow>("library_entries", {
    filters: platform ? { platform: eq(platform) } : undefined,
    order: orderBy("updated_at", "desc")
  });
  return rows.map((row) => mapLibraryEntryRow(row)).filter(Boolean) as LibraryEntryRecord[];
}

export async function deleteLibraryEntry(taskId: string) {
  await deleteRows("library_entries", { task_id: eq(taskId) });
}

export async function getPlatformSetting(platform: PlatformId) {
  return await selectOne("platform_settings", { filters: { platform: eq(platform) } });
}

export async function upsertPlatformSetting(input: {
  platform: PlatformId;
  baseRulesJson: string;
  enabledSkillIdsJson: string;
  imageSkillIdsJson?: string;
  imageModel?: string;
}) {
  const existing = await getPlatformSetting(input.platform) as
    | { image_skill_ids_json?: string; image_model?: string }
    | null;
  const now = new Date().toISOString();

  await upsertRows("platform_settings", {
    platform: input.platform,
    base_rules_json: input.baseRulesJson,
    enabled_skill_ids_json: input.enabledSkillIdsJson,
    image_skill_ids_json: input.imageSkillIdsJson ?? existing?.image_skill_ids_json ?? "[]",
    image_model: normalizeSiliconFlowImageModel(input.imageModel ?? existing?.image_model),
    updated_at: now
  }, "platform");
}

export async function listSkills() {
  const rows = await selectRows<SkillRow>("skills", { order: orderBy("updated_at", "desc") });
  return rows.map(mapSkillRow);
}

export async function createSkill(input: Omit<SkillRecord, "createdAt" | "updatedAt">) {
  const now = new Date().toISOString();
  const existing = await selectOne<SkillRow>("skills", { filters: { id: eq(input.id) } });

  await upsertRows("skills", {
    id: input.id,
    name: input.name,
    source_type: input.sourceType,
    source_ref: input.sourceRef,
    summary: input.summary,
    status: input.status,
    skill_kind: input.skillKind ?? "content",
    created_at: existing?.created_at ?? now,
    updated_at: now
  }, "id");
}

export async function getSkillById(skillId: string) {
  const row = await selectOne<SkillRow>("skills", { filters: { id: eq(skillId) } });
  return row ? mapSkillRow(row) : null;
}

export async function isBuiltinSkillDeleted(skillId: string) {
  const row = await selectOne<{ skill_id: string }>("deleted_builtin_skills", {
    filters: { skill_id: eq(skillId) }
  });
  return Boolean(row);
}

export async function saveSkillLearningResult(
  skillId: string,
  input: Omit<SkillLearningResultRecord, "skillId" | "updatedAt">
) {
  await upsertRows("skill_learning_results", {
    skill_id: skillId,
    summary: input.summary,
    rules_json: JSON.stringify(input.rules),
    platform_hints_json: JSON.stringify(input.platformHints),
    keywords_json: JSON.stringify(input.keywords),
    examples_summary_json: JSON.stringify(input.examplesSummary),
    updated_at: new Date().toISOString()
  }, "skill_id");
}

export async function getSkillLearningResult(skillId: string) {
  const row = await selectOne<{
    skill_id: string;
    summary: string;
    rules_json: string | string[];
    platform_hints_json: string | string[];
    keywords_json: string | string[];
    examples_summary_json: string | string[];
    updated_at: string;
  }>("skill_learning_results", { filters: { skill_id: eq(skillId) } });

  if (!row) {
    return null;
  }

  return {
    skillId: row.skill_id,
    summary: row.summary,
    rules: parseJsonArray<string>(row.rules_json),
    platformHints: parseJsonArray<string>(row.platform_hints_json),
    keywords: parseJsonArray<string>(row.keywords_json),
    examplesSummary: parseJsonArray<string>(row.examples_summary_json),
    updatedAt: row.updated_at
  };
}

export async function deleteSkill(skillId: string) {
  const now = new Date().toISOString();

  if (isBuiltinSkillId(skillId)) {
    await upsertRows("deleted_builtin_skills", { skill_id: skillId, deleted_at: now }, "skill_id");
  }

  await deleteRows("skill_learning_results", { skill_id: eq(skillId) });
  await deleteRows("skill_files", { skill_id: eq(skillId) });
  await deleteRows("skill_bindings", { skill_id: eq(skillId) });
  await deleteRows("skills", { id: eq(skillId) });

  const platformRows = await selectRows<{
    platform: PlatformId;
    enabled_skill_ids_json: string;
    image_skill_ids_json: string;
  }>("platform_settings");

  for (const row of platformRows) {
    const currentIds = JSON.parse(row.enabled_skill_ids_json) as string[];
    const currentImageIds = JSON.parse(row.image_skill_ids_json) as string[];
    const nextIds = currentIds.filter((id) => id !== skillId);
    const nextImageIds = currentImageIds.filter((id) => id !== skillId);

    if (nextIds.length === currentIds.length && nextImageIds.length === currentImageIds.length) {
      continue;
    }

    await updateRows("platform_settings", { platform: eq(row.platform) }, {
      enabled_skill_ids_json: JSON.stringify(nextIds),
      image_skill_ids_json: JSON.stringify(nextImageIds),
      updated_at: now
    });
  }
}
