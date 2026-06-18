# Vercel + Supabase Cloud Migration

This document summarizes the current MVP cloudization path for AI Content Factory.

## Current Status

Completed:

1. Vercel-ready Next.js project structure.
2. Vercel Cron route for daily analysis: `src/app/api/cron/daily-analysis/route.ts`.
3. Supabase config loader: `src/lib/supabase/config.ts`.
4. Supabase Storage-aware generated asset write/read path: `src/lib/storage/generated-asset-storage.ts` and `src/app/api/assets/[...assetPath]/route.ts`.
5. Supabase Postgres schema and migrations in `supabase/migrations`.
6. Production database runtime switch with `APP_DATABASE_PROVIDER=supabase`.
7. Local SQLite remains available with `APP_DATABASE_PROVIDER=sqlite`.
8. Production build verified with `npm run build`.
9. Image-package export reads `/api/assets/...` from Supabase Storage in production.
10. Vercel/Supabase runtime no longer tries to create Windows `schtasks.exe` jobs.
11. Custom ZIP/GitHub skill install endpoints fail fast with `501` in Supabase storage mode instead of writing local Vercel disk.
12. Business tables are explicitly private from browser anon/auth roles; server routes use service-role access.
13. Vercel project `ai-factory0605` has been created and linked to the local project.
14. Production deployment to `https://ai-factory0605.vercel.app` succeeds after marking runtime-data pages dynamic and using Vercel's default `.next` output directory.

Current live smoke status:

1. `/login` returns 200.
2. `/` redirects to `/login?next=%2F` for unauthenticated users.
3. Data APIs currently return server errors until `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and Supabase SQL migrations are completed.

Still pending for later phases:

1. Full self-registration and public multi-tenant onboarding.
2. Per-user encrypted API-key management UI and storage.
3. Optional full Supabase Storage implementation for custom uploaded/GitHub-installed skill files.
4. Durable background queue for very long batch generation jobs.
5. Optional Supabase Auth/RLS hardening.

Still pending before the production MVP is usable end-to-end:

1. Add real `DATABASE_URL` to Vercel Production.
2. Add real `SUPABASE_SERVICE_ROLE_KEY` to Vercel Production.
3. Run all Supabase SQL migrations in the Supabase SQL Editor.
4. Redeploy after adding those two private values.

## Minimum Production Path

1. Create a Supabase project.
2. Run SQL migration `202606050001_initial_ai_factory_schema.sql`.
3. Run follow-up migrations `202606050002_sqlite_integer_flags_compatibility.sql` and `202606180001_lock_down_public_data_api.sql` in order.
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

Generated images are persisted under `generated-assets/...` when `APP_STORAGE_PROVIDER=supabase`. The server route `/api/assets/...` reads those private bucket objects through the service role key. Image-package export also uses the same storage abstraction, so downloaded packages include cloud-backed images.

For real Xiaohongshu/WeChat publishing, configure `APP_BASE_URL` to the Vercel/custom domain so relative `/api/assets/...` image URLs become public absolute URLs.

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

The current MVP supports generated-image storage on Supabase. Custom skill uploads and GitHub skill installs are intentionally local-only and return `501` in Supabase storage mode until a future Storage-backed skill-file implementation is added.

## Vercel Cron

`vercel.json` defines the scheduled route. The route should require:

```env
CRON_SECRET=<random-secret>
```

Smoke test: calling the cron endpoint without the correct secret should return 401.

## Vercel Project Notes

Current project:

```text
Team: Selina's projects
Project: ai-factory0605
Production URL: https://ai-factory0605.vercel.app
```

The project must use the Next.js framework preset. `next.config.ts` keeps local production builds in `.next-build`, but switches to `.next` on Vercel through `process.env.VERCEL`, because Vercel's Next.js adapter expects `.next`.

## Risks

1. Supabase REST/Data API calls are network-bound; very large batch jobs may exceed Vercel route time limits.
2. Real publishing should stay disabled until provider keys and account selection are verified.
3. Custom uploaded/GitHub-installed skills are not durable on Vercel yet; use built-in skills or local storage for custom skill development.
4. Public multi-user operation still needs registration, per-user API-key storage, and stronger access controls.
5. `APP_BASE_URL` must be public and correct before real publishing uses generated `/api/assets/...` images.

## Verification Checklist

Local:

```bash
npm run lint
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
9. `/api/assets/...` generated images load from Supabase Storage.
10. Custom skill upload/install returns `501` in Supabase storage mode.

## Target Repository

Push cloudized MVP updates to:

```text
https://github.com/Selina2025-alt/AI-Factory0605.git
```

Do not push to `AI-Content-Factory.git` unless explicitly requested.
