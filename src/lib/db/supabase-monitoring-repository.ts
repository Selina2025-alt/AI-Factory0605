import {
  DEFAULT_SILICONFLOW_MODEL,
  normalizeSiliconFlowModel
} from "@/lib/analysis-models";
import type { ReplicaCategory, ReplicaTrackedPlatformId } from "@/lib/replica-workbench-data";
import type { ContentItem } from "@/lib/types";
import { DEFAULT_WORKSPACE_ID } from "@/lib/workspace/workspace-context";
import type {
  PersistedAnalysisEvidenceItem,
  PersistedAnalysisSnapshot,
  PersistedAnalysisSnapshotDetail,
  PersistedAnalysisTopic,
  PersistedGlobalAnalysisSettings,
  PersistedKeywordTarget,
  PersistedMonitorCategory,
  PersistedMonitorCategoryCreator,
  PersistedSearchQuery,
  PersistedSyncRun,
  PersistedTopicLibraryEntry,
  SyncRunStatus,
  TopicLibraryCoverStatus,
  TopicLibraryGenerationStatus
} from "@/lib/db/monitoring-repository-sqlite";
import {
  coerceSearchQueryTriggerType,
  coerceSyncRunStatus
} from "@/lib/db/monitoring-repository-sqlite";
import {
  deleteRows,
  eq,
  insertRows,
  orderBy,
  parseJsonArray,
  parseJsonObject,
  selectOne,
  selectRows,
  updateRows,
  upsertRows
} from "@/lib/supabase/data-api";

export interface SupabaseMonitoringRepository {
  provider: "supabase";
  database: {
    close: () => void;
  };
}

export function createSupabaseMonitoringRepository(): SupabaseMonitoringRepository {
  return {
    provider: "supabase",
    database: {
      close() {
        // Supabase Data API uses per-request fetch calls, so there is no local handle to close.
      }
    }
  };
}

function coerceCreatorPlatformId(value: string): ReplicaTrackedPlatformId {
  switch (value) {
    case "douyin":
    case "xiaohongshu":
    case "weibo":
    case "bilibili":
    case "twitter":
    case "wechat":
    case "zhihu":
      return value;
    default:
      return "wechat";
  }
}

function boolToInt(value: boolean) {
  return value ? 1 : 0;
}

function rowBool(value: unknown) {
  return value === true || value === 1 || value === "1";
}

function normalizeJsonArray<T>(value: unknown) {
  return parseJsonArray<T>(value);
}

function mapSearchQueryRow(row: {
  id: string;
  category_id: string;
  keyword_target_id: string | null;
  keyword: string;
  platform_scope: string;
  trigger_type: string;
  status: string;
  fetched_count: number;
  capped_count: number;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
}): PersistedSearchQuery {
  return {
    id: row.id,
    categoryId: row.category_id,
    keywordTargetId: row.keyword_target_id,
    keyword: row.keyword,
    platformScope: row.platform_scope,
    triggerType: coerceSearchQueryTriggerType(row.trigger_type),
    status: coerceSyncRunStatus(row.status),
    fetchedCount: row.fetched_count,
    cappedCount: row.capped_count,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    errorMessage: row.error_message
  };
}

function mapKeywordTargetRow(row: {
  id: string;
  category_id: string;
  keyword: string;
  platform_ids: unknown;
  created_at: string;
  last_run_at: string | null;
  last_run_status: string;
  last_result_count: number;
}): PersistedKeywordTarget {
  return {
    id: row.id,
    categoryId: row.category_id,
    keyword: row.keyword,
    platformIds: normalizeJsonArray<ReplicaTrackedPlatformId>(row.platform_ids),
    createdAt: row.created_at,
    lastRunAt: row.last_run_at,
    lastRunStatus: coerceSyncRunStatus(row.last_run_status),
    lastResultCount: row.last_result_count
  };
}

