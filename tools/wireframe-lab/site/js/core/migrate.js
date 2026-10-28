import { SCHEMA_VERSION } from "./constants.js";
import { normalizePosition, normalizeSize } from "./schema.js";

/** v1 的具名槽位定义，迁移时展开成本节点自己的 slots 声明。 */
const V1_PATTERN_SLOTS = {
  navbar: ["left", "right"],
  tabbar: ["left", "right"],
  tabs: ["content"],
  list: ["header", "content"],
  form: ["content"],
  table: ["header", "content"],
  dialog: ["header", "body", "footer"],
};

const V1_STRUCTURAL_KEYS = new Set([
  "type",
  "pattern",
  "shape",
  "label",
  "binding",
  "escape",
  "frame",
  "gap",
  "align",
  "distribute",
  "columns",
]);

export function needsMigration(doc) {
  return doc?.schemaVersion !== SCHEMA_VERSION;
}

/**
 * v1 → v2 单向迁移。旧的三类节点各自翻成同一种结构，
 * 旧 shape 与 pattern 直接变成语义名，不需要特例表。
 */
export function migrateDocument(doc) {
  if (!doc || typeof doc !== "object") throw new Error("文档必须是对象");
  if (doc.schemaVersion === SCHEMA_VERSION) return doc;
  if (doc.schemaVersion !== 1) {
    throw new Error(`不认识的 schemaVersion：${doc.schemaVersion}`);
  }
  const nodes = {};
  for (const [id, node] of Object.entries(doc.nodes ?? {})) {
    nodes[id] = migrateNode(node);
  }
  const next = {
    schemaVersion: SCHEMA_VERSION,
    id: doc.id,
    title: doc.title,
    root: doc.root,
    nodes,
  };
  if (Array.isArray(doc.sets)) next.sets = doc.sets;
  return next;
}

export function migrateNode(raw) {
  const node = { id: raw.id };
  if (raw.parent != null) node.parent = raw.parent;
  if (raw.pos != null) node.pos = raw.pos;
  if (raw.slot != null) node.slot = raw.slot;

  if (raw.layout != null) {
    node.layout = raw.layout;
    node.layoutProps = pickLayoutProps(raw);
  }

  const use = [];
  const props = {};

  if (raw.type === "pattern") {
    if (raw.pattern) {
      use.push(raw.pattern);
      const slots = V1_PATTERN_SLOTS[raw.pattern];
      if (slots) node.slots = [...slots];
    }
    Object.assign(props, raw.props ?? {});
  } else if (raw.type === "leaf") {
    if (raw.shape) use.push(raw.shape);
    if (raw.label != null) {
      node.desc = raw.label;
      props.label = raw.label;
    }
  }

  if (raw.binding?.component) {
    use.unshift(`local:${raw.binding.component}`);
    Object.assign(props, raw.binding.props ?? {});
  }
  if (use.length > 0) node.use = use;
  if (Object.keys(props).length > 0) node.props = props;

  const position = positionFromV1(raw);
  if (position) node.position = position;
  const size = sizeFromV1(raw);
  if (size) node.size = size;

  for (const [key, value] of Object.entries(raw)) {
    if (V1_STRUCTURAL_KEYS.has(key)) continue;
    if (key === "id" || key === "parent" || key === "pos" || key === "slot") continue;
    if (key === "layout" || key === "use" || key === "props" || key === "desc") continue;
    if (key === "position" || key === "size" || key === "slots") continue;
    if (key === "note" || key === "requirementId" || key === "origin" || key === "hidden") {
      node[key] = value;
    }
  }
  return node;
}

function pickLayoutProps(raw) {
  if (raw.layout === "grid") {
    return {
      gap: raw.gap ?? "md",
      align: raw.align ?? "start",
      columns: raw.columns ?? 2,
    };
  }
  if (raw.layout === "free") return { gap: raw.gap ?? "md" };
  return {
    gap: raw.gap ?? "md",
    align: raw.align ?? "start",
    distribute: raw.distribute ?? "start",
  };
}

function positionFromV1(raw) {
  if (raw.frame) {
    const { x, y, w, h } = raw.frame;
    return normalizePosition({ mode: "absolute", x, y, w, h });
  }
  if (raw.escape) {
    return normalizePosition({
      mode: "anchor",
      anchor: raw.escape.anchor,
      inset: raw.escape.inset,
    });
  }
  return null;
}

function sizeFromV1(raw) {
  if (raw.frame) {
    return normalizeSize({ width: raw.frame.w, height: raw.frame.h });
  }
  if (raw.size) {
    return normalizeSize({ width: raw.size.w, height: raw.size.h });
  }
  return null;
}
