import { persistGeneratedImage } from "@/lib/assets/generated-asset-service";
import {
  createSiliconFlowImageGeneration,
  getSiliconFlowImageConfig
} from "@/lib/content/siliconflow-client";
import { resolvePlatformImageModel } from "@/lib/content/platform-image-model";
import { ensureWechatCoverImagePlan } from "@/lib/content/wechat-cover-image-planning";
import { getPlatformSetting } from "@/lib/db/repositories/platform-settings-repository";
import {
  getSkillById,
  getSkillLearningResult,
  listSkills
} from "@/lib/db/repositories/skill-repository";
import { ensureBuiltinImageSkills } from "@/lib/skills/builtin-image-skills";
import type { WechatContentBody, WechatCoverImageAsset } from "@/lib/content-creation-types";

const DEFAULT_WECHAT_COVER_SKILL_ID = "builtin-image-wechat-md2wechat-cover";
const WECHAT_COVER_FALLBACK_SKILL_ID = "builtin-image-wechat-baoyu-cover";
type SkillRow = NonNullable<ReturnType<typeof getSkillById>>;

const SKILL_STYLE_PRESETS: Record<string, string[]> = {
  "builtin-image-wechat-baoyu-cover": [
    "Composition: one clear subject with generous negative space.",
    "Visual texture: premium editorial, cinematic lighting, sharp edges, clean layers.",
    "Meaning delivery: communicate by metaphor and scene, never by words."
  ],
  "builtin-image-wechat-md2wechat-cover": [
    "Composition: 16:9 hero scene, clear foreground subject, depth in background.",
    "Visual texture: modern, clean, broadcast-ready; avoid noisy decorations.",
    "Content guardrail: no title overlay, no logo, no watermark, no UI element."
  ]
};

const PROMPT_LEAK_PATTERNS: RegExp[] = [
  /\bbaoyu\b/gi,
  /\bmd2wechat\b/gi,
  /\bjimliu\b/gi,
  /\bgeekjourneyx\b/gi,
  /\bgithub\b/gi,
  /\bskill(s)?\b/gi,
  /\bwechat\s*cover\b/gi,
  /sourceRef/gi
];

const PLATFORM_NOISE_PATTERNS: RegExp[] = [
  /\bwechat\b/gi,
  /微信/gi,
  /公众号/gi,
  /朋友圈/gi,
  /小红书/gi,
  /\bins\b/gi,
  /\binstagram\b/gi,
  /抖音/gi,
  /\btiktok\b/gi,
  /\btwitter\b/gi,
  /\bfacebook\b/gi,
  /\byoutube\b/gi,
  /\bbilibili\b/gi,
  /微博/gi,
  /快手/gi,
  /\bapp\b/gi,
  /\bui\b/gi,
  /界面/gi,
  /截图/gi,
  /角标/gi,
  /状态栏/gi,
  /导航栏/gi
];

const COVER_IMAGE_CLEANUP_INSTRUCTION = [
  "Artifact cleanup pass for article cover image:",
  "- Keep only the core visual scene and subject; preserve composition quality.",
  "- Remove every logo, watermark, badge, app icon, corner mark, and platform identity.",
  "- Remove all text fragments, letters, words, numbers, labels, and tiny corner symbols.",
  "- Remove phone/device frames, status bars, chat windows, UI overlays, and interface chrome.",
  "- Keep all four corners clean and empty. Keep the final result as a pure textless scene."
].join("\n");

function toSiliconFlowImageSize(size?: "portrait" | "landscape" | "square") {
  switch (size) {
    case "square":
      return "1024x1024";
    case "portrait":
      return "768x1024";
    case "landscape":
    default:
      return "1024x576";
  }
}

function resolveCoverDimensions(size?: "portrait" | "landscape" | "square") {
  switch (size) {
    case "portrait":
      return { width: 768, height: 1024 };
    case "square":
      return { width: 1024, height: 1024 };
    case "landscape":
    default:
      return { width: 1024, height: 576 };
  }
}

