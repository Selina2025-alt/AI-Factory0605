import { NextResponse } from "next/server";
import MarkdownIt from "markdown-it";

import { migrateDatabase } from "@/lib/db/migrate";
import { createHistoryAction } from "@/lib/db/repositories/history-action-repository";
import {
  getTaskBundle,
  updatePublishStatus
} from "@/lib/db/repositories/task-content-repository";
import { getTaskById } from "@/lib/db/repositories/task-repository";
import { mockPublishContent } from "@/lib/publish/mock-publish-service";
import {
  WechatOpenApiError,
  publishWechatArticle,
  type WechatArticleType,
  type WechatPublishInput
} from "@/lib/publish/wechat-openapi-service";
import {
  XiaohongshuOpenApiError,
  publishXiaohongshuNote,
  type XiaohongshuPublishInput
} from "@/lib/publish/xiaohongshu-openapi-service";
import type {
  PersistedGeneratedTaskContentBundle,
  PlatformId
} from "@/lib/content-creation-types";

export const runtime = "nodejs";

const markdownImagePattern = /!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/gi;
const htmlImagePattern = /<img[^>]+src=["'](https?:\/\/[^"']+)["'][^>]*>/gi;
const markdownAnchorPattern = /\[([^\]]+)]\((https?:\/\/[^)\s]+)\)/gi;
const plainHttpUrlPattern = /(?<!\()https?:\/\/[^\s<>"')\]]+/gi;
const markdownRenderer = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true
});

class PublishValidationError extends Error {
  code: string;
  detail?: unknown;
  status: number;

  constructor(input: {
    code: string;
    message: string;
    status?: number;
    detail?: unknown;
  }) {
    super(input.message);
    this.name = "PublishValidationError";
    this.code = input.code;
    this.detail = input.detail;
    this.status = input.status ?? 400;
  }
}

type PublishRequestBody = {
  platform?: PlatformId;
  wechatAppid?: string;
  articleType?: WechatArticleType;
};

function getWechatPublishMode() {
  const mode = process.env.WECHAT_PUBLISH_MODE?.trim().toLowerCase();

  if (mode === "mock") {
    return "mock";
  }

  if (mode === "real") {
    return "real";
  }

  return process.env.WECHAT_OPENAPI_KEY?.trim() ? "real" : "mock";
}

function getXiaohongshuPublishMode() {
  const mode = process.env.XIAOHONGSHU_PUBLISH_MODE?.trim().toLowerCase();

  if (mode === "mock") {
    return "mock";
  }

  if (mode === "real") {
    return "real";
  }

  return process.env.XIAOHONGSHU_OPENAPI_KEY?.trim() ||
    process.env.WECHAT_OPENAPI_KEY?.trim()
    ? "real"
    : "mock";
}

function normalizeArticleType(value: unknown): WechatArticleType {
  return value === "newspic" ? "newspic" : "news";
}

