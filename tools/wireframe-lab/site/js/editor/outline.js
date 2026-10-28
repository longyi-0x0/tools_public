import { LAYOUT_GLYPHS, LAYOUT_LABELS } from "../core/constants.js";
import { childrenOf, nodeDisplayName } from "../core/ast.js";
import { normalizeUse, positionOf, slotNamesOf } from "../core/schema.js";
import { baseNameOf } from "../resolve/vocabulary.js";
import { el } from "./dom.js";

const SEMANTIC_GLYPHS = {
  text: "T",
  image: "▧",
  button: "◉",
  input: "⌸",
  placeholder: "▢",
  navbar: "▔",
  tabs: "▤",
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
    const slots = slotNamesOf(node);
    if (slots.length > 0) {
      for (const slotName of slots) {
        const children = childrenOf(app.doc, node.id, slotName);
        if (children.length === 0) continue;
        const label = el("div", "tree-slot-label", `槽位 · ${slotName}`);
        label.style.paddingLeft = `${depth * 13 + 25}px`;
        root.append(label);
        for (const child of children) appendNode(child, depth + 1);
      }
    }
    for (const child of childrenOf(app.doc, node.id, null)) {
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

  const badge = badgeFor(node);
  if (badge) row.append(el("span", "tree-badge", badge));
  return row;
}

function badgeFor(node) {
  const first = normalizeUse(node.use)[0];
  if (first && first.src.includes(":")) return "组件";
  const position = positionOf(node);
  if (position.mode === "anchor") return "悬浮";
  if (position.mode === "absolute") return "定位";
  if (slotNamesOf(node).length > 0) return "槽位";
  if (node.layout) return LAYOUT_LABELS[node.layout] ?? "布局";
  if (first) return "语义";
  return null;
}

function glyphFor(node) {
  if (node.layout) return LAYOUT_GLYPHS[node.layout] ?? "▢";
  const first = normalizeUse(node.use)[0];
  const base = first ? baseNameOf(first.src) : null;
  return SEMANTIC_GLYPHS[base] ?? "·";
}

export function outlineLabel(node) {
  return nodeDisplayName(node);
}
