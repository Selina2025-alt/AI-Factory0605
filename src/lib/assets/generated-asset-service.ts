import type { PlatformId } from "@/lib/content-creation-types";
import { persistGeneratedAssetBuffer } from "@/lib/storage/generated-asset-storage";

const IMAGE_CONTENT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

function parseDataImage(src: string) {
  const match = src.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i);

  if (!match) {
    return null;
  }

  return {
    contentType: match[1].toLowerCase(),
    buffer: Buffer.from(match[2], "base64")
  };
}

export async function persistGeneratedImage(input: {
  src: string;
  platform: PlatformId;
  assetId: string;
}) {
  if (input.src.startsWith("/api/assets/")) {
    return {
      src: input.src,
      originalSrc: input.src,
      filePath: ""
    };
  }

  const dataImage = parseDataImage(input.src);

  if (dataImage) {
    return persistGeneratedAssetBuffer({
      platform: input.platform,
      assetId: input.assetId,
      extension: IMAGE_CONTENT_TYPES[dataImage.contentType] ?? "png",
      buffer: dataImage.buffer,
      contentType: dataImage.contentType,
      originalSrc: input.src
    });
  }

  const response = await fetch(input.src);

  if (!response.ok) {
    throw new Error(`Failed to download generated image: ${response.status}`);
  }

  const contentType =
    response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ??
    "image/png";
  const extension = IMAGE_CONTENT_TYPES[contentType] ?? "png";
  const buffer = Buffer.from(await response.arrayBuffer());

  return persistGeneratedAssetBuffer({
    platform: input.platform,
    assetId: input.assetId,
    extension,
    buffer,
    contentType,
    originalSrc: input.src
  });
}
