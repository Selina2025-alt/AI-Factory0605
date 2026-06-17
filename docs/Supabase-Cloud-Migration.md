# Vercel + Supabase Cloud Migration

This document summarizes the current MVP cloudization path for AI Content Factory.

## Current Status

Completed:

1. Vercel-ready Next.js project structure.
2. Vercel Cron route for daily analysis: `src/app/api/cron/daily-analysis/route.ts`.
3. Supabase config loader: `src/lib/supabase/config.ts`.
4. Supabase Storage-aware asset route: `src/app/api/assets/[...assetPath]/route.ts`.
5. Supabase Postgres schema and migrations in `supabase/migrations`.
6. Production database runtime switch with `APP_DATABASE_PROVIDER=supabase`.
7. Local SQLite remains available with `APP_DATABASE_PROVIDER=sqlite`.
8. Production build verified with `npm run build`.

Still pending for later phases:

1. Full self-registration and public multi-tenant onboarding.
2. Per-user encrypted API-key management UI and storage.
3. Full audit/migration of every local `node:fs` write to Supabase Storage.
4. Durable background queue for very long batch generation jobs.
5. Optional Supabase Auth/RLS hardening.

## Minimum Production Path

1. Create a Supabase project.
2. Run SQL migration `202606050001_initial_ai_factory_schema.sql`.
3. If you previously ran the older boolean-column SQL, also run `202606050002_sqlite_integer_flags_compatibility.sql`.
4. Configure Vercel Environment Variables.
5. Deploy the GitHub repository on Vercel.
6. Test login, monitor categories, collection, analysis, topic library, batch generation and content library.

## Environment Variables

```env
APP_DATABASE_PROVIDER=supabase
APP_STORAGE_PROVIDER=supabase
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@<pooler-host>:6543/postgres
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_STORAGE_BUCKET=assets
CRON_SECRET=<random-secret>
ENABLE_AUTO_PUBLISH=false
APP_BASE_URL=https://<vercel-domain-or-custom-domain>
```

Business provider variables are documented in `README.md` and `docs/Supabase-Postgres-Phase1.md`.

Do not commit real secrets.

## Supabase Database

The current migration covers:

- Workspaces, users and sessions.
- Monitor categories and creators.
- Keyword targets.
- Search queries and sync runs.
- Collected content snapshots.
- Analysis snapshots, topics and evidence.
- Analysis settings.
- Topic library.
- Drafts, generation tasks and generated task contents.
- History actions and content library entries.
- Platform settings, skills, skill learning results and skill bindings.

## Supabase Storage

Current bucket:

```text
assets
```

Recommended future path layout:

```text
assets/
  generated-assets/
    wechat/
    xiaohongshu/
  uploads/
  exports/
  skills/
```

The current MVP has Storage-aware configuration, but a later phase should complete a full `node:fs` write audit before relying on Vercel-only runtime for all file-producing workflows.

## Vercel Cron

`vercel.json` defines the scheduled route. The route should require:

```env
CRON_SECRET=<random-secret>
```

Smoke test: calling the cron endpoint without the correct secret should return 401.

## Risks

1. Supabase REST/Data API calls are network-bound; very large batch jobs may exceed Vercel route time limits.
2. Real publishing should stay disabled until provider keys and account selection are verified.
3. Local generated files are not automatically uploaded unless the Storage path is used.
4. Public multi-user operation still needs registration, per-user API-key storage, and stronger access controls.

## Verification Checklist

Local:

```bash
npm run build
npm run db:check-production
```

Online:

1. Login works.
2. Monitor categories persist after refresh.
3. Keyword refresh writes collected content.
4. Analysis report writes snapshots and evidence.
5. Topic library selection persists.
6. Batch generation creates drafts and task contents.
7. Content library lists generated articles.
8. Cron endpoint is protected.

## Target Repository

Push cloudized MVP updates to:

```text
https://github.com/Selina2025-alt/AI-Factory0605.git
```

Do not push to `AI-Content-Factory.git` unless explicitly requested.
