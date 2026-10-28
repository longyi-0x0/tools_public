import { h } from "./h.js";
import { SlotContext } from "./slot-context.js";
import { LAYOUT_GLYPHS, LAYOUT_LABELS } from "../core/constants.js";
import { baseNameOf } from "../resolve/vocabulary.js";
import { findTarget } from "../resolve/registry.js";
import { isEmptyNode, renderSemantic } from "./wireframe.js";
import { PlaceholderNode } from "./PlaceholderNode.js";

const JUSTIFY = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
};
const ALIGN = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  fill: "stretch",
};

/** IR 节点到 DOM。布局、尺寸、定位都在这里落地，内容交给目标。 */
export function WireNode({ node, ctx }) {
  const renderList = (list) =>
    list.map((child) => h(WireNode, { key: child.id, node: child, ctx }));

  const attrs = {
    className: nodeClasses(node, ctx),
    style: {
      ...layoutStyle(node.layout),
      ...sizeStyle(node.size),
      ...positionStyle(node.position),
    },
    "data-node-id": node.id,
    "data-shape": shapeOf(node),
    "data-layout": node.layout?.kind,
  };
  if (node.layout) attrs["data-drop-container"] = node.id;

  const children = [];
  if (node.layout) {
    children.push(
      h(
        "span",
        { className: "wf-layout-badge", key: "layout-badge", "aria-hidden": "true" },
        `${LAYOUT_GLYPHS[node.layout.kind] ?? ""} ${LAYOUT_LABELS[node.layout.kind] ?? ""}`,
      ),
    );
  }

  children.push(...contentOf(node, ctx, renderList));

  if (!node.render && node.layout && isEmptyNode(node)) {
    children.push(
      h(
        "div",
        { className: "wf-empty", key: "empty" },
        node.layout.kind === "free" ? "拖入容器或元素，摆到任意位置" : "拖入容器或元素",
      ),
    );
  }

  if (node.render?.kind === "component") {
    children.push(
      h(
        "span",
        { className: "wf-bound-badge", key: "bound-badge", "aria-hidden": "true" },
        `真组件 · ${node.render.name}`,
      ),
    );
  }

  return h("div", attrs, children);
}

function contentOf(node, ctx, renderList) {
  if (!node.render) {
    // 有候选但没解析到才写占位块；纯布局盒直接画子节点。
    if (node.unresolved) {
      return [
        h(PlaceholderNode, {
          key: "placeholder",
          node,
          source: node.unresolved,
          editMode: ctx.editMode,
        }),
      ];
    }
    return renderList(node.children);
  }
  if (node.render.kind === "component") {
    const target = findTarget(ctx.registry, node.render.targetId);
    if (!target?.Component) {
      return [
        h(PlaceholderNode, {
          key: "placeholder",
          node,
          source: node.render.source,
          editMode: ctx.editMode,
        }),
      ];
    }
    const slots = {};
    for (const [name, list] of Object.entries(node.slots)) slots[name] = renderList(list);
    const value = {
      nodeId: node.id,
      slots,
      children: renderList(node.children),
      editMode: ctx.editMode,
    };
    return [
      h(
        SlotContext.Provider,
        { key: "component", value },
        h(target.Component, { ...node.render.props }),
      ),
    ];
  }

  const base = baseNameOf(node.render.source);
  const rendered = renderSemantic(base, {
    node,
    props: node.render.props ?? {},
    editMode: ctx.editMode,
    renderList,
  });
  if (!rendered) {
    return [
      h(PlaceholderNode, {
        key: "placeholder",
        node,
        source: node.render.source,
        editMode: ctx.editMode,
      }),
    ];
  }
  return Array.isArray(rendered) ? rendered : [rendered];
}

