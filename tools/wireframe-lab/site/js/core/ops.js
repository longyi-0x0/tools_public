import {
  canAcceptChild,
  childrenOf,
  descendantIds,
  getNode,
  isDescendant,
} from "./ast.js";
import { positionBetween } from "./position.js";

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
  delete placed.escape;
  delete placed.frame;
  delete placed.size;
  doc.nodes[placed.id] = placed;
  return placed;
}

export function moveNode(
  doc,
  nodeId,
  parentId,
  {
    slot = null,
    index = Infinity,
    frame = null,
    keepEscape = false,
  } = {},
) {
  const node = getNode(doc, nodeId);
  if (!node) throw new Error("要移动的节点不存在");
  if (nodeId === doc.root) throw new Error("根节点不能移动");
  if (parentId === nodeId || isDescendant(doc, nodeId, parentId)) {
    throw new Error("不能把容器拖进自己的子树");
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
  delete node.frame;
  if (!keepEscape) {
    delete node.escape;
    delete node.size;
  }
  if (frame) node.frame = clone(frame);
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

export function setLayout(doc, nodeId, layout, frames = null) {
  const node = getNode(doc, nodeId);
  if (!node || node.type !== "container") throw new Error("只有容器可以切换布局");
  node.layout = layout;
  if (layout === "grid" && !Number.isFinite(node.columns)) node.columns = 2;
  if (layout === "grid") node.columns = Math.max(1, Math.min(6, node.columns ?? 2));

  const children = childrenOf(doc, nodeId);
  for (const child of children) {
    if (child.escape) {
      delete child.frame;
      continue;
    }
    if (layout === "free") {
      child.frame = clone(
        frames?.[child.id] ?? child.frame ?? { x: 0, y: 0, w: 160, h: 48 },
      );
    } else {
      delete child.frame;
    }
  }
  return node;
}

export function bindNode(doc, nodeId, component, props = {}) {
  const node = getNode(doc, nodeId);
  if (!node || node.type !== "leaf") throw new Error("只有叶子可以绑定组件");
  node.binding = { component, props: clone(props) };
  return node;
}

export function unbindNode(doc, nodeId) {
  const node = getNode(doc, nodeId);
  if (!node) throw new Error("节点不存在");
  delete node.binding;
  return node;
}

export function setEscape(doc, nodeId, escape = null) {
  const node = getNode(doc, nodeId);
  if (!node || nodeId === doc.root) throw new Error("根节点不能悬浮");
  if (!escape) {
    delete node.escape;
    delete node.size;
    return node;
  }
  node.escape = clone(escape);
  delete node.frame;
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

function metaOf(doc) {
  const meta = {};
  for (const [key, value] of Object.entries(doc)) {
    if (key !== "nodes") meta[key] = value;
  }
  return meta;
}
