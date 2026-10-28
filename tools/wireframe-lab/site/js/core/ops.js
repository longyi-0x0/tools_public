import {
  canAcceptChild,
  childrenOf,
  descendantIds,
  getNode,
  isDescendant,
} from "./ast.js";
import { positionBetween } from "./position.js";
import { defaultLayoutProps, normalizePosition, normalizeSize } from "./schema.js";
import { LAYOUT_PARAM_KEYS } from "./constants.js";

export function clone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export function cloneDocument(doc) {
  return clone(doc);
}

export function insertNode(doc, parentId, node, { slot = null, index = Infinity } = {}) {
  const acceptance = canAcceptChild(doc, parentId, slot);
  if (!acceptance.ok) throw new Error(acceptance.reason);
  if (!node?.id) throw new Error("节点缺少 id");
  if (doc.nodes[node.id]) throw new Error(`节点 id 重复：${node.id}`);

  const siblings = childrenOf(doc, parentId, slot);
  const at = Math.max(0, Math.min(index, siblings.length));
  const previous = siblings[at - 1];
  const next = siblings[at];
  const placed = clone(node);
  placed.parent = parentId;
  placed.pos = positionBetween(previous?.pos ?? null, next?.pos ?? null);
  if (slot == null) delete placed.slot;
  else placed.slot = slot;
  delete placed.position;
  doc.nodes[placed.id] = placed;
  return placed;
}

export function moveNode(
  doc,
  nodeId,
  parentId,
  { slot = null, index = Infinity, position = null } = {},
) {
  const node = getNode(doc, nodeId);
  if (!node) throw new Error("要移动的节点不存在");
  if (nodeId === doc.root) throw new Error("根节点不能移动");
  if (parentId === nodeId || isDescendant(doc, nodeId, parentId)) {
    throw new Error("不能把节点拖进自己的子树");
  }
  const acceptance = canAcceptChild(doc, parentId, slot);
  if (!acceptance.ok) throw new Error(acceptance.reason);

  const siblings = childrenOf(doc, parentId, slot).filter((item) => item.id !== nodeId);
  const at = Math.max(0, Math.min(index, siblings.length));
  const previous = siblings[at - 1];
  const next = siblings[at];

  node.parent = parentId;
  node.pos = positionBetween(previous?.pos ?? null, next?.pos ?? null);
  if (slot == null) delete node.slot;
  else node.slot = slot;
  if (position) node.position = normalizePosition(position);
  else if (node.position?.mode === "absolute") delete node.position;
  return node;
}

export function removeNode(doc, nodeId) {
  if (nodeId === doc.root) throw new Error("根节点不能删除");
  if (!doc.nodes[nodeId]) return [];
  const removed = [nodeId, ...descendantIds(doc, nodeId)];
  for (const id of removed) delete doc.nodes[id];
  return removed;
}

export function setFields(doc, nodeId, patch) {
  const node = getNode(doc, nodeId);
  if (!node) throw new Error("节点不存在");
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete node[key];
    else node[key] = clone(value);
  }
  return node;
}

/**
 * 切布局时把子节点的画面位置物化成 position.absolute，切回流体布局再删掉，
 * 这样切换本身不会让画面跳动。
 */
export function setLayout(doc, nodeId, layout, frames = null) {
  const node = getNode(doc, nodeId);
  if (!node) throw new Error("节点不存在");
  const defaults = defaultLayoutProps(layout);
  const previous = node.layoutProps ?? {};
  const next = {};
  for (const key of LAYOUT_PARAM_KEYS[layout] ?? []) {
    const value = previous[key] ?? defaults[key];
    if (value !== undefined) next[key] = value;
  }
  node.layout = layout;
  node.layoutProps = next;
  if (layout === "grid") {
    node.layoutProps.columns = Math.max(1, Math.min(6, node.layoutProps.columns ?? 2));
  }

  for (const child of childrenOf(doc, nodeId)) {
    if (child.position?.mode === "anchor") continue;
    if (layout === "free") {
      child.position = {
        mode: "absolute",
        ...(frames?.[child.id] ?? frameOf(child) ?? { x: 0, y: 0, w: 160, h: 48 }),
      };
    } else if (child.position?.mode === "absolute") {
      delete child.position;
    }
  }
  return node;
}

export function setUse(doc, nodeId, use) {
  const node = getNode(doc, nodeId);
  if (!node) throw new Error("节点不存在");
  if (use == null) delete node.use;
  else node.use = clone(use);
  return node;
}

export function setPosition(doc, nodeId, position = null) {
  const node = getNode(doc, nodeId);
  if (!node || nodeId === doc.root) throw new Error("这个节点不能改定位");
  if (!position || position.mode === "flow") {
    delete node.position;
    return node;
  }
  node.position = normalizePosition(position);
  return node;
}

export function setSize(doc, nodeId, size = null) {
  const node = getNode(doc, nodeId);
  if (!node) throw new Error("节点不存在");
  const normalized = normalizeSize(size);
  if (normalized) node.size = normalized;
  else delete node.size;
  return node;
}

/** 记录一次动作前后真正变化的节点，不复制整页。 */
export function snapshotDiff(before, after) {
  const beforeMeta = metaOf(before);
  const afterMeta = metaOf(after);
  const metaChanged = JSON.stringify(beforeMeta) !== JSON.stringify(afterMeta);
  const ids = new Set([...Object.keys(before.nodes), ...Object.keys(after.nodes)]);
  const changed = {};
  for (const id of ids) {
    const left = before.nodes[id];
    const right = after.nodes[id];
    if (JSON.stringify(left) === JSON.stringify(right)) continue;
    changed[id] = {
      before: left ? clone(left) : null,
      after: right ? clone(right) : null,
    };
  }
  if (!metaChanged && Object.keys(changed).length === 0) return null;
  return {
    before: {
      meta: metaChanged ? clone(beforeMeta) : null,
      nodes: Object.fromEntries(
        Object.entries(changed).map(([id, pair]) => [id, pair.before]),
      ),
    },
    after: {
      meta: metaChanged ? clone(afterMeta) : null,
      nodes: Object.fromEntries(
        Object.entries(changed).map(([id, pair]) => [id, pair.after]),
      ),
    },
  };
}

export function applySnapshot(doc, snapshot) {
  if (snapshot.meta) {
    for (const key of Object.keys(doc)) {
      if (key !== "nodes") delete doc[key];
    }
    Object.assign(doc, clone(snapshot.meta));
  }
  for (const [id, node] of Object.entries(snapshot.nodes)) {
    if (node == null) delete doc.nodes[id];
    else doc.nodes[id] = clone(node);
  }
  return doc;
}

function frameOf(node) {
  if (node.position?.mode !== "absolute") return null;
  const { x, y, w, h } = node.position;
  return { x, y, w, h };
}

function metaOf(doc) {
  const meta = {};
  for (const [key, value] of Object.entries(doc)) {
    if (key !== "nodes") meta[key] = value;
  }
  return meta;
}