function mapAnalysisTopicRow(row: {
  id: string;
  snapshot_id: string;
  title: string;
  intro: string;
  why_now: string;
  hook: string;
  growth: string;
  support_content_ids: unknown;
}): PersistedAnalysisTopic {
  return {
    id: row.id,
    snapshotId: row.snapshot_id,
    title: row.title,
    intro: row.intro,
    whyNow: row.why_now,
    hook: row.hook,
    growth: row.growth,
    supportContentIds: normalizeJsonArray<string>(row.support_content_ids)
  };
}

function mapAnalysisSnapshotRow(row: {
  id: string;
  search_query_id: string;
  category_id: string;
  keyword: string;
  generated_at: string;
  hot_summary: string;
  focus_summary: string;
  pattern_summary: string;
  insight_summary: string;
}): PersistedAnalysisSnapshot {
  return {
    id: row.id,
    searchQueryId: row.search_query_id,
    categoryId: row.category_id,
    keyword: row.keyword,
    generatedAt: row.generated_at,
    hotSummary: row.hot_summary,
    focusSummary: row.focus_summary,
    patternSummary: row.pattern_summary,
    insightSummary: row.insight_summary
  };
}

function coerceTopicLibraryGenerationStatus(value: string): TopicLibraryGenerationStatus {
  switch (value) {
    case "generating":
    case "generated":
    case "failed":
      return value;
    default:
      return "idle";
  }
}

function coerceTopicLibraryCoverStatus(value: string): TopicLibraryCoverStatus {
  switch (value) {
    case "generated":
    case "failed":
      return value;
    default:
      return "idle";
  }
}

