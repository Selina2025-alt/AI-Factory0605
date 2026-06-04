# Vercel Supabase Cloud Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move AI Content Factory toward Vercel + Supabase deployment while preserving the local SQLite workflow.

**Architecture:** Add environment-switchable infrastructure adapters before rewriting business repositories. Local development keeps SQLite and `.codex-data`; production can use Supabase Storage and Vercel Cron immediately, with Postgres repository migration planned as Phase 2.

**Tech Stack:** Next.js App Router, TypeScript, Vercel Cron, Supabase Postgres, Supabase Storage, existing SQLite repositories.

---

### Task 1: Rollback Marker

**Files:**
- Git tag: `rollback/pre-vercel-supabase-20260604`

- [x] **Step 1: Tag the current stable commit**

Run:

```bash
git tag rollback/pre-vercel-supabase-20260604 e4f6e08
```

Expected: tag exists and points to the pre-cloud stable commit.

### Task 2: Supabase Runtime Config

**Files:**
- Create: `src/lib/supabase/config.ts`

- [x] **Step 1: Add provider and Supabase env readers**

Expose:

```ts
getAppDatabaseProvider()
getAppStorageProvider()
getSupabaseRuntimeConfig()
requireSupabaseRuntimeConfig()
encodeSupabaseObjectPath()
```

Expected: local defaults to SQLite/local storage; production can set Supabase providers via environment variables.

### Task 3: Generated Asset Storage Adapter

**Files:**
- Create: `src/lib/storage/generated-asset-storage.ts`
- Modify: `src/lib/assets/generated-asset-service.ts`
- Modify: `src/app/api/assets/[...assetPath]/route.ts`

- [x] **Step 1: Add local/Supabase generated asset persistence**

Local mode writes into `.codex-data/generated-assets`.

Supabase mode uploads into:

```text
acf-assets/generated-assets/{platform}/{fileName}
```

- [x] **Step 2: Keep public API path stable**

Generated content still stores:

```text
/api/assets/{platform}/{fileName}
```

Expected: UI and publish flows do not need URL changes.

### Task 4: Vercel Cron Entry

**Files:**
- Create: `src/lib/analysis-daily-runner.ts`
- Create: `src/app/api/cron/daily-analysis/route.ts`
- Modify: `scripts/run-daily-analysis.ts`
- Create: `vercel.json`

- [x] **Step 1: Share daily analysis runner**

Both local script and Vercel route call `runDailyAnalysis()`.

- [x] **Step 2: Protect cron route**

Production requires:

```env
CRON_SECRET=...
```

Expected: `GET /api/cron/daily-analysis` returns 401 without the bearer token in production.

### Task 5: Supabase Schema Draft

**Files:**
- Create: `supabase/schema.sql`

- [x] **Step 1: Convert current SQLite tables to Postgres DDL**

Include monitoring tables, auth tables, content creation tables, indexes, `jsonb`, and `timestamptz`.

Expected: SQL can be reviewed and applied in Supabase SQL Editor before Phase 2 repository migration.

- [x] **Step 2: Reserve workspace isolation columns**

Add `workspace_id` to monitoring, collection, topic analysis, topic library, and content configuration tables so Phase 2 can keep user data isolated when repositories move to Postgres.

### Task 6: Documentation

**Files:**
- Create: `docs/Supabase-Cloud-Migration.md`
- Modify: `README.md`
- Modify: `.env.example`

- [x] **Step 1: Document deployment variables and steps**

Cover Vercel, Supabase Postgres, Supabase Storage, Vercel Cron, and Aliyun DNS.

- [x] **Step 2: Keep README concise**

README should link to the cloud migration doc and list only the core variables.

### Task 7: Verification

**Files:**
- No production files.

- [x] **Step 1: Run lint**

```bash
npm run lint
```

- [x] **Step 2: Run focused tests**

```bash
npm run test -- src/lib/assets/__tests__/generated-asset-service.test.ts src/app/api/analysis/settings/__tests__/route.test.ts
```

- [x] **Step 3: Run build**

```bash
npm run build
```

Expected: all commands pass before commit.

- [x] **Step 4: Run full test suite**

```bash
npm run test
```

Expected: all tests pass. Existing React `act(...)` warnings may appear in workbench tests, but they should not fail the suite.

### Phase 2 Backlog

- [ ] Replace SQLite repository implementations with async Supabase Postgres implementations.
- [ ] Move skill upload and GitHub skill unpack files to Supabase Storage.
- [ ] Move export package storage to Supabase Storage or streamed responses.
- [ ] Split long batch generation into durable task queue records.
- [ ] Remove Windows-only PowerShell fallback for production paths.
- [ ] Decide whether to keep custom auth or adopt Supabase Auth when public registration starts.
