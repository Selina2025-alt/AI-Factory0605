-- AI Content Factory Supabase Postgres schema.
-- Apply this file in Supabase SQL Editor before enabling APP_DATABASE_PROVIDER=supabase.

create table if not exists auth_users (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  display_name text not null,
  status text not null default 'active',
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists auth_workspaces (
  id text primary key,
  name text not null,
  owner_user_id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists auth_workspace_members (
  workspace_id text not null,
  user_id text not null,
  role text not null,
  created_at timestamptz not null,
  primary key (workspace_id, user_id)
);

create table if not exists auth_sessions (
  token text primary key,
  user_id text not null,
  workspace_id text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null
);

create index if not exists auth_sessions_user_workspace_idx
  on auth_sessions (user_id, workspace_id, expires_at desc);

create table if not exists monitor_categories (
  workspace_id text not null,
  id text not null,
  icon text not null,
  name text not null,
  description text not null,
  keyword text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (workspace_id, id)
);

create unique index if not exists monitor_categories_workspace_name_idx
  on monitor_categories (workspace_id, name);

create table if not exists monitor_category_creators (
  workspace_id text not null,
  id text not null,
  category_id text not null,
  name text not null,
  platform_id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (workspace_id, id)
);

create index if not exists monitor_category_creators_lookup_idx
  on monitor_category_creators (workspace_id, category_id, created_at asc);

create table if not exists keyword_targets (
  id text primary key,
  workspace_id text not null default 'default-workspace',
  category_id text not null,
  keyword text not null,
  platform_ids jsonb not null,
  created_at timestamptz not null,
  last_run_at timestamptz,
  last_run_status text not null default 'idle',
  last_result_count integer not null default 0
);

create unique index if not exists keyword_targets_category_keyword_idx
  on keyword_targets (workspace_id, category_id, keyword);

create table if not exists sync_runs (
  id text primary key,
  workspace_id text not null default 'default-workspace',
  category_id text not null,
  keyword_target_id text not null,
  platform_id text not null,
  status text not null,
  result_count integer not null default 0,
  error_message text,
  started_at timestamptz not null,
  finished_at timestamptz
);

create index if not exists sync_runs_lookup_idx
  on sync_runs (workspace_id, category_id, keyword_target_id, platform_id, started_at desc);

create table if not exists collected_contents (
  workspace_id text not null default 'default-workspace',
  platform_id text not null,
  content_id text not null,
  category_id text not null,
  keyword_target_id text not null,
  sync_run_id text,
  title text not null,
  summary text,
  author_name text not null,
  author_id text,
  published_at timestamptz not null,
  publish_timestamp bigint not null default 0,
  read_count integer,
  like_count integer,
  comment_count integer,
  article_url text,
  avatar text,
  is_original boolean,
  keyword text,
  raw_order_index integer,
  source_payload jsonb,
  last_collected_at timestamptz not null,
  primary key (workspace_id, platform_id, content_id, keyword_target_id)
);

create index if not exists collected_contents_lookup_idx
  on collected_contents (workspace_id, category_id, keyword_target_id, platform_id, publish_timestamp desc);

create table if not exists search_queries (
  id text primary key,
  workspace_id text not null default 'default-workspace',
  category_id text not null,
  keyword_target_id text,
  keyword text not null,
  platform_scope text not null,
  trigger_type text not null,
  status text not null,
  fetched_count integer not null default 0,
  capped_count integer not null default 0,
  started_at timestamptz not null,
  finished_at timestamptz,
  error_message text
);

create index if not exists search_queries_lookup_idx
  on search_queries (workspace_id, category_id, started_at desc);

create table if not exists search_query_contents (
  workspace_id text not null default 'default-workspace',
  search_query_id text not null,
  category_id text not null,
  keyword_target_id text,
  platform_id text not null,
  content_id text not null,
  title text not null,
  summary text,
  author_name text not null,
  author_id text,
  published_at timestamptz not null,
  publish_timestamp bigint not null default 0,
  read_count integer,
  like_count integer,
  comment_count integer,
  article_url text,
  avatar text,
  is_original boolean,
  keyword text,
  raw_order_index integer,
  source_payload jsonb,
  last_collected_at timestamptz not null,
  primary key (workspace_id, search_query_id, platform_id, content_id)
);

create index if not exists search_query_contents_lookup_idx
  on search_query_contents (workspace_id, search_query_id, platform_id, publish_timestamp desc);

create table if not exists analysis_snapshots (
  id text primary key,
  workspace_id text not null default 'default-workspace',
  search_query_id text not null,
  category_id text not null,
  keyword text not null,
  generated_at timestamptz not null,
  hot_summary text not null,
  focus_summary text not null,
  pattern_summary text not null,
  insight_summary text not null
);

create index if not exists analysis_snapshots_lookup_idx
  on analysis_snapshots (workspace_id, search_query_id, generated_at desc);

create table if not exists analysis_topics (
  id text primary key,
  workspace_id text not null default 'default-workspace',
  snapshot_id text not null,
  title text not null,
  intro text not null,
  why_now text not null,
  hook text not null,
  growth text not null,
  support_content_ids jsonb not null
);

create index if not exists analysis_topics_lookup_idx
  on analysis_topics (workspace_id, snapshot_id);

create table if not exists analysis_settings (
  workspace_id text not null default 'default-workspace',
  singleton_key text not null,
  enabled boolean not null,
  time text not null,
  provider text not null,
  model text not null,
  updated_at timestamptz not null,
  primary key (workspace_id, singleton_key)
);

create table if not exists analysis_evidence_items (
  id text primary key,
  workspace_id text not null default 'default-workspace',
  snapshot_id text not null,
  content_id text not null,
  keyword text not null,
  platform_id text not null,
  title text not null,
  brief_summary text not null,
  key_facts_json jsonb not null,
  keywords_json jsonb not null,
  highlights_json jsonb not null,
  attention_signals_json jsonb not null,
  topic_angles_json jsonb not null,
  created_at timestamptz not null
);

create index if not exists analysis_evidence_items_snapshot_idx
  on analysis_evidence_items (workspace_id, snapshot_id);

create table if not exists topic_library_entries (
  id text primary key,
  workspace_id text not null default 'default-workspace',
  source_topic_id text not null,
  source_snapshot_id text,
  category_id text not null,
  category_name text not null,
  keyword text not null,
  report_date text,
  title text not null,
  intro text not null,
  why_now text not null,
  hook text not null,
  growth text not null,
  support_content_ids_json jsonb not null,
  selected boolean not null default true,
  is_deleted boolean not null default false,
  generation_status text not null default 'idle',
  cover_status text not null default 'idle',
  generated_task_id text,
  last_error_message text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create unique index if not exists topic_library_entries_source_topic_idx
  on topic_library_entries (workspace_id, source_topic_id);

create index if not exists topic_library_entries_deleted_idx
  on topic_library_entries (workspace_id, is_deleted, updated_at desc);

create index if not exists topic_library_entries_selected_idx
  on topic_library_entries (workspace_id, selected, is_deleted, updated_at desc);

create table if not exists drafts (
  id text primary key,
  workspace_id text not null default 'default-workspace',
  title text not null,
  prompt text not null,
  selected_platforms_json jsonb not null,
  status text not null,
  last_generated_task_id text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists drafts_workspace_updated_idx
  on drafts (workspace_id, updated_at desc);

create table if not exists tasks (
  id text primary key,
  workspace_id text not null default 'default-workspace',
  title text not null,
  user_input text not null,
  selected_platforms_json jsonb not null,
  status text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists tasks_workspace_updated_idx
  on tasks (workspace_id, updated_at desc);

create table if not exists task_contents (
  id text primary key,
  workspace_id text not null default 'default-workspace',
  task_id text not null,
  platform text not null,
  content_type text not null,
  title text not null,
  body_json jsonb not null,
  publish_status text not null,
  version integer not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists task_contents_task_platform_idx
  on task_contents (task_id, platform);

create table if not exists platform_settings (
  platform text not null,
  workspace_id text not null default 'default-workspace',
  base_rules_json jsonb not null,
  enabled_skill_ids_json jsonb not null,
  image_skill_ids_json jsonb not null default '[]'::jsonb,
  image_model text not null default 'Qwen/Qwen-Image-Edit-2509',
  updated_at timestamptz not null,
  primary key (workspace_id, platform)
);

create table if not exists skills (
  id text primary key,
  workspace_id text not null default 'default-workspace',
  name text not null,
  source_type text not null,
  source_ref text not null,
  summary text not null,
  status text not null,
  skill_kind text not null default 'content',
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists deleted_builtin_skills (
  skill_id text not null,
  workspace_id text not null default 'default-workspace',
  deleted_at timestamptz not null,
  primary key (workspace_id, skill_id)
);

create table if not exists skill_files (
  id text primary key,
  workspace_id text not null default 'default-workspace',
  skill_id text not null,
  relative_path text not null,
  file_type text not null,
  storage_path text,
  created_at timestamptz not null
);

create table if not exists skill_learning_results (
  skill_id text not null,
  workspace_id text not null default 'default-workspace',
  summary text not null,
  rules_json jsonb not null,
  platform_hints_json jsonb not null,
  keywords_json jsonb not null,
  examples_summary_json jsonb not null,
  updated_at timestamptz not null,
  primary key (workspace_id, skill_id)
);

create table if not exists skill_bindings (
  id text primary key,
  workspace_id text not null default 'default-workspace',
  platform text not null,
  skill_id text not null,
  enabled boolean not null,
  created_at timestamptz not null
);

create table if not exists history_actions (
  id text primary key,
  workspace_id text not null default 'default-workspace',
  task_id text not null,
  action_type text not null,
  payload_json jsonb not null,
  created_at timestamptz not null
);

create index if not exists history_actions_task_created_idx
  on history_actions (task_id, created_at desc);

create table if not exists library_entries (
  task_id text not null,
  workspace_id text not null default 'default-workspace',
  source_draft_id text,
  platform text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (workspace_id, task_id)
);

create index if not exists library_entries_workspace_updated_idx
  on library_entries (workspace_id, updated_at desc);

-- Optional Storage bucket bootstrap for generated assets.
-- Safe to run in Supabase SQL Editor. Service-role server code can use this private bucket.
insert into storage.buckets (id, name, public)
values ('assets', 'assets', false)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public;
