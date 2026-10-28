import {
  ALIGN_LABELS,
  ANCHOR_LABELS,
  DISTRIBUTE_LABELS,
  GAP_LABELS,
  LAYOUT_LABELS,
} from "../core/constants.js";
import { childrenOf } from "../core/ast.js";
import { layoutParamsOf, normalizeUse, positionOf, slotNamesOf } from "../core/schema.js";

/** 一个节点的意图描述，同时服务 inspector 摘要与 AI 提示。 */
export function describeIntent(node) {
  if (!node) return "";
  const parts = [];
  const first = normalizeUse(node.use)[0];
  if (first) parts.push(first.src);
  else if (node.layout) parts.push(`${LAYOUT_LABELS[node.layout] ?? "容器"}布局盒`);
  else parts.push("空节点");

  const params = layoutParamsOf(node);
  if (params) {
    const layoutBits = [];
    if (params.gap) layoutBits.push(`${GAP_LABELS[params.gap] ?? params.gap}间距`);
    if (params.align) layoutBits.push(ALIGN_LABELS[params.align] ?? params.align);
    if (params.distribute) layoutBits.push(DISTRIBUTE_LABELS[params.distribute] ?? params.distribute);
    if (params.columns) layoutBits.push(`${params.columns} 列`);
    if (layoutBits.length > 0) parts.push(layoutBits.join(" · "));
  }

  const slots = slotNamesOf(node);
  if (slots.length > 0) parts.push(`槽位 ${slots.join(" / ")}`);

  const position = positionOf(node);
  if (position.mode === "anchor") {
    parts.push(`锚在${ANCHOR_LABELS[position.anchor] ?? position.anchor}`);
  } else if (position.mode === "absolute") {
    parts.push(`绝对定位 ${position.x},${position.y}`);
  }

  if (node.size) {
    const sizeBits = [];
    if (node.size.width !== undefined) sizeBits.push(`宽 ${formatLength(node.size.width)}`);
    if (node.size.height !== undefined) sizeBits.push(`高 ${formatLength(node.size.height)}`);
    if (node.size.aspect !== undefined) sizeBits.push(`比例 ${node.size.aspect}`);
    if (sizeBits.length > 0) parts.push(sizeBits.join(" · "));
  }

  const propsText = describeProps(node.props);
  if (propsText) parts.push(propsText);
  return parts.join(" · ");
}

export function describeProps(props) {
  if (!props || typeof props !== "object") return "";
  const entries = Object.entries(props).filter(([, value]) => value !== "" && value != null);
  if (entries.length === 0) return "";
  return entries
    .map(([key, value]) => `${key}=${formatValue(value)}`)
    .join(" ");
}

export function describeTree(doc, nodeId = doc.root, depth = 0) {
  const node = doc.nodes[nodeId];
  if (!node) return [];
  const lines = [`${"  ".repeat(depth)}- ${describeIntent(node)}`];
  const slots = slotNamesOf(node);
  for (const name of slots) {
    const children = childrenOf(doc, node.id, name);
    if (children.length === 0) continue;
    lines.push(`${"  ".repeat(depth + 1)}[${name}]`);
    for (const child of children) {
      lines.push(...describeTree(doc, child.id, depth + 2));
    }
  }
  for (const child of childrenOf(doc, node.id, null)) {
    lines.push(...describeTree(doc, child.id, depth + 1));
  }
  return lines;
}

/** 整页意图，喂给 AI 的那一份。 */
export function describeDocument(doc) {
  const title = doc?.title ? `# ${doc.title}\n` : "";
  return `${title}${describeTree(doc).join("\n")}\n`;
}

function formatLength(value) {
  if (typeof value === "number") return `${value}px`;
  return String(value);
}

function formatValue(value) {
  if (Array.isArray(value)) return value.join("/");
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}
