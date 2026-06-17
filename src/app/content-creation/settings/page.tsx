import { SettingsShell } from "@/components/settings/settings-shell";
import {
  DEFAULT_SILICONFLOW_IMAGE_MODEL,
  normalizeSiliconFlowImageModel
} from "@/lib/content/siliconflow-image-models";
import type {
  PlatformId,
  PlatformImageModelSelections,
  PlatformSkillSelections,
  SkillLearningResultRecord
} from "@/lib/content-creation-types";
import { migrateDatabase } from "@/lib/db/migrate";
import { getPlatformSetting } from "@/lib/db/repositories/platform-settings-repository";
import {
  getSkillLearningResult,
  listSkills
} from "@/lib/db/repositories/skill-repository";
import { ensureBuiltinImageSkills } from "@/lib/skills/builtin-image-skills";

const platformIds: PlatformId[] = [
  "wechat",
  "xiaohongshu",
  "twitter",
  "videoScript"
];

export default async function SettingsPage() {
  migrateDatabase();
  await ensureBuiltinImageSkills();

  const skills = await listSkills();
  const initialSkillDetails: Record<string, SkillLearningResultRecord | null> = {};

  for (const skill of skills) {
    initialSkillDetails[skill.id] = await getSkillLearningResult(skill.id);
  }

  const initialPlatformSelections: PlatformSkillSelections = {
    wechat: [],
    xiaohongshu: [],
    twitter: [],
    videoScript: []
  };
  const initialImageSkillSelections: PlatformSkillSelections = {
    wechat: [],
    xiaohongshu: [],
    twitter: [],
    videoScript: []
  };
  const initialImageModelSelections: PlatformImageModelSelections = {
    wechat: DEFAULT_SILICONFLOW_IMAGE_MODEL,
    xiaohongshu: DEFAULT_SILICONFLOW_IMAGE_MODEL,
    twitter: DEFAULT_SILICONFLOW_IMAGE_MODEL,
    videoScript: DEFAULT_SILICONFLOW_IMAGE_MODEL
  };

  for (const platformId of platformIds) {
    const savedSetting = (await getPlatformSetting(platformId)) as
      | {
          enabled_skill_ids_json?: string;
          image_skill_ids_json?: string;
          image_model?: string;
        }
      | null;

    initialPlatformSelections[platformId] = savedSetting?.enabled_skill_ids_json
      ? (JSON.parse(savedSetting.enabled_skill_ids_json) as string[])
      : [];
    initialImageSkillSelections[platformId] = savedSetting?.image_skill_ids_json
      ? (JSON.parse(savedSetting.image_skill_ids_json) as string[])
      : [];
    initialImageModelSelections[platformId] = normalizeSiliconFlowImageModel(
      savedSetting?.image_model ?? DEFAULT_SILICONFLOW_IMAGE_MODEL
    );
  }

  return (
    <SettingsShell
      initialImageModelSelections={initialImageModelSelections}
      initialImageSkillSelections={initialImageSkillSelections}
      initialPlatformSelections={initialPlatformSelections}
      initialSkillDetails={initialSkillDetails}
      initialSkills={skills}
    />
  );
}
