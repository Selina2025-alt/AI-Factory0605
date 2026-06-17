# AI Content Factory

AI Content Factory is a unified content workflow that combines:

1. 数据采集与选题分析 agent
2. 内容创作与自动分发 agent

The current MVP keeps local development on SQLite by default, and supports production deployment on Vercel with Supabase Postgres through `APP_DATABASE_PROVIDER=supabase`.

## Core Features

- Multi-platform content monitoring for WeChat, Xiaohongshu and Twitter/X.
- Keyword-based collection, analysis reports and topic-library accumulation.
- Topic-library batch generation into the content creation workspace.
- WeChat article, Xiaohongshu note, Twitter/X and video-script generation.
- WeChat cover image generation with model switching.
- Content library selection and batch publishing flow.
- Local SQLite persistence for development.
- Supabase Postgres runtime persistence for production MVP.

## Project Docs

- `docs/AI-Content-Factory-3013-Project-Guide.md`
- `docs/Repository-Inventory.md`
- `docs/Multi-User-Persistence-Phase1.md`
- `docs/Supabase-Cloud-Migration.md`
- `docs/Supabase-Postgres-Phase1.md`

## Requirements

- Node.js 18+
- npm 9+

## Local Development

```bash
npm install
cp .env.example .env.local
npm run dev -- --port 3013
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
npm run dev -- --port 3013
```

Open `http://localhost:3013`.

Local development defaults:

```env
APP_DATABASE_PROVIDER=sqlite
APP_STORAGE_PROVIDER=local
CONTENT_CREATION_AGENT_DATA_ROOT=.codex-data
```

Do not commit `.env.local`, `.codex-data`, generated runtime files, or real API keys.

## Vercel + Supabase Production MVP

### 1. Supabase SQL

For a fresh Supabase project, execute:

```text
supabase/migrations/202606050001_initial_ai_factory_schema.sql
```

If you already executed an earlier Phase 1 SQL before integer flag columns were introduced, also execute:

```text
supabase/migrations/202606050002_sqlite_integer_flags_compatibility.sql
```

The compatibility migration is safe to run after either schema version.

### 2. Vercel Environment Variables

Configure these in Vercel Project Settings > Environment Variables:

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
APP_BASE_URL=https://<your-vercel-domain-or-custom-domain>

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

Never commit real values.

### 3. Vercel Cron

`vercel.json` defines the daily analysis cron route. The route is protected by `CRON_SECRET`.

## Database Runtime

The project keeps both database paths:

- `sqlite`: local development, existing `.codex-data` files remain untouched.
- `supabase`: production runtime through Supabase REST/Data API with server-side service role key.

Important files:

- `src/lib/db/migrate.ts`
- `src/lib/db/monitoring-repository.ts`
- `src/lib/db/supabase-monitoring-repository.ts`
- `src/lib/db/repositories/*`
- `src/lib/db/repositories/sqlite/*`
- `src/lib/db/supabase-content-repository.ts`
- `src/lib/supabase/data-api.ts`
- `supabase/schema.sql`
- `supabase/migrations/*`

## Common Commands

```bash
npm run lint
npm run build
npm run test
npm run db:check-production
npm run analysis:daily
```

Current verified gate for this cloudization phase:

```bash
npm run build
```

## Login And Access Protection

The current MVP uses a minimal internal login/session layer. Bootstrap account values are configured by environment variables:

```env
ACF_BOOTSTRAP_EMAIL=
ACF_BOOTSTRAP_PASSWORD=
ACF_BOOTSTRAP_NAME=
ACF_BOOTSTRAP_WORKSPACE_ID=default-workspace
ACF_BOOTSTRAP_WORKSPACE_NAME=Default Workspace
```

For public multi-tenant usage, registration and per-user encrypted API-key management are recorded as a future TODO in `docs/Multi-User-Persistence-Phase1.md`.

## Deployment Test Checklist

1. Supabase SQL executes without errors.
2. Vercel build succeeds.
3. `/login` loads and blocks unauthenticated app pages.
4. Monitor categories can be added, refreshed and reloaded.
5. Keyword collection writes rows into Supabase.
6. Analysis reports and topic-library entries persist after refresh.
7. Batch generation creates drafts/tasks and updates generation status.
8. Content library reads generated articles.
9. Publish mode defaults to mock unless real platform keys are configured.
10. `/api/cron/daily-analysis` returns 401 without the correct cron secret.

## Repository Safety

This cloudization branch should be pushed to:

```text
https://github.com/Selina2025-alt/AI-Factory0605.git
```

Do not push these cloudization changes to the older `AI-Content-Factory` remote unless explicitly requested.