function createLocalFallbackCoverDataUrl(size?: "portrait" | "landscape" | "square") {
  const { width, height } = resolveCoverDimensions(size);
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f4e8d5"/>
      <stop offset="55%" stop-color="#e6cdb0"/>
      <stop offset="100%" stop-color="#d7b08a"/>
    </linearGradient>
    <radialGradient id="lightA" cx="22%" cy="24%" r="52%">
      <stop offset="0%" stop-color="#fff8ef" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#fff8ef" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="lightB" cx="78%" cy="76%" r="58%">
      <stop offset="0%" stop-color="#9f5f3a" stop-opacity="0.42"/>
      <stop offset="100%" stop-color="#9f5f3a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <circle cx="${Math.round(width * 0.2)}" cy="${Math.round(height * 0.28)}" r="${Math.round(width * 0.16)}" fill="url(#lightA)"/>
  <circle cx="${Math.round(width * 0.82)}" cy="${Math.round(height * 0.74)}" r="${Math.round(width * 0.2)}" fill="url(#lightB)"/>
  <path d="M${Math.round(width * 0.1)} ${Math.round(height * 0.74)} C ${Math.round(width * 0.28)} ${Math.round(height * 0.56)}, ${Math.round(width * 0.42)} ${Math.round(height * 0.92)}, ${Math.round(width * 0.62)} ${Math.round(height * 0.72)} C ${Math.round(width * 0.74)} ${Math.round(height * 0.6)}, ${Math.round(width * 0.88)} ${Math.round(height * 0.78)}, ${Math.round(width * 0.94)} ${Math.round(height * 0.62)}" stroke="#7f482a" stroke-opacity="0.24" stroke-width="${Math.max(10, Math.round(width * 0.012))}" fill="none" stroke-linecap="round"/>
</svg>`.trim();

  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

function pickCandidate(input: {
  content: ReturnType<typeof ensureWechatCoverImagePlan>;
  candidateId?: string;
}) {
  const plan = input.content.coverImagePlan;

  if (input.candidateId) {
    const matchedCandidate = plan.images.find((item) => item.id === input.candidateId);

    if (matchedCandidate) {
      return matchedCandidate;
    }
  }

  if (plan.selectedImageId) {
    const selectedCandidate = plan.images.find((item) => item.id === plan.selectedImageId);

    if (selectedCandidate) {
      return selectedCandidate;
    }
  }

  return plan.images[0];
}

function sanitizeStyleText(value: string) {
  const compacted = value
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/`+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return PROMPT_LEAK_PATTERNS.reduce(
    (acc, pattern) => acc.replace(pattern, ""),
    compacted
  )
    .replace(/\s{2,}/g, " ")
    .replace(/^[-:;,.\s]+|[-:;,.\s]+$/g, "")
    .trim();
}

function scrubPlatformNoise(value: string) {
  const compacted = value.replace(/\s+/g, " ").trim();
  const stripped = PLATFORM_NOISE_PATTERNS.reduce(
    (acc, pattern) => acc.replace(pattern, ""),
    compacted
  );

  return stripped.replace(/\s{2,}/g, " ").trim();
}

function normalizeSemanticAliases(value: string) {
  return value
    .replace(/\bsocial media\b/gi, "daily life scene")
    .replace(/\bcontent platform\b/gi, "theme context")
    .replace(/\bapp interface\b/gi, "real scene");
}

async function deriveSkillStyleDirectives(skill: SkillRow) {
  const preset = SKILL_STYLE_PRESETS[skill.id];

  if (preset?.length) {
    return preset;
  }

  const learning = await getSkillLearningResult(skill.id);
  const candidates = [learning?.summary ?? skill.summary, ...(learning?.rules ?? []).slice(0, 2)]
    .map((line) => sanitizeStyleText(line))
    .filter(Boolean)
    .slice(0, 3);

  return candidates.length > 0
    ? candidates
    : [
        "Style rule: clear composition, strong subject hierarchy, and a text-free final image."
      ];
}

async function resolveWechatCoverSkillInstructions() {
  await ensureBuiltinImageSkills();

  const savedSetting = (await getPlatformSetting("wechat")) as
    | { image_skill_ids_json?: string }
    | null;
  const selectedImageSkillIds = savedSetting?.image_skill_ids_json
    ? (JSON.parse(savedSetting.image_skill_ids_json) as string[])
    : [];

  const allReadyImageSkills = (await listSkills()).filter(
    (skill) => skill.skillKind === "image" && skill.status === "ready"
  );
  const selectedSkills = (await Promise.all(selectedImageSkillIds.map((skillId) => getSkillById(skillId))))
    .filter((skill): skill is SkillRow => Boolean(skill))
    .filter((skill) => skill.skillKind === "image" && skill.status === "ready");
  const defaultSkill =
    (await getSkillById(DEFAULT_WECHAT_COVER_SKILL_ID)) ??
    (await getSkillById(WECHAT_COVER_FALLBACK_SKILL_ID)) ??
    allReadyImageSkills[0] ??
    null;
  const activeSkills = selectedSkills.length > 0 ? selectedSkills : defaultSkill ? [defaultSkill] : [];

  if (activeSkills.length === 0) {
    return "";
  }

  const styleLines = (await Promise.all(activeSkills.map(async (skill, index) => {
    const rules = await deriveSkillStyleDirectives(skill);

    return [`style channel ${index + 1}:`, ...rules.map((rule) => `- ${rule}`)];
  }))).flat();

  return [
    "Article hero-cover style constraints (design guidance only, never render these words into the final image):",
    ...styleLines,
    "Hard constraints: NO visible words, NO letters, NO numbers, NO logo, NO watermark, NO UI screenshot, NO branding badge.",
    "Zero-branding safety: NO platform names, NO social-app identity, NO chat bubble logos, NO product marks, NO corner symbols.",
    "Corner safety: keep all four corners clean; NO badges, NO app marks, NO platform names, NO corner icons.",
    "Relevance guardrail: remove unrelated symbols, stickers, UI fragments, and decorative marks not tied to the article meaning.",
    "Scene purity: render a pure visual scene only; no phone frame, no app header bar, no fake interface chrome.",
    "Human character is allowed when relevant: realistic portrait, stylized cartoon, anime-like illustration, or minimalist silhouette.",
    "If any text artifact appears, treat image as invalid and regenerate."
  ].join("\n");
}

async function generateCoverWithCleanup(input: {
  prompt: string;
  candidateTitle: string;
  size?: "portrait" | "landscape" | "square";
  model: string;
}) {
  const imageSize = toSiliconFlowImageSize(input.size);
  let firstPassImage: string;

  try {
    firstPassImage = await createSiliconFlowImageGeneration({
      prompt: input.prompt,
      imageSize,
      model: input.model
    });
  } catch {
    try {
      firstPassImage = await createSiliconFlowImageGeneration({
        prompt: `Generate a clean visual hero cover scene only. No text, no logo, no watermark. Theme: ${input.candidateTitle}`,
        imageSize,
        model: input.model
      });
    } catch {
      return createLocalFallbackCoverDataUrl(input.size);
    }
  }

  const cleanupPrompt = [
    COVER_IMAGE_CLEANUP_INSTRUCTION,
    `Theme anchor (semantic only, do not render as text): ${input.candidateTitle}`,
    "If any text/logo/icon/corner badge remains, regenerate until completely clean."
  ].join("\n");

  try {
    return await createSiliconFlowImageGeneration({
      prompt: cleanupPrompt,
      image: firstPassImage,
      imageSize,
      model: input.model
    });
  } catch {
    try {
      return await createSiliconFlowImageGeneration({
        prompt: `${input.prompt}

${cleanupPrompt}`,
        imageSize,
        model: input.model
      });
    } catch {
      return firstPassImage;
    }
  }
}

export async function generateWechatCoverImage(input: {
  content: WechatContentBody;
  candidateId?: string;
}) {
  const skillInstruction = await resolveWechatCoverSkillInstructions();
  const ensuredContent = ensureWechatCoverImagePlan(input.content);
  const selectedImageModel = await resolvePlatformImageModel("wechat");
  const imageConfig = getSiliconFlowImageConfig(selectedImageModel);

  if (!imageConfig) {
    throw new Error("SiliconFlow image generation is not configured");
  }

  const candidate = pickCandidate({
    content: ensuredContent,
    candidateId: input.candidateId
  });

  if (!candidate) {
    throw new Error("No cover image candidate is available");
  }

  const promptDraft = skillInstruction
    ? `${skillInstruction}

${candidate.prompt}`
    : candidate.prompt;
  const prompt = normalizeSemanticAliases(scrubPlatformNoise(promptDraft));
  const generatedSrc = await generateCoverWithCleanup({
    prompt,
    candidateTitle: candidate.title,
    size: candidate.size,
    model: selectedImageModel
  });
  const persistedImage = await persistGeneratedImage({
    src: generatedSrc,
    platform: "wechat",
    assetId: candidate.id
  });

  const nextCoverImageAsset: WechatCoverImageAsset = {
    id: candidate.id,
    title: candidate.title,
    prompt,
    alt: `公众号首图：${candidate.title}`,
    src: persistedImage.src,
    originalSrc: persistedImage.originalSrc,
    provider: "siliconflow",
    status: "ready",
    type: candidate.type,
    typeName: candidate.typeName,
    size: candidate.size,
    colorScheme: candidate.colorScheme
  };

  return {
    content: {
      ...ensuredContent,
      coverImagePlan: {
        ...ensuredContent.coverImagePlan,
        selectedImageId: candidate.id
      },
      coverImageAsset: nextCoverImageAsset
    },
    coverImageAsset: nextCoverImageAsset
  };
}
