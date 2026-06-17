import {
  getSiliconFlowConfig,
  getSiliconFlowImageConfig
} from "@/lib/content/siliconflow-client";
import { resolvePlatformImageModel } from "@/lib/content/platform-image-model";
import {
  TWITTER_BUILTIN_SKILL_NAME,
  TWITTER_BUILTIN_TRACE_DETAIL
} from "@/lib/content/twitter-built-in-skill";
import { XIAOHONGSHU_BUILTIN_SKILL_NAME } from "@/lib/content/xiaohongshu-built-in-skill";
import { listHistoryActions } from "@/lib/db/repositories/history-action-repository";
import type {
  GenerationTraceSource,
  GenerationTraceSkill,
  GenerationTraceStep,
  PlatformId,
  TaskGenerationTrace,
  WebSearchTrace
} from "@/lib/content-creation-types";

function includesAllPlatforms(platforms: PlatformId[]) {
  return (
    platforms.length === 4 &&
    platforms.includes("wechat") &&
    platforms.includes("xiaohongshu") &&
    platforms.includes("twitter") &&
    platforms.includes("videoScript")
  );
}

function usesEfficiencyFixture(prompt: string, platforms: PlatformId[]) {
  const normalizedPrompt = prompt.replace(/\s+/g, "");

  return (
    includesAllPlatforms(platforms) &&
    (normalizedPrompt.includes("提高工作效率") || normalizedPrompt.includes("高效工作"))
  );
}

