import {
  ALIGN_LABELS,
  DISTRIBUTE_LABELS,
  GAP_VALUES,
  LAYOUT_GLYPHS,
  LAYOUT_LABELS,
  PATTERN_SLOTS,
  SHAPE_LABELS,
} from "../core/constants.js";
import { childrenOf } from "../core/ast.js";
import { el } from "../editor/dom.js";
import {
  componentProps,
  getComponent,
  mountComponent,
} from "../components/registry.js";

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

export class CanvasRenderer {
  constructor(app, canvas) {
    this.app = app;
    this.canvas = canvas;
    this.nodeEls = new Map();
    this.unmounts = new Map();
  }

  get doc() {
    return this.app.doc;
  }

  render() {
    this.disposeComponents();
    this.canvas.replaceChildren();
    this.nodeEls.clear();
    const root = this.doc.nodes[this.doc.root];
    if (!root) return;
    const rootEl = this.renderNode(root, true);
    this.canvas.append(rootEl);
    this.applySelection(this.app.selectionId);
  }

  disposeComponents() {
    for (const unmount of this.unmounts.values()) {
      try {
        unmount();
      } catch (error) {
        console.warn("组件卸载失败", error);
      }
    }
    this.unmounts.clear();
  }

  renderNode(node, isRoot = false) {
    const wrapper =
      node.type === "container"
        ? this.renderContainer(node, isRoot)
        : node.type === "pattern"
          ? this.renderPattern(node)
          : this.renderLeaf(node);
    wrapper.dataset.nodeId = node.id;
    wrapper.dataset.nodeType = node.type;
    if (node.layout) wrapper.dataset.layout = node.layout;
    if (node.shape) wrapper.dataset.shape = node.shape;
    if (node.binding) wrapper.dataset.bound = "true";
    if (node.escape) wrapper.classList.add("is-escaped");
    if (isRoot) wrapper.classList.add("wf-root");
    this.nodeEls.set(node.id, wrapper);
    this.applyPosition(wrapper, node);
    return wrapper;
  }

  renderContainer(node, isRoot) {
    const wrapper = el(
      "div",
      `wf-node wf-container wf-layout-${node.layout}${isRoot ? " wf-page-root" : ""}`,
    );
    wrapper.dataset.dropContainer = node.id;
    wrapper.style.setProperty("--wf-gap", `${GAP_VALUES[node.gap] ?? 12}px`);

    if (node.layout === "row" || node.layout === "column") {
      wrapper.style.display = "flex";
      wrapper.style.flexDirection = node.layout;
      wrapper.style.gap = "var(--wf-gap)";
      wrapper.style.justifyContent = JUSTIFY[node.distribute] ?? "flex-start";
      wrapper.style.alignItems = ALIGN[node.align] ?? "stretch";
    } else if (node.layout === "grid") {
      wrapper.style.display = "grid";
      wrapper.style.gap = "var(--wf-gap)";
      wrapper.style.gridTemplateColumns = `repeat(${Math.max(1, node.columns ?? 2)}, minmax(0, 1fr))`;
      wrapper.style.alignItems = ALIGN[node.align] ?? "stretch";
    }

    const badge = el("span", "wf-layout-badge");
    badge.textContent = `${LAYOUT_GLYPHS[node.layout]} ${LAYOUT_LABELS[node.layout]}`;
    badge.setAttribute("aria-hidden", "true");
    wrapper.append(badge);

    const children = childrenOf(this.doc, node.id, null);
    for (const child of children) wrapper.append(this.renderNode(child));
    if (children.length === 0) {
      const empty = el("div", "wf-empty");
      empty.textContent =
        node.layout === "free" ? "拖入容器或元素，摆到任意位置" : "拖入容器或元素";
      wrapper.append(empty);
    }
    return wrapper;
  }

  renderPattern(node) {
    const wrapper = el("div", `wf-node wf-pattern wf-${node.pattern}`);
    if (node.pattern === "navbar") {
      const left = this.renderSlot(node, "left");
      const title = el("div", "wf-navbar-title", node.props?.title ?? "页面标题");
      const right = this.renderSlot(node, "right");
      wrapper.append(left, title, right);
    } else {
      const rail = el("div", "wf-tabs-rail");
      const labels = Array.isArray(node.props?.labels)
        ? node.props.labels
        : ["概览", "详情"];
      labels.forEach((label, index) => {
        const tab = el("span", `wf-tab${index === 0 ? " is-active" : ""}`, label);
        rail.append(tab);
      });
      wrapper.append(rail, this.renderSlot(node, "content"));
    }
    return wrapper;
  }

  renderSlot(node, slotName) {
    const definition = PATTERN_SLOTS[node.pattern]?.[slotName];
    const slot = el("div", `wf-slot wf-slot-${slotName}`);
    slot.dataset.slotParent = node.id;
    slot.dataset.slotName = slotName;
    const children = childrenOf(this.doc, node.id, slotName);
    for (const child of children) slot.append(this.renderNode(child));
    if (children.length === 0) {
      const empty = el("span", "wf-slot-empty");
      empty.textContent = definition ? `+ ${definition.label}` : "+";
      slot.append(empty);
    }
    return slot;
  }

  renderLeaf(node) {
    const wrapper = el("div", `wf-node wf-leaf wf-shape-${node.shape}`);
    if (node.binding) {
      this.renderBinding(wrapper, node);
      return wrapper;
    }
    this.renderWireLeaf(wrapper, node);
    return wrapper;
  }