function normalizePublishBody(value: unknown): PublishRequestBody {
  if (!value || typeof value !== "object") {
    return {};
  }

  const body = value as Record<string, unknown>;

  return {
    platform:
      body.platform === "wechat" ||
      body.platform === "xiaohongshu" ||
      body.platform === "twitter" ||
      body.platform === "videoScript"
        ? body.platform
        : undefined,
    wechatAppid:
      typeof body.wechatAppid === "string" ? body.wechatAppid.trim() : undefined,
    articleType: normalizeArticleType(body.articleType)
  };
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

function stripRichText(value: string) {
  return value
    .replace(htmlImagePattern, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[#>*`_\-\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractImageUrls(content: string) {
  const urls = new Set<string>();
  const markdownPattern = new RegExp(markdownImagePattern);
  const htmlPattern = new RegExp(htmlImagePattern);
  let match: RegExpExecArray | null = null;

  while ((match = markdownPattern.exec(content))) {
    if (match[1]) {
      const sanitized = sanitizeUrlForWechat(match[1], {
        stripSearch: false,
        rejectSogouJumpLink: false
      });
      if (sanitized) {
        urls.add(sanitized);
      }
    }
  }

  while ((match = htmlPattern.exec(content))) {
    if (match[1]) {
      const sanitized = sanitizeUrlForWechat(match[1], {
        stripSearch: false,
        rejectSogouJumpLink: false
      });
      if (sanitized) {
        urls.add(sanitized);
      }
    }
  }

  return [...urls];
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function looksLikeHtml(value: string) {
  return /<\s*(h[1-6]|p|div|section|article|img|ul|ol|li|blockquote|br)\b/i.test(value);
}

function trimTrailingPunctuation(value: string) {
  return value.replace(/[，。；、！!？?,.)\]}]+$/g, "");
}

function sanitizeUrlForWechat(
  value: string,
  options: { stripSearch?: boolean; rejectSogouJumpLink?: boolean } = {}
) {
  const candidate = trimTrailingPunctuation(value.trim());

  if (!candidate) {
    return null;
  }

  try {
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase();

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    if (
      options.rejectSogouJumpLink !== false &&
      hostname.endsWith("sogou.com") &&
      url.pathname.startsWith("/link")
    ) {
      return null;
    }

    if (options.stripSearch !== false) {
      url.search = "";
    }
    url.hash = "";

    return url.toString();
  } catch {
    return null;
  }
}

function sanitizeRenderedWechatHtml(
  html: string,
  options: { stripAllAnchors?: boolean } = {}
) {
  const anchorPattern =
    /<a\b([^>]*?)href=(["'])(https?:\/\/[^"']+)\2([^>]*)>([\s\S]*?)<\/a>/gi;
  const imagePattern = /<img\b([^>]*?)src=(["'])(https?:\/\/[^"']+)\2([^>]*)>/gi;

  const withoutUnsafeAnchors = html.replace(
    anchorPattern,
    (_full, preAttrs, quote, href, postAttrs, inner) => {
      if (options.stripAllAnchors) {
        return String(inner);
      }

      const sanitized = sanitizeUrlForWechat(String(href));

      if (!sanitized) {
        return String(inner);
      }

      return `<a${String(preAttrs)}href=${String(quote)}${sanitized}${String(quote)}${String(postAttrs)}>${String(inner)}</a>`;
    }
  );

  return withoutUnsafeAnchors.replace(
    imagePattern,
    (_full, preAttrs, quote, src, postAttrs) => {
      const sanitized = sanitizeUrlForWechat(String(src), {
        stripSearch: false,
        rejectSogouJumpLink: false
      });

      if (!sanitized) {
        return "";
      }

      return `<img${String(preAttrs)}src=${String(quote)}${sanitized}${String(quote)}${String(postAttrs)}>`;
    }
  );
}

function sanitizeMarkdownUrlsForWechat(
  markdown: string,
  options: { stripAllAnchors?: boolean } = {}
) {
  const withAnchors = markdown.replace(
    markdownAnchorPattern,
    (_full, label, url) => {
      if (options.stripAllAnchors) {
        return String(label);
      }

      const sanitized = sanitizeUrlForWechat(String(url));
      return sanitized ? `[${String(label)}](${sanitized})` : String(label);
    }
  );

  return withAnchors.replace(plainHttpUrlPattern, (rawUrl) => {
    if (options.stripAllAnchors) {
      return "(链接已省略)";
    }

    const sanitized = sanitizeUrlForWechat(rawUrl);
    return sanitized ?? "(链接已省略)";
  });
}

function shouldRetryAfterInvalidContentHint(error: unknown) {
  if (!(error instanceof WechatOpenApiError)) {
    return false;
  }

  const source = `${error.message}\n${error.detail ?? ""}`;
  return /invalid content hint/i.test(source);
}

function markdownToWechatHtml(
  markdown: string,
  options: { stripAllAnchors?: boolean } = {}
) {
  if (looksLikeHtml(markdown)) {
    return sanitizeRenderedWechatHtml(markdown, options);
  }

  const sanitizedMarkdown = sanitizeMarkdownUrlsForWechat(markdown, options);
  const html = markdownRenderer.render(sanitizedMarkdown).trim();
  return sanitizeRenderedWechatHtml(html, options);
}

function pickWechatCoverImage(content: NonNullable<PersistedGeneratedTaskContentBundle["wechat"]>) {
  const coverImageAsset = content.coverImageAsset;

  if (!coverImageAsset) {
    return undefined;
  }

  const candidates = [coverImageAsset.originalSrc, coverImageAsset.src];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.startsWith("http")) {
      return candidate;
    }
  }

  return undefined;
}

function isPrivateHostname(hostname: string) {
  const normalized = hostname.toLowerCase();

  if (normalized === "localhost") {
    return true;
  }

  if (/^127\./.test(normalized)) {
    return true;
  }

  if (/^10\./.test(normalized)) {
    return true;
  }

  if (/^192\.168\./.test(normalized)) {
    return true;
  }

  return /^172\.(1[6-9]|2\d|3[01])\./.test(normalized);
}

function getPublicImageUrl(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  if (!/^https?:\/\//i.test(normalized)) {
    return null;
  }

  try {
    const url = new URL(normalized);

    if (isPrivateHostname(url.hostname)) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function normalizeHashtag(value: string) {
  return value.replace(/^#+/g, "").trim();
}

function stripMarkdownForXiaohongshu(value: string) {
  return value
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/`{1,3}/g, "")
    .replace(/\*{1,3}/g, "")
    .replace(/_{1,3}/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildXiaohongshuPublishText(input: {
  caption: string;
  hashtags: string[];
}) {
  const cleanedCaption = stripMarkdownForXiaohongshu(input.caption);
  const hashtagLine =
    input.hashtags.length > 0
      ? input.hashtags.map((tag) => `#${tag}`).join(" ")
      : "";

  return [cleanedCaption, hashtagLine].filter(Boolean).join("\n\n").trim();
}

function buildXiaohongshuPublishInput(
  bundle: PersistedGeneratedTaskContentBundle
): XiaohongshuPublishInput {
  const xiaohongshuContent = bundle.xiaohongshu;

  if (!xiaohongshuContent) {
    throw new PublishValidationError({
      code: "XIAOHONGSHU_CONTENT_NOT_FOUND",
      message: "Current task has no Xiaohongshu content to publish."
    });
  }

  const title = xiaohongshuContent.title.trim();
  const tags = (xiaohongshuContent.hashtags ?? [])
    .map(normalizeHashtag)
    .filter(Boolean);
  const content = buildXiaohongshuPublishText({
    caption: xiaohongshuContent.caption,
    hashtags: tags
  });

  if (!title && !content) {
    throw new PublishValidationError({
      code: "XIAOHONGSHU_CONTENT_EMPTY",
      message: "Xiaohongshu title and content cannot both be empty."
    });
  }

  const imageUrls = (xiaohongshuContent.imageAssets ?? [])
    .filter((asset) => asset.status !== "failed")
    .map((asset) => getPublicImageUrl(asset.originalSrc) ?? getPublicImageUrl(asset.src))
    .filter((url): url is string => Boolean(url));
  const uniqueImageUrls = [...new Set(imageUrls)];
  const coverImage = uniqueImageUrls[0];

  if (!coverImage) {
    throw new PublishValidationError({
      code: "XIAOHONGSHU_COVER_REQUIRED",
      message:
        "发布到小红书需要至少一张可公网访问的封面图。请先生成并保存可访问图片后再发布。"
    });
  }
  const images = uniqueImageUrls.slice(1);

  return {
    title: title || undefined,
    content: content || undefined,
    coverImage,
    images: images.length > 0 ? images : undefined,
    tags: tags.length > 0 ? tags : undefined
  };
}

async function validateXiaohongshuImageUrl(url: string) {
  return validateXiaohongshuImageUrlWithExpiryDetails(url);

  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, 8000);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Range: "bytes=0-1024"
      },
      signal: abortController.signal
    });

    if (!response.ok) {
      throw new PublishValidationError({
        code: "XIAOHONGSHU_IMAGE_UNREACHABLE",
        message: `封面/配图暂时无法访问（HTTP ${response.status}）。请更换图片后重试。`
      });
    }
  } catch (error) {
    if (error instanceof PublishValidationError) {
      throw error;
    }

    if (isAbortError(error)) {
      throw new PublishValidationError({
        code: "XIAOHONGSHU_IMAGE_TIMEOUT",
        message: "封面/配图访问超时，请更换公网可访问图片后重试。"
      });
    }

    throw new PublishValidationError({
      code: "XIAOHONGSHU_IMAGE_UNREACHABLE",
      message: "封面/配图链接不可访问，请更换图片后重试。"
    });
  } finally {
    clearTimeout(timeout);
  }
}

function extractXmlTagValue(xml: string, tagName: string) {
  const match = xml.match(new RegExp(`<${tagName}>([^<]+)</${tagName}>`, "i"));
  return match?.[1]?.trim() || null;
}

function formatBeijingTime(isoTime: string | null) {
  if (!isoTime) {
    return null;
  }

  const date = new Date(isoTime);

  if (Number.isNaN(date.getTime())) {
    return isoTime;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

function buildImageExpiredMessage(input: {
  expiresAt: string | null;
  serverTime: string | null;
}) {
  const expiresAtLabel = formatBeijingTime(input.expiresAt);
  const serverTimeLabel = formatBeijingTime(input.serverTime);

  if (expiresAtLabel && serverTimeLabel) {
    return `封面/配图链接已过期（过期时间：${expiresAtLabel}，当前：${serverTimeLabel}）。请一键重新生成配图后再发布。`;
  }

  return "封面/配图链接已过期，请一键重新生成配图后再发布。";
}

async function validateXiaohongshuImageUrlWithExpiryDetails(url: string) {
  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, 8000);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Range: "bytes=0-1024"
      },
      signal: abortController.signal
    });

    if (!response.ok) {
      const responseText =
        typeof response.text === "function" ? await response.text() : "";
      const messageFromXml = extractXmlTagValue(responseText, "Message");
      const expiresAt = extractXmlTagValue(responseText, "Expires");
      const serverTime = extractXmlTagValue(responseText, "ServerTime");

      if (
        response.status === 403 &&
        /request has expired/i.test(messageFromXml ?? "")
      ) {
        throw new PublishValidationError({
          code: "XIAOHONGSHU_IMAGE_EXPIRED",
          message: buildImageExpiredMessage({
            expiresAt,
            serverTime
          }),
          detail: {
            expiresAt,
            imageUrl: url,
            serverTime
          }
        });
      }

      throw new PublishValidationError({
        code: "XIAOHONGSHU_IMAGE_UNREACHABLE",
        message: `封面/配图暂时无法访问（HTTP ${response.status}）。请更换图片后重试。`,
        detail: {
          imageUrl: url,
          status: response.status
        }
      });
    }
  } catch (error) {
    if (error instanceof PublishValidationError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new PublishValidationError({
        code: "XIAOHONGSHU_IMAGE_TIMEOUT",
        message: "封面/配图访问超时，请更换公网可访问图片后重试。",
        detail: {
          imageUrl: url
        }
      });
    }

    throw new PublishValidationError({
      code: "XIAOHONGSHU_IMAGE_UNREACHABLE",
      message: "封面/配图链接不可访问，请更换图片后重试。",
      detail: {
        imageUrl: url
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function validateXiaohongshuPublishInput(input: XiaohongshuPublishInput) {
  const imageUrls = [...new Set([input.coverImage, ...(input.images ?? [])])];
  await Promise.all(imageUrls.map((url) => validateXiaohongshuImageUrl(url)));
}

function buildNewsPicContent(input: {
  wechat: NonNullable<PersistedGeneratedTaskContentBundle["wechat"]>;
  xiaohongshu: PersistedGeneratedTaskContentBundle["xiaohongshu"];
}) {
  const imageUrls = new Set<string>();

  for (const url of extractImageUrls(`${input.wechat.summary}\n${input.wechat.body}`)) {
    imageUrls.add(url);
  }

  for (const image of input.xiaohongshu?.imageAssets ?? []) {
    const candidate = image.originalSrc ?? image.src;
    if (candidate?.startsWith("http")) {
      imageUrls.add(candidate);
    }
  }

  const urls = [...imageUrls].slice(0, 20);

  if (urls.length === 0) {
    throw new PublishValidationError({
      code: "NEWSPIC_IMAGE_REQUIRED",
      message:
        "发布小绿书至少需要 1 张图片。请先在内容中插入图片链接，或先生成并保存小红书配图后再发布。"
    });
  }

  const plainText = truncate(
    stripRichText(`${input.wechat.summary}\n\n${input.wechat.body}`),
    1000
  );
  const imageMarkdown = urls.map((url, index) => `![图片${index + 1}](${url})`).join("\n");

  return {
    content: [plainText, imageMarkdown].filter(Boolean).join("\n\n"),
    coverImage: urls[0]
  };
}

function buildWechatPublishInput(input: {
  body: PublishRequestBody;
  bundle: PersistedGeneratedTaskContentBundle;
  stripAllAnchors?: boolean;
}): WechatPublishInput {
  const wechatContent = input.bundle.wechat;

  if (!wechatContent) {
    throw new PublishValidationError({
      code: "WECHAT_CONTENT_NOT_FOUND",
      message: "当前任务没有可发布的公众号内容"
    });
  }

  if (!input.body.wechatAppid) {
    throw new PublishValidationError({
      code: "WECHAT_ACCOUNT_REQUIRED",
      message: "请先选择要发布的公众号"
    });
  }

  const articleType = input.body.articleType ?? "news";
  const title = truncate(wechatContent.title.trim(), 64);
  const summary = truncate(wechatContent.summary.trim(), 120);
  const coverImage = pickWechatCoverImage(wechatContent);

  if (articleType === "newspic") {
    const newsPicContent = buildNewsPicContent({
      wechat: wechatContent,
      xiaohongshu: input.bundle.xiaohongshu
    });

    return {
      wechatAppid: input.body.wechatAppid,
      title,
      summary,
      content: newsPicContent.content,
      coverImage: coverImage ?? newsPicContent.coverImage,
      contentFormat: "markdown",
      articleType
    };
  }

  return {
    wechatAppid: input.body.wechatAppid,
    title,
    summary,
    content: markdownToWechatHtml(wechatContent.body, {
      stripAllAnchors: input.stripAllAnchors
    }),
    coverImage,
    contentFormat: "html",
    articleType
  };
}

async function publishInMockMode(input: {
  taskId: string;
  platform: Exclude<PlatformId, "videoScript">;
}) {
  const result = await mockPublishContent();
  await updatePublishStatus(input.taskId, input.platform, result.status);
  await createHistoryAction({
    taskId: input.taskId,
    actionType: `${input.platform}_published`,
    payload: {
      mode: "mock",
      platform: input.platform,
      status: result.status
    }
  });

  return NextResponse.json(result);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ taskId: string }> }
) {
  migrateDatabase();

  const { taskId } = await context.params;
  const task = await getTaskById(taskId);

  if (!task) {
    return NextResponse.json({ message: "Task not found" }, { status: 404 });
  }

  let rawBody: unknown = {};

  try {
    rawBody = await request.json();
  } catch {
    rawBody = {};
  }

  const body = normalizePublishBody(rawBody);

  if (!body.platform) {
    return NextResponse.json(
      {
        code: "PLATFORM_REQUIRED",
        message: "Publish platform is required"
      },
      { status: 400 }
    );
  }

  if (body.platform === "videoScript") {
    return NextResponse.json(
      { message: "Video scripts do not support publishing." },
      { status: 400 }
    );
  }

  if (body.platform === "wechat") {
    if (getWechatPublishMode() === "mock") {
      return publishInMockMode({
        taskId,
        platform: "wechat"
      });
    }

    try {
      const bundle = await getTaskBundle(taskId);
      const publishInput = buildWechatPublishInput({ body, bundle });

      await updatePublishStatus(taskId, "wechat", "publishing");
      let result: Awaited<ReturnType<typeof publishWechatArticle>>;
      let usedSanitizedRetry = false;

      try {
        result = await publishWechatArticle(publishInput);
      } catch (error) {
        if (
          publishInput.articleType === "news" &&
          shouldRetryAfterInvalidContentHint(error)
        ) {
          const retryInput = buildWechatPublishInput({
            body,
            bundle,
            stripAllAnchors: true
          });
          result = await publishWechatArticle(retryInput);
          usedSanitizedRetry = true;
        } else {
          throw error;
        }
      }

      await updatePublishStatus(taskId, "wechat", result.status);
      await createHistoryAction({
        taskId,
        actionType: "wechat_published",
        payload: {
          articleType: publishInput.articleType ?? "news",
          linkSanitizedRetry: usedSanitizedRetry,
          mode: "real",
          platform: "wechat",
          publicationId: result.publicationId ?? null,
          status: result.status,
          wechatAppid: publishInput.wechatAppid
        }
      });

      return NextResponse.json(result);
    } catch (error) {
      if (!(error instanceof PublishValidationError)) {
        await updatePublishStatus(taskId, "wechat", "failed");
      }

      if (error instanceof PublishValidationError) {
        return NextResponse.json(
          {
            code: error.code,
            detail: error.detail,
            message: error.message
          },
          { status: error.status }
        );
      }

      if (error instanceof WechatOpenApiError) {
        return NextResponse.json(
          {
            code: error.code,
            detail: error.detail,
            message: error.message
          },
          { status: error.status }
        );
      }

      return NextResponse.json(
        {
          code: "INTERNAL_ERROR",
          message: "Failed to publish wechat content"
        },
        { status: 500 }
      );
    }
  }

  if (body.platform === "xiaohongshu") {
    if (getXiaohongshuPublishMode() === "mock") {
      return publishInMockMode({
        taskId,
        platform: "xiaohongshu"
      });
    }

    try {
      const bundle = await getTaskBundle(taskId);
      const publishInput = buildXiaohongshuPublishInput(bundle);
      await validateXiaohongshuPublishInput(publishInput);

      await updatePublishStatus(taskId, "xiaohongshu", "publishing");
      const result = await publishXiaohongshuNote(publishInput);
      await updatePublishStatus(taskId, "xiaohongshu", result.status);
      await createHistoryAction({
        taskId,
        actionType: "xiaohongshu_published",
        payload: {
          mode: "real",
          platform: "xiaohongshu",
          publicationId: result.publicationId ?? null,
          status: result.status,
          noteId: result.noteId ?? null,
          publishUrl: result.publishUrl
        }
      });

      return NextResponse.json(result);
    } catch (error) {
      if (!(error instanceof PublishValidationError)) {
        await updatePublishStatus(taskId, "xiaohongshu", "failed");
      }

      if (error instanceof PublishValidationError) {
        return NextResponse.json(
          {
            code: error.code,
            detail: error.detail,
            message: error.message
          },
          { status: error.status }
        );
      }

      if (error instanceof XiaohongshuOpenApiError) {
        return NextResponse.json(
          {
            code: error.code,
            detail: error.detail,
            message: error.message
          },
          { status: error.status }
        );
      }

      return NextResponse.json(
        {
          code: "INTERNAL_ERROR",
          message: "Failed to publish xiaohongshu content"
        },
        { status: 500 }
      );
    }
  }

  return publishInMockMode({
    taskId,
    platform: body.platform
  });
}

