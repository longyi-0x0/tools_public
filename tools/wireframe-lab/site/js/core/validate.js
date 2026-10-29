import {
  ANCHORS,
  DISTRIBUTES,
  GAP_TOKENS,
  INSET_TOKENS,
  LAYOUT_PARAM_KEYS,
  SCHEMA_VERSION,
  isLayout,
} from "./constants.js";
import {
  isPlainObject,
  parseAspect,
  parseLength,
  splitHandle,
  slotNamesOf,
} from "./schema.js";

/**
 * 只返回结构层的错：画不出来、或者会留下悬空引用。
 * 目标能否被解析、props 是否落在语义词表里，一律不算错，见 collectContractWarnings。
 */
export function validateDocument(doc) {
  const errors = [];
  if (!isPlainObject(doc)) return ["文档必须是对象"];
  if (doc.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schemaVersion 必须是 ${SCHEMA_VERSION}`);
  }
  if (typeof doc.id !== "string" || !doc.id) errors.push("页面缺少 id");
  if (typeof doc.title !== "string") errors.push("页面缺少 title");
  if (!isPlainObject(doc.nodes)) return [...errors, "nodes 必须是对象"];
  if (typeof doc.root !== "string" || !doc.nodes[doc.root]) {
    return [...errors, "root 指向的节点不存在"];
  }

  // 组件集在 v2 之后归项目管，页面再带一份就是没迁干净的脏数据。
  if (doc.sets != null) errors.push("页面不再携带 sets：组件集属于项目");

  for (const [id, node] of Object.entries(doc.nodes)) {
    if (!isPlainObject(node)) {
      errors.push(`节点 ${id} 不是对象`);
      continue;
    }
    if (node.id !== id) errors.push(`节点 ${id} 的 id 字段不一致`);
    if (id === doc.root) {
      if (node.parent != null) errors.push("根节点不能有 parent");
      if (node.pos != null) errors.push("根节点不能有 pos");
      if (node.slot != null) errors.push("根节点不能进槽位");
      if (node.position != null && node.position.mode !== "flow") {
        errors.push("根节点不能脱离文档流");
      }
    } else {
      if (typeof node.parent !== "string" || !doc.nodes[node.parent]) {
        errors.push(`节点 ${id} 的 parent 不存在`);
      }
      if (typeof node.pos !== "string" || !node.pos) {
        errors.push(`节点 ${id} 缺少 pos`);
      }
    }

    validateLayout(node, id, errors);
    validateSlots(node, id, errors);
    validateSize(node, id, errors);
    validatePosition(doc, node, id, errors);
    validateUse(node, id, errors);
  }

  validateParentLinks(doc, errors);
  return [...new Set(errors)];
}

/**
 * 契约层：文档仍然有效，只是某些引用解析不到、或者依赖了具体实现。
 * 返回给人看的告警，不阻止载入与导出。
 */
export function collectContractWarnings(doc, { resolve } = {}) {
  const warnings = [];
  for (const [id, node] of Object.entries(doc.nodes)) {
    const use = Array.isArray(node.use) ? node.use : [];
    if (use.length === 0) continue;
    if (typeof resolve !== "function") continue;
    if (!use.some((entry) => resolve(node, entry))) {
      warnings.push(`节点 ${id} 的候选全部解析不到：${describeFirst(use)}`);
    }
  }
  return warnings;
}

function describeFirst(use) {
  const first = use[0];
  return typeof first === "string" ? first : String(first?.src ?? "");
}

function validateLayout(node, id, errors) {
  if (node.layout == null) {
    if (node.layoutProps != null) errors.push(`节点 ${id} 有 layoutProps 但没有 layout`);
    return;
  }
  if (!isLayout(node.layout)) {
    errors.push(`节点 ${id} 的 layout 无效`);
    return;
  }
  if (!isPlainObject(node.layoutProps)) {
    errors.push(`节点 ${id} 缺少 layoutProps`);
    return;
  }
  const allowed = LAYOUT_PARAM_KEYS[node.layout] ?? [];
  for (const key of Object.keys(node.layoutProps)) {
    if (!allowed.includes(key)) errors.push(`节点 ${id} 的 layoutProps.${key} 不属于 ${node.layout}`);
  }
  const props = node.layoutProps;
  if (props.gap != null && !GAP_TOKENS.includes(props.gap)) {
    errors.push(`节点 ${id} 的 gap 无效`);
  }
  if (props.align != null && !["start", "center", "end", "fill"].includes(props.align)) {
    errors.push(`节点 ${id} 的 align 无效`);
  }
  if (props.distribute != null && !DISTRIBUTES.includes(props.distribute)) {
    errors.push(`节点 ${id} 的 distribute 无效`);
  }
  if (node.layout === "grid") {
    const columns = props.columns;
    if (!Number.isInteger(columns) || columns < 1 || columns > 6) {
      errors.push(`节点 ${id} 的 columns 必须是 1–6 的整数`);
    }
  }
}

function validateSlots(node, id, errors) {
  if (node.slots == null) return;
  if (!Array.isArray(node.slots)) {
    errors.push(`节点 ${id} 的 slots 必须是数组`);
    return;
  }
  const seen = new Set();
  for (const name of node.slots) {
    if (typeof name !== "string" || !name) {
      errors.push(`节点 ${id} 的槽位名必须是非空字符串`);
      continue;
    }
    if (seen.has(name)) errors.push(`节点 ${id} 的槽位 ${name} 重复`);
    seen.add(name);
  }
  if (node.slots.length === 0) errors.push(`节点 ${id} 的 slots 为空数组，应直接省略`);
}

function validateSize(node, id, errors) {
  if (node.size == null) return;
  if (!isPlainObject(node.size)) {
    errors.push(`节点 ${id} 的 size 必须是对象`);
    return;
  }
  for (const key of ["width", "height"]) {
    if (node.size[key] === undefined) continue;
    const parsed = parseLength(node.size[key]);
    if (parsed.kind === "invalid") errors.push(`节点 ${id} 的 size.${key} 无效`);
  }
  for (const key of ["minWidth", "maxWidth", "minHeight", "maxHeight"]) {
    if (node.size[key] === undefined) continue;
    const parsed = parseLength(node.size[key]);
    if (parsed.kind !== "px" && parsed.kind !== "percent") {
      errors.push(`节点 ${id} 的 size.${key} 只能是数值或百分比`);
    }
  }
  if (node.size.aspect !== undefined && parseAspect(node.size.aspect) == null) {
    errors.push(`节点 ${id} 的 size.aspect 无效`);
  }
  const known = new Set([
    "width",
    "height",
    "minWidth",
    "maxWidth",
    "minHeight",
    "maxHeight",
    "aspect",
  ]);
  for (const key of Object.keys(node.size)) {
    if (!known.has(key)) errors.push(`节点 ${id} 的 size.${key} 不认识`);
  }
}

function validatePosition(doc, node, id, errors) {
  if (node.position == null) return;
  if (!isPlainObject(node.position)) {
    errors.push(`节点 ${id} 的 position 必须是对象`);
    return;
  }
  const mode = node.position.mode;
  if (mode === "flow") return;
  if (mode === "anchor") {
    if (!ANCHORS.includes(node.position.anchor)) errors.push(`节点 ${id} 的锚点无效`);
    for (const axis of ["x", "y"]) {
      if (!INSET_TOKENS.includes(node.position.inset?.[axis])) {
        errors.push(`节点 ${id} 的 inset.${axis} 不是有效 token`);
      }
    }
    return;
  }
  if (mode === "absolute") {
    const parent = doc.nodes[node.parent];
    if (parent?.layout !== "free") {
      errors.push(`节点 ${id} 的 absolute 定位只属于自由布局父节点的直接子节点`);
    }
    for (const key of ["x", "y", "w", "h"]) {
      if (!Number.isFinite(node.position[key])) {
        errors.push(`节点 ${id} 的 position.${key} 不是数字`);
      }
    }
    if (node.position.w <= 0 || node.position.h <= 0) {
      errors.push(`节点 ${id} 的 position 宽高必须为正数`);
    }
    return;
  }
  errors.push(`节点 ${id} 的 position.mode 无效`);
}

function validateUse(node, id, errors) {
  if (node.use == null) return;
  if (!Array.isArray(node.use)) {
    errors.push(`节点 ${id} 的 use 必须是数组`);
    return;
  }
  node.use.forEach((entry, index) => {
    if (typeof entry === "string") {
      if (!entry.trim()) errors.push(`节点 ${id} 的第 ${index + 1} 个候选为空`);
      if (entry.includes(":")) {
        const { scheme, rest } = splitHandle(entry);
        if (!scheme) errors.push(`节点 ${id} 的候选 ${entry} 缺少 scheme`);
        if (!rest) errors.push(`节点 ${id} 的候选 ${entry} 缺少 ${scheme}: 之后的内容`);
      }
      return;
    }
    if (!isPlainObject(entry)) {
      errors.push(`节点 ${id} 的第 ${index + 1} 个候选必须是字符串或对象`);
      return;
    }
    if (typeof entry.src !== "string" || !entry.src.trim()) {
      errors.push(`节点 ${id} 的第 ${index + 1} 个候选缺少 src`);
    }
    if (entry.props != null && !isPlainObject(entry.props)) {
      errors.push(`节点 ${id} 的第 ${index + 1} 个候选的 props 必须是对象`);
    }
  });
}

function validateParentLinks(doc, errors) {
  for (const [id, node] of Object.entries(doc.nodes)) {
    if (id === doc.root) continue;
    const parent = doc.nodes[node.parent];
    if (!parent) continue;
    if (node.slot != null) {
      const declared = slotNamesOf(parent);
      if (!declared.includes(node.slot)) {
        errors.push(`父节点 ${parent.id} 没有槽位 ${node.slot}，子节点 ${id} 因此悬空`);
      }
    }
  }

  for (const id of Object.keys(doc.nodes)) {
    const seen = new Set();
    let current = doc.nodes[id];
    while (current && current.id !== doc.root) {
      if (seen.has(current.id)) {
        errors.push(`节点 ${id} 的父子关系成环`);
        break;
      }
      seen.add(current.id);
      current = doc.nodes[current.parent];
    }
    if (!current) errors.push(`节点 ${id} 无法连到根节点`);
  }
}

export function nodeHasAbsolutePosition(doc, node) {
  return node.position?.mode === "absolute" && doc.nodes[node.parent]?.layout === "free";
}
