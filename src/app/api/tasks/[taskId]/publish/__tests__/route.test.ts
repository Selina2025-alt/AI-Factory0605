// @vitest-environment node

import { rmSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as publishTask } from "@/app/api/tasks/[taskId]/publish/route";
import { migrateDatabase } from "@/lib/db/migrate";
import {
  createTaskContents,
  getTaskBundle
} from "@/lib/db/repositories/task-content-repository";
import { createTask } from "@/lib/db/repositories/task-repository";
import type { GeneratedTaskContentBundle } from "@/lib/content-creation-types";

const originalDataRoot = process.env.CONTENT_CREATION_AGENT_DATA_ROOT;
const originalWechatMode = process.env.WECHAT_PUBLISH_MODE;
const originalWechatApiKey = process.env.WECHAT_OPENAPI_KEY;
const originalWechatBaseUrl = process.env.WECHAT_OPENAPI_BASE_URL;
const originalXiaohongshuMode = process.env.XIAOHONGSHU_PUBLISH_MODE;
const originalXiaohongshuApiKey = process.env.XIAOHONGSHU_OPENAPI_KEY;
const originalXiaohongshuBaseUrl = process.env.XIAOHONGSHU_OPENAPI_BASE_URL;
const originalAppBaseUrl = process.env.APP_BASE_URL;

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

function seedTaskWithBundle(
  bundle: GeneratedTaskContentBundle,
  selectedPlatforms: Array<"wechat" | "xiaohongshu" | "twitter" | "videoScript">
) {
  createTask({
    id: "task-publish-1",
    title: "Publish test task",
    userInput: "Write an article for publish testing",
    selectedPlatforms,
    status: "ready"
  });
  createTaskContents("task-publish-1", bundle);
}

