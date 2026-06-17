-- Converts early Phase 1 boolean flag columns to SQLite-compatible 0/1 integer flags.
-- Safe to run after either the old boolean schema or the updated integer schema.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'collected_contents'
      and column_name = 'is_original'
      and data_type = 'boolean'
  ) then
    alter table public.collected_contents
      alter column is_original type integer
      using case
        when is_original is null then null
        when is_original then 1
        else 0
      end;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'search_query_contents'
      and column_name = 'is_original'
      and data_type = 'boolean'
  ) then
    alter table public.search_query_contents
      alter column is_original type integer
      using case
        when is_original is null then null
        when is_original then 1
        else 0
      end;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'analysis_settings'
      and column_name = 'enabled'
      and data_type = 'boolean'
  ) then
    alter table public.analysis_settings
      alter column enabled drop default,
      alter column enabled type integer
      using case when enabled then 1 else 0 end;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'topic_library_entries'
      and column_name = 'selected'
      and data_type = 'boolean'
  ) then
    alter table public.topic_library_entries
      alter column selected drop default,
      alter column selected type integer
      using case when selected then 1 else 0 end,
      alter column selected set default 1;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'topic_library_entries'
      and column_name = 'is_deleted'
      and data_type = 'boolean'
  ) then
    alter table public.topic_library_entries
      alter column is_deleted drop default,
      alter column is_deleted type integer
      using case when is_deleted then 1 else 0 end,
      alter column is_deleted set default 0;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'skill_bindings'
      and column_name = 'enabled'
      and data_type = 'boolean'
  ) then
    alter table public.skill_bindings
      alter column enabled type integer
      using case when enabled then 1 else 0 end;
  end if;
end $$;
