import {
  LAYOUT_GLYPHS,
  PATTERN_LABELS,
  PATTERN_SLOTS,
  SHAPE_LABELS,
  TYPE_LABELS,
} from "../core/constants.js";
import { childrenOf, nodeDisplayName } from "../core/ast.js";
import { el } from "./dom.js";

const LEAF_GLYPHS = {
  text: "T",
  image: "▧",
  button: "◉",
  input: "⌸",
  placeholder: "▢",
};

export function renderOutline(app) {
  const root = document.querySelector("#outline");
  const count = document.querySelector("#outline-count");
  root.replaceChildren();
  const rootNode = app.doc.nodes[app.doc.root];
  if (!rootNode) return;
  count.textContent = `${Object.keys(app.doc.nodes).length} 个节点`;

  const appendNode = (node, depth) => {
    root.append(outlineRow(node, depth, app.selectionId));
    if (node.type === "pattern") {
      const definitions = PATTERN_SLOTS[node.pattern] ?? {};
      for (const [slotName, definition] of Object.entries(definitions)) {
        const children = childrenOf(app.doc, node.id, slotName);
        if (children.length > 0) {
          const label = el("div", "tree-slot-label", `槽位 · ${definition.label}`);
          label.style.paddingLeft = `${depth * 13 + 25}px`;
          root.append(label);
        }
        for (const child of children) appendNode(child, depth + 1);
      }
      return;
    }
    for (const child of childrenOf(
      app.doc,
      node.id,
      node.type === "container" ? null : undefined,
    )) {
      appendNode(child, depth + 1);
    }
  };
  appendNode(rootNode, 0);

  root.onclick = (event) => {
    const row = event.target.closest(".tree-row");
    if (!row?.dataset.nodeId) return;
    app.select(row.dataset.nodeId, { reveal: true });
  };
}

function outlineRow(node, depth, selectedId) {
  const row = el("button", `tree-row${node.id === selectedId ? " is-selected" : ""}`);
  row.type = "button";
  row.dataset.nodeId = node.id;
  row.title = `${nodeDisplayName(node)} · ${node.id}`;

  const indent = el("span", "tree-indent");
  indent.style.width = `${depth * 13}px`;
  const glyph = el("span", "tree-glyph", glyphFor(node));
  const label = el("span", "tree-label", nodeDisplayName(node));
  row.append(indent, glyph, label);

  if (node.binding) {
    row.append(el("span", "tree-badge bound", "组件"));
  } else if (node.type === "pattern") {
    row.append(el("span", "tree-badge", "锁定"));
  } else if (node.escape) {
    row.append(el("span", "tree-badge", "悬浮"));
  } else if (node.type === "container") {
    row.append(el("span", "tree-badge", TYPE_LABELS[node.type]));
  } else if (SHAPE_LABELS[node.shape]) {
    row.append(el("span", "tree-badge", SHAPE_LABELS[node.shape]));
  }
  return row;
}

function glyphFor(node) {
  if (node.type === "container") return LAYOUT_GLYPHS[node.layout] ?? "▢";
  if (node.type === "pattern") return node.pattern === "navbar" ? "▔" : "▤";
  return LEAF_GLYPHS[node.shape] ?? "·";
}

export function outlineLabel(node) {
  if (node.type === "pattern") return PATTERN_LABELS[node.pattern] ?? "结构件";
  return nodeDisplayName(node);
}
