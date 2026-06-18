# Supabase Postgres Phase 1

This document tracks the first cloudization phase for AI Content Factory: production database runtime can use Supabase Postgres while local development can continue using SQLite.

## Status

Completed in this phase:

1. Preserved the original SQLite implementation for local development.
2. Added Supabase Postgres table schema and migration SQL.
3. Added a Supabase REST/Data API client for server-side runtime access.
4. Added Supabase implementations for monitoring, topic library, analysis settings, auth sessions, drafts, tasks, generated content, library entries, platform settings and skills.
5. Updated API routes and server services to await repository calls when production uses Supabase.
6. Kept existing SQLite files and local data directories untouched.
7. Verified production build with `npm run build`.
8. Verified Vercel production deployment build for project `ai-factory0605`.
9. Marked server-rendered data pages as dynamic so Vercel build does not prerender pages that need Supabase runtime secrets.
10. Updated `next.config.ts` so Vercel uses the standard `.next` build output while local production builds can keep `.next-build`.

Not completed in this phase:

1. Full public self-registration.
2. Per-user encrypted API-key storage in database.
3. Optional Storage-backed implementation for custom uploaded/GitHub-installed skill files.
4. Long-running background job queue beyond current Vercel-compatible API/Cron structure.
5. Final online runtime verification, because `DATABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are not yet configured in Vercel.

## Runtime Switch

Local development can stay on SQLite:

```env
APP_DATABASE_PROVIDER=sqlite
APP_STORAGE_PROVIDER=local
```

Production should use Supabase:

```env
APP_DATABASE_PROVIDER=supabase
APP_STORAGE_PROVIDER=supabase
```

The runtime switch is implemented in:

```text
src/lib/db/migrate.ts
src/lib/db/monitoring-repository.ts
src/lib/db/supabase-monitoring-repository.ts
src/lib/db/repositories/*.ts
src/lib/db/repositories/sqlite/*.ts
src/lib/db/supabase-content-repository.ts
src/lib/supabase/data-api.ts
```

## SQLite Read/Write Areas Covered

Monitoring and analysis:

1. Auth users, workspaces and sessions.
2. Monitor categories and creators.
3. Keyword targets.
4. Search queries and sync runs.
5. Collected content and search-query content snapshots.
6. Analysis snapshots, topics and evidence items.
7. Global analysis settings.
8. Topic library entries.

Content creation:

1. Draft inbox.
2. Generation tasks.
3. Multi-platform generated task contents.
4. History actions.
5. Content library entries.
6. Platform settings and image model settings.
7. Skills, skill learning results and skill bindings.

## Supabase SQL Execution

For a fresh Supabase project, run this SQL in Supabase SQL Editor:

```text
supabase/migrations/202606050001_initial_ai_factory_schema.sql
```

Then run the follow-up migrations in order. The compatibility migration is safe to run after either schema version.

```text
supabase/migrations/202606050002_sqlite_integer_flags_compatibility.sql
supabase/migrations/202606180001_lock_down_public_data_api.sql
```

The compatibility migration converts these early boolean columns to SQLite-compatible integer flags:

```text
collected_contents.is_original
search_query_contents.is_original
analysis_settings.enabled
topic_library_entries.selected
topic_library_entries.is_deleted
skill_bindings.enabled
```

The current schema stores those flags as `integer` using `0` and `1`, matching the existing SQLite semantics and the Supabase REST runtime implementation.

## Environment Variables For Vercel

Required production variables:

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

Business API variables:

```env
WECHAT_MONITOR_TOKEN=<wechat-monitor-token>
XIAOHONGSHU_MONITOR_TOKEN=<xiaohongshu-monitor-token>
TWITTER_BEARER_TOKEN=<twitter-bearer-token>
SERPER_API_KEY=<serper-key>
SILICONFLOW_API_KEY=<siliconflow-key>
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
SILICONFLOW_MODEL=Pro/zai-org/GLM-5
SILICONFLOW_TEXT_MODEL=Pro/zai-org/GLM-4.7
SILICONFLOW_IMAGE_MODEL=Qwen/Qwen-Image-Edit-2509
SILICONFLOW_IMAGE_MODEL_FALLBACKS=Qwen/Qwen-Image-Edit-2509,Qwen/Qwen-Image-Edit,Qwen/Qwen-Image,Kwai-Kolors/Kolors
WECHAT_PUBLISH_MODE=mock
WECHAT_OPENAPI_KEY=<wechat-openapi-key>
WECHAT_OPENAPI_BASE_URL=https://wx.limyai.com/api/openapi
XIAOHONGSHU_PUBLISH_MODE=mock
XIAOHONGSHU_OPENAPI_KEY=<xiaohongshu-openapi-key>
XIAOHONGSHU_OPENAPI_BASE_URL=https://note.limyai.com/api/openapi
```

Bootstrap/internal access variables:

```env
ACF_BOOTSTRAP_EMAIL=<admin-email>
ACF_BOOTSTRAP_PASSWORD=<admin-password>
ACF_BOOTSTRAP_NAME=<admin-name>
ACF_BOOTSTRAP_WORKSPACE_ID=default-workspace
ACF_BOOTSTRAP_WORKSPACE_NAME=Default Workspace
```

Do not commit real values.

## Supabase Storage

The SQL creates or verifies the `assets` storage bucket. Production should use:

```env
SUPABASE_STORAGE_BUCKET=assets
```

Generated image assets are cloud-ready when `APP_STORAGE_PROVIDER=supabase`: writes go to the private `assets/generated-assets/...` bucket, `/api/assets/...` reads from that bucket, and image-package export uses the same abstraction. Custom skill ZIP/GitHub install remains local-only and returns `501` in Supabase storage mode.

## Vercel Deployment Notes

1. Import the GitHub repository in Vercel, or use the existing project `ai-factory0605`.
2. Set Framework Preset to Next.js.
3. Configure all environment variables above. `DATABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must be real values, not placeholders.
4. Keep `ENABLE_AUTO_PUBLISH=false` for the MVP unless real publishing is intentionally enabled.
5. Deploy.
6. Use Vercel Cron from `vercel.json` for daily analysis; the UI analysis time is a stored preference, while production schedule changes require editing `vercel.json` and redeploying.
7. Protect `/api/cron/daily-analysis` with `CRON_SECRET`.
8. If Vercel reports a missing `.next` output directory, confirm the deployed commit includes the `process.env.VERCEL === "1"` branch in `next.config.ts`.

## Local Verification

```bash
npm run build
npm run db:check-production
```

Optional broader checks:

```bash
npm run lint
npm run test
```

Note: local tests may still use SQLite paths and legacy fixture data. Production readiness for this phase is primarily verified by build plus Supabase SQL/env configuration.

## Online Smoke Test

After deployment:

1. Visit `/login`.
2. Log in with the configured bootstrap account.
3. Add a monitor category and creator.
4. Refresh a keyword target.
5. Confirm collected rows appear in Supabase tables.
6. Run topic analysis and add topics to the topic library.
7. Batch-generate selected topics.
8. Confirm drafts, tasks and task contents are written to Supabase.
9. Open content library and verify generated articles are visible.
10. Open a generated `/api/assets/...` image URL and verify it loads.
11. Export an image package and verify Supabase-backed images are included.
12. Call `/api/cron/daily-analysis` without `CRON_SECRET` and confirm it returns 401.
13. Confirm custom skill ZIP/GitHub install endpoints return `501` in Supabase storage mode.

## Repository Target

Push this cloudized version to:

```text
https://github.com/Selina2025-alt/AI-Factory0605.git
```

Do not push to the older `AI-Content-Factory` remote unless the user explicitly asks.
