# Vercel + Supabase 云化改造说明

本文档对应 Phase 1 云化骨架：保留本地 SQLite 和 `.codex-data`，新增生产环境 Supabase Postgres、Supabase Storage、Vercel Cron 入口。

## 1. 当前状态

已完成：

1. 新增 Supabase 环境配置读取：`src/lib/supabase/config.ts`
2. 新增生成图片 Storage 适配：`src/lib/storage/generated-asset-storage.ts`
3. `/api/assets/...` 支持按环境读取本地文件或 Supabase Storage
4. 新增 Vercel Cron 入口：`src/app/api/cron/daily-analysis/route.ts`
5. 本地每日分析脚本复用同一段 runner：`src/lib/analysis-daily-runner.ts`
6. 新增 Vercel Cron 配置：`vercel.json`
7. 新增 Supabase 建表草案：`supabase/schema.sql`

尚未完成：

1. SQLite repository 全量替换为 Supabase Postgres repository
2. 技能上传、GitHub 技能安装、导出文件全量迁移到 Storage
3. 长批量任务队列化
4. Supabase Auth / RLS

## 2. 生产环境变量

Vercel Project Settings > Environment Variables 添加：

```env
APP_DATABASE_PROVIDER=supabase
APP_STORAGE_PROVIDER=supabase
DATABASE_URL=postgresql://...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=replace-with-service-role-key
SUPABASE_STORAGE_BUCKET=acf-assets
CRON_SECRET=replace-with-random-secret
APP_BASE_URL=https://your-domain.example

ACF_BOOTSTRAP_EMAIL=admin@example.com
ACF_BOOTSTRAP_PASSWORD=replace-with-strong-password
ACF_BOOTSTRAP_NAME=Admin
ACF_BOOTSTRAP_WORKSPACE_ID=default-workspace
ACF_BOOTSTRAP_WORKSPACE_NAME=Default Workspace

WECHAT_MONITOR_TOKEN=replace-with-token
XIAOHONGSHU_MONITOR_TOKEN=replace-with-token
TWITTER_BEARER_TOKEN=replace-with-token
SERPER_API_KEY=replace-with-key

SILICONFLOW_API_KEY=replace-with-key
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
SILICONFLOW_MODEL=Pro/zai-org/GLM-5
SILICONFLOW_IMAGE_MODEL=Qwen/Qwen-Image-Edit-2509
SILICONFLOW_IMAGE_MODEL_FALLBACKS=Qwen/Qwen-Image-Edit-2509,Qwen/Qwen-Image-Edit,Qwen/Qwen-Image,Kwai-Kolors/Kolors
SILICONFLOW_TIMEOUT_MS=180000
SILICONFLOW_IMAGE_TIMEOUT_MS=180000
SILICONFLOW_IMAGE_LIMIT=9

WECHAT_PUBLISH_MODE=real
WECHAT_OPENAPI_KEY=replace-with-key
WECHAT_OPENAPI_BASE_URL=https://wx.limyai.com/api/openapi
XIAOHONGSHU_PUBLISH_MODE=real
XIAOHONGSHU_OPENAPI_KEY=replace-with-key
XIAOHONGSHU_OPENAPI_BASE_URL=https://note.limyai.com/api/openapi
```

不要在 GitHub 提交真实密钥。

## 3. Supabase 数据库

1. 新建 Supabase 项目。
2. 打开 SQL Editor。
3. 执行 `supabase/schema.sql`。
4. 复制 Supabase transaction pooler 的 Postgres 连接串到 `DATABASE_URL`。

说明：

1. 当前 Phase 1 已提供建表草案，但业务 repository 仍默认 SQLite。
2. 建表草案已为监控、采集、选题分析、选题库、内容创作核心表预留 `workspace_id`，方便后续多账号隔离。
3. 后续 Phase 2 会把 `src/lib/db/*` 和 `src/lib/db/repositories/*` 改成 `sqlite | supabase` 双实现。
4. Serverless 连接建议使用 transaction pooler，并避免 prepared statements。

## 4. Supabase Storage

创建 bucket：

1. `acf-assets`
2. 建议先设为 private
3. 发布平台需要公网图片时，由 `/api/assets/...` 读取后返回，或后续升级为 signed URL

当前路径设计：

```text
acf-assets/
  generated-assets/
    wechat/
    xiaohongshu/
  skills/
    uploads/
    unpacked/
  exports/
```

当前已接入：

1. 公众号首图
2. 小红书 AI 生图
3. `/api/assets/...` 读取

后续待接入：

1. 技能 zip 上传
2. GitHub skill unpacked 文件
3. 图片包导出缓存

## 5. Vercel Cron

`vercel.json` 已配置：

```json
{
  "crons": [
    {
      "path": "/api/cron/daily-analysis",
      "schedule": "0 0 * * *"
    }
  ]
}
```

`0 0 * * *` 是 UTC 00:00，对应北京时间 08:00。

Cron 入口：

```text
GET /api/cron/daily-analysis
Authorization: Bearer <CRON_SECRET>
```

Vercel Cron 会自动带 `CRON_SECRET` 授权头。生产环境必须配置 `CRON_SECRET`。

## 6. 阿里云域名

1. 在 Vercel 项目中添加域名，例如 `content.example.com`。
2. Vercel 会给出 DNS 记录。
3. 在阿里云 DNS 控制台添加 CNAME：
   `content -> cname.vercel-dns.com`
4. 等待解析生效。
5. Vercel 自动签发 HTTPS 证书。
6. 将 `APP_BASE_URL` 改为正式域名。

## 7. 上线测试清单

1. `npm run lint`
2. `npm run test`
3. `npm run build`
4. Vercel build 成功
5. Supabase SQL 执行成功
6. Storage bucket 创建成功
7. 登录页可登录
8. 新增监控分类后刷新不丢
9. 采集公众号 / 小红书 / Twitter 正常
10. 手动选题分析正常
11. 批量生成进入生成中状态
12. 公众号首图生成后 `/api/assets/...` 可访问
13. 小红书图片生成后 `/api/assets/...` 可访问
14. Vercel Cron 手动触发返回 200
15. 公众号/小红书发布模式按环境变量切换

## 8. 已知风险

1. 当前 repository 仍以 SQLite 为主，Supabase Postgres 还需要 Phase 2 接管读写。
2. Vercel Serverless 不适合超长批量生成，批量任务需要继续拆分。
3. Supabase private bucket 图片发布到第三方平台时，可能需要 signed URL 或 public bucket。
4. PowerShell fallback 在 Vercel 不可用，后续应替换为纯 `fetch`。
5. `node:sqlite` 在 Vercel 生产环境不可作为持久数据源。
6. Supabase SQL 执行后建议开启 RLS；内部 MVP 可先只用服务端 `service_role` 访问，但不要把 `SUPABASE_SERVICE_ROLE_KEY` 暴露到浏览器端。
