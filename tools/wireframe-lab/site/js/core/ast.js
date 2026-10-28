import { SCHEMA_VERSION } from "./constants.js";
import { normalizeUse, slotNamesOf } from "./schema.js";
import { sortByPosition } from "./position.js";

let sequence = 0;

export function newId(prefix = "n") {
  sequence = (sequence + 1) % 1296;
  const random =
    globalThis.crypto?.randomUUID?.().replaceAll("-", "").slice(0, 8) ??
    Math.random().toString(36).slice(2, 10);
  return `${prefix}${random}${sequence.toString(36).padStart(2, "0")}`;
}

/**
 * 节点只有一种结构。能不能装子节点、怎么排、由谁渲染，分别由
 * slots / layout / use 三个字段回答，没有类型字段。
 */
export function createNode(patch = {}) {
  const node = { id: patch.id ?? newId(), ...patch };
  const { use } = patch;
  if (use === undefined) node.use = [];
  else node.use = Array.isArray(use) ? [...use] : [use];
  return node;
}

export function createDocument(title = "未命名页面") {
  const root = createNode({
    layout: "column",
    layoutProps: { gap: "md", align: "fill", distribute: "start" },
  });
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId("p"),
    title,
    root: root.id,
    nodes: { [root.id]: root },
  };
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

/**
 * 任何节点都能装子节点——类型消失之后这条不再是限制。
 * 唯一的结构约束是：写进具名槽位的子节点，父节点必须声明过那个槽位。
 */
export function canAcceptChild(doc, parentId, slot = null) {
  const parent = doc.nodes[parentId];
  if (!parent) return { ok: false, reason: "目标节点不存在" };
  if (slot == null) return { ok: true };
  if (!slotNamesOf(parent).includes(slot)) {
    return { ok: false, reason: `${nodeDisplayName(parent)} 没有槽位 ${slot}` };
  }
  return { ok: true };
}

export function nodeDisplayName(node) {
  if (!node) return "未选中";
  if (typeof node.desc === "string" && node.desc.trim()) return node.desc.trim();
  const label = node.props?.label ?? node.props?.content ?? node.props?.title;
  if (typeof label === "string" && label.trim()) return label.trim();
  const first = normalizeUse(node.use)[0];
  if (first) return first.src;
  if (node.layout) {
    return (
      {
        row: "横排容器",
        column: "纵向容器",
        grid: "网格容器",
        free: "自由容器",
      }[node.layout] ?? "容器"
    );
  }
  return "节点";
}

export function childCount(doc, parentId) {
  return Object.values(doc.nodes).filter((node) => node.parent === parentId).length;
}
