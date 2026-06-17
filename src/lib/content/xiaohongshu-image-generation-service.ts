import { persistGeneratedImage } from "@/lib/assets/generated-asset-service";
import { resolvePlatformImageModel } from "@/lib/content/platform-image-model";
import {
  createSiliconFlowImageGeneration,
  getSiliconFlowImageConfig
} from "@/lib/content/siliconflow-client";
import { ensureXiaohongshuImageAssets } from "@/lib/content/xiaohongshu-image-card-generator";
import { createXiaohongshuReferencePngDataUrl } from "@/lib/content/xiaohongshu-reference-png";
import type {
  XiaohongshuContentBody,
  XiaohongshuImageAsset,
  XiaohongshuImageSize
} from "@/lib/content-creation-types";

const DEFAULT_IMAGE_LIMIT = 9;

function getImageLimit(total: number) {
  const configuredLimit = Number(process.env.SILICONFLOW_IMAGE_LIMIT);

  if (!Number.isFinite(configuredLimit) || configuredLimit <= 0) {
    return Math.min(total, DEFAULT_IMAGE_LIMIT);
  }

  return Math.min(total, Math.floor(configuredLimit));
}

function toSiliconFlowImageSize(size: XiaohongshuImageSize | undefined) {
  switch (size) {
    case "landscape":
      return "1024x576";
    case "square":
      return "1024x1024";
    case "portrait":
    default:
      return "768x1024";
  }
}

function shouldSendReferenceImage(model: string) {
  return model.includes("Image-Edit");
}

function buildImagePrompt(asset: XiaohongshuImageAsset, index: number, total: number) {
  return [
    asset.prompt,
    "",
    "请生成一张可直接用于小红书图文轮播的中文知识卡片。",
    `这是 Series ${index + 1} of ${total}，需要与同组图片保持统一视觉语言。`,
    "必须避免大面积空白、文字截断、占位符、乱码和无意义装饰。",
    "画面要有明确标题、结构化信息区、手绘涂鸦质感、温暖纸张纹理和可收藏的知识图谱感。",
    "中文文字尽量短句化，保证主要标题和关键短语清晰可读。"
  ].join("\n");
}

export async function enhanceXiaohongshuImagesWithSiliconFlow(
  content: XiaohongshuContentBody
): Promise<XiaohongshuContentBody> {
  const ensuredContent = ensureXiaohongshuImageAssets(content);
  const selectedImageModel = await resolvePlatformImageModel("xiaohongshu");
  const imageConfig = getSiliconFlowImageConfig(selectedImageModel);
  const localAssets = ensuredContent.imageAssets ?? [];

  if (!imageConfig || localAssets.length === 0) {
    return ensuredContent;
  }

  const generatedAssets: XiaohongshuImageAsset[] = [...localAssets];
  const imageLimit = getImageLimit(generatedAssets.length);

  for (let index = 0; index < imageLimit; index += 1) {
    const asset = generatedAssets[index];

    try {
      const generatedSrc = await createSiliconFlowImageGeneration({
        prompt: buildImagePrompt(asset, index, generatedAssets.length),
        image: shouldSendReferenceImage(imageConfig.model)
          ? createXiaohongshuReferencePngDataUrl(asset)
          : undefined,
        imageSize: toSiliconFlowImageSize(asset.size),
        model: selectedImageModel
      });
      const persistedImage = await persistGeneratedImage({
        src: generatedSrc,
        platform: "xiaohongshu",
        assetId: asset.id
      });

      generatedAssets[index] = {
        ...asset,
        src: persistedImage.src,
        originalSrc: persistedImage.originalSrc,
        provider: "siliconflow",
        status: "ready",
        errorMessage: undefined
      };
    } catch (error) {
      generatedAssets[index] = {
        ...asset,
        status: "failed",
        errorMessage:
          error instanceof Error ? error.message : "图片生成失败，已回退本地卡片"
      };
    }
  }

  return {
    ...ensuredContent,
    imageAssets: generatedAssets
  };
}

export async function regenerateXiaohongshuImageAsset(input: {
  content: XiaohongshuContentBody;
  imageId: string;
}) {
  const ensuredContent = ensureXiaohongshuImageAssets(input.content);
  const selectedImageModel = await resolvePlatformImageModel("xiaohongshu");
  const imageConfig = getSiliconFlowImageConfig(selectedImageModel);

  if (!imageConfig) {
    throw new Error("SiliconFlow image generation is not configured");
  }

  const imageAssets = [...(ensuredContent.imageAssets ?? [])];
  const imageIndex = imageAssets.findIndex((asset) => asset.id === input.imageId);

  if (imageIndex === -1) {
    throw new Error("Xiaohongshu image asset not found");
  }

  const asset = imageAssets[imageIndex];
  const generatedSrc = await createSiliconFlowImageGeneration({
    prompt: buildImagePrompt(asset, imageIndex, imageAssets.length),
    image: shouldSendReferenceImage(imageConfig.model)
      ? createXiaohongshuReferencePngDataUrl(asset)
      : undefined,
    imageSize: toSiliconFlowImageSize(asset.size),
    model: selectedImageModel
  });
  const persistedImage = await persistGeneratedImage({
    src: generatedSrc,
    platform: "xiaohongshu",
    assetId: asset.id
  });
  const nextAsset: XiaohongshuImageAsset = {
    ...asset,
    src: persistedImage.src,
    originalSrc: persistedImage.originalSrc,
    provider: "siliconflow",
    status: "ready",
    errorMessage: undefined
  };

  imageAssets[imageIndex] = nextAsset;

  return {
    content: {
      ...ensuredContent,
      imageAssets
    },
    imageAsset: nextAsset
  };
}
