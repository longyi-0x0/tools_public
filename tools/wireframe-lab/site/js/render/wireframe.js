import { h } from "./h.js";

/**
 * 默认集合的五个语义单元与两个结构单元，全部按旧样式类绘制，
 * 所以换掉节点模型不需要重做样式。
 */
export function renderSemantic(baseName, payload) {
  if (baseName === "navbar") return renderNavbar(payload);
  if (baseName === "tabs") return renderTabs(payload);
  if (baseName === "text") return renderText(payload);
  if (baseName === "image") return renderImage(payload);
  if (baseName === "button") return renderButton(payload);
  if (baseName === "input") return renderInput(payload);
  if (baseName === "placeholder") return renderPlaceholder(payload);
  return null;
}

function renderText({ node, props }) {
  const content = props.content ?? props.label ?? "";
  return h(
    "p",
    { className: `wf-text${content ? "" : " is-muted"}` },
    content || "文本",
  );
}

function renderImage({ node, props }) {
  const caption = props.alt ?? node.desc ?? "";
  return h("div", { className: "wf-image" }, [
    h("span", { className: "wf-image-mark", key: "mark" }, "×"),
    caption ? h("span", { className: "wf-image-label", key: "label" }, caption) : null,
  ]);
}

function renderPlaceholder({ node, props }) {
  return h(
    "div",
    { className: "wf-placeholder" },
    props.note ?? node.desc ?? "占位块",
  );
}

function renderButton({ node, props, renderList }) {
  const label = props.label ?? node.desc ?? "按钮";
  const inner = node.children.length > 0 ? [label, ...renderList(node.children)] : label;
  return h(
    "button",
    {
      type: "button",
      className: "wf-control wf-button",
      disabled: Boolean(props.disabled),
    },
    inner,
  );
}

function renderInput({ props, node, renderList }) {
  const text = props.value || props.placeholder || node.desc || "输入内容";
  return h(
    "div",
    { className: "wf-control wf-input" },
    node.children.length > 0 ? [text, ...renderList(node.children)] : text,
  );
}

function renderNavbar({ node, props, editMode, renderList }) {
  return [
    h("div", { className: "wf-slot wf-slot-left", key: "left", "data-slot-parent": node.id, "data-slot-name": "left" },
      slotChildren(node, "left", editMode, renderList)),
    h("div", { className: "wf-navbar-title", key: "title" }, props.title ?? "页面标题"),
    h("div", { className: "wf-slot wf-slot-right", key: "right", "data-slot-parent": node.id, "data-slot-name": "right" },
      slotChildren(node, "right", editMode, renderList)),
  ];
}

function renderTabs({ node, props, editMode, renderList }) {
  const labels = Array.isArray(props.labels) ? props.labels : ["概览", "详情"];
  return [
    h(
      "div",
      { className: "wf-tabs-rail", key: "rail" },
      labels.map((label, index) =>
        h("span", { className: `wf-tab${index === 0 ? " is-active" : ""}`, key: index }, label),
      ),
    ),
    h(
      "div",
      { className: "wf-slot wf-slot-content", key: "content", "data-slot-parent": node.id, "data-slot-name": "content" },
      slotChildren(node, "content", editMode, renderList),
    ),
  ];
}

function slotChildren(node, name, editMode, renderList) {
  const list = node.slots[name] ?? [];
  if (list.length > 0) return renderList(list);
  return editMode ? h("span", { className: "wf-slot-empty" }, `+ ${name}`) : null;
}

export function hasSlotContent(node, name) {
  return (node.slots[name] ?? []).length > 0;
}

export function isEmptyNode(node) {
  const slotEmpty = Object.values(node.slots).every((list) => list.length === 0);
  return node.children.length === 0 && slotEmpty;
}
