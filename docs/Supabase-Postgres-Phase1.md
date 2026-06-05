# Supabase Postgres Phase 1

本文档对应数据库云化第一阶段：梳理当前 SQLite 结构，生成 Supabase Postgres migration，并准备 Vercel 生产环境变量。

## 当前 SQLite 读写入口

### 监控与选题分析库

主文件：

```text
src/lib/db/database.ts
src/lib/db/schema.ts
src/lib/db/monitoring-repository.ts
```

覆盖数据：

1. 登录用户、工作空间、会话
2. 监控分类、对标账号
3. 关键词监控目标
4. 采集同步记录
5. 采集内容快照
6. 搜索历史
7. 选题分析快照、选题结果、证据项
8. 选题库汇总

### 内容创作库

主文件：

```text
src/lib/db/client.ts
src/lib/db/content-creation-schema.ts
src/lib/db/migrate.ts
src/lib/db/repositories/draft-repository.ts
src/lib/db/repositories/task-repository.ts
src/lib/db/repositories/task-content-repository.ts
src/lib/db/repositories/platform-settings-repository.ts
src/lib/db/repositories/skill-repository.ts
src/lib/db/repositories/history-action-repository.ts
src/lib/db/repositories/library-entry-repository.ts
```

覆盖数据：

1. 需求草稿箱
2. 内容生成任务
3. 多平台生成内容
4. 平台设置和图片模型设置
5. 技能库、技能文件、技能学习结果、技能绑定
6. 操作历史
7. 内容库

## Supabase Migration

需要在 Supabase SQL Editor 执行完整文件：

```text
supabase/migrations/202606050001_initial_ai_factory_schema.sql
```

该 SQL 包含：

1. 当前 SQLite 表的 Postgres 版本
2. `jsonb` 字段替换 SQLite JSON 字符串字段
3. `boolean` 字段替换 SQLite 0/1 字段
4. `timestamptz` 字段替换 SQLite 文本时间字段
5. 多用户隔离预留 `workspace_id`
6. Storage Bucket `assets` 初始化

执行方式：

1. 打开 Supabase Dashboard。
2. 进入 `AI-factory` 项目。
3. 打开 `SQL Editor`。
4. 粘贴并执行 `supabase/migrations/202606050001_initial_ai_factory_schema.sql` 全部内容。
5. 确认没有报错。

## Vercel 环境变量

在 Vercel Project Settings > Environment Variables 中配置：

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
APP_BASE_URL=https://<vercel-domain>
```

继续补充业务 API：

```env
WECHAT_MONITOR_TOKEN=<wechat-monitor-token>
XIAOHONGSHU_MONITOR_TOKEN=<xiaohongshu-monitor-token>
TWITTER_BEARER_TOKEN=<twitter-bearer-token>
SERPER_API_KEY=<serper-key>
SILICONFLOW_API_KEY=<siliconflow-key>
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
SILICONFLOW_MODEL=Pro/zai-org/GLM-5
SILICONFLOW_IMAGE_MODEL=Qwen/Qwen-Image-Edit-2509
SILICONFLOW_IMAGE_MODEL_FALLBACKS=Qwen/Qwen-Image-Edit-2509,Qwen/Qwen-Image-Edit,Qwen/Qwen-Image,Kwai-Kolors/Kolors
WECHAT_PUBLISH_MODE=mock
WECHAT_OPENAPI_KEY=<wechat-openapi-key>
WECHAT_OPENAPI_BASE_URL=https://wx.limyai.com/api/openapi
XIAOHONGSHU_PUBLISH_MODE=mock
XIAOHONGSHU_OPENAPI_KEY=<xiaohongshu-openapi-key>
XIAOHONGSHU_OPENAPI_BASE_URL=https://note.limyai.com/api/openapi
```

不要把真实值提交到 GitHub。

## 当前阶段边界

已完成：

1. SQLite 表结构盘点
2. Supabase Postgres 建表 SQL
3. Storage Bucket 初始化 SQL
4. 生产环境变量清单
5. 环境变量检查脚本
6. Supabase 配置读取兼容 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

仍需下一阶段完成：

1. 将 `src/lib/db/monitoring-repository.ts` 从同步 SQLite API 改为异步 Postgres repository。
2. 将 `src/lib/db/repositories/*` 从同步 SQLite API 改为异步 Postgres repository。
3. 将调用这些 repository 的 API Route 加上 `await`。
4. 在 Vercel 部署后验证真实 Postgres 读写。

原因：当前运行时 repository 使用 `node:sqlite` 的同步 API，Supabase Postgres 需要异步网络连接，不能只通过替换连接字符串完成。

## 本地测试步骤

```bash
npm run lint
npm run test
npm run build
npm run db:check-production
```

本地开发可以继续使用 SQLite：

```env
APP_DATABASE_PROVIDER=sqlite
APP_STORAGE_PROVIDER=local
```

## 线上部署测试步骤

1. Supabase SQL Editor 执行 migration。
2. Supabase Storage 确认存在 `assets` bucket。
3. Vercel 配置全部环境变量。
4. Vercel 部署成功。
5. 访问 `/login`。
6. 验证 `/api/cron/daily-analysis` 未带 `CRON_SECRET` 时返回 401。
7. 验证生成图片后 `/api/assets/...` 可访问。
8. 完成下一阶段 Postgres repository 后，再验证新增分类、采集、选题分析、批量生成、内容库、发布状态都写入 Supabase 表。
