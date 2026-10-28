import {
  ALIGNS,
  ANCHORS,
  DISTRIBUTES,
  GAP_TOKENS,
  INSET_TOKENS,
  LAYOUTS,
  PATTERN_SLOTS,
  PATTERNS,
  SHAPES,
  SCHEMA_VERSION,
} from "./constants.js";
import { childrenOf } from "./ast.js";

/**
 * 返回空数组表示文档有效。这里只收“画不出来或会留下悬空引用”的错，
 * 不把风格偏好写成校验规则。
 */
export function validateDocument(doc) {
  const errors = [];
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return ["文档必须是对象"];
  }
  if (doc.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schemaVersion 必须是 ${SCHEMA_VERSION}`);
  }
  if (typeof doc.id !== "string" || !doc.id) errors.push("页面缺少 id");
  if (typeof doc.title !== "string") errors.push("页面缺少 title");
  if (!doc.nodes || typeof doc.nodes !== "object" || Array.isArray(doc.nodes)) {
    return [...errors, "nodes 必须是对象"];
  }
  if (typeof doc.root !== "string" || !doc.nodes[doc.root]) {
    return [...errors, "root 指向的节点不存在"];
  }

  for (const [id, node] of Object.entries(doc.nodes)) {
    if (!node || typeof node !== "object") {
      errors.push(`节点 ${id} 不是对象`);
      continue;
    }
    if (node.id !== id) errors.push(`节点 ${id} 的 id 字段不一致`);
    if (!["container", "pattern", "leaf"].includes(node.type)) {
      errors.push(`节点 ${id} 的 type 无效`);
      continue;
    }
    if (id === doc.root) {
      if (node.type !== "container") errors.push("根节点必须是容器");
      if (node.parent != null) errors.push("根节点不能有 parent");
      if (node.pos != null) errors.push("根节点不能有 pos");
      if (node.escape) errors.push("根节点不能 escape");
      if (node.frame) errors.push("根节点不能有 frame");
    } else {
      if (typeof node.parent !== "string" || !doc.nodes[node.parent]) {
        errors.push(`节点 ${id} 的 parent 不存在`);
      }
      if (typeof node.pos !== "string" || !node.pos) {
        errors.push(`节点 ${id} 缺少 pos`);
      }
    }

    if (node.type === "container") validateContainer(doc, node, errors);
    if (node.type === "pattern") validatePattern(doc, node, errors);
    if (node.type === "leaf") validateLeaf(doc, node, errors);

    if (node.escape) {
      if (!ANCHORS.includes(node.escape.anchor)) {
        errors.push(`节点 ${id} 的锚点无效`);
      }
      for (const axis of ["x", "y"]) {
        if (!INSET_TOKENS.includes(node.escape.inset?.[axis])) {
          errors.push(`节点 ${id} 的 inset.${axis} 不是有效 token`);
        }
      }
      if (node.frame) errors.push(`节点 ${id} 同时有 escape 与 frame`);
    }
    if (node.size != null) {
      if (!node.escape) errors.push(`节点 ${id} 只有 escape 时才能有显式 size`);
      if (!positive(node.size.w) || !positive(node.size.h)) {
        errors.push(`节点 ${id} 的 size 必须为正数`);
      }
    }
    if (node.frame != null) {
      const parent = doc.nodes[node.parent];
      if (parent?.type !== "container" || parent.layout !== "free") {
        errors.push(`节点 ${id} 的 frame 只属于自由容器的直接子节点`);
      }
      if (node.escape) errors.push(`节点 ${id} 的 escape 节点不应持有 frame`);
      for (const key of ["x", "y", "w", "h"]) {
        if (!Number.isFinite(node.frame[key])) {
          errors.push(`节点 ${id} 的 frame.${key} 不是数字`);
        }
      }
      if (!positive(node.frame.w) || !positive(node.frame.h)) {
        errors.push(`节点 ${id} 的 frame 宽高必须为正数`);
      }
    }
    if (node.binding != null) {
      if (node.type !== "leaf") errors.push(`节点 ${id} 只有叶子能绑定组件`);
      if (typeof node.binding.component !== "string" || !node.binding.component) {
        errors.push(`节点 ${id} 的 binding.component 无效`);
      }
      if (
        node.binding.props != null &&
        (typeof node.binding.props !== "object" || Array.isArray(node.binding.props))
      ) {
        errors.push(`节点 ${id} 的 binding.props 必须是对象`);
      }
    }
  }

  if (doc.nodes[doc.root] && doc.nodes[doc.root].type !== "container") {
    errors.push("root 必须是容器节点");
  }

  validateParentLinks(doc, errors);
  validateSlotCapacity(doc, errors);
  return [...new Set(errors)];
}

function validateContainer(doc, node, errors) {
  if (!LAYOUTS.includes(node.layout)) {
    errors.push(`容器 ${node.id} 的 layout 无效`);
  }
  if (node.layout === "grid") {
    if (!Number.isInteger(node.columns) || node.columns < 1 || node.columns > 6) {
      errors.push(`容器 ${node.id} 的 columns 必须是 1–6 的整数`);
    }
  }
  if (!GAP_TOKENS.includes(node.gap)) {
    errors.push(`容器 ${node.id} 的 gap 无效`);
  }
  if (node.layout !== "free") {
    if (!DISTRIBUTES.includes(node.distribute)) {
      errors.push(`容器 ${node.id} 的 distribute 无效`);
    }
    if (!ALIGNS.includes(node.align)) {
      errors.push(`容器 ${node.id} 的 align 无效`);
    }
  }
  if (node.layout === "free") {
    for (const child of childrenOf(doc, node.id)) {
      if (!child.escape && !child.frame) {
        errors.push(`自由容器 ${node.id} 的子节点 ${child.id} 缺少 frame`);
      }
    }
  }
}

function validatePattern(doc, node, errors) {
  if (!PATTERNS.includes(node.pattern)) {
    errors.push(`结构件 ${node.id} 的 pattern 无效`);
  }
  for (const child of childrenOf(doc, node.id)) {
    if (!child.slot) {
      errors.push(`结构件 ${node.id} 的子节点 ${child.id} 缺少 slot`);
    } else if (!(child.slot in (PATTERN_SLOTS[node.pattern] ?? {}))) {
      errors.push(`结构件 ${node.id} 没有槽位 ${child.slot}`);
    }
  }
}

function validateLeaf(doc, node, errors) {
  if (!SHAPES.includes(node.shape)) {
    errors.push(`元素 ${node.id} 的 shape 无效`);
  }
  if (typeof node.label !== "string") {
    errors.push(`元素 ${node.id} 缺少 label`);
  }
}

function validateParentLinks(doc, errors) {
  for (const [id, node] of Object.entries(doc.nodes)) {
    if (id === doc.root) continue;
    const parent = doc.nodes[node.parent];
    if (!parent) continue;
    if (parent.type === "leaf") {
      errors.push(`元素 ${parent.id} 不能包含子节点 ${id}`);
    }
    if (parent.type === "container" && node.slot != null) {
      errors.push(`普通容器的子节点 ${id} 不应带槽位`);
    }
    if (parent.type === "pattern") {
      if (!node.slot) errors.push(`结构件的子节点 ${id} 缺少槽位`);
      else if (!(node.slot in (PATTERN_SLOTS[parent.pattern] ?? {}))) {
        errors.push(`结构件 ${parent.id} 没有槽位 ${node.slot}`);
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

function validateSlotCapacity(doc, errors) {
  for (const node of Object.values(doc.nodes)) {
    if (node.type !== "pattern") continue;
    const definitions = PATTERN_SLOTS[node.pattern] ?? {};
    for (const [slot, definition] of Object.entries(definitions)) {
      const count = childrenOf(doc, node.id, slot).length;
      if (count > definition.max) {
        errors.push(
          `结构件 ${node.id} 的槽位 ${slot} 最多 ${definition.max} 个，现在是 ${count} 个`,
        );
      }
    }
  }
}

function positive(value) {
  return Number.isFinite(value) && value > 0;
}
