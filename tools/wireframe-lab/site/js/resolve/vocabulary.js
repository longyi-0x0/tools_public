/**
 * 语义名与推荐属性。第三方集合照着实现即可获得可移植性，
 * 也是 AI 起稿的输出目标。
 */
export const SEMANTIC_TARGETS = [
  {
    name: "text",
    label: "文本",
    variants: ["caption", "body"],
    slots: [],
    honorsStructure: true,
    propsSchema: [{ key: "content", label: "内容", type: "string", default: "一段说明文字" }],
    defaultSize: { w: 180, h: 24 },
  },
  {
    name: "image",
    label: "图片",
    variants: [],
    slots: [],
    honorsStructure: true,
    propsSchema: [{ key: "alt", label: "替代文字", type: "string", default: "" }],
    defaultSize: { w: 72, h: 72 },
  },
  {
    name: "button",
    label: "按钮",
    variants: ["large", "ghost"],
    slots: [],
    honorsStructure: true,
    propsSchema: [
      { key: "label", label: "文字", type: "string", default: "按钮" },
      { key: "disabled", label: "禁用", type: "boolean", default: false },
    ],
    defaultSize: { w: 104, h: 40 },
  },
  {
    name: "input",
    label: "输入框",
    variants: [],
    slots: [],
    honorsStructure: true,
    propsSchema: [
      { key: "label", label: "标签", type: "string", default: "" },
      { key: "placeholder", label: "占位提示", type: "string", default: "输入内容" },
      { key: "value", label: "当前值", type: "string", default: "" },
    ],
    defaultSize: { w: 220, h: 40 },
  },
  {
    name: "placeholder",
    label: "占位块",
    variants: [],
    slots: [],
    honorsStructure: true,
    propsSchema: [{ key: "note", label: "说明", type: "string", default: "" }],
    defaultSize: { w: 220, h: 64 },
  },
  {
    name: "navbar",
    label: "导航栏",
    variants: ["transparent"],
    slots: ["left", "right"],
    honorsStructure: true,
    propsSchema: [{ key: "title", label: "标题", type: "string", default: "页面标题" }],
    defaultSize: { w: 320, h: 56 },
  },
  {
    name: "tabs",
    label: "标签页",
    variants: [],
    slots: ["content"],
    honorsStructure: true,
    propsSchema: [{ key: "labels", label: "标签文字", type: "list", default: ["概览", "详情"] }],
    defaultSize: { w: 320, h: 44 },
  },
];

export function baseNameOf(src) {
  if (typeof src !== "string") return null;
  const bare = src.includes(":") ? src.slice(src.indexOf(":") + 1) : src;
  const first = bare.split(".")[0];
  return first || null;
}

/** 只在这条链的首项确实是语义词时返回它，句柄一律不算。 */
export function semanticOf(src) {
  if (typeof src !== "string" || src.includes(":")) return null;
  const base = baseNameOf(src);
  return findSemantic(base) ? base : null;
}

export function findSemantic(name) {
  return SEMANTIC_TARGETS.find((entry) => entry.name === name) ?? null;
}

export function variantOf(src) {
  if (typeof src !== "string" || src.includes(":")) return null;
  const parts = src.split(".");
  return parts.length > 1 ? parts.slice(1).join(".") : null;
}

/** 默认集合的条目：语义名与变体各展开成一条，行为完全一致。 */
export function createDefaultTargets() {
  const targets = [];
  for (const entry of SEMANTIC_TARGETS) {
    targets.push({ ...entry, name: entry.name });
    for (const variant of entry.variants) {
      targets.push({ ...entry, name: `${entry.name}.${variant}`, variant });
    }
  }
  return targets;
}

/** 交给 LLM 的约束片段：名、属性、变体、槽位。 */
export function vocabularyPrompt() {
  return SEMANTIC_TARGETS.map((entry) => {
    const props = entry.propsSchema.map((field) => field.key).join(", ") || "无";
    const variants = entry.variants.length > 0 ? entry.variants.join(" / ") : "无";
    const slots = entry.slots.length > 0 ? entry.slots.join(", ") : "无";
    return `- ${entry.name}｜属性：${props}｜变体：${variants}｜槽位：${slots}`;
  }).join("\n");
}

export function knownPropKeys(name) {
  const entry = findSemantic(name);
  return entry ? entry.propsSchema.map((field) => field.key) : [];
}
