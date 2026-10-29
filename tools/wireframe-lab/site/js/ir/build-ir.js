import { GAP_VALUES, LAYOUT_PARAM_KEYS } from "../core/constants.js";
import { childrenOf } from "../core/ast.js";
import { layoutParamsOf, normalizeUse, parseAspect, parseLength, positionOf, slotNamesOf } from "../core/schema.js";
import { resolveNode } from "../resolve/resolve.js";

/**
 * IR 是宿主算完语义之后的纯数据：token 换成像素、位置模式归一化、
 * 候选链已经解析完。语言适配器只做 IR 到原生树的映射。
 */
export function buildIR(doc, nodeId, registry, sets, warnings = []) {
  const node = doc.nodes[nodeId];
  if (!node) return null;

  const resolved = resolveNode(registry, node, sets);
  for (const warning of resolved.warnings) {
    warnings.push(`${nodeId}: ${warning}`);
  }
  const requested = normalizeUse(node.use).map((entry) => entry.src);

  const ir = {
    id: node.id,
    desc: typeof node.desc === "string" ? node.desc : "",
    layout: layoutIR(node),
    size: sizeIR(node),
    position: positionIR(node),
    render: renderIR(resolved),
    // 没有候选就是纯布局盒；有候选但全都没解析到才是占位块。
    unresolved: resolved.target || requested.length === 0 ? null : requested[0],
    slots: {},
    children: [],
  };

  for (const name of slotNamesOf(node)) {
    ir.slots[name] = childrenOf(doc, node.id, name)
      .map((child) => buildIR(doc, child.id, registry, sets, warnings))
      .filter(Boolean);
  }
  ir.children = childrenOf(doc, node.id, null)
    .map((child) => buildIR(doc, child.id, registry, sets, warnings))
    .filter(Boolean);
  return ir;
}

export function buildDocumentIR(doc, registry, sets) {
  const warnings = [];
  const ir = buildIR(doc, doc.root, registry, sets, warnings);
  return { ir, warnings };
}

function layoutIR(node) {
  const params = layoutParamsOf(node);
  if (!params) return null;
  const result = { kind: node.layout };
  for (const key of LAYOUT_PARAM_KEYS[node.layout] ?? []) {
    if (params[key] === undefined) continue;
    if (key === "gap") result.gap = GAP_VALUES[params[key]] ?? 0;
    else result[key] = params[key];
  }
  return result;
}

function sizeIR(node) {
  if (!node.size) return null;
  const result = {};
  for (const key of ["width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight"]) {
    if (node.size[key] === undefined) continue;
    result[key] = parseLength(node.size[key]);
  }
  if (node.size.aspect !== undefined) {
    result.aspect = parseAspect(node.size.aspect);
  }
  return Object.keys(result).length > 0 ? result : null;
}

function positionIR(node) {
  const position = positionOf(node);
  if (position.mode === "anchor") {
    return {
      mode: "anchor",
      anchor: position.anchor,
      inset: {
        x: GAP_VALUES[position.inset?.x] ?? 0,
        y: GAP_VALUES[position.inset?.y] ?? 0,
      },
    };
  }
  if (position.mode === "absolute") {
    return {
      mode: "absolute",
      x: position.x,
      y: position.y,
      w: position.w,
      h: position.h,
    };
  }
  return { mode: "flow" };
}

function renderIR(resolved) {
  if (!resolved.target) return null;
  const target = resolved.target;
  return {
    targetId: target.key ?? target.id ?? resolved.source,
    source: resolved.source,
    name: target.name ?? target.id ?? resolved.source,
    kind: target.Component ? "component" : "semantic",
    honorsStructure: Boolean(target.honorsStructure),
    slots: Array.isArray(target.slots) ? [...target.slots] : [],
    props: resolved.props,
  };
}
