import { createNode } from "../core/ast.js";
import { defaultLayoutProps } from "../core/schema.js";
import { baseNameOf, SEMANTIC_TARGETS } from "../resolve/vocabulary.js";
import { listComponents } from "../components/registry.js";

const LAYOUT_ITEMS = [
  { template: "column", label: "纵向容器", glyph: "↓", hint: "从上往下排", layout: "column" },
  { template: "row", label: "横排容器", glyph: "→", hint: "从左往右排", layout: "row" },
  { template: "grid", label: "网格容器", glyph: "▦", hint: "等宽单元", layout: "grid" },
  { template: "free", label: "自由容器", glyph: "✥", hint: "允许绝对坐标", layout: "free" },
];

const SEMANTIC_GLYPHS = {
  text: "T",
  image: "▧",
  button: "◉",
  input: "⌸",
  placeholder: "▢",
  navbar: "▔",
  tabs: "▤",
};

const SEMANTIC_HINTS = {
  text: "一段说明",
  image: "图片框",
  button: "行动按钮",
  input: "表单输入",
  placeholder: "待定区域",
  navbar: "标题 + 左右槽位",
  tabs: "标签 + 内容槽位",
};

function semanticItems() {
  return SEMANTIC_TARGETS.map((entry) => ({
    template: entry.name,
    label: entry.label,
    glyph: SEMANTIC_GLYPHS[entry.name] ?? "·",
    hint: SEMANTIC_HINTS[entry.name] ?? entry.label,
    use: [entry.name],
    props: defaultPropsOf(entry),
  }));
}

function componentItems() {
  return listComponents().map((component) => ({
    template: `local:${component.id}`,
    label: component.name,
    glyph: "◎",
    hint: component.description ?? "已注册的真组件",
    use: [`local:${component.id}`],
    props: {},
  }));
}

function defaultPropsOf(entry) {
  const props = {};
  for (const field of entry.propsSchema ?? []) {
    if (field.default !== undefined) props[field.key] = field.default;
  }
  return props;
}

export const PALETTE_GROUPS = [
  {
    id: "layout",
    label: "布局",
    hint: "决定子节点的自由度",
    items: LAYOUT_ITEMS,
  },
  {
    id: "semantic",
    label: "语义单元",
    hint: "无前缀短名，可被任何组件集覆盖",
    items: semanticItems(),
  },
  {
    id: "component",
    label: "真组件",
    hint: "接管后由组件决定渲染",
    items: componentItems(),
  },
];

const INDEX = new Map(
  PALETTE_GROUPS.flatMap((group) =>
    group.items.map((item) => [item.template, { ...item, group: group.id }]),
  ),
);

export function paletteItem(template) {
  return INDEX.get(template) ?? null;
}

export function createFromTemplate(template) {
  const item = paletteItem(template);
  if (!item) throw new Error(`没有这个模板：${template}`);
  if (item.layout) {
    return createNode({ layout: item.layout, layoutProps: defaultLayoutProps(item.layout) });
  }
  return createNode({ use: item.use, props: { ...item.props } });
}

/** 自由布局里的默认落点尺寸，按语义名或布局类型给个合理值。 */
export function defaultFrameFor(node) {
  const { w, h } = suggestedSize(node);
  return { x: 16, y: 16, w, h };
}

export function suggestedSize(node) {
  if (node?.layout === "row") return { w: 280, h: 88 };
  if (node?.layout) return { w: 240, h: 140 };
  const source = baseNameOf(node?.use?.[0]?.src ?? node?.use?.[0]);
  const entry = SEMANTIC_TARGETS.find((item) => item.name === source);
  if (entry?.defaultSize) return { w: entry.defaultSize.w, h: entry.defaultSize.h };
  return { w: 180, h: 28 };
}