  renderWireLeaf(wrapper, node) {
    if (node.shape === "text") {
      const text = el("p", "wf-text", node.label || "文本");
      if (!node.label) text.classList.add("is-muted");
      wrapper.append(text);
      return;
    }
    if (node.shape === "image") {
      const image = el("div", "wf-image");
      image.append(el("span", "wf-image-mark", "×"));
      if (node.label) {
        const caption = el("span", "wf-image-label", node.label);
        image.append(caption);
      }
      wrapper.append(image);
      return;
    }
    if (node.shape === "placeholder") {
      wrapper.append(el("div", "wf-placeholder", node.label || "占位块"));
      return;
    }
    const control = el(
      node.shape === "input" ? "div" : "button",
      `wf-control wf-${node.shape}`,
      node.label || SHAPE_LABELS[node.shape],
    );
    if (node.shape === "button") control.type = "button";
    wrapper.append(control);
  }

  renderBinding(wrapper, node) {
    const component = getComponent(node.binding?.component);
    wrapper.classList.add("wf-leaf--bound");
    if (!component) {
      this.renderWireLeaf(wrapper, node);
      wrapper.append(this.bindingBadge(`未注册：${node.binding?.component}`, true));
      return;
    }
    const content = el("div", "wf-bound-content");
    content.style.minHeight = `${component.defaultSize?.h ?? 40}px`;
    try {
      const unmount = mountComponent(
        component.id,
        content,
        componentProps(component, node.binding.props),
      );
      this.unmounts.set(node.id, unmount);
      wrapper.append(content, this.bindingBadge(`真组件 · ${component.name}`));
    } catch (error) {
      console.error(error);
      this.renderWireLeaf(wrapper, node);
      wrapper.append(this.bindingBadge("组件加载失败", true));
    }
  }

  bindingBadge(text, danger = false) {
    const badge = el("span", `wf-bound-badge${danger ? " is-danger" : ""}`, text);
    badge.setAttribute("aria-hidden", "true");
    return badge;
  }

  applyPosition(wrapper, node) {
    if (node.frame) {
      wrapper.classList.add("has-frame");
      wrapper.style.position = "absolute";
      wrapper.style.left = `${Number(node.frame.x) || 0}px`;
      wrapper.style.top = `${Number(node.frame.y) || 0}px`;
      wrapper.style.width = `${Math.max(1, Number(node.frame.w) || 1)}px`;
      wrapper.style.height = `${Math.max(1, Number(node.frame.h) || 1)}px`;
      return;
    }
    if (!node.escape) return;
    const { anchor, inset } = node.escape;
    const x = GAP_VALUES[inset?.x] ?? 12;
    const y = GAP_VALUES[inset?.y] ?? 12;
    const vertical = anchor[0];
    const horizontal = anchor[1];
    wrapper.classList.add("is-escaped");
    wrapper.style.position = "absolute";
    if (horizontal === "l") wrapper.style.left = `${x}px`;
    if (horizontal === "r") wrapper.style.right = `${x}px`;
    if (horizontal === "c") {
      wrapper.style.left = "50%";
      wrapper.dataset.translateX = "true";
    }
    if (vertical === "t") wrapper.style.top = `${y}px`;
    if (vertical === "b") wrapper.style.bottom = `${y}px`;
    if (vertical === "c") {
      wrapper.style.top = "50%";
      wrapper.dataset.translateY = "true";
    }
    if (wrapper.dataset.translateX && wrapper.dataset.translateY) {
      wrapper.style.transform = "translate(-50%, -50%)";
    } else if (wrapper.dataset.translateX) {
      wrapper.style.transform = "translateX(-50%)";
    } else if (wrapper.dataset.translateY) {
      wrapper.style.transform = "translateY(-50%)";
    }
    if (node.size) {
      wrapper.style.width = `${node.size.w}px`;
      wrapper.style.height = `${node.size.h}px`;
    }
  }

  applySelection(selectedId) {
    for (const [id, element] of this.nodeEls) {
      element.classList.toggle("is-selected", id === selectedId);
    }
  }

  setSelection(selectedId) {
    this.applySelection(selectedId);
  }

  elementFor(id) {
    return this.nodeEls.get(id) ?? null;
  }

  captureLayoutFrames(containerId) {
    const parent = this.elementFor(containerId);
    if (!parent) return {};
    const parentRect = parent.getBoundingClientRect();
    const style = getComputedStyle(parent);
    const originX =
      parentRect.left + (Number.parseFloat(style.borderLeftWidth) || 0);
    const originY =
      parentRect.top + (Number.parseFloat(style.borderTopWidth) || 0);
    const frames = {};
    for (const child of childrenOf(this.doc, containerId, null)) {
      if (child.escape) continue;
      const element = this.elementFor(child.id);
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      frames[child.id] = {
        x: Math.max(0, Math.round(rect.left - originX)),
        y: Math.max(0, Math.round(rect.top - originY)),
        w: Math.max(1, Math.round(rect.width)),
        h: Math.max(1, Math.round(rect.height)),
      };
    }
    return frames;
  }

  selectionSummary() {
    const node = this.doc.nodes[this.app.selectionId];
    if (!node) return "";
    if (node.type === "container") {
      return `${LAYOUT_LABELS[node.layout]} · ${node.gap} 间距 · ${ALIGN_LABELS[node.align] ?? ""}`;
    }
    if (node.type === "pattern") {
      return PATTERN_SLOTS[node.pattern]
        ? `${Object.keys(PATTERN_SLOTS[node.pattern]).length} 个具名槽位`
        : "";
    }
    return node.binding ? "已接真组件" : SHAPE_LABELS[node.shape] ?? "元素";
  }
}

export function layoutDescription(node) {
  if (node?.type !== "container") return "";
  const align = ALIGN_LABELS[node.align] ?? "";
  const distribute = DISTRIBUTE_LABELS[node.distribute] ?? "";
  return `${LAYOUT_LABELS[node.layout]} · ${align} · ${distribute}`;
}
