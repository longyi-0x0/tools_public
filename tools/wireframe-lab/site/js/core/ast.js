import {
  PATTERN_SLOTS,
  PATTERNS,
  SHAPES,
  SCHEMA_VERSION,
} from "./constants.js";
import { sortByPosition } from "./position.js";

let sequence = 0;

export function newId(prefix = "n") {
  sequence = (sequence + 1) % 1296;
  const random =
    globalThis.crypto?.randomUUID?.().replaceAll("-", "").slice(0, 8) ??
    Math.random().toString(36).slice(2, 10);
  return `${prefix}${random}${sequence.toString(36).padStart(2, "0")}`;
}

export function createContainer(layout = "column", patch = {}) {
  return {
    id: newId(),
    type: "container",
    layout,
    gap: "md",
    align: "start",
    distribute: "start",
    ...(layout === "grid" ? { columns: 2 } : {}),
    ...patch,
  };
}

export function createLeaf(shape = "text", patch = {}) {
  return {
    id: newId(),
    type: "leaf",
    shape: SHAPES.includes(shape) ? shape : "text",
    label: defaultLeafLabel(shape),
    ...patch,
  };
}

export function createPattern(pattern = "navbar", patch = {}) {
  return {
    id: newId(),
    type: "pattern",
    pattern: PATTERNS.includes(pattern) ? pattern : "navbar",
    props:
      pattern === "tabs"
        ? { labels: ["概览", "详情", "记录"] }
        : { title: "页面标题" },
    ...patch,
  };
}

export function createDocument(title = "未命名页面") {
  const root = createContainer("column");
  root.gap = "md";
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId("p"),
    title,
    root: root.id,
    nodes: { [root.id]: root },
  };
}

export function defaultLeafLabel(shape) {
  return {
    text: "一段说明文字",
    image: "图片",
    button: "按钮",
    input: "输入内容",
    placeholder: "占位块",
  }[shape] ?? "内容";
}

export function getNode(doc, id) {
  return doc.nodes[id] ?? null;
}

export function childrenOf(doc, parentId, slot = undefined) {
  return Object.values(doc.nodes)
    .filter((node) => {
      if (node.parent !== parentId) return false;
      if (slot === null) return node.slot == null;
      if (typeof slot === "string") return node.slot === slot;
      return true;
    })
    .sort(sortByPosition);
}

export function depthOf(doc, id) {
  let depth = 0;
  let current = doc.nodes[id];
  const seen = new Set();
  while (current?.parent) {
    if (seen.has(current.id)) return Number.POSITIVE_INFINITY;
    seen.add(current.id);
    depth += 1;
    current = doc.nodes[current.parent];
  }
  return depth;
}

export function isDescendant(doc, ancestorId, nodeId) {
  let current = doc.nodes[nodeId];
  const seen = new Set();
  while (current?.parent) {
    if (seen.has(current.id)) return false;
    seen.add(current.id);
    if (current.parent === ancestorId) return true;
    current = doc.nodes[current.parent];
  }
  return false;
}

export function descendantIds(doc, nodeId) {
  const result = [];
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const node of Object.values(doc.nodes)) {
      if (node.parent === current) {
        result.push(node.id);
        queue.push(node.id);
      }
    }
  }
  return result;
}

export function patternSlotNames(pattern) {
  return Object.keys(PATTERN_SLOTS[pattern] ?? {});
}

export function patternSlotMax(pattern, slot) {
  return PATTERN_SLOTS[pattern]?.[slot]?.max ?? 0;
}

export function canAcceptChild(doc, parentId, slot = null) {
  const parent = doc.nodes[parentId];
  if (!parent) return { ok: false, reason: "目标容器不存在" };
  if (parent.type === "leaf") return { ok: false, reason: "元素不能包含子节点" };
  if (parent.type === "container") {
    if (slot != null) return { ok: false, reason: "普通容器没有具名槽位" };
    return { ok: true };
  }
  if (parent.type === "pattern") {
    if (slot == null) return { ok: false, reason: "结构件只能放进具名槽位" };
    if (!(slot in (PATTERN_SLOTS[parent.pattern] ?? {}))) {
      return { ok: false, reason: "这个槽位不存在" };
    }
    return { ok: true };
  }
  return { ok: false, reason: "未知父节点" };
}

export function nodeDisplayName(node) {
  if (!node) return "未选中";
  if (node.type === "container") {
    return {
      row: "横排容器",
      column: "纵向容器",
      grid: "网格容器",
      free: "自由容器",
    }[node.layout] ?? "容器";
  }
  if (node.type === "pattern") {
    return node.pattern === "navbar" ? "导航栏" : "标签页";
  }
  if (node.label) return String(node.label);
  return {
    text: "文本",
    image: "图片",
    button: "按钮",
    input: "输入框",
    placeholder: "占位块",
  }[node.shape] ?? "元素";
}

export function childCount(doc, parentId) {
  return Object.values(doc.nodes).filter((node) => node.parent === parentId).length;
}
