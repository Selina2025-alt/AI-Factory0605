import path from "node:path";

import AdmZip from "adm-zip";

import { readGeneratedAsset } from "@/lib/storage/generated-asset-storage";
import type {
  PersistedGeneratedTaskContentBundle,
  TaskRecord
} from "@/lib/content-creation-types";

export type TaskExportFormat =
  | "markdown"
  | "html"
  | "image-package"
  | "video-script-doc";

export interface TaskExportPayload {
  body: Buffer;
  fileName: string;
  contentType: string;
}

const videoScriptTableHeaders = [
  "Shot",
  "Copy / Voiceover",
  "Visual",
  "Subtitle",
  "Pace",
  "Audio",
  "Effect"
];

function sanitizeFileBaseName(value: string) {
  const base = value.trim().replace(/[\\/:*?"<>|]+/g, "-");
  return base.slice(0, 80) || "content";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toHtmlParagraphs(value: string) {
  return escapeHtml(value)
    .split(/\r?\n\r?\n/g)
    .map((block) => `<p>${block.replace(/\r?\n/g, "<br />")}</p>`)
    .join("\n");
}

function buildVideoScriptMarkdown(bundle: PersistedGeneratedTaskContentBundle) {
  if (!bundle.videoScript) {
    return "";
  }

  const rows = bundle.videoScript.scenes
    .map((scene, index) =>
      [
        scene.shot || String(index + 1).padStart(2, "0"),
        scene.copy || scene.voiceover || "",
        scene.visual,
        scene.subtitle,
        scene.pace,
        scene.audio,
        scene.effect
      ]
        .map((value) => value.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br/>"))
        .join(" | ")
    )
    .join("\n");

  return [
    `# ${bundle.videoScript.title}`,
    "",
    `| ${videoScriptTableHeaders.join(" | ")} |`,
    `| ${videoScriptTableHeaders.map(() => "---").join(" | ")} |`,
    rows
  ].join("\n");
}

function buildTaskMarkdown(
  task: TaskRecord,
  bundle: PersistedGeneratedTaskContentBundle
) {
  const sections: string[] = [`# ${task.title}`, "", `> Request: ${task.userInput}`, ""];

  if (bundle.wechat) {
    sections.push(
      "## WeChat Article",
      "",
      `### ${bundle.wechat.title}`,
      "",
      bundle.wechat.summary,
      "",
      bundle.wechat.body,
      ""
    );
  }

  if (bundle.xiaohongshu) {
    sections.push(
      "## Xiaohongshu Note",
      "",
      `### ${bundle.xiaohongshu.title}`,
      "",
      bundle.xiaohongshu.caption,
      "",
      "### Image Suggestions",
      "",
      ...bundle.xiaohongshu.imageSuggestions.map(
        (suggestion, index) => `${index + 1}. ${suggestion}`
      ),
      ""
    );

    if (bundle.xiaohongshu.hashtags.length > 0) {
      sections.push(
        "### Hashtags",
        "",
        bundle.xiaohongshu.hashtags.map((tag) => `#${tag}`).join(" "),
        ""
      );
    }
  }

  if (bundle.twitter) {
    sections.push(
      "## Twitter",
      "",
      `- Mode: ${bundle.twitter.mode}`,
      `- Language: ${bundle.twitter.language ?? "English"}`,
      "",
      ...bundle.twitter.tweets.map((tweet, index) => `${index + 1}. ${tweet}`),
      ""
    );
  }

  if (bundle.videoScript) {
    sections.push("## Video Script", "", buildVideoScriptMarkdown(bundle), "");
  }

  return sections.join("\n");
}

function buildTaskHtml(task: TaskRecord, bundle: PersistedGeneratedTaskContentBundle) {
  const twitterList = bundle.twitter
    ? `<ol>${bundle.twitter.tweets.map((tweet) => `<li>${escapeHtml(tweet)}</li>`).join("")}</ol>`
    : "";
  const xhsSuggestions = bundle.xiaohongshu
    ? `<ol>${bundle.xiaohongshu.imageSuggestions
        .map((suggestion) => `<li>${escapeHtml(suggestion)}</li>`)
        .join("")}</ol>`
    : "";
  const videoTableRows = bundle.videoScript
    ? bundle.videoScript.scenes
        .map(
          (scene, index) =>
            `<tr>${[
              scene.shot || String(index + 1).padStart(2, "0"),
              scene.copy || scene.voiceover || "",
              scene.visual,
              scene.subtitle,
              scene.pace,
              scene.audio,
              scene.effect
            ]
              .map((column) => `<td>${escapeHtml(column).replace(/\r?\n/g, "<br />")}</td>`)
              .join("")}</tr>`
        )
        .join("")
    : "";

  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '  <meta charset="utf-8" />',
    `  <title>${escapeHtml(task.title)}</title>`,
    "  <style>",
    "    body{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.7;max-width:960px;margin:40px auto;padding:0 20px;color:#121212;}",
    "    h1,h2,h3{line-height:1.3;}",
    "    table{border-collapse:collapse;width:100%;margin-top:12px;}",
    "    th,td{border:1px solid #d9d9d9;padding:8px;vertical-align:top;text-align:left;}",
    "    th{background:#f8f8f8;}",
    "    .meta{color:#555;}",
    "  </style>",
    "</head>",
    "<body>",
    `  <h1>${escapeHtml(task.title)}</h1>`,
    `  <p class="meta"><strong>Request:</strong> ${escapeHtml(task.userInput)}</p>`,
    bundle.wechat
      ? [
          "  <h2>WeChat Article</h2>",
          `  <h3>${escapeHtml(bundle.wechat.title)}</h3>`,
          `  <p><strong>Summary:</strong> ${escapeHtml(bundle.wechat.summary)}</p>`,
          `  ${toHtmlParagraphs(bundle.wechat.body)}`
        ].join("\n")
      : "",
    bundle.xiaohongshu
      ? [
          "  <h2>Xiaohongshu Note</h2>",
          `  <h3>${escapeHtml(bundle.xiaohongshu.title)}</h3>`,
          `  ${toHtmlParagraphs(bundle.xiaohongshu.caption)}`,
          "  <h3>Image Suggestions</h3>",
          `  ${xhsSuggestions}`,
          bundle.xiaohongshu.hashtags.length > 0
            ? `  <p><strong>Hashtags:</strong> ${bundle.xiaohongshu.hashtags
                .map((tag) => `#${escapeHtml(tag)}`)
                .join(" ")}</p>`
            : ""
        ].join("\n")
      : "",
    bundle.twitter
      ? [
          "  <h2>Twitter</h2>",
          `  <p><strong>Mode:</strong> ${escapeHtml(bundle.twitter.mode)}</p>`,
          `  <p><strong>Language:</strong> ${escapeHtml(bundle.twitter.language ?? "English")}</p>`,
          `  ${twitterList}`
        ].join("\n")
      : "",
    bundle.videoScript
      ? [
          "  <h2>Video Script</h2>",
          `  <h3>${escapeHtml(bundle.videoScript.title)}</h3>`,
          "  <table>",
          `    <thead><tr>${videoScriptTableHeaders
            .map((header) => `<th>${header}</th>`)
            .join("")}</tr></thead>`,
          `    <tbody>${videoTableRows}</tbody>`,
          "  </table>"
        ].join("\n")
      : "",
    "</body>",
    "</html>"
  ].join("\n");
}

function parseDataUrl(src: string) {
  const match = src.match(/^data:([^;,]+)(;base64)?,(.*)$/);

  if (!match) {
    return null;
  }

  const mediaType = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || "";
  const buffer = isBase64
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");

  return { mediaType, buffer };
}

function extensionFromMediaType(mediaType: string) {
  if (mediaType.includes("svg")) {
    return "svg";
  }

  if (mediaType.includes("jpeg") || mediaType.includes("jpg")) {
    return "jpg";
  }

  if (mediaType.includes("webp")) {
    return "webp";
  }

  return "png";
}

function extensionFromSrc(src: string) {
  const clean = src.split("?")[0] ?? src;
  const extension = path.extname(clean).replace(".", "").toLowerCase();

  return extension || "png";
}

async function readImageAssetBuffer(src: string) {
  const dataUrl = parseDataUrl(src);

  if (dataUrl) {
    return {
      buffer: dataUrl.buffer,
      extension: extensionFromMediaType(dataUrl.mediaType)
    };
  }

  if (src.startsWith("/api/assets/")) {
    const relativePath = src
      .replace(/^\/api\/assets\//, "")
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .filter((segment) => segment && !segment.includes("..") && !segment.includes("\\"));
    const asset = await readGeneratedAsset(relativePath);

    if (!asset) {
      throw new Error("Image asset not found");
    }

    return {
      buffer: asset.buffer,
      extension:
        asset.contentType && asset.contentType !== "application/octet-stream"
          ? extensionFromMediaType(asset.contentType)
          : extensionFromSrc(src)
    };
  }

  const response = await fetch(src);

  if (!response.ok) {
    throw new Error(`Failed to fetch image asset: ${response.status}`);
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const buffer = Buffer.from(await response.arrayBuffer());

  return {
    buffer,
    extension: extensionFromMediaType(contentType || "image/png")
  };
}

async function buildImagePackageExport(
  task: TaskRecord,
  bundle: PersistedGeneratedTaskContentBundle
): Promise<TaskExportPayload> {
  const xiaohongshu = bundle.xiaohongshu;
  const imageAssets = xiaohongshu?.imageAssets ?? [];

  if (!xiaohongshu || imageAssets.length === 0) {
    throw new Error("No Xiaohongshu images available for packaging");
  }

  const zip = new AdmZip();
  const manifest = {
    taskId: task.id,
    title: xiaohongshu.title,
    caption: xiaohongshu.caption,
    hashtags: xiaohongshu.hashtags,
    generatedAt: new Date().toISOString(),
    images: [] as Array<{
      id: string;
      title: string;
      prompt: string;
      provider: string;
      fileName: string;
      originalSrc?: string;
    }>
  };

  for (let index = 0; index < imageAssets.length; index += 1) {
    const asset = imageAssets[index];
    const { buffer, extension } = await readImageAssetBuffer(asset.src);
    const fileName = `image-${String(index + 1).padStart(2, "0")}.${extension}`;

    zip.addFile(`images/${fileName}`, buffer);
    manifest.images.push({
      id: asset.id,
      title: asset.title,
      prompt: asset.prompt,
      provider: asset.provider,
      fileName,
      originalSrc: asset.originalSrc
    });
  }

  zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf8"));

  return {
    body: zip.toBuffer(),
    contentType: "application/zip",
    fileName: `${sanitizeFileBaseName(task.title)}-image-package.zip`
  };
}

export async function buildTaskExportPayload(input: {
  format: TaskExportFormat;
  task: TaskRecord;
  bundle: PersistedGeneratedTaskContentBundle;
}): Promise<TaskExportPayload> {
  const safeBaseName = sanitizeFileBaseName(input.task.title);

  if (input.format === "markdown") {
    return {
      body: Buffer.from(buildTaskMarkdown(input.task, input.bundle), "utf8"),
      contentType: "text/markdown; charset=utf-8",
      fileName: `${safeBaseName}.md`
    };
  }

  if (input.format === "html") {
    return {
      body: Buffer.from(buildTaskHtml(input.task, input.bundle), "utf8"),
      contentType: "text/html; charset=utf-8",
      fileName: `${safeBaseName}.html`
    };
  }

  if (input.format === "video-script-doc") {
    if (!input.bundle.videoScript) {
      throw new Error("No video script content available for export");
    }

    return {
      body: Buffer.from(buildVideoScriptMarkdown(input.bundle), "utf8"),
      contentType: "text/markdown; charset=utf-8",
      fileName: `${safeBaseName}-video-script.md`
    };
  }

  return buildImagePackageExport(input.task, input.bundle);
}
