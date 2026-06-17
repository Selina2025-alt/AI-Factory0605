import { parseSkillMarkdown } from "@/lib/skills/skill-parser";

const capabilityHeadingPatterns = [
  /鑳藉姏/,
  /瑙﹀彂鏉′欢/,
  /宸ヤ綔娴佺▼/,
  /浣跨敤鏂瑰紡/,
  /杈撳嚭鏍囧噯/,
  /蹇呴』鍋氬埌/,
  /when to use/i,
  /workflow/i,
  /capabilities/i,
  /rules/i
];

function headingMatchesCapabilities(text: string) {
  return capabilityHeadingPatterns.some((pattern) => pattern.test(text));
}

function extractCapabilityRules(markdown: string) {
  const rules: string[] = [];
  let isCapturing = false;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    const markdownHeading = line.match(/^#{1,6}\s+(.+)$/);
    const colonHeading = line.match(/^(.+?)[锛?]$/);
    const headingText = markdownHeading?.[1] ?? colonHeading?.[1] ?? null;

    if (headingText) {
      isCapturing = headingMatchesCapabilities(headingText);
      continue;
    }

    const bullet = line.match(/^(?:[-*]|\d+\.)\s+(.+)$/);

    if (!isCapturing || !bullet?.[1]) {
      continue;
    }

    rules.push(bullet[1]);

    if (rules.length >= 6) {
      break;
    }
  }

  return rules;
}

function inferPlatformHints(markdown: string) {
  const hints = new Set<string>();

  if (/鍏紬鍙穦寰俊|wechat|weixin/i.test(markdown)) {
    hints.add("wechat");
  }

  if (/灏忕孩涔xiaohongshu|rednote/i.test(markdown)) {
    hints.add("xiaohongshu");
  }

  if (/twitter|tweet|thread|鎺ㄦ枃|x\.com/i.test(markdown)) {
    hints.add("twitter");
  }

  if (/瑙嗛|鍒嗛暅|鑴氭湰|video|script/i.test(markdown)) {
    hints.add("videoScript");
  }

  return Array.from(hints);
}

function extractKeywords(markdown: string, title: string, description: string) {
  const keywords = new Set<string>();
  const source = `${title} ${description}`;

  for (const match of source.matchAll(/[A-Za-z0-9][A-Za-z0-9_.-]{2,}/g)) {
    keywords.add(match[0].toLowerCase());
  }

  for (const keyword of [
    "公众号",
    "小红书",
    "Twitter",
    "瑙嗛",
    "闀挎枃",
    "鍐欎綔",
    "閫夐",
    "瀹℃牎",
    "椋庢牸",
    "鍐呭鍒涗綔"
  ]) {
    if (markdown.includes(keyword)) {
      keywords.add(keyword);
    }
  }

  return Array.from(keywords).slice(0, 8);
}

export function learnSkill(input: { markdown: string; references: string[] }) {
  const parsed = parseSkillMarkdown(input.markdown);
  const extractedRules = extractCapabilityRules(input.markdown);

  return {
    summary: parsed.description,
    rules:
      extractedRules.length > 0
        ? extractedRules
        : ["Read SKILL.md", "Apply workflow before generation"],
    platformHints: inferPlatformHints(input.markdown),
    keywords: extractKeywords(input.markdown, parsed.title, parsed.description),
    examplesSummary: input.references.slice(0, 3)
  };
}
