import { getAppDatabaseProvider } from "@/lib/supabase/config";
import * as supabase from "@/lib/db/supabase-monitoring-repository";
import * as sqlite from "@/lib/db/monitoring-repository-sqlite";

export { initializeMonitoringDatabase } from "@/lib/db/database";
export {
  coerceSearchQueryTriggerType,
  coerceSyncRunStatus
} from "@/lib/db/monitoring-repository-sqlite";
export type {
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

export type MonitoringRepository =
  | sqlite.MonitoringRepository
  | supabase.SupabaseMonitoringRepository;

function shouldUseSupabase(database?: unknown) {
  return !database && getAppDatabaseProvider() === "supabase";
}

export function isSupabaseMonitoringRepository(
  repository: MonitoringRepository
): repository is supabase.SupabaseMonitoringRepository {
  return "provider" in repository && repository.provider === "supabase";
}

function asSqlite(repository: MonitoringRepository) {
  return repository as sqlite.MonitoringRepository;
}

function asSupabase(repository: MonitoringRepository) {
  return repository as supabase.SupabaseMonitoringRepository;
}

export function createMonitoringRepository(database?: Parameters<typeof sqlite.createMonitoringRepository>[0]): MonitoringRepository {
  if (shouldUseSupabase(database)) {
    return supabase.createSupabaseMonitoringRepository();
  }

  return sqlite.createMonitoringRepository(database);
}

export function listMonitorCategories(repository: MonitoringRepository, ...args: Tail<Parameters<typeof sqlite.listMonitorCategories>>) {
  return (isSupabaseMonitoringRepository(repository)
    ? supabase.listMonitorCategories(asSupabase(repository), ...args)
    : sqlite.listMonitorCategories(asSqlite(repository), ...args)) as ReturnType<typeof sqlite.listMonitorCategories>;
}

export function listMonitorCategoryCreators(repository: MonitoringRepository, ...args: Tail<Parameters<typeof sqlite.listMonitorCategoryCreators>>) {
  return (isSupabaseMonitoringRepository(repository)
    ? supabase.listMonitorCategoryCreators(asSupabase(repository), ...args)
    : sqlite.listMonitorCategoryCreators(asSqlite(repository), ...args)) as ReturnType<typeof sqlite.listMonitorCategoryCreators>;
}

export function replaceMonitorCategoriesSnapshot(repository: MonitoringRepository, ...args: Tail<Parameters<typeof sqlite.replaceMonitorCategoriesSnapshot>>) {
  return (isSupabaseMonitoringRepository(repository)
    ? supabase.replaceMonitorCategoriesSnapshot(asSupabase(repository), ...args)
    : sqlite.replaceMonitorCategoriesSnapshot(asSqlite(repository), ...args)) as ReturnType<typeof sqlite.replaceMonitorCategoriesSnapshot>;
}

export function upsertKeywordTarget(repository: MonitoringRepository, ...args: Tail<Parameters<typeof sqlite.upsertKeywordTarget>>) {
  return (isSupabaseMonitoringRepository(repository)
    ? supabase.upsertKeywordTarget(asSupabase(repository), ...args)
    : sqlite.upsertKeywordTarget(asSqlite(repository), ...args)) as ReturnType<typeof sqlite.upsertKeywordTarget>;
}

export function listKeywordTargets(repository: MonitoringRepository, ...args: Tail<Parameters<typeof sqlite.listKeywordTargets>>) {
  return (isSupabaseMonitoringRepository(repository)
    ? supabase.listKeywordTargets(asSupabase(repository), ...args)
    : sqlite.listKeywordTargets(asSqlite(repository), ...args)) as ReturnType<typeof sqlite.listKeywordTargets>;
}

export function getKeywordTargetById(repository: MonitoringRepository, ...args: Tail<Parameters<typeof sqlite.getKeywordTargetById>>) {
  return (isSupabaseMonitoringRepository(repository)
    ? supabase.getKeywordTargetById(asSupabase(repository), ...args)
    : sqlite.getKeywordTargetById(asSqlite(repository), ...args)) as ReturnType<typeof sqlite.getKeywordTargetById>;
}

export function listKeywordTargetsByCategory(repository: MonitoringRepository, ...args: Tail<Parameters<typeof sqlite.listKeywordTargetsByCategory>>) {
  return (isSupabaseMonitoringRepository(repository)
    ? supabase.listKeywordTargetsByCategory(asSupabase(repository), ...args)
    : sqlite.listKeywordTargetsByCategory(asSqlite(repository), ...args)) as ReturnType<typeof sqlite.listKeywordTargetsByCategory>;
}

export function listAllKeywordTargets(repository: MonitoringRepository) {
  return (isSupabaseMonitoringRepository(repository)
    ? supabase.listAllKeywordTargets(asSupabase(repository))
    : sqlite.listAllKeywordTargets(asSqlite(repository))) as ReturnType<typeof sqlite.listAllKeywordTargets>;
}

export function createSearchQuery(repository: MonitoringRepository, ...args: Tail<Parameters<typeof sqlite.createSearchQuery>>) {
  return (isSupabaseMonitoringRepository(repository)
    ? supabase.createSearchQuery(asSupabase(repository), ...args)
    : sqlite.createSearchQuery(asSqlite(repository), ...args)) as ReturnType<typeof sqlite.createSearchQuery>;
}

export function finishSearchQuery(repository: MonitoringRepository, ...args: Tail<Parameters<typeof sqlite.finishSearchQuery>>) {
  return (isSupabaseMonitoringRepository(repository)
    ? supabase.finishSearchQuery(asSupabase(repository), ...args)
    : sqlite.finishSearchQuery(asSqlite(repository), ...args)) as ReturnType<typeof sqlite.finishSearchQuery>;
}

export function listSearchQueries(repository: MonitoringRepository, ...args: Tail<Parameters<typeof sqlite.listSearchQueries>>) {
  return (isSupabaseMonitoringRepository(repository)
    ? supabase.listSearchQueries(asSupabase(repository), ...args)
    : sqlite.listSearchQueries(asSqlite(repository), ...args)) as ReturnType<typeof sqlite.listSearchQueries>;
}

export function getSearchQueryById(repository: MonitoringRepository, ...args: Tail<Parameters<typeof sqlite.getSearchQueryById>>) {
  return (isSupabaseMonitoringRepository(repository)
    ? supabase.getSearchQueryById(asSupabase(repository), ...args)
    : sqlite.getSearchQueryById(asSqlite(repository), ...args)) as ReturnType<typeof sqlite.getSearchQueryById>;
}

export function createSyncRun(repository: MonitoringRepository, ...args: Tail<Parameters<typeof sqlite.createSyncRun>>) {
  return (isSupabaseMonitoringRepository(repository)
    ? supabase.createSyncRun(asSupabase(repository), ...args)
    : sqlite.createSyncRun(asSqlite(repository), ...args)) as ReturnType<typeof sqlite.createSyncRun>;
}

export function finishSyncRun(repository: MonitoringRepository, ...args: Tail<Parameters<typeof sqlite.finishSyncRun>>) {
  return (isSupabaseMonitoringRepository(repository)
    ? supabase.finishSyncRun(asSupabase(repository), ...args)
    : sqlite.finishSyncRun(asSqlite(repository), ...args)) as ReturnType<typeof sqlite.finishSyncRun>;
}

export function upsertAnalysisSnapshot(repository: MonitoringRepository, ...args: Tail<Parameters<typeof sqlite.upsertAnalysisSnapshot>>) {
  return (isSupabaseMonitoringRepository(repository)
    ? supabase.upsertAnalysisSnapshot(asSupabase(repository), ...args)
    : sqlite.upsertAnalysisSnapshot(asSqlite(repository), ...args)) as ReturnType<typeof sqlite.upsertAnalysisSnapshot>;
}

export function getAnalysisSnapshotBySearchQuery(repository: MonitoringRepository, ...args: Tail<Parameters<typeof sqlite.getAnalysisSnapshotBySearchQuery>>) {
  return (isSupabaseMonitoringRepository(repository)
    ? supabase.getAnalysisSnapshotBySearchQuery(asSupabase(repository), ...args)
    : sqlite.getAnalysisSnapshotBySearchQuery(asSqlite(repository), ...args)) as ReturnType<typeof sqlite.getAnalysisSnapshotBySearchQuery>;
}

export function getAnalysisSnapshotById(repository: MonitoringRepository, ...args: Tail<Parameters<typeof sqlite.getAnalysisSnapshotById>>) {
  return (isSupabaseMonitoringRepository(repository)
    ? supabase.getAnalysisSnapshotById(asSupabase(repository), ...args)
    : sqlite.getAnalysisSnapshotById(asSqlite(repository), ...args)) as ReturnType<typeof sqlite.getAnalysisSnapshotById>;
}

export function listAnalysisSnapshotsByKeyword(repository: MonitoringRepository, ...args: Tail<Parameters<typeof sqlite.listAnalysisSnapshotsByKeyword>>) {
  return (isSupabaseMonitoringRepository(repository)
    ? supabase.listAnalysisSnapshotsByKeyword(asSupabase(repository), ...args)
    : sqlite.listAnalysisSnapshotsByKeyword(asSqlite(repository), ...args)) as ReturnType<typeof sqlite.listAnalysisSnapshotsByKeyword>;
}

export function saveGlobalAnalysisSettings(repository: MonitoringRepository, ...args: Tail<Parameters<typeof sqlite.saveGlobalAnalysisSettings>>) {
  return (isSupabaseMonitoringRepository(repository)
    ? supabase.saveGlobalAnalysisSettings(asSupabase(repository), ...args)
    : sqlite.saveGlobalAnalysisSettings(asSqlite(repository), ...args)) as ReturnType<typeof sqlite.saveGlobalAnalysisSettings>;
}

export function getGlobalAnalysisSettings(repository: MonitoringRepository, ...args: Tail<Parameters<typeof sqlite.getGlobalAnalysisSettings>>) {
  return (isSupabaseMonitoringRepository(repository)
    ? supabase.getGlobalAnalysisSettings(asSupabase(repository), ...args)
    : sqlite.getGlobalAnalysisSettings(asSqlite(repository), ...args)) as ReturnType<typeof sqlite.getGlobalAnalysisSettings>;
}

export function upsertTopicLibraryEntry(repository: MonitoringRepository, ...args: Tail<Parameters<typeof sqlite.upsertTopicLibraryEntry>>) {
  return (isSupabaseMonitoringRepository(repository)
    ? supabase.upsertTopicLibraryEntry(asSupabase(repository), ...args)
    : sqlite.upsertTopicLibraryEntry(asSqlite(repository), ...args)) as ReturnType<typeof sqlite.upsertTopicLibraryEntry>;
}

export function listTopicLibraryEntries(repository: MonitoringRepository, ...args: Tail<Parameters<typeof sqlite.listTopicLibraryEntries>>) {
  return (isSupabaseMonitoringRepository(repository)
    ? supabase.listTopicLibraryEntries(asSupabase(repository), ...args)
    : sqlite.listTopicLibraryEntries(asSqlite(repository), ...args)) as ReturnType<typeof sqlite.listTopicLibraryEntries>;
}

export function getTopicLibraryEntriesByIds(repository: MonitoringRepository, ...args: Tail<Parameters<typeof sqlite.getTopicLibraryEntriesByIds>>) {
  return (isSupabaseMonitoringRepository(repository)
    ? supabase.getTopicLibraryEntriesByIds(asSupabase(repository), ...args)
    : sqlite.getTopicLibraryEntriesByIds(asSqlite(repository), ...args)) as ReturnType<typeof sqlite.getTopicLibraryEntriesByIds>;
}

export function updateTopicLibrarySelection(repository: MonitoringRepository, ...args: Tail<Parameters<typeof sqlite.updateTopicLibrarySelection>>) {
  return (isSupabaseMonitoringRepository(repository)
    ? supabase.updateTopicLibrarySelection(asSupabase(repository), ...args)
    : sqlite.updateTopicLibrarySelection(asSqlite(repository), ...args)) as ReturnType<typeof sqlite.updateTopicLibrarySelection>;
}

export function softDeleteTopicLibraryEntries(repository: MonitoringRepository, ...args: Tail<Parameters<typeof sqlite.softDeleteTopicLibraryEntries>>) {
  return (isSupabaseMonitoringRepository(repository)
    ? supabase.softDeleteTopicLibraryEntries(asSupabase(repository), ...args)
    : sqlite.softDeleteTopicLibraryEntries(asSqlite(repository), ...args)) as ReturnType<typeof sqlite.softDeleteTopicLibraryEntries>;
}

export function updateTopicLibraryEntryGenerationResult(repository: MonitoringRepository, ...args: Tail<Parameters<typeof sqlite.updateTopicLibraryEntryGenerationResult>>) {
  return (isSupabaseMonitoringRepository(repository)
    ? supabase.updateTopicLibraryEntryGenerationResult(asSupabase(repository), ...args)
    : sqlite.updateTopicLibraryEntryGenerationResult(asSqlite(repository), ...args)) as ReturnType<typeof sqlite.updateTopicLibraryEntryGenerationResult>;
}

export function upsertAnalysisEvidenceItems(repository: MonitoringRepository, ...args: Tail<Parameters<typeof sqlite.upsertAnalysisEvidenceItems>>) {
  return (isSupabaseMonitoringRepository(repository)
    ? supabase.upsertAnalysisEvidenceItems(asSupabase(repository), ...args)
    : sqlite.upsertAnalysisEvidenceItems(asSqlite(repository), ...args)) as ReturnType<typeof sqlite.upsertAnalysisEvidenceItems>;
}

export function getAnalysisEvidenceItemsBySnapshotId(repository: MonitoringRepository, ...args: Tail<Parameters<typeof sqlite.getAnalysisEvidenceItemsBySnapshotId>>) {
  return (isSupabaseMonitoringRepository(repository)
    ? supabase.getAnalysisEvidenceItemsBySnapshotId(asSupabase(repository), ...args)
    : sqlite.getAnalysisEvidenceItemsBySnapshotId(asSqlite(repository), ...args)) as ReturnType<typeof sqlite.getAnalysisEvidenceItemsBySnapshotId>;
}

export function upsertCollectedContents(repository: MonitoringRepository, ...args: Tail<Parameters<typeof sqlite.upsertCollectedContents>>) {
  return (isSupabaseMonitoringRepository(repository)
    ? supabase.upsertCollectedContents(asSupabase(repository), ...args)
    : sqlite.upsertCollectedContents(asSqlite(repository), ...args)) as ReturnType<typeof sqlite.upsertCollectedContents>;
}

export function replaceSearchQueryContents(repository: MonitoringRepository, ...args: Tail<Parameters<typeof sqlite.replaceSearchQueryContents>>) {
  return (isSupabaseMonitoringRepository(repository)
    ? supabase.replaceSearchQueryContents(asSupabase(repository), ...args)
    : sqlite.replaceSearchQueryContents(asSqlite(repository), ...args)) as ReturnType<typeof sqlite.replaceSearchQueryContents>;
}

export function listCollectedContents(repository: MonitoringRepository, ...args: Tail<Parameters<typeof sqlite.listCollectedContents>>) {
  return (isSupabaseMonitoringRepository(repository)
    ? supabase.listCollectedContents(asSupabase(repository), ...args)
    : sqlite.listCollectedContents(asSqlite(repository), ...args)) as ReturnType<typeof sqlite.listCollectedContents>;
}

export function listCollectedContentsBySearchQuery(repository: MonitoringRepository, ...args: Tail<Parameters<typeof sqlite.listCollectedContentsBySearchQuery>>) {
  return (isSupabaseMonitoringRepository(repository)
    ? supabase.listCollectedContentsBySearchQuery(asSupabase(repository), ...args)
    : sqlite.listCollectedContentsBySearchQuery(asSqlite(repository), ...args)) as ReturnType<typeof sqlite.listCollectedContentsBySearchQuery>;
}

export function listSearchQueryContents(repository: MonitoringRepository, ...args: Tail<Parameters<typeof sqlite.listSearchQueryContents>>) {
  return (isSupabaseMonitoringRepository(repository)
    ? supabase.listSearchQueryContents(asSupabase(repository), ...args)
    : sqlite.listSearchQueryContents(asSqlite(repository), ...args)) as ReturnType<typeof sqlite.listSearchQueryContents>;
}

type Tail<T extends unknown[]> = T extends [unknown, ...infer Rest] ? Rest : never;
