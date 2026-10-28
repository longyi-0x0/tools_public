import {
  createContainer,
  createLeaf,
  createPattern,
} from "../core/ast.js";

export const PALETTE_GROUPS = [
  {
    id: "layout",
    label: "布局",
    hint: "决定子节点的自由度",
    items: [
      { template: "column", label: "纵向容器", glyph: "↓", hint: "从上往下排" },
      { template: "row", label: "横排容器", glyph: "→", hint: "从左往右排" },
      { template: "grid", label: "网格容器", glyph: "▦", hint: "等宽单元" },
      { template: "free", label: "自由容器", glyph: "✥", hint: "允许绝对坐标" },
    ],
  },
  {
    id: "pattern",
    label: "结构件",
    hint: "内部布局锁定，只填槽位",
    items: [
      { template: "navbar", label: "导航栏", glyph: "▔", hint: "标题 + 左右槽位" },
      { template: "tabs", label: "标签页", glyph: "▤", hint: "标签 + 内容槽位" },
    ],
  },
  {
    id: "leaf",
    label: "元素",
    hint: "线框态，可逐个接真组件",
    items: [
      { template: "text", label: "文本", glyph: "T", hint: "一段说明" },
      { template: "image", label: "图片", glyph: "▧", hint: "图片框" },
      { template: "button", label: "按钮", glyph: "◉", hint: "行动按钮" },
      { template: "input", label: "输入框", glyph: "⌸", hint: "表单输入" },
      { template: "placeholder", label: "占位块", glyph: "▢", hint: "待定区域" },
    ],
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
  if (["row", "column", "grid", "free"].includes(template)) {
    return createContainer(template);
  }
  if (template === "navbar" || template === "tabs") {
    return createPattern(template);
  }
  return createLeaf(template);
}

export function defaultFrameFor(node) {
  if (node.type === "container") {
    return node.layout === "row"
      ? { x: 16, y: 16, w: 280, h: 88 }
      : { x: 16, y: 16, w: 240, h: 140 };
  }
  if (node.type === "pattern") return { x: 16, y: 16, w: 320, h: 72 };
  if (node.shape === "image") return { x: 16, y: 16, w: 72, h: 72 };
  if (node.shape === "button") return { x: 16, y: 16, w: 104, h: 40 };
  if (node.shape === "input") return { x: 16, y: 16, w: 220, h: 40 };
  if (node.shape === "placeholder") return { x: 16, y: 16, w: 220, h: 64 };
  return { x: 16, y: 16, w: 180, h: 28 };
}