function mapTopicLibraryEntryRow(row: {
  id: string;
  source_topic_id: string;
  source_snapshot_id: string | null;
  category_id: string;
  category_name: string;
  keyword: string;
  report_date: string | null;
  title: string;
  intro: string;
  why_now: string;
  hook: string;
  growth: string;
  support_content_ids_json: unknown;
  selected: unknown;
  is_deleted: unknown;
  generation_status: string;
  cover_status: string;
  generated_task_id: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
}): PersistedTopicLibraryEntry {
  return {
    id: row.id,
    sourceTopicId: row.source_topic_id,
    sourceSnapshotId: row.source_snapshot_id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    keyword: row.keyword,
    reportDate: row.report_date,
    title: row.title,
    intro: row.intro,
    whyNow: row.why_now,
    hook: row.hook,
    growth: row.growth,
    supportContentIds: normalizeJsonArray<string>(row.support_content_ids_json),
    selected: rowBool(row.selected),
    isDeleted: rowBool(row.is_deleted),
    generationStatus: coerceTopicLibraryGenerationStatus(row.generation_status),
    coverStatus: coerceTopicLibraryCoverStatus(row.cover_status),
    generatedTaskId: row.generated_task_id,
    lastErrorMessage: row.last_error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapStoredContentRow(row: {
  content_id: string;
  platform_id: ContentItem["platformId"];
  title: string;
  summary: string;
  author_name: string;
  author_id: string | null;
  published_at: string;
  publish_timestamp: number;
  read_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  article_url: string | null;
  avatar: string | null;
  is_original: unknown;
  keyword: string | null;
  raw_order_index: number | null;
  source_payload: unknown;
}): ContentItem {
  const payload = parseJsonObject<Record<string, unknown>>(
    row.source_payload,
    {}
  ) as unknown as ContentItem;

  return {
    ...payload,
    id: row.content_id,
    platformId: row.platform_id,
    title: row.title,
    summary: row.summary,
    author: row.author_name,
    authorName: row.author_name,
    authorId: row.author_id ?? undefined,
    publishedAt: row.published_at,
    publishTime: row.published_at,
    publishTimestamp: row.publish_timestamp,
    readCount: row.read_count ?? undefined,
    likeCount: row.like_count ?? undefined,
    articleUrl: row.article_url ?? undefined,
    sourceUrl: row.article_url ?? undefined,
    avatar: row.avatar ?? undefined,
    isOriginal: rowBool(row.is_original),
    keyword: row.keyword ?? undefined,
    rawOrderIndex: row.raw_order_index ?? undefined,
    metrics: {
      ...payload.metrics,
      comments:
        row.comment_count !== null && row.comment_count !== undefined
          ? `${row.comment_count}`
          : payload.metrics.comments
    }
  };
}

function buildStoredContentRow(input: {
  workspaceId?: string;
  searchQueryId?: string;
  categoryId: string;
  keywordTargetId: string | null;
  platformId: ContentItem["platformId"];
  syncRunId?: string | null;
  item: ContentItem;
  collectedAt: string;
}) {
  const item = input.item;

  return {
    workspace_id: input.workspaceId ?? DEFAULT_WORKSPACE_ID,
    ...(input.searchQueryId ? { search_query_id: input.searchQueryId } : {}),
    platform_id: input.platformId,
    content_id: item.id,
    category_id: input.categoryId,
    keyword_target_id: input.keywordTargetId,
    ...(Object.prototype.hasOwnProperty.call(input, "syncRunId")
      ? { sync_run_id: input.syncRunId ?? null }
      : {}),
    title: item.title,
    summary: item.summary ?? "",
    author_name: item.authorName ?? item.author,
    author_id: item.authorId ?? null,
    published_at: item.publishTime ?? item.publishedAt,
    publish_timestamp: item.publishTimestamp ?? 0,
    read_count: item.readCount ?? null,
    like_count: item.likeCount ?? null,
    comment_count: Number.parseInt(item.metrics.comments, 10) || null,
    article_url: item.articleUrl ?? item.sourceUrl ?? null,
    avatar: item.avatar ?? null,
    is_original: item.isOriginal ? 1 : 0,
    keyword: item.keyword ?? null,
    raw_order_index: item.rawOrderIndex ?? null,
    source_payload: item,
    last_collected_at: input.collectedAt
  };
}

export async function listMonitorCategories(
  _repository: SupabaseMonitoringRepository,
  workspaceId: string
): Promise<PersistedMonitorCategory[]> {
  const rows = await selectRows<{
    workspace_id: string;
    id: string;
    icon: string;
    name: string;
    description: string;
    keyword: string;
    created_at: string;
    updated_at: string;
  }>("monitor_categories", {
    filters: { workspace_id: eq(workspaceId) },
    order: orderBy("created_at", "asc")
  });

  return rows.map((row) => ({
    workspaceId: row.workspace_id,
    id: row.id,
    icon: row.icon,
    name: row.name,
    description: row.description,
    keyword: row.keyword,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export async function listMonitorCategoryCreators(
  _repository: SupabaseMonitoringRepository,
  workspaceId: string
): Promise<PersistedMonitorCategoryCreator[]> {
  const rows = await selectRows<{
    workspace_id: string;
    id: string;
    category_id: string;
    name: string;
    platform_id: string;
    created_at: string;
    updated_at: string;
  }>("monitor_category_creators", {
    filters: { workspace_id: eq(workspaceId) },
    order: orderBy("created_at", "asc")
  });

  return rows.map((row) => ({
    workspaceId: row.workspace_id,
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    platformId: coerceCreatorPlatformId(row.platform_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export async function replaceMonitorCategoriesSnapshot(
  repository: SupabaseMonitoringRepository,
  input: {
    workspaceId: string;
    categories: Array<Pick<ReplicaCategory, "id" | "icon" | "name" | "description" | "keyword" | "creators">>;
  }
) {
  const now = new Date().toISOString();
  const existingRows = await listMonitorCategories(repository, input.workspaceId);
  const existingCreatedAtById = new Map(existingRows.map((row) => [row.id, row.createdAt]));

  await deleteRows("monitor_category_creators", { workspace_id: eq(input.workspaceId) });
  await deleteRows("monitor_categories", { workspace_id: eq(input.workspaceId) });

  if (input.categories.length === 0) {
    return;
  }

  await insertRows(
    "monitor_categories",
    input.categories.map((category) => ({
      workspace_id: input.workspaceId,
      id: category.id,
      icon: category.icon,
      name: category.name,
      description: category.description,
      keyword: category.keyword,
      created_at: existingCreatedAtById.get(category.id) ?? now,
      updated_at: now
    }))
  );

  const creators = input.categories.flatMap((category) =>
    category.creators.map((creator) => ({
      workspace_id: input.workspaceId,
      id: creator.id,
      category_id: category.id,
      name: creator.name,
      platform_id: creator.platformId,
      created_at: now,
      updated_at: now
    }))
  );

  if (creators.length > 0) {
    await insertRows("monitor_category_creators", creators);
  }
}

export async function upsertKeywordTarget(
  _repository: SupabaseMonitoringRepository,
  target: PersistedKeywordTarget
) {
  await upsertRows("keyword_targets", {
    id: target.id,
    workspace_id: DEFAULT_WORKSPACE_ID,
    category_id: target.categoryId,
    keyword: target.keyword,
    platform_ids: target.platformIds,
    created_at: target.createdAt,
    last_run_at: target.lastRunAt,
    last_run_status: target.lastRunStatus,
    last_result_count: target.lastResultCount
  }, "id");
}

export async function listKeywordTargets(
  _repository: SupabaseMonitoringRepository,
  categoryId: string
) {
  const rows = await selectRows<Parameters<typeof mapKeywordTargetRow>[0]>("keyword_targets", {
    filters: { category_id: eq(categoryId) },
    order: orderBy("created_at", "asc")
  });
  return rows.map(mapKeywordTargetRow);
}

export async function getKeywordTargetById(
  _repository: SupabaseMonitoringRepository,
  categoryId: string,
  id: string
) {
  const row = await selectOne<Parameters<typeof mapKeywordTargetRow>[0]>("keyword_targets", {
    filters: { category_id: eq(categoryId), id: eq(id) }
  });
  return row ? mapKeywordTargetRow(row) : undefined;
}

export async function listKeywordTargetsByCategory(repository: SupabaseMonitoringRepository, categoryId: string) {
  return listKeywordTargets(repository, categoryId);
}

export async function listAllKeywordTargets(_repository: SupabaseMonitoringRepository) {
  const rows = await selectRows<Parameters<typeof mapKeywordTargetRow>[0]>("keyword_targets", {
    order: "category_id.asc,created_at.asc,id.asc"
  });
  return rows.map(mapKeywordTargetRow);
}

export async function createSearchQuery(
  _repository: SupabaseMonitoringRepository,
  input: PersistedSearchQuery
) {
  await upsertRows("search_queries", {
    id: input.id,
    workspace_id: DEFAULT_WORKSPACE_ID,
    category_id: input.categoryId,
    keyword_target_id: input.keywordTargetId,
    keyword: input.keyword,
    platform_scope: input.platformScope,
    trigger_type: input.triggerType,
    status: input.status,
    fetched_count: input.fetchedCount,
    capped_count: input.cappedCount,
    started_at: input.startedAt,
    finished_at: input.finishedAt,
    error_message: input.errorMessage
  }, "id");
}

export async function finishSearchQuery(
  _repository: SupabaseMonitoringRepository,
  input: Pick<PersistedSearchQuery, "id" | "status" | "fetchedCount" | "cappedCount" | "finishedAt" | "errorMessage">
) {
  await updateRows("search_queries", { id: eq(input.id) }, {
    status: input.status,
    fetched_count: input.fetchedCount,
    capped_count: input.cappedCount,
    finished_at: input.finishedAt,
    error_message: input.errorMessage
  });
}

export async function listSearchQueries(
  _repository: SupabaseMonitoringRepository,
  categoryId?: string | null
) {
  const normalizedCategoryId = categoryId?.trim() ?? "";
  const rows = await selectRows<Parameters<typeof mapSearchQueryRow>[0]>("search_queries", {
    filters: normalizedCategoryId ? { category_id: eq(normalizedCategoryId) } : undefined,
    order: "started_at.desc,id.desc"
  });
  return rows.map(mapSearchQueryRow);
}

export async function getSearchQueryById(
  _repository: SupabaseMonitoringRepository,
  id: string
) {
  const row = await selectOne<Parameters<typeof mapSearchQueryRow>[0]>("search_queries", {
    filters: { id: eq(id) }
  });
  return row ? mapSearchQueryRow(row) : undefined;
}

export async function createSyncRun(_repository: SupabaseMonitoringRepository, input: PersistedSyncRun) {
  await insertRows("sync_runs", {
    id: input.id,
    workspace_id: DEFAULT_WORKSPACE_ID,
    category_id: input.categoryId,
    keyword_target_id: input.keywordTargetId,
    platform_id: input.platformId,
    status: input.status,
    result_count: input.resultCount,
    error_message: input.errorMessage,
    started_at: input.startedAt,
    finished_at: input.finishedAt
  });
}

export async function finishSyncRun(
  _repository: SupabaseMonitoringRepository,
  input: Pick<PersistedSyncRun, "id" | "status" | "resultCount" | "errorMessage" | "finishedAt">
) {
  const syncRun = await selectOne<{
    category_id: string;
    keyword_target_id: string;
  }>("sync_runs", { filters: { id: eq(input.id) } });

  await updateRows("sync_runs", { id: eq(input.id) }, {
    status: input.status,
    result_count: input.resultCount,
    error_message: input.errorMessage,
    finished_at: input.finishedAt
  });

  if (syncRun) {
    await updateRows("keyword_targets", { id: eq(syncRun.keyword_target_id) }, {
      last_run_at: input.finishedAt,
      last_run_status: input.status,
      last_result_count: input.resultCount
    });
  }
}

export async function upsertAnalysisSnapshot(
  _repository: SupabaseMonitoringRepository,
  input: PersistedAnalysisSnapshotDetail
) {
  await upsertRows("analysis_snapshots", {
    id: input.snapshot.id,
    workspace_id: DEFAULT_WORKSPACE_ID,
    search_query_id: input.snapshot.searchQueryId,
    category_id: input.snapshot.categoryId,
    keyword: input.snapshot.keyword,
    generated_at: input.snapshot.generatedAt,
    hot_summary: input.snapshot.hotSummary,
    focus_summary: input.snapshot.focusSummary,
    pattern_summary: input.snapshot.patternSummary,
    insight_summary: input.snapshot.insightSummary
  }, "id");

  await deleteRows("analysis_topics", { snapshot_id: eq(input.snapshot.id) });

  if (input.topics.length > 0) {
    await insertRows(
      "analysis_topics",
      input.topics.map((topic) => ({
        id: topic.id,
        workspace_id: DEFAULT_WORKSPACE_ID,
        snapshot_id: input.snapshot.id,
        title: topic.title,
        intro: topic.intro,
        why_now: topic.whyNow,
        hook: topic.hook,
        growth: topic.growth,
        support_content_ids: topic.supportContentIds
      }))
    );
  }
}

async function getAnalysisSnapshotDetailByFilter(filters: Record<string, string>, order?: string) {
  const snapshotRow = await selectOne<Parameters<typeof mapAnalysisSnapshotRow>[0]>("analysis_snapshots", {
    filters,
    order
  });

  if (!snapshotRow) {
    return undefined;
  }

  const topicRows = await selectRows<Parameters<typeof mapAnalysisTopicRow>[0]>("analysis_topics", {
    filters: { snapshot_id: eq(snapshotRow.id) },
    order: orderBy("id", "asc")
  });

  return {
    snapshot: mapAnalysisSnapshotRow(snapshotRow),
    topics: topicRows.map(mapAnalysisTopicRow)
  };
}

export async function getAnalysisSnapshotBySearchQuery(
  _repository: SupabaseMonitoringRepository,
  searchQueryId: string
) {
  return getAnalysisSnapshotDetailByFilter(
    { search_query_id: eq(searchQueryId) },
    orderBy("generated_at", "desc")
  );
}

export async function getAnalysisSnapshotById(
  _repository: SupabaseMonitoringRepository,
  snapshotId: string
) {
  return getAnalysisSnapshotDetailByFilter({ id: eq(snapshotId) });
}

export async function listAnalysisSnapshotsByKeyword(
  _repository: SupabaseMonitoringRepository,
  categoryId: string,
  keyword: string,
  limit = 14
) {
  const rows = await selectRows<Parameters<typeof mapAnalysisSnapshotRow>[0]>("analysis_snapshots", {
    filters: { category_id: eq(categoryId), keyword: eq(keyword) },
    order: orderBy("generated_at", "desc"),
    limit
  });
  return rows.map(mapAnalysisSnapshotRow);
}

export async function saveGlobalAnalysisSettings(
  _repository: SupabaseMonitoringRepository,
  settings: PersistedGlobalAnalysisSettings,
  workspaceId = DEFAULT_WORKSPACE_ID
) {
  const singletonKey =
    workspaceId === DEFAULT_WORKSPACE_ID ? "global" : `global:${workspaceId}`;

  await upsertRows("analysis_settings", {
    singleton_key: singletonKey,
    enabled: boolToInt(settings.enabled),
    time: settings.time,
    provider: settings.provider,
    model: normalizeSiliconFlowModel(settings.model),
    updated_at: new Date().toISOString()
  }, "singleton_key");
}

export async function getGlobalAnalysisSettings(
  _repository: SupabaseMonitoringRepository,
  workspaceId = DEFAULT_WORKSPACE_ID
) {
  const singletonKey =
    workspaceId === DEFAULT_WORKSPACE_ID ? "global" : `global:${workspaceId}`;
  const row = await selectOne<{
    enabled: unknown;
    time: string;
    provider: string;
    model: string;
  }>("analysis_settings", { filters: { singleton_key: eq(singletonKey) } });

  if (!row) {
    return {
      enabled: true,
      time: "08:00",
      provider: "SiliconFlow",
      model: DEFAULT_SILICONFLOW_MODEL
    };
  }

  return {
    enabled: rowBool(row.enabled),
    time: row.time,
    provider: row.provider,
    model: normalizeSiliconFlowModel(row.model)
  };
}

export async function upsertTopicLibraryEntry(
  _repository: SupabaseMonitoringRepository,
  input: Omit<PersistedTopicLibraryEntry, "createdAt" | "updatedAt">
) {
  const now = new Date().toISOString();

  await upsertRows("topic_library_entries", {
    id: input.id,
    workspace_id: DEFAULT_WORKSPACE_ID,
    source_topic_id: input.sourceTopicId,
    source_snapshot_id: input.sourceSnapshotId,
    category_id: input.categoryId,
    category_name: input.categoryName,
    keyword: input.keyword,
    report_date: input.reportDate,
    title: input.title,
    intro: input.intro,
    why_now: input.whyNow,
    hook: input.hook,
    growth: input.growth,
    support_content_ids_json: input.supportContentIds,
    selected: boolToInt(input.selected),
    is_deleted: boolToInt(input.isDeleted),
    generation_status: input.generationStatus,
    cover_status: input.coverStatus,
    generated_task_id: input.generatedTaskId,
    last_error_message: input.lastErrorMessage,
    created_at: now,
    updated_at: now
  }, "source_topic_id");
}

export async function listTopicLibraryEntries(
  _repository: SupabaseMonitoringRepository,
  options?: { selectedOnly?: boolean; includeDeleted?: boolean }
) {
  const filters: Record<string, string> = {};

  if (!options?.includeDeleted) {
    filters.is_deleted = eq(0);
  }

  if (options?.selectedOnly) {
    filters.selected = eq(1);
  }

  const rows = await selectRows<Parameters<typeof mapTopicLibraryEntryRow>[0]>("topic_library_entries", {
    filters,
    order: orderBy("updated_at", "desc")
  });
  return rows.map(mapTopicLibraryEntryRow);
}

export async function getTopicLibraryEntriesByIds(
  _repository: SupabaseMonitoringRepository,
  ids: string[]
) {
  if (ids.length === 0) {
    return [];
  }

  const rows = await selectRows<Parameters<typeof mapTopicLibraryEntryRow>[0]>("topic_library_entries");
  const idSet = new Set(ids);
  return rows.filter((row) => idSet.has(row.id)).map(mapTopicLibraryEntryRow);
}

export async function updateTopicLibrarySelection(
  _repository: SupabaseMonitoringRepository,
  ids: string[],
  selected: boolean
) {
  for (const id of ids) {
    await updateRows("topic_library_entries", { id: eq(id) }, {
      selected: boolToInt(selected),
      updated_at: new Date().toISOString()
    });
  }
}

export async function softDeleteTopicLibraryEntries(
  _repository: SupabaseMonitoringRepository,
  ids: string[],
  isDeleted: boolean
) {
  for (const id of ids) {
    await updateRows("topic_library_entries", { id: eq(id) }, {
      is_deleted: boolToInt(isDeleted),
      updated_at: new Date().toISOString()
    });
  }
}

export async function updateTopicLibraryEntryGenerationResult(
  _repository: SupabaseMonitoringRepository,
  input: {
    id: string;
    generationStatus: TopicLibraryGenerationStatus;
    coverStatus?: TopicLibraryCoverStatus;
    generatedTaskId?: string | null;
    lastErrorMessage?: string | null;
    selected?: boolean;
  }
) {
  const patch: Record<string, unknown> = {
    generation_status: input.generationStatus,
    updated_at: new Date().toISOString()
  };

  if (Object.prototype.hasOwnProperty.call(input, "coverStatus")) {
    patch.cover_status = input.coverStatus ?? null;
  }

  if (Object.prototype.hasOwnProperty.call(input, "generatedTaskId")) {
    patch.generated_task_id = input.generatedTaskId ?? null;
  }

  if (Object.prototype.hasOwnProperty.call(input, "lastErrorMessage")) {
    patch.last_error_message = input.lastErrorMessage ?? null;
  }

  if (typeof input.selected === "boolean") {
    patch.selected = boolToInt(input.selected);
  }

  await updateRows("topic_library_entries", { id: eq(input.id) }, patch);
}

export async function upsertAnalysisEvidenceItems(
  _repository: SupabaseMonitoringRepository,
  input: { snapshotId: string; items: PersistedAnalysisEvidenceItem[] }
) {
  await deleteRows("analysis_evidence_items", { snapshot_id: eq(input.snapshotId) });

  if (input.items.length === 0) {
    return;
  }

  await insertRows(
    "analysis_evidence_items",
    input.items.map((item) => ({
      id: item.id,
      workspace_id: DEFAULT_WORKSPACE_ID,
      snapshot_id: input.snapshotId,
      content_id: item.contentId,
      keyword: item.keyword,
      platform_id: item.platformId,
      title: item.title,
      brief_summary: item.briefSummary,
      key_facts_json: item.keyFacts,
      keywords_json: item.keywords,
      highlights_json: item.highlights,
      attention_signals_json: item.attentionSignals,
      topic_angles_json: item.topicAngles,
      created_at: item.createdAt
    }))
  );
}

export async function getAnalysisEvidenceItemsBySnapshotId(
  _repository: SupabaseMonitoringRepository,
  snapshotId: string
): Promise<PersistedAnalysisEvidenceItem[]> {
  const rows = await selectRows<{
    id: string;
    snapshot_id: string;
    content_id: string;
    keyword: string;
    platform_id: ContentItem["platformId"];
    title: string;
    brief_summary: string;
    key_facts_json: unknown;
    keywords_json: unknown;
    highlights_json: unknown;
    attention_signals_json: unknown;
    topic_angles_json: unknown;
    created_at: string;
  }>("analysis_evidence_items", {
    filters: { snapshot_id: eq(snapshotId) },
    order: orderBy("id", "asc")
  });

  return rows.map((row) => ({
    id: row.id,
    snapshotId: row.snapshot_id,
    contentId: row.content_id,
    keyword: row.keyword,
    platformId: row.platform_id,
    title: row.title,
    briefSummary: row.brief_summary,
    keyFacts: normalizeJsonArray<string>(row.key_facts_json),
    keywords: normalizeJsonArray<string>(row.keywords_json),
    highlights: normalizeJsonArray<string>(row.highlights_json),
    attentionSignals: normalizeJsonArray<string>(row.attention_signals_json),
    topicAngles: normalizeJsonArray<string>(row.topic_angles_json),
    createdAt: row.created_at
  }));
}

export async function upsertCollectedContents(
  _repository: SupabaseMonitoringRepository,
  input: {
    categoryId: string;
    keywordTargetId: string;
    platformId: ContentItem["platformId"];
    syncRunId: string | null;
    items: ContentItem[];
    collectedAt: string;
  }
) {
  await deleteRows("collected_contents", {
    category_id: eq(input.categoryId),
    keyword_target_id: eq(input.keywordTargetId),
    platform_id: eq(input.platformId)
  });

  if (input.items.length === 0) {
    return;
  }

  await upsertRows(
    "collected_contents",
    input.items.map((item) =>
      buildStoredContentRow({
        categoryId: input.categoryId,
        keywordTargetId: input.keywordTargetId,
        platformId: input.platformId,
        syncRunId: input.syncRunId,
        item,
        collectedAt: input.collectedAt
      })
    ),
    "workspace_id,platform_id,content_id,keyword_target_id"
  );
}

export async function replaceSearchQueryContents(
  _repository: SupabaseMonitoringRepository,
  input: {
    searchQueryId: string;
    categoryId: string;
    keywordTargetId: string | null;
    platformId: ContentItem["platformId"];
    items: ContentItem[];
    collectedAt: string;
  }
) {
  await deleteRows("search_query_contents", {
    search_query_id: eq(input.searchQueryId),
    platform_id: eq(input.platformId)
  });

  if (input.items.length === 0) {
    return;
  }

  await upsertRows(
    "search_query_contents",
    input.items.map((item) =>
      buildStoredContentRow({
        searchQueryId: input.searchQueryId,
        categoryId: input.categoryId,
        keywordTargetId: input.keywordTargetId,
        platformId: input.platformId,
        item,
        collectedAt: input.collectedAt
      })
    ),
    "workspace_id,search_query_id,platform_id,content_id"
  );
}

export async function listCollectedContents(
  _repository: SupabaseMonitoringRepository,
  input: {
    categoryId: string;
    keywordTargetId: string;
    platformId?: ContentItem["platformId"];
    limit?: number;
  }
) {
  const rows = await selectRows<Parameters<typeof mapStoredContentRow>[0]>("collected_contents", {
    filters: {
      category_id: eq(input.categoryId),
      keyword_target_id: eq(input.keywordTargetId),
      ...(input.platformId ? { platform_id: eq(input.platformId) } : {})
    },
    order: "publish_timestamp.desc,raw_order_index.asc",
    limit: input.limit ?? 100
  });
  return rows.map(mapStoredContentRow);
}

export async function listCollectedContentsBySearchQuery(
  repository: SupabaseMonitoringRepository,
  input: { searchQueryId: string; platformId?: ContentItem["platformId"]; limit?: number }
) {
  return listSearchQueryContents(repository, input);
}

export async function listSearchQueryContents(
  repository: SupabaseMonitoringRepository,
  input: { searchQueryId: string; platformId?: ContentItem["platformId"]; limit?: number }
) {
  const rows = await selectRows<Parameters<typeof mapStoredContentRow>[0]>("search_query_contents", {
    filters: {
      search_query_id: eq(input.searchQueryId),
      ...(input.platformId ? { platform_id: eq(input.platformId) } : {})
    },
    order: "raw_order_index.asc,publish_timestamp.desc",
    limit: input.limit ?? 100
  });

  if (rows.length > 0) {
    return rows.map(mapStoredContentRow);
  }

  const searchQuery = await getSearchQueryById(repository, input.searchQueryId);

  if (!searchQuery?.keywordTargetId) {
    return [];
  }

  const derivedSyncRunId = input.searchQueryId.startsWith("query-")
    ? input.searchQueryId.slice("query-".length)
    : null;

  if (!derivedSyncRunId) {
    return [];
  }

  const fallbackRows = await selectRows<Parameters<typeof mapStoredContentRow>[0]>("collected_contents", {
    filters: {
      category_id: eq(searchQuery.categoryId),
      keyword_target_id: eq(searchQuery.keywordTargetId),
      sync_run_id: eq(derivedSyncRunId),
      ...(input.platformId ? { platform_id: eq(input.platformId) } : {})
    },
    order: "raw_order_index.asc,publish_timestamp.desc",
    limit: input.limit ?? 100
  });

  return fallbackRows.map(mapStoredContentRow);
}
