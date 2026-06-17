import type { PlatformId } from "@/lib/content-creation-types";
import {
  DEFAULT_SILICONFLOW_IMAGE_MODEL,
  normalizeSiliconFlowImageModel
} from "@/lib/content/siliconflow-image-models";
import { getPlatformSetting } from "@/lib/db/repositories/platform-settings-repository";

export async function resolvePlatformImageModel(platformId: PlatformId) {
  try {
    const savedSetting = (await getPlatformSetting(platformId)) as
      | {
          image_model?: string;
        }
      | null;

    return normalizeSiliconFlowImageModel(
      savedSetting?.image_model ??
        process.env.SILICONFLOW_IMAGE_MODEL ??
        DEFAULT_SILICONFLOW_IMAGE_MODEL
    );
  } catch {
    return normalizeSiliconFlowImageModel(
      process.env.SILICONFLOW_IMAGE_MODEL ?? DEFAULT_SILICONFLOW_IMAGE_MODEL
    );
  }
}
