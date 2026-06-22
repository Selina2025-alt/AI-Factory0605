# Vercel + Supabase Go-Live Runbook

This runbook is the final production checklist for `ai-factory0605`.

## Current Live State

Checked on 2026-06-22:

```text
Production URL: https://ai-factory0605.vercel.app
Cloud health endpoint: https://ai-factory0605.vercel.app/api/health/cloud
GitHub repository: https://github.com/Selina2025-alt/AI-Factory0605.git
```

The Vercel deployment is live. The cloud health endpoint currently reports:

```text
APP_DATABASE_PROVIDER=supabase: ok
APP_STORAGE_PROVIDER=supabase: ok
NEXT_PUBLIC_SUPABASE_URL: set
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: set
ACF_BOOTSTRAP_EMAIL: set
ACF_BOOTSTRAP_PASSWORD: set
Missing: DATABASE_URL, SUPABASE_SERVICE_ROLE_KEY
```

Do not paste real secrets into chat, Git commits, screenshots, issue comments, or documentation.

Once `DATABASE_URL` is set, this endpoint performs a direct Supabase Postgres connection probe and runs `select 1`. Once `SUPABASE_SERVICE_ROLE_KEY` is set, it also probes Supabase REST/Data API and the `assets` Storage bucket.

## Step 1: Run Supabase SQL

Open the Supabase project SQL Editor and run this generated bundle:

```text
supabase/ai_factory_supabase_go_live.sql
```

The bundle is generated from these source migrations in order:

```text
supabase/migrations/202606050001_initial_ai_factory_schema.sql
supabase/migrations/202606050002_sqlite_integer_flags_compatibility.sql
supabase/migrations/202606180001_lock_down_public_data_api.sql
```

Before copying the bundle, you can confirm it is current:

```bash
npm run supabase:bundle-sql:check
```

You can also run the broader read-only launch check:

```bash
npm run cloud:doctor
```

This checks the SQL bundle, migration files, local Vercel project link, current shell env shape, and the live `/api/health/cloud` endpoint. It only reports secret names and probe statuses, never secret values. Use `npm run cloud:doctor:strict` when you want the command to fail if the production health endpoint is still blocked.

Expected result:

```text
Business tables exist.
The private storage bucket assets exists.
Public anon/auth roles do not have direct business-table access.
Server routes can access data through the service-role key.
```

## Step 2: Add Private Vercel Variables

Add these in Vercel Project Settings > Environment Variables > Production:

```env
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@<pooler-host>:6543/postgres
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

Use the Supabase pooler connection string for `DATABASE_URL`. Keep the real password only in Supabase/Vercel, never in the repository.

Recommended local helper on Windows:

```powershell
npm run cloud:add-vercel-secrets
```

The helper prompts for `DATABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` with hidden input, then pipes them to Vercel Production. It does not print or write the values to disk.

Optional CLI pattern if already authenticated with Vercel:

```powershell
"<real-database-url>" | npx vercel@54.14.2 env add DATABASE_URL production --scope selinas-projects-d6525c85
"<real-service-role-key>" | npx vercel@54.14.2 env add SUPABASE_SERVICE_ROLE_KEY production --scope selinas-projects-d6525c85
```

Do not save those real values in shell history if using a shared machine. The Vercel Dashboard is safer for manual entry.

## Step 3: Redeploy Production

After adding the two private values, redeploy:

```powershell
npx vercel@54.14.2 deploy --prod --yes --scope selinas-projects-d6525c85
```

If the local network needs a proxy, set the proxy environment variables before running the command.

## Step 4: Verify Cloud Health

Open:

```text
https://ai-factory0605.vercel.app/api/health/cloud
```

Expected success:

```json
{
  "status": "ready"
}
```

If it is not ready, read the `checks` array. The endpoint only returns missing variable names and probe statuses; it does not return secret values.

Expected check IDs when fully configured:

```text
required-env
runtime-provider
bootstrap-credentials
supabase-postgres
supabase-rest
supabase-storage
```

Equivalent command-line check:

```bash
npm run cloud:doctor
```

## Step 5: Online Smoke Test

After `/api/health/cloud` returns `ready`, test the business flow:

1. Open `/login`.
2. Log in with the Vercel-configured bootstrap account.
3. Add a monitor category.
4. Add a creator/account under that category.
5. Run keyword refresh.
6. Confirm collected data persists after page refresh.
7. Run topic analysis.
8. Add topics to the topic library.
9. Batch-generate content.
10. Confirm generated drafts/tasks appear in the content creation workspace.
11. Add generated articles to the content library.
12. Confirm generated images load through `/api/assets/...`.
13. Confirm content library batch publishing stays in mock mode unless real publish mode is intentionally enabled.
14. Call `/api/cron/daily-analysis` without the cron secret and confirm it returns 401.

## Troubleshooting

### Missing DATABASE_URL

Add the Supabase pooler connection string to Vercel Production and redeploy.

### Missing SUPABASE_SERVICE_ROLE_KEY

Add the Supabase service-role key to Vercel Production and redeploy. Never expose this key to the browser and never prefix it with `NEXT_PUBLIC_`.

### Supabase REST probe fails

Check that the SQL migrations ran successfully and that `SUPABASE_SERVICE_ROLE_KEY` belongs to the same Supabase project as `NEXT_PUBLIC_SUPABASE_URL`.

### Storage probe fails

Check that `SUPABASE_STORAGE_BUCKET=assets` is configured and that the `assets` bucket exists. The initial migration creates it when run with sufficient Supabase privileges.

### Login fails after health is ready

Check that `ACF_BOOTSTRAP_EMAIL` and `ACF_BOOTSTRAP_PASSWORD` are configured in Vercel Production. The current `ai-factory0605` project already has these values set, but fresh deployments must add them.

## Repository Safety

Push cloud deployment work only to:

```text
https://github.com/Selina2025-alt/AI-Factory0605.git
```

Do not push these cloudization changes to:

```text
https://github.com/Selina2025-alt/AI-Content-Factory.git
```
