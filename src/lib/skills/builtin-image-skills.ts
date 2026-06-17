import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  createSkill,
  isBuiltinSkillDeleted,
  saveSkillLearningResult
} from "@/lib/db/repositories/skill-repository";
import { getSkillUnpackedDirectory } from "@/lib/fs/app-paths";

type BuiltinImageSkillDefinition = {
  id: string;
  name: string;
  sourceRef: string;
  summary: string;
  platformHints?: string[];
  keywords: string[];
  rules: string[];
  markdown: string;
};

const builtInImageSkills: BuiltinImageSkillDefinition[] = [
  {
    id: "builtin-image-wechat-baoyu-cover",
    name: "Baoyu WeChat Cover",
    sourceRef: "https://github.com/JimLiu/baoyu-skills",
    summary:
      "WeChat cover skill inspired by JimLiu/baoyu-skills, focused on readable public-account covers with strong hierarchy and editorial storytelling.",
    platformHints: ["wechat"],
    keywords: ["wechat-cover", "baoyu-skills", "editorial", "hero-image"],
    rules: [
      "Prioritize WeChat article cover readability: one clear visual thesis, one primary title block, and one secondary support line.",
      "Use editorial composition with strong hierarchy, generous whitespace, and mobile-first text legibility.",
      "Prefer meaningful metaphor and structured information over decorative noise.",
      "Output should feel publish-ready for public-account distribution, not like a generic placeholder."
    ],
    markdown: `---
name: baoyu-wechat-cover
description: WeChat cover image skill inspired by JimLiu/baoyu-skills.
---

# Baoyu WeChat Cover Skill

Use this skill to design high-quality WeChat article cover images.

## Goals

- Strong title readability on mobile.
- Clear visual hierarchy and editorial layout.
- One-image-one-message cover strategy.

## Style Rules

- Use concise title-first composition.
- Keep visual language clean, intentional, and information-driven.
- Balance aesthetics with practical public-account cover requirements.
`
  },
  {
    id: "builtin-image-wechat-md2wechat-cover",
    name: "md2wechat Cover Hero",
    sourceRef: "https://github.com/geekjourneyx/md2wechat-skill",
    summary:
      "WeChat cover skill inspired by geekjourneyx/md2wechat-skill, optimized for cover-hero style and markdown-to-wechat publishing scenarios.",
    platformHints: ["wechat"],
    keywords: ["wechat-cover", "md2wechat", "cover-hero", "markdown"],
    rules: [
      "Design cover visuals for WeChat publishing with practical 16:9-friendly hero composition.",
      "Keep title, subtitle, and visual motif consistent with the article's narrative hook.",
      "Avoid clutter; favor clean typography and high contrast.",
      "Use structure and tone suitable for long-form public-account articles."
    ],
    markdown: `---
name: md2wechat-cover-hero
description: WeChat cover hero skill inspired by geekjourneyx/md2wechat-skill.
---

# md2wechat Cover Hero Skill

Use this skill when the article needs a classic public-account cover with a clear title-led hero style.

## Goals

- Ready-to-publish hero cover structure.
- Strong title impact and easy scanning.
- Good fit for markdown-first article workflows.
`
  },
  {
    id: "builtin-image-satori-resvg",
    name: "Satori + resvg Social Card",
    sourceRef: "https://github.com/vercel/satori + https://github.com/thx/resvg-js",
    summary:
      "Generate premium social cards from JSX/HTML/CSS-style layout specs for covers, quote cards, framework cards, and visual series.",
    keywords: ["satori", "resvg", "social-card", "html-css", "xiaohongshu"],
    rules: [
      "Use code-native layout with explicit typography, spacing, grid, and color tokens.",
      "Design every Xiaohongshu card as a polished social card, not a generic placeholder.",
      "Prefer concise text blocks, strong hierarchy, and export-ready SVG/PNG composition.",
      "Keep series cards visually consistent with reusable layout variables."
    ],
    markdown: `---
name: satori-resvg-social-card
description: Code drawing skill for creating premium social cards with Satori-style JSX layout and resvg-style export.
---

# Satori + resvg Social Card Skill

Use this skill when Xiaohongshu content needs designed image cards rather than generic AI images.

## Capabilities

- Build image prompts as code-native card specs: canvas size, typography, grid, color tokens, decorative shapes, and export target.
- Create Xiaohongshu carousel cards with consistent cover, method, comparison, checklist, framework, and CTA pages.
- Favor editorial social-card aesthetics: bold display title, short subtitle, readable body, controlled whitespace, and brand accents.
- Source inspiration: vercel/satori and thx/resvg-js.

## Workflow

1. Decide the card role: cover, concept, framework, checklist, comparison, scene, summary, or CTA.
2. Specify canvas ratio for Xiaohongshu, usually 3:4 portrait or square.
3. Write a compact visual spec with layout, type scale, color palette, and text hierarchy.
4. Keep every series card connected through shared palette, motif, and footer markers.
`
  },
  {
    id: "builtin-image-rough-js",
    name: "Rough.js Hand-drawn Knowledge Card",
    sourceRef: "https://github.com/rough-stuff/rough",
    summary:
      "Use hand-drawn lines, rough boxes, arrows, and sticky-note structures for warm knowledge cards, method cards, comparisons, flows, and checklists.",
    keywords: ["rough", "hand-drawn", "sketch", "knowledge-card", "xiaohongshu"],
    rules: [
      "Use hand-drawn lines, rough rectangles, arrows, sticky notes, and warm paper texture.",
      "Translate abstract ideas into visual maps with clear labels and small doodle icons.",
      "Keep text legible; use sketch style as decoration, not noise.",
      "Source inspiration: rough-stuff/rough."
    ],
    markdown: `---
name: rough-js-knowledge-card
description: Hand-drawn code drawing skill based on rough-stuff/rough for warm Xiaohongshu knowledge cards.
---

# Rough.js Hand-drawn Knowledge Card Skill

Use this skill when the content should feel human, hand-made, and easy to save.

## Capabilities

- Generate hand-drawn knowledge cards with rough-stuff/rough style strokes.
- Use hand-drawn boxes, arrows, stars, dividers, sticky notes, and warm paper backgrounds.
- Works well for workflow diagrams, concept maps, comparison cards, checklist cards, and method cards.
- Keep the mood warm and approachable while maintaining strong information hierarchy.

## Rules

- Use hand-drawn visual language: uneven strokes, doodle arrows, organic outlines, and simple icons.
- Put the core takeaway in one large title and keep each supporting point short.
- Avoid dense paragraphs inside the image; split into 3-6 digestible blocks.
- For Xiaohongshu carousel, keep a repeated motif across all cards.
`
  },
  {
    id: "builtin-image-excalidraw",
    name: "Excalidraw Whiteboard Explainer",
    sourceRef: "https://github.com/excalidraw/excalidraw",
    summary:
      "Use whiteboard sketches, flow frames, hand-drawn arrows, and structured diagrams to explain complex ideas.",
    keywords: ["excalidraw", "whiteboard", "diagram", "flow", "xiaohongshu"],
    rules: [
      "Use whiteboard-style diagrams with clear nodes, arrows, grouped zones, and handwritten labels.",
      "Prefer visual explanation over decorative imagery for technical or abstract topics.",
      "Show relationships, tradeoffs, or flows explicitly.",
      "Source inspiration: excalidraw/excalidraw."
    ],
    markdown: `---
name: excalidraw-whiteboard-explainer
description: Whiteboard diagram skill inspired by Excalidraw for explaining concepts, systems, and workflows.
---

# Excalidraw Whiteboard Explainer Skill

Use this skill for concepts that need a diagram more than a pretty picture.

## Capabilities

- Plan whiteboard cards with nodes, arrows, zones, labels, and simple hand-drawn icons.
- Turn software, AI, business, or workflow topics into a clear visual model.
- Good for "what happens behind the scenes", "before vs after", and "system map" cards.

## Rules

- Start from the core relation: flow, hierarchy, loop, contrast, or timeline.
- Use no more than 7 main nodes per card.
- Make arrows meaningful; every arrow should express cause, sequence, or dependency.
- Keep labels short and readable on mobile.
`
  },
  {
    id: "builtin-image-mermaid",
    name: "Mermaid Structured Diagram",
    sourceRef: "https://github.com/mermaid-js/mermaid",
    summary:
      "Use flowcharts, sequence diagrams, state diagrams, and architecture diagrams to express logic, paths, and step-by-step structures.",
    keywords: ["mermaid", "flowchart", "sequence", "architecture", "xiaohongshu"],
    rules: [
      "Choose Mermaid-style diagrams for process, sequence, state, journey, timeline, and architecture content.",
      "Use diagram grammar thinking: nodes, edges, clusters, decision diamonds, and annotations.",
      "Pair the diagram with a strong card title and a short interpretation.",
      "Source inspiration: mermaid-js/mermaid."
    ],
    markdown: `---
name: mermaid-structured-diagram
description: Code diagram skill inspired by mermaid-js/mermaid for flowcharts, sequences, timelines, and architecture diagrams.
---

# Mermaid Structured Diagram Skill

Use this skill when the image should primarily communicate logic.

## Capabilities

- Convert content into flowchart, sequence, timeline, state, journey, or architecture card specs.
- Keep diagrams simple enough to read on mobile.
- Add title, legend, and emphasis notes around the diagram.

## Rules

- Pick one Mermaid diagram type that matches the content structure.
- Use short node labels and meaningful edge labels.
- Use groups/subgraphs only when they reduce cognitive load.
- Put the key conclusion outside the diagram as a card footer.
`
  },
  {
    id: "builtin-image-generative-canvas",
    name: "p5.js + canvas-sketch Generative Poster",
    sourceRef:
      "https://github.com/processing/p5.js + https://github.com/mattdesl/canvas-sketch",
    summary:
      "Use generative shapes, particles, grids, gradients, and organic forms for emotional covers and atmosphere cards.",
    keywords: ["p5", "canvas-sketch", "generative", "poster", "xiaohongshu"],
    rules: [
      "Use generative shapes, grids, particles, gradients, and organic patterns as visual identity.",
      "Best for cover cards, mood cards, and abstract concept cards.",
      "Keep generated art behind or around text; never sacrifice readability.",
      "Source inspiration: processing/p5.js and mattdesl/canvas-sketch."
    ],
    markdown: `---
name: generative-canvas-poster
description: Generative code drawing skill using p5.js and canvas-sketch style thinking for expressive content cards.
---

# p5.js + canvas-sketch Generative Poster Skill

Use this skill when a Xiaohongshu note needs a memorable visual atmosphere.

## Capabilities

- Design cards with generative grids, particles, organic blobs, contour lines, and gradient fields.
- Create strong cover visuals for AI, creativity, productivity, and trend topics.
- Combine expressive background systems with clean text panels.

## Rules

- Use generative art as the mood layer, not the message itself.
- Keep the headline large and readable.
- Use no more than 2-3 visual systems per card.
- Repeat one visual motif across the carousel for continuity.
`
  },
  {
    id: "builtin-image-d3-visx",
    name: "D3 / visx Data Visualization Card",
    sourceRef: "https://github.com/d3/d3 + https://github.com/airbnb/visx",
    summary:
      "Use charts, coordinates, trend lines, matrices, and comparison visuals for data-led social cards.",
    keywords: ["d3", "visx", "data-visualization", "chart", "xiaohongshu"],
    rules: [
      "Use data visualization patterns: bar, line, scatter, matrix, quadrant, funnel, and timeline.",
      "Make the chart answer one clear question, with annotated highlights.",
      "Avoid fake precision; if data is qualitative, label it as an interpretation map.",
      "Source inspiration: d3/d3 and airbnb/visx."
    ],
    markdown: `---
name: d3-visx-data-card
description: Data visualization card skill inspired by D3 and visx for evidence-led Xiaohongshu images.
---

# D3 / visx Data Visualization Card Skill

Use this skill when the content benefits from charts, comparison matrices, or trend maps.

## Capabilities

- Plan data-led cards using bars, timelines, quadrants, matrices, funnels, and annotated charts.
- Convert research findings into readable social visuals.
- Good for reports, industry analysis, trend explainers, and metric-driven conclusions.

## Rules

- One chart should answer one question.
- Use annotations to point at the most important evidence.
- If the source is not numeric, present it as a qualitative framework, not a fake chart.
- Keep labels short and contrast high for mobile reading.
`
  }
];

function writeBuiltinSkillFiles(definition: BuiltinImageSkillDefinition) {
  const unpackedDirectory = getSkillUnpackedDirectory(definition.id);

  mkdirSync(unpackedDirectory, { recursive: true });
  writeFileSync(path.join(unpackedDirectory, "SKILL.md"), definition.markdown, "utf8");
}

export async function ensureBuiltinImageSkills() {
  for (const definition of builtInImageSkills) {
    if (await isBuiltinSkillDeleted(definition.id)) {
      continue;
    }

    writeBuiltinSkillFiles(definition);

    await createSkill({
      id: definition.id,
      name: definition.name,
      sourceType: "github",
      sourceRef: definition.sourceRef,
      summary: definition.summary,
      status: "ready",
      skillKind: "image"
    });

    await saveSkillLearningResult(definition.id, {
      summary: definition.summary,
      rules: definition.rules,
      platformHints: definition.platformHints ?? ["xiaohongshu"],
      keywords: definition.keywords,
      examplesSummary: ["SKILL.md"]
    });
  }
}