export async function buildTaskGenerationTrace(input: {
  prompt: string;
  platforms: PlatformId[];
  skills: GenerationTraceSkill[];
  webSearch?: WebSearchTrace;
}): Promise<TaskGenerationTrace> {
  const siliconFlowConfig = getSiliconFlowConfig();
  const siliconFlowImageConfig = input.platforms.includes("xiaohongshu")
    ? getSiliconFlowImageConfig(await resolvePlatformImageModel("xiaohongshu"))
    : getSiliconFlowImageConfig();
  const modelBackedPlatforms = input.platforms.filter(
    (platform) =>
      Boolean(siliconFlowConfig) &&
      (platform === "wechat" ||
        platform === "xiaohongshu" ||
        platform === "twitter" ||
        platform === "videoScript")
  );
  const usesSiliconFlow = modelBackedPlatforms.length > 0;
  const usesSiliconFlowImages =
    input.platforms.includes("xiaohongshu") && Boolean(siliconFlowImageConfig);
  const usesFixture = !usesSiliconFlow && usesEfficiencyFixture(input.prompt, input.platforms);

  const providerLabel = usesSiliconFlow
    ? `SiliconFlow · ${siliconFlowConfig?.model}${
        usesSiliconFlowImages ? ` · Image ${siliconFlowImageConfig?.model}` : ""
      }`
    : "Prototype generation";
  const methodLabel = usesSiliconFlow
    ? modelBackedPlatforms.length > 1
      ? "多平台结构化生成"
      : modelBackedPlatforms[0] === "videoScript"
        ? "视频脚本结构化生成"
        : modelBackedPlatforms[0] === "twitter"
          ? "Twitter 结构化生成"
        : modelBackedPlatforms[0] === "xiaohongshu"
          ? "小红书图文结构化生成"
          : "公众号结构化生成"
    : usesFixture
      ? "样例内容装配"
      : "原型草稿生成";
  const webSearch = input.webSearch ?? {
    enabled: false,
    provider: "none",
    query: "",
    results: []
  };
  const usesBuiltInXiaohongshuSkill = input.platforms.includes("xiaohongshu");
  const usesBuiltInTwitterSkill = input.platforms.includes("twitter");
  const builtInSkillDetails = [
    usesBuiltInXiaohongshuSkill ? `小红书额外启用 ${XIAOHONGSHU_BUILTIN_SKILL_NAME}。` : "",
    usesBuiltInTwitterSkill ? `Twitter 额外启用 ${TWITTER_BUILTIN_SKILL_NAME}。` : ""
  ].join("");
  const steps: GenerationTraceStep[] = [
    {
      id: "parse",
      label: "解析创作需求",
      detail: `识别主题、目标平台与写作要求，覆盖 ${input.platforms.join(" / ")}。`,
      status: "completed"
    },
    {
      id: "rules",
      label: "应用技能与规则",
      detail:
        input.skills.length > 0
          ? `加载 ${input.skills.length} 个技能快照并合并平台规则。${builtInSkillDetails}`
          : builtInSkillDetails
            ? `未启用额外 skills，${builtInSkillDetails}`
            : "未启用额外 skills，直接使用基础平台规则。",
      status: "completed"
    }
  ];

  if (webSearch.enabled) {
    const querySummary =
      webSearch.queries && webSearch.queries.length > 0
        ? webSearch.queries.join(" / ")
        : webSearch.query;

    steps.push({
      id: "search",
      label: "联网检索资料",
      detail: webSearch.error
        ? `Search provider ${webSearch.provider} tried: ${querySummary}. Error: ${webSearch.error}`
        : `Search provider ${webSearch.provider} tried: ${querySummary}. Collected ${webSearch.results.length} usable sources.`,
      status: "completed"
    });
  }

  steps.push(
    {
      id: "prompt",
      label: "组织生成方法",
      detail: usesSiliconFlow
        ? "构造结构化提示词，请求模型返回平台对应的 JSON 字段。"
        : usesFixture
          ? "命中原型样例内容，直接装配预置文章结构。"
          : "使用原型生成逻辑构造基础草稿内容。",
      status: "completed"
    },
    {
      id: "generate",
      label: "生成文章内容",
      detail: usesSiliconFlow
        ? `通过 ${providerLabel} 完成结构化内容生成。`
        : "使用本地原型生成逻辑完成文章草稿。",
      status: "completed"
    }
  );

  if (usesSiliconFlowImages) {
    steps.push({
      id: "image-generate",
      label: "生成小红书配图",
      detail: `通过 SiliconFlow 图片模型 ${siliconFlowImageConfig?.model} 基于分图策略生成轮播配图。`,
      status: "completed"
    });
  }

  steps.push(
    {
      id: "persist",
      label: "校验并保存",
      detail: "校验标题、摘要与正文结构后，写入任务和内容存储。",
      status: "completed"
    }
  );

  const searchSources: GenerationTraceSource[] = webSearch.enabled
    ? webSearch.results.length > 0
      ? webSearch.results.map((result, index) => ({
          id: `external-search-${index + 1}`,
          kind: "external-search",
          label: result.title,
          detail: result.snippet || "联网检索结果。",
          url: result.url
        }))
      : [
          {
            id: "external-search",
            kind: "external-search",
            label: "外部资料搜索",
            detail: webSearch.error
              ? `已尝试联网搜索，但遇到问题：${webSearch.error}`
              : "已尝试联网搜索，但未返回可用资料。"
          }
        ]
    : [
        {
          id: "external-search",
          kind: "external-search",
          label: "外部资料搜索",
          detail: "本次创作未调用外部资料搜索。"
        }
      ];

  return {
    statusLabel: `已完成 ${steps.length} / ${steps.length} 步`,
    methodLabel,
    providerLabel,
    steps,
    skills: input.skills,
    sources: [
      {
        id: "prompt",
        kind: "prompt",
        label: "用户需求",
        detail: input.prompt
      },
      ...searchSources,
      {
        id: "system",
        kind: "system",
        label: "生成方式",
        detail: methodLabel
      },
      ...(usesBuiltInXiaohongshuSkill
        ? [
            {
              id: "xiaohongshu-built-in-skill",
              kind: "system" as const,
              label: XIAOHONGSHU_BUILTIN_SKILL_NAME,
              detail:
                "内置爆文文案规则 + Simple/Series 分图策略 + 5 类手绘图文模板。"
            }
          ]
        : []),
      ...(usesBuiltInTwitterSkill
        ? [
            {
              id: "twitter-built-in-skill",
              kind: "system" as const,
              label: TWITTER_BUILTIN_SKILL_NAME,
              detail: TWITTER_BUILTIN_TRACE_DETAIL
            }
          ]
        : [])
    ]
  };
}

export async function getTaskGenerationTrace(taskId: string): Promise<TaskGenerationTrace | null> {
  const generationAction = (await listHistoryActions()).find(
    (action) =>
      action.taskId === taskId &&
      (action.actionType === "task_regenerated" ||
        action.actionType === "task_created")
  );

  if (!generationAction) {
    return null;
  }

  const rawTrace = generationAction.payload.generationTrace;

  if (!rawTrace || typeof rawTrace !== "object") {
    return null;
  }

  return rawTrace as TaskGenerationTrace;
}
