import type { PlatformId, SkillKind, SkillRecord, SkillSourceType } from "@/lib/content-creation-types";
import { getPlatformSetting } from "@/lib/db/repositories/platform-settings-repository";
import {
  getSkillById,
  getSkillLearningResult,
  listSkills
} from "@/lib/db/repositories/skill-repository";

const DEFAULT_KHAZIX_WRITER = {
  name: "khazix-writer",
  sourceRef: "builtin:khazix-writer",
  sourceType: "prompt" as SkillSourceType,
  rules: [
    "先给结论，再展开方法与案例，确保开头三段建立阅读价值。",
    "正文采用问题-拆解-步骤-案例-复盘结构，避免空泛描述。",
    "语言有节奏且可执行，优先给真实动作与落地细节。",
    "结尾给出下一步行动建议，并形成可持续关注的话题钩子。"
  ]
};

type ResolvedSkill = SkillRecord;

async function buildRulesForSkills(skills: ResolvedSkill[]) {
  const rules: string[] = [];

  for (const skill of skills) {
    const learningResult = await getSkillLearningResult(skill.id);
    rules.push(
      skill.name,
      ...(learningResult?.rules ?? []),
      ...(learningResult?.summary ? [learningResult.summary] : [])
    );
  }

  return rules;
}

function buildSkillSnapshots(platform: PlatformId, skills: ResolvedSkill[], skillKind: SkillKind) {
  return skills.map((skill) => ({
    platform,
    name: skill.name,
    sourceRef: skill.sourceRef,
    sourceType: skill.sourceType,
    skillKind
  }));
}

export async function resolveGenerationContext(platforms: PlatformId[]) {
  const result: {
    appliedRulesByPlatform: Partial<Record<PlatformId, string[]>>;
    imageRulesByPlatform: Partial<Record<PlatformId, string[]>>;
    skillSnapshots: Array<{
      platform: PlatformId;
      name: string;
      sourceRef: string;
      sourceType: SkillSourceType;
      skillKind?: SkillKind;
    }>;
  } = {
    appliedRulesByPlatform: {},
    imageRulesByPlatform: {},
    skillSnapshots: []
  };

  for (const platform of platforms) {
    const savedSetting = (await getPlatformSetting(platform)) as
      | {
          enabled_skill_ids_json?: string;
          image_skill_ids_json?: string;
        }
      | null;

    const skillIds = savedSetting?.enabled_skill_ids_json
      ? (JSON.parse(savedSetting.enabled_skill_ids_json) as string[])
      : [];
    const skills: ResolvedSkill[] = [];

    for (const skillId of skillIds) {
      const skill = await getSkillById(skillId);

      if (skill) {
        skills.push(skill);
      }
    }

    if (skills.length > 0) {
      result.appliedRulesByPlatform[platform] = await buildRulesForSkills(skills);
      result.skillSnapshots.push(...buildSkillSnapshots(platform, skills, "content"));
    } else if (platform === "wechat") {
      result.appliedRulesByPlatform[platform] = DEFAULT_KHAZIX_WRITER.rules;
      result.skillSnapshots.push({
        platform,
        name: DEFAULT_KHAZIX_WRITER.name,
        sourceRef: DEFAULT_KHAZIX_WRITER.sourceRef,
        sourceType: DEFAULT_KHAZIX_WRITER.sourceType,
        skillKind: "content"
      });
    }

    if (platform === "xiaohongshu") {
      const selectedImageSkillIds = savedSetting?.image_skill_ids_json
        ? (JSON.parse(savedSetting.image_skill_ids_json) as string[])
        : [];
      const imageSkills: ResolvedSkill[] = [];

      if (selectedImageSkillIds.length > 0) {
        for (const skillId of selectedImageSkillIds) {
          const skill = await getSkillById(skillId);

          if (skill?.skillKind === "image") {
            imageSkills.push(skill);
          }
        }
      } else {
        imageSkills.push(
          ...(await listSkills()).filter(
            (skill) => skill.skillKind === "image" && skill.status === "ready"
          )
        );
      }

      if (imageSkills.length > 0) {
        result.imageRulesByPlatform[platform] = await buildRulesForSkills(imageSkills);
        result.skillSnapshots.push(...buildSkillSnapshots(platform, imageSkills, "image"));
      }
    }
  }

  return result;
}