function nodeClasses(node, ctx) {
  const parts = ["wf-node"];
  if (node.render) {
    if (node.render.kind === "component") {
      parts.push("wf-leaf", "wf-leaf--bound");
    } else {
      const base = baseNameOf(node.render.source);
      if (base === "navbar" || base === "tabs") parts.push("wf-pattern", `wf-${base}`);
      else parts.push("wf-leaf", `wf-shape-${base}`);
    }
  } else {
    parts.push("wf-container");
  }
  if (node.layout) parts.push(`wf-layout-${node.layout.kind}`);
  if (node.position.mode === "anchor") parts.push("is-escaped");
  if (node.position.mode === "absolute") parts.push("has-frame");
  if (ctx.rootId === node.id) parts.push("wf-root", "wf-page-root");
  return parts.join(" ");
}

function shapeOf(node) {
  if (!node.render || node.render.kind === "component") return undefined;
  const base = baseNameOf(node.render.source);
  return base === "navbar" || base === "tabs" ? undefined : base;
}

function layoutStyle(layout) {
  if (!layout) return {};
  const style = { "--wf-gap": `${layout.gap ?? 0}px` };
  if (layout.kind === "row" || layout.kind === "column") {
    style.display = "flex";
    style.flexDirection = layout.kind;
    style.gap = "var(--wf-gap)";
    style.justifyContent = JUSTIFY[layout.distribute] ?? "flex-start";
    style.alignItems = ALIGN[layout.align] ?? "stretch";
  } else if (layout.kind === "grid") {
    style.display = "grid";
    style.gap = "var(--wf-gap)";
    style.gridTemplateColumns = `repeat(${Math.max(1, layout.columns ?? 2)}, minmax(0, 1fr))`;
    style.alignItems = ALIGN[layout.align] ?? "stretch";
  }
  return style;
}

function sizeStyle(size) {
  if (!size) return {};
  const style = {};
  if (size.width) applyLength(style, "width", size.width, "row");
  if (size.height) applyLength(style, "height", size.height, "column");
  for (const [key, cssKey] of [
    ["minWidth", "minWidth"],
    ["maxWidth", "maxWidth"],
    ["minHeight", "minHeight"],
    ["maxHeight", "maxHeight"],
  ]) {
    const value = size[key];
    if (!value) continue;
    if (value.kind === "px") style[cssKey] = `${value.value}px`;
    else if (value.kind === "percent") style[cssKey] = `${value.value}%`;
  }
  if (typeof size.aspect === "number") style.aspectRatio = String(size.aspect);
  return style;
}

function applyLength(style, cssKey, value, flexAxis) {
  if (value.kind === "px") {
    style[cssKey] = `${value.value}px`;
    return;
  }
  if (value.kind === "percent") {
    style[cssKey] = `${value.value}%`;
    return;
  }
  if (value.kind === "fill") {
    style[cssKey] = "100%";
    if (cssKey === flexAxis) {
      style.flex = "1 1 0";
      style.minWidth = style.minWidth ?? 0;
    }
  }
}

function positionStyle(position) {
  if (!position || position.mode === "flow") return {};
  if (position.mode === "absolute") {
    return {
      position: "absolute",
      left: `${position.x}px`,
      top: `${position.y}px`,
      width: `${position.w}px`,
      height: `${position.h}px`,
    };
  }
  const style = { position: "absolute" };
  const { anchor, inset } = position;
  const vertical = anchor[0];
  const horizontal = anchor[1];
  if (horizontal === "l") style.left = `${inset.x}px`;
  if (horizontal === "r") style.right = `${inset.x}px`;
  if (horizontal === "c") style.left = "50%";
  if (vertical === "t") style.top = `${inset.y}px`;
  if (vertical === "b") style.bottom = `${inset.y}px`;
  if (vertical === "c") style.top = "50%";
  if (horizontal === "c" && vertical === "c") style.transform = "translate(-50%, -50%)";
  else if (horizontal === "c") style.transform = "translateX(-50%)";
  else if (vertical === "c") style.transform = "translateY(-50%)";
  return style;
}