describe("task publish route", () => {
  const dataRoot = path.join(process.cwd(), ".codex-data-tests", "task-publish-route");

  beforeEach(() => {
    process.env.CONTENT_CREATION_AGENT_DATA_ROOT = dataRoot;
    rmSync(dataRoot, { recursive: true, force: true });
    migrateDatabase();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    restoreEnv("CONTENT_CREATION_AGENT_DATA_ROOT", originalDataRoot);
    restoreEnv("WECHAT_PUBLISH_MODE", originalWechatMode);
    restoreEnv("WECHAT_OPENAPI_KEY", originalWechatApiKey);
    restoreEnv("WECHAT_OPENAPI_BASE_URL", originalWechatBaseUrl);
    restoreEnv("XIAOHONGSHU_PUBLISH_MODE", originalXiaohongshuMode);
    restoreEnv("XIAOHONGSHU_OPENAPI_KEY", originalXiaohongshuApiKey);
    restoreEnv("XIAOHONGSHU_OPENAPI_BASE_URL", originalXiaohongshuBaseUrl);
    restoreEnv("APP_BASE_URL", originalAppBaseUrl);
    rmSync(dataRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("publishes wechat content with selected account in real mode", async () => {
    process.env.WECHAT_PUBLISH_MODE = "real";
    process.env.WECHAT_OPENAPI_KEY = "wechat-api-key";
    process.env.WECHAT_OPENAPI_BASE_URL = "https://wx.limyai.com/api/openapi";

    seedTaskWithBundle(
      {
        wechat: {
          title: "Wechat publish test title",
          summary: "Wechat publish test summary",
          body:
            "## Body\n\nThis is a markdown body for publish testing with **bold** text.\n\n> Block quote line.\n\n- Item A\n- Item B\n\n```ts\nconsole.log('hello');\n```",
          coverImageAsset: {
            id: "wechat-cover-1",
            title: "Wechat Cover",
            type: 5,
            typeName: "Framework",
            size: "landscape",
            colorScheme: "warm",
            provider: "siliconflow",
            status: "ready",
            src: "/api/assets/wechat-cover-1.png",
            originalSrc: "https://cdn.example.com/wechat-cover-1.png"
          }
        },
        xiaohongshu: null,
        twitter: null,
        videoScript: null
      },
      ["wechat"]
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          materialId: "material-id",
          mediaId: "media-id",
          message: "saved to drafts",
          publicationId: "publication-id",
          status: "published"
        }
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await publishTask(
      new Request("http://localhost/api/tasks/task-publish-1/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          platform: "wechat",
          wechatAppid: "wx123456",
          articleType: "news"
        })
      }),
      { params: Promise.resolve({ taskId: "task-publish-1" }) }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "published"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://wx.limyai.com/api/openapi/wechat-publish",
      expect.objectContaining({
        method: "POST"
      })
    );

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const payload = JSON.parse(String(requestInit?.body ?? "{}")) as Record<string, unknown>;
    expect(payload.wechatAppid).toBe("wx123456");
    expect(payload.contentFormat).toBe("html");
    expect(String(payload.content)).toContain("<h2>Body</h2>");
    expect(String(payload.content)).toContain("<strong>bold</strong>");
    expect(String(payload.content)).toContain("<blockquote>");
    expect(String(payload.content)).toContain("<ul>");
    expect(String(payload.content)).toContain("<pre><code");
    expect(payload.coverImage).toBe("https://cdn.example.com/wechat-cover-1.png");
    expect(getTaskBundle("task-publish-1").wechat?.publishStatus).toBe("published");
  });

  it("blocks newspic publishing when no image can be extracted", async () => {
    process.env.WECHAT_PUBLISH_MODE = "real";
    process.env.WECHAT_OPENAPI_KEY = "wechat-api-key";
    process.env.WECHAT_OPENAPI_BASE_URL = "https://wx.limyai.com/api/openapi";

    seedTaskWithBundle(
      {
        wechat: {
          title: "No image article",
          summary: "Summary",
          body: "Plain text body without markdown or html image links."
        },
        xiaohongshu: null,
        twitter: null,
        videoScript: null
      },
      ["wechat"]
    );

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await publishTask(
      new Request("http://localhost/api/tasks/task-publish-1/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          platform: "wechat",
          wechatAppid: "wx123456",
          articleType: "newspic"
        })
      }),
      { params: Promise.resolve({ taskId: "task-publish-1" }) }
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "NEWSPIC_IMAGE_REQUIRED"
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getTaskBundle("task-publish-1").wechat?.publishStatus).toBe("idle");
  });

  it("retries publish with sanitized links when wechat returns invalid content hint", async () => {
    process.env.WECHAT_PUBLISH_MODE = "real";
    process.env.WECHAT_OPENAPI_KEY = "wechat-api-key";
    process.env.WECHAT_OPENAPI_BASE_URL = "https://wx.limyai.com/api/openapi";

    seedTaskWithBundle(
      {
        wechat: {
          title: "Retry sanitize links",
          summary: "Summary with source links",
          body: [
            "## Article",
            "",
            "正文段落。",
            "",
            "资料来源：",
            "1. https://mp.weixin.qq.com/s?src=11&timestamp=1776162978&signature=abc*def",
            "2. https://www.sogou.com/link?url=abcdefg"
          ].join("\n")
        },
        xiaohongshu: null,
        twitter: null,
        videoScript: null
      },
      ["wechat"]
    );

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          error: "invalid content hint: [abc]"
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            materialId: "material-id",
            mediaId: "media-id",
            message: "saved to drafts",
            publicationId: "publication-id",
            status: "published"
          }
        })
      });
    vi.stubGlobal("fetch", fetchMock);

    const response = await publishTask(
      new Request("http://localhost/api/tasks/task-publish-1/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          platform: "wechat",
          wechatAppid: "wx123456",
          articleType: "news"
        })
      }),
      { params: Promise.resolve({ taskId: "task-publish-1" }) }
    );

    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("published");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstPayload = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body ?? "{}")
    ) as Record<string, unknown>;
    const secondPayload = JSON.parse(
      String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body ?? "{}")
    ) as Record<string, unknown>;

    expect(String(firstPayload.content)).toContain(
      '<a href="https://mp.weixin.qq.com/s">'
    );
    expect(String(firstPayload.content)).toContain("(链接已省略)");
    expect(String(secondPayload.content)).not.toContain("<a href=");
    expect(String(secondPayload.content)).not.toContain("sogou.com/link");
    expect(String(secondPayload.content)).not.toContain("signature=");
    expect(getTaskBundle("task-publish-1").wechat?.publishStatus).toBe("published");
  });

  it("keeps mock publishing behavior when WECHAT_PUBLISH_MODE=mock", async () => {
    process.env.WECHAT_PUBLISH_MODE = "mock";
    delete process.env.WECHAT_OPENAPI_KEY;

    seedTaskWithBundle(
      {
        wechat: {
          title: "Mock mode article",
          summary: "Summary",
          body: "## Body\n\nmock mode body"
        },
        xiaohongshu: null,
        twitter: null,
        videoScript: null
      },
      ["wechat"]
    );

    const response = await publishTask(
      new Request("http://localhost/api/tasks/task-publish-1/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          platform: "wechat",
          wechatAppid: "wx123456",
          articleType: "news"
        })
      }),
      { params: Promise.resolve({ taskId: "task-publish-1" }) }
    );

    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("published");
    expect(getTaskBundle("task-publish-1").wechat?.publishStatus).toBe("published");
  });

  it("publishes xiaohongshu content in real mode and returns publish URL", async () => {
    process.env.XIAOHONGSHU_PUBLISH_MODE = "real";
    process.env.XIAOHONGSHU_OPENAPI_KEY = "xhs-api-key";
    process.env.XIAOHONGSHU_OPENAPI_BASE_URL = "https://note.limyai.com/api/openapi";

    seedTaskWithBundle(
      {
        wechat: null,
        xiaohongshu: {
          title: "Xiaohongshu publish title",
          caption: "Xiaohongshu publish content",
          imageSuggestions: ["cover", "detail"],
          imageAssets: [
            {
              id: "img-1",
              title: "Cover",
              prompt: "cover prompt",
              alt: "cover",
              src: "/api/assets/local-cover.png",
              originalSrc: "https://cdn.example.com/cover.png",
              provider: "siliconflow"
            },
            {
              id: "img-2",
              title: "Detail",
              prompt: "detail prompt",
              alt: "detail",
              src: "https://cdn.example.com/detail.png",
              provider: "siliconflow"
            }
          ],
          hashtags: ["#效率", "职场"]
        },
        twitter: null,
        videoScript: null
      },
      ["xiaohongshu"]
    );

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "https://cdn.example.com/cover.png") {
        return {
          ok: true,
          status: 200
        };
      }

      if (url === "https://cdn.example.com/detail.png") {
        return {
          ok: true,
          status: 200
        };
      }

      if (url === "https://note.limyai.com/api/openapi/publish_note") {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            success: true,
            data: {
              id: "publication-id",
              note_id: "note-id",
              publish_url: "https://note.example.com/publish?token=123",
              xiaohongshu_qr_image_url: "https://note.example.com/qr.png",
              status: "published"
            }
          })
        };
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await publishTask(
      new Request("http://localhost/api/tasks/task-publish-1/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          platform: "xiaohongshu"
        })
      }),
      { params: Promise.resolve({ taskId: "task-publish-1" }) }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      publishUrl: "https://note.example.com/publish?token=123",
      qrImageUrl: "https://note.example.com/qr.png",
      status: "published"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://note.limyai.com/api/openapi/publish_note",
      expect.objectContaining({
        method: "POST"
      })
    );

    const publishCall = fetchMock.mock.calls.find(
      (call) => String(call[0]) === "https://note.limyai.com/api/openapi/publish_note"
    );
    const requestInit = publishCall?.[1] as RequestInit | undefined;
    const payload = JSON.parse(String(requestInit?.body ?? "{}")) as Record<string, unknown>;
    expect(payload.title).toBe("Xiaohongshu publish title");
    expect(payload.content).toBe("Xiaohongshu publish content\n\n#效率 #职场");
    expect(payload.coverImage).toBe("https://cdn.example.com/cover.png");
    expect(payload.images).toEqual(["https://cdn.example.com/detail.png"]);
    expect(payload.tags).toEqual(["效率", "职场"]);
    expect(getTaskBundle("task-publish-1").xiaohongshu?.publishStatus).toBe("published");
  });

  it("publishes xiaohongshu content with relative Supabase asset URLs when APP_BASE_URL is public", async () => {
    process.env.XIAOHONGSHU_PUBLISH_MODE = "real";
    process.env.XIAOHONGSHU_OPENAPI_KEY = "xhs-api-key";
    process.env.XIAOHONGSHU_OPENAPI_BASE_URL = "https://note.limyai.com/api/openapi";
    process.env.APP_BASE_URL = "https://factory.example.com";

    seedTaskWithBundle(
      {
        wechat: null,
        xiaohongshu: {
          title: "Relative cloud asset title",
          caption: "Relative cloud asset content",
          imageSuggestions: ["cover"],
          imageAssets: [
            {
              id: "img-1",
              title: "Cover",
              prompt: "cover prompt",
              alt: "cover",
              src: "/api/assets/xiaohongshu/cloud-cover.png",
              provider: "siliconflow"
            }
          ],
          hashtags: []
        },
        twitter: null,
        videoScript: null
      },
      ["xiaohongshu"]
    );

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "https://factory.example.com/api/assets/xiaohongshu/cloud-cover.png") {
        return {
          ok: true,
          status: 200
        };
      }

      if (url === "https://note.limyai.com/api/openapi/publish_note") {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            success: true,
            data: {
              id: "publication-id",
              note_id: "note-id",
              publish_url: "https://note.example.com/publish?token=456",
              status: "published"
            }
          })
        };
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await publishTask(
      new Request("http://localhost/api/tasks/task-publish-1/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          platform: "xiaohongshu"
        })
      }),
      { params: Promise.resolve({ taskId: "task-publish-1" }) }
    );

    expect(response.status).toBe(200);

    const publishCall = fetchMock.mock.calls.find(
      (call) => String(call[0]) === "https://note.limyai.com/api/openapi/publish_note"
    );
    const requestInit = publishCall?.[1] as RequestInit | undefined;
    const payload = JSON.parse(String(requestInit?.body ?? "{}")) as Record<string, unknown>;

    expect(payload.coverImage).toBe("https://factory.example.com/api/assets/xiaohongshu/cloud-cover.png");
    expect(getTaskBundle("task-publish-1").xiaohongshu?.publishStatus).toBe("published");
  });
  it("blocks xiaohongshu publishing when no public cover image exists", async () => {
    process.env.XIAOHONGSHU_PUBLISH_MODE = "real";
    process.env.XIAOHONGSHU_OPENAPI_KEY = "xhs-api-key";
    process.env.XIAOHONGSHU_OPENAPI_BASE_URL = "https://note.limyai.com/api/openapi";

    seedTaskWithBundle(
      {
        wechat: null,
        xiaohongshu: {
          title: "No public image",
          caption: "content",
          imageSuggestions: ["cover"],
          imageAssets: [
            {
              id: "img-1",
              title: "Cover",
              prompt: "cover prompt",
              alt: "cover",
              src: "/api/assets/local-cover.png",
              provider: "siliconflow"
            }
          ],
          hashtags: []
        },
        twitter: null,
        videoScript: null
      },
      ["xiaohongshu"]
    );

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await publishTask(
      new Request("http://localhost/api/tasks/task-publish-1/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          platform: "xiaohongshu"
        })
      }),
      { params: Promise.resolve({ taskId: "task-publish-1" }) }
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "XIAOHONGSHU_COVER_REQUIRED"
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getTaskBundle("task-publish-1").xiaohongshu?.publishStatus).toBe("idle");
  });

  it("blocks xiaohongshu publishing when cover image URL is not reachable", async () => {
    process.env.XIAOHONGSHU_PUBLISH_MODE = "real";
    process.env.XIAOHONGSHU_OPENAPI_KEY = "xhs-api-key";
    process.env.XIAOHONGSHU_OPENAPI_BASE_URL = "https://note.limyai.com/api/openapi";

    seedTaskWithBundle(
      {
        wechat: null,
        xiaohongshu: {
          title: "Image unreachable",
          caption: "content",
          imageSuggestions: ["cover"],
          imageAssets: [
            {
              id: "img-1",
              title: "Cover",
              prompt: "cover prompt",
              alt: "cover",
              src: "https://cdn.example.com/unreachable.png",
              provider: "siliconflow"
            }
          ],
          hashtags: ["测试"]
        },
        twitter: null,
        videoScript: null
      },
      ["xiaohongshu"]
    );

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "https://cdn.example.com/unreachable.png") {
        return {
          ok: false,
          status: 404
        };
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await publishTask(
      new Request("http://localhost/api/tasks/task-publish-1/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          platform: "xiaohongshu"
        })
      }),
      { params: Promise.resolve({ taskId: "task-publish-1" }) }
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "XIAOHONGSHU_IMAGE_UNREACHABLE"
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getTaskBundle("task-publish-1").xiaohongshu?.publishStatus).toBe("idle");
  });

  it("returns expired-image details when xiaohongshu image URL signature has expired", async () => {
    process.env.XIAOHONGSHU_PUBLISH_MODE = "real";
    process.env.XIAOHONGSHU_OPENAPI_KEY = "xhs-api-key";
    process.env.XIAOHONGSHU_OPENAPI_BASE_URL = "https://note.limyai.com/api/openapi";

    seedTaskWithBundle(
      {
        wechat: null,
        xiaohongshu: {
          title: "Image expired",
          caption: "content",
          imageSuggestions: ["cover"],
          imageAssets: [
            {
              id: "img-1",
              title: "Cover",
              prompt: "cover prompt",
              alt: "cover",
              src: "https://cdn.example.com/expired.png",
              provider: "siliconflow"
            }
          ],
          hashtags: ["测试"]
        },
        twitter: null,
        videoScript: null
      },
      ["xiaohongshu"]
    );

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "https://cdn.example.com/expired.png") {
        return {
          ok: false,
          status: 403,
          text: async () =>
            `<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>AccessDenied</Code>
  <Message>Request has expired.</Message>
  <Expires>2026-04-21T11:20:06.000Z</Expires>
  <ServerTime>2026-04-22T06:58:22.000Z</ServerTime>
</Error>`
        };
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await publishTask(
      new Request("http://localhost/api/tasks/task-publish-1/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          platform: "xiaohongshu"
        })
      }),
      { params: Promise.resolve({ taskId: "task-publish-1" }) }
    );

    expect(response.status).toBe(400);

    const payload = (await response.json()) as {
      code?: string;
      message?: string;
      detail?: Record<string, string>;
    };

    expect(payload.code).toBe("XIAOHONGSHU_IMAGE_EXPIRED");
    expect(payload.message).toContain("过期时间");
    expect(payload.detail?.expiresAt).toBe("2026-04-21T11:20:06.000Z");
    expect(payload.detail?.serverTime).toBe("2026-04-22T06:58:22.000Z");
    expect(payload.detail?.imageUrl).toBe("https://cdn.example.com/expired.png");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getTaskBundle("task-publish-1").xiaohongshu?.publishStatus).toBe("idle");
  });
});
