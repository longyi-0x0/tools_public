import {
  GAP_VALUES,
  PATTERN_SLOTS,
} from "../core/constants.js";
import {
  childrenOf,
  isDescendant,
  nodeDisplayName,
} from "../core/ast.js";
import { insertNode, moveNode } from "../core/ops.js";
import { createFromTemplate, defaultFrameFor, paletteItem } from "./templates.js";

const EDGE = 8;
const SNAP = 8;

export class DndController {
  constructor(app) {
    this.app = app;
    this.canvas = app.canvasEl;
    this.layer = document.querySelector("#dnd-layer");
    this.ghost = document.querySelector("#drag-ghost");
    this.line = document.querySelector("#drop-line");
    this.outline = document.querySelector("#drop-outline");
    this.pending = null;
    this.drag = null;

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onPointerCancel = this.onPointerCancel.bind(this);

    document.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove, { passive: false });
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerCancel);
  }

  onPointerDown(event) {
    if (this.app.mode !== "edit") return;
    if (event.button !== 0) return;
    const paletteButton = event.target.closest("button[data-template]");
    const nodeElement = event.target.closest("[data-node-id]");
    const onCanvas = nodeElement && this.canvas.contains(nodeElement);

    if (paletteButton) {
      this.pending = {
        kind: "template",
        template: paletteButton.dataset.template,
        startX: event.clientX,
        startY: event.clientY,
        pointerId: event.pointerId,
      };
      return;
    }
    if (onCanvas) {
      const nodeId = nodeElement.dataset.nodeId;
      if (nodeId === this.app.doc.root) return;
      this.pending = {
        kind: "node",
        nodeId,
        startX: event.clientX,
        startY: event.clientY,
        pointerId: event.pointerId,
      };
    }
  }

  onPointerMove(event) {
    if (this.pending && !this.drag) {
      if (event.pointerId !== this.pending.pointerId) return;
      const distance = Math.hypot(
        event.clientX - this.pending.startX,
        event.clientY - this.pending.startY,
      );
      if (distance < 4) return;
      this.startDrag(event);
    }
    if (!this.drag) return;
    event.preventDefault();
    this.drag.x = event.clientX;
    this.drag.y = event.clientY;
    this.drag.shiftKey = event.shiftKey;
    this.updateGhost();
    const target = this.computeTarget(event.clientX, event.clientY, event.shiftKey);
    this.drag.target = target;
    this.showOverlay(target);
  }

  startDrag(event) {
    const pending = this.pending;
    const sourceNode =
      pending.kind === "node" ? this.app.doc.nodes[pending.nodeId] : null;
    let node = null;
    let label = "";
    let width = 120;
    let height = 44;
    let grabOffset = { x: 24, y: 20 };

    if (pending.kind === "template") {
      node = createFromTemplate(pending.template);
      label = paletteItem(pending.template)?.label ?? "节点";
      const frame = defaultFrameFor(node);
      width = frame.w;
      height = frame.h;
      grabOffset = {
        x: Math.min(28, frame.w / 2),
        y: Math.min(20, frame.h / 2),
      };
    } else {
      label = nodeDisplayName(sourceNode);
      const element = this.app.renderer.elementFor(pending.nodeId);
      const rect = element?.getBoundingClientRect();
      if (rect) {
        width = rect.width;
        height = rect.height;
        grabOffset = {
          x: Math.max(0, pending.startX - rect.left),
          y: Math.max(0, pending.startY - rect.top),
        };
        element.classList.add("is-drag-source");
      }
    }

    this.drag = {
      kind: pending.kind,
      template: pending.template,
      node,
      nodeId: pending.nodeId,
      sourceNode,
      escapeDrag: Boolean(sourceNode?.escape),
      label,
      width,
      height,
      grabOffset,
      x: event.clientX,
      y: event.clientY,
      shiftKey: event.shiftKey,
      target: null,
      sourceElement:
        pending.kind === "node"
          ? this.app.renderer.elementFor(pending.nodeId)
          : null,
    };
    this.layer.classList.add("is-active");
    this.ghost.classList.remove("is-invalid");
    this.ghost.textContent = label;
    document.body.classList.add("is-dragging-node");
  }

  updateGhost() {
    if (!this.drag) return;
    this.ghost.style.left = `${this.drag.x}px`;
    this.ghost.style.top = `${this.drag.y}px`;
  }

  computeTarget(x, y, shiftKey) {
    const drag = this.drag;
    if (!drag) return { kind: "invalid", reason: "没有拖拽中的节点" };
    if (drag.escapeDrag) return this.escapeTarget(x, y);

    const top = document.elementFromPoint(x, y);
    if (!top || !this.canvas.contains(top)) {
      return {
        kind: "invalid",
        reason: "拖到画布里的容器上",
        rect: this.canvas.getBoundingClientRect(),
      };
    }

    const nodeElement = top.closest("[data-node-id]");
    const slotElement = top.closest("[data-slot-parent]");

    if (
      slotElement &&
      (!nodeElement ||
        nodeElement.dataset.nodeId === slotElement.dataset.slotParent)
    ) {
      return this.slotTarget(slotElement);
    }

    if (nodeElement && this.canvas.contains(nodeElement)) {
      return this.nodeTarget(nodeElement, x, y, shiftKey);
    }

    const containerElement = top.closest("[data-drop-container]");
    if (containerElement) {
      return this.containerTarget(containerElement, x, y, shiftKey);
    }
    return {
      kind: "invalid",
      reason: "这里不是可放入的区域",
      rect: top.getBoundingClientRect(),
    };
  }

  sourceBlocks(parentId) {
    if (this.drag.kind !== "node") return false;
    return (
      parentId === this.drag.nodeId ||
      isDescendant(this.app.doc, this.drag.nodeId, parentId)
    );
  }

  slotTarget(slotElement) {
    const parentId = slotElement.dataset.slotParent;
    const slotName = slotElement.dataset.slotName;
    const parent = this.app.doc.nodes[parentId];
    if (!parent || parent.type !== "pattern") {
      return this.invalid("这个槽位不属于结构件", slotElement);
    }
    if (this.sourceBlocks(parentId)) {
      return this.invalid("不能把节点放进它自己或它的子树", slotElement);
    }
    const max = PATTERN_SLOTS[parent.pattern]?.[slotName]?.max ?? 0;
    const children = childrenOf(this.app.doc, parentId, slotName).filter(
      (child) => child.id !== this.drag.nodeId,
    );
    if (children.length >= max) {
      return this.invalid("这个槽位已经满了，先移走里面的节点", slotElement);
    }
    return {
      kind: "slot",
      parentId,
      slot: slotName,
      index: children.length,
      rect: slotElement.getBoundingClientRect(),
    };
  }

  nodeTarget(element, x, y, shiftKey) {
    const nodeId = element.dataset.nodeId;
    const node = this.app.doc.nodes[nodeId];
    if (!node) return this.invalid("目标节点不存在", element);
    if (this.drag.kind === "node") {
      if (
        nodeId === this.drag.nodeId ||
        isDescendant(this.app.doc, this.drag.nodeId, nodeId)
      ) {
        return this.invalid("不能拖进自己或自己的子树", element);
      }
    }
    const parent = this.app.doc.nodes[node.parent];
    if (!parent) return this.invalid("目标节点没有父节点", element);

    if (parent.type === "container" && parent.layout === "free") {
      return this.freeTarget(parent.id, x, y, shiftKey);
    }
    if (
      node.type === "container" &&
      node.layout === "free" &&
      nodeId !== this.drag.nodeId
    ) {
      return this.freeTarget(node.id, x, y, shiftKey);
    }

    if (node.type === "pattern") {
      return this.invalid("结构件只能放进具名槽位", element);
    }

    if (node.type === "container") {
      const rect = element.getBoundingClientRect();
      const nearStart =
        parent.layout === "row"
          ? x - rect.left < EDGE
          : parent.layout === "column"
            ? y - rect.top < EDGE
            : false;
      const nearEnd =
        parent.layout === "row"
          ? rect.right - x < EDGE
          : parent.layout === "column"
            ? rect.bottom - y < EDGE
            : false;
      if ((nearStart || nearEnd) && parent.type === "container") {
        return this.siblingTarget(node, nearEnd, x, y);
      }
      if (parent.type === "pattern") {
        return this.patternChildSlotTarget(parent, node, x, y);
      }
      return this.containerTarget(element, x, y, shiftKey);
    }

    if (parent.type === "pattern") {
      return this.patternChildSlotTarget(parent, node, x, y);
    }
    return this.siblingTarget(node, this.isAfter(node, x, y, parent.layout), x, y);
  }

  patternChildSlotTarget(parent, node, x, y) {
    const slotElement = this.canvas.querySelector(
      `[data-slot-parent="${cssEscape(parent.id)}"][data-slot-name="${cssEscape(node.slot)}"]`,
    );
    if (!slotElement) return this.invalid("找不到结构件槽位");
    return this.slotTarget(slotElement);
  }

  isAfter(node, x, y, layout) {
    const element = this.app.renderer.elementFor(node.id);
    if (!element) return true;
    const rect = element.getBoundingClientRect();
    if (layout === "row" || layout === "grid") {
      return x >= rect.left + rect.width / 2;
    }
    return y >= rect.top + rect.height / 2;
  }

  siblingTarget(node, after, x, y) {
    const parent = this.app.doc.nodes[node.parent];
    if (!parent) return this.invalid("目标节点没有父节点");
    if (parent.type === "pattern") {
      return this.patternChildSlotTarget(parent, node, x, y);
    }
    if (parent.layout === "free") {
      return this.freeTarget(parent.id, x, y, false);
    }
    const siblings = childrenOf(this.app.doc, parent.id, null).filter(
      (child) => child.id !== this.drag.nodeId,
    );
    const at = siblings.findIndex((child) => child.id === node.id);
    if (at < 0) return this.invalid("目标顺序已经变化，请重新拖动");
    return this.flowTarget(parent.id, null, after ? at + 1 : at);
  }

  containerTarget(element, x, y, shiftKey) {
    const containerId = element.dataset.nodeId;
    const container = this.app.doc.nodes[containerId];
    if (!container || container.type !== "container") {
      return this.invalid("这里不是容器", element);
    }
    if (this.sourceBlocks(containerId)) {
      return this.invalid("不能把节点拖进自己或自己的子树", element);
    }
    if (container.layout === "free") {
      return this.freeTarget(containerId, x, y, shiftKey);
    }
    const siblings = childrenOf(this.app.doc, containerId, null).filter(
      (child) => child.id !== this.drag.nodeId,
    );
    return this.flowTarget(containerId, null, siblings.length, element);
  }

  flowTarget(parentId, slot, index, outlineElement = null) {
    const parent = this.app.doc.nodes[parentId];
    if (!parent) return this.invalid("目标容器不存在");
    const siblings = childrenOf(this.app.doc, parentId, slot).filter(
      (child) => child.id !== this.drag.nodeId,
    );
    const at = Math.max(0, Math.min(index, siblings.length));
    const parentElement = this.app.renderer.elementFor(parentId);
    if (!parentElement) return this.invalid("目标容器没有渲染出来");

    if (parent.type === "pattern" && slot) {
      const slotElement = this.canvas.querySelector(
        `[data-slot-parent="${cssEscape(parentId)}"][data-slot-name="${cssEscape(slot)}"]`,
      );
      return {
        kind: "slot",
        parentId,
        slot,
        index: at,
        rect: (slotElement ?? parentElement).getBoundingClientRect(),
      };
    }

    if (siblings.length === 0) {
      return {
        kind: "append",
        parentId,
        slot: null,
        index: 0,
        rect: parentElement.getBoundingClientRect(),
      };
    }

    const previous = siblings[at - 1];
    const next = siblings[at];
    const previousEl = previous ? this.app.renderer.elementFor(previous.id) : null;
    const nextEl = next ? this.app.renderer.elementFor(next.id) : null;
    const parentRect = parentElement.getBoundingClientRect();
    const gap = GAP_VALUES[parent.gap] ?? 12;
    let line;
    if (parent.layout === "row" || parent.layout === "grid") {
      let left;
      let top = parentRect.top + 4;
      let height = Math.max(24, parentRect.height - 8);
      if (nextEl) {
        const rect = nextEl.getBoundingClientRect();
        left = rect.left - gap / 2;
        if (parent.layout === "grid") {
          top = rect.top;
          height = rect.height;
        }
      } else if (previousEl) {
        left = previousEl.getBoundingClientRect().right + gap / 2;
      } else {
        left = parentRect.left + 8;
      }
      line = { orientation: "vertical", left, top, height };
    } else {
      let top;
      let left = parentRect.left + 4;
      let width = Math.max(24, parentRect.width - 8);
      if (nextEl) {
        top = nextEl.getBoundingClientRect().top - gap / 2;
      } else if (previousEl) {
        top = previousEl.getBoundingClientRect().bottom + gap / 2;
      } else {
        top = parentRect.top + 8;
      }
      line = { orientation: "horizontal", left, top, width };
    }
    return {
      kind: "flow",
      parentId,
      slot,
      index: at,
      line,
      rect: outlineElement?.getBoundingClientRect() ?? null,
    };
  }

  freeTarget(parentId, x, y, shiftKey) {
    const parent = this.app.doc.nodes[parentId];
    const parentElement = this.app.renderer.elementFor(parentId);
    if (!parent || !parentElement) return this.invalid("自由容器不存在");
    if (this.sourceBlocks(parentId)) {
      return this.invalid("不能把节点拖进自己或自己的子树");
    }
    const rect = parentElement.getBoundingClientRect();
    const style = getComputedStyle(parentElement);
    const originLeft = rect.left + (Number.parseFloat(style.borderLeftWidth) || 0);
    const originTop = rect.top + (Number.parseFloat(style.borderTopWidth) || 0);
    const snap = shiftKey ? 1 : SNAP;
    const rawX = x - originLeft - this.drag.grabOffset.x;
    const rawY = y - originTop - this.drag.grabOffset.y;
    const maxX = Math.max(0, parentElement.clientWidth - this.drag.width);
    const maxY = Math.max(0, parentElement.clientHeight - this.drag.height);
    const left = Math.max(0, Math.min(maxX, Math.round(rawX / snap) * snap));
    const top = Math.max(0, Math.min(maxY, Math.round(rawY / snap) * snap));
    const w = Math.max(1, Math.round(this.drag.width));
    const h = Math.max(1, Math.round(this.drag.height));
    const siblings = childrenOf(this.app.doc, parentId, null).filter(
      (child) => child.id !== this.drag.nodeId,
    );
    return {
      kind: "free",
      parentId,
      slot: null,
      index: siblings.length,
      frame: { x: left, y: top, w, h },
      rect: {
        left: originLeft + left,
        top: originTop + top,
        width: w,
        height: h,
      },
    };
  }

  escapeTarget(x, y) {
    const drag = this.drag;
    const node = this.app.doc.nodes[drag.nodeId];
    const parent = node ? this.app.doc.nodes[node.parent] : null;
    const parentElement = parent ? this.app.renderer.elementFor(parent.id) : null;
    if (!node || !parentElement) return this.invalid("找不到悬浮元素的父容器");
    const parentRect = parentElement.getBoundingClientRect();
    if (
      x < parentRect.left ||
      x > parentRect.right ||
      y < parentRect.top ||
      y > parentRect.bottom
    ) {
      return this.invalid("悬浮元素先在原父容器内移动；跨容器请先取消悬浮");
    }
    const style = getComputedStyle(parentElement);
    const originLeft = parentRect.left + (Number.parseFloat(style.borderLeftWidth) || 0);
    const originTop = parentRect.top + (Number.parseFloat(style.borderTopWidth) || 0);
    const width = parentElement.clientWidth;
    const height = parentElement.clientHeight;
    const w = drag.width;
    const h = drag.height;
    const proposedLeft = Math.max(0, x - originLeft - drag.grabOffset.x);
    const proposedTop = Math.max(0, y - originTop - drag.grabOffset.y);
    const centerX = proposedLeft + w / 2;
    const centerY = proposedTop + h / 2;
    const horizontal =
      centerX < width / 3 ? "l" : centerX > (width * 2) / 3 ? "r" : "c";
    const vertical =
      centerY < height / 3 ? "t" : centerY > (height * 2) / 3 ? "b" : "c";
    const inset = {
      x:
        horizontal === "l"
          ? tokenForDistance(proposedLeft)
          : horizontal === "r"
            ? tokenForDistance(width - (proposedLeft + w))
            : "md",
      y:
        vertical === "t"
          ? tokenForDistance(proposedTop)
          : vertical === "b"
            ? tokenForDistance(height - (proposedTop + h))
            : "md",
    };
    const anchor = `${vertical}${horizontal}`;
    const insetValue = {
      x: GAP_VALUES[inset.x] ?? 12,
      y: GAP_VALUES[inset.y] ?? 12,
    };
    const left =
      horizontal === "l"
        ? insetValue.x
        : horizontal === "r"
          ? width - w - insetValue.x
          : (width - w) / 2;
    const top =
      vertical === "t"
        ? insetValue.y
        : vertical === "b"
          ? height - h - insetValue.y
          : (height - h) / 2;
    return {
      kind: "escape",
      nodeId: node.id,
      anchor,
      inset,
      rect: {
        left: originLeft + left,
        top: originTop + top,
        width: w,
        height: h,
      },
    };
  }

  invalid(reason, element = null) {
    return {
      kind: "invalid",
      reason,
      rect: element?.getBoundingClientRect() ?? null,
    };
  }

  showOverlay(target) {
    this.line.style.display = "none";
    this.outline.style.display = "none";
    this.outline.classList.remove("free", "invalid");
    this.ghost.classList.remove("is-invalid");
    if (!this.drag) return;
    this.ghost.textContent = this.drag.label;

    if (!target || target.kind === "invalid") {
      this.ghost.classList.add("is-invalid");
      this.ghost.textContent = `${this.drag.label} · ${target?.reason ?? "不可放入"}`;
      if (target?.rect) this.showOutlineRect(target.rect, "invalid");
      return;
    }

    if (target.kind === "free") {
      this.showOutlineRect(target.rect, "free");
      this.ghost.textContent = `${this.drag.label} · 自由定位`;
      return;
    }
    if (target.kind === "escape") {
      this.showOutlineRect(target.rect, "free");
      this.ghost.textContent = `${this.drag.label} · 锚定 ${target.anchor.toUpperCase()}`;
      return;
    }
    if (target.kind === "slot") {
      this.showOutlineRect(target.rect, "");
      return;
    }
    if (target.kind === "append") {
      this.showOutlineRect(target.rect, "");
      return;
    }
    if (target.kind === "flow") {
      if (target.line) this.showLine(target.line);
      if (target.rect) this.showOutlineRect(target.rect, "");
    }
  }

  showLine(line) {
    this.line.className = `drop-line ${line.orientation}`;
    this.line.style.display = "block";
    if (line.orientation === "vertical") {
      this.line.style.left = `${line.left}px`;
      this.line.style.top = `${line.top}px`;
      this.line.style.width = "2px";
      this.line.style.height = `${Math.max(8, line.height)}px`;
    } else {
      this.line.style.left = `${line.left}px`;
      this.line.style.top = `${line.top}px`;
      this.line.style.width = `${Math.max(8, line.width)}px`;
      this.line.style.height = "2px";
    }
  }

  showOutlineRect(rect, mode) {
    this.outline.style.display = "block";
    this.outline.className = `drop-outline${mode ? ` ${mode}` : ""}`;
    this.outline.style.left = `${rect.left}px`;
    this.outline.style.top = `${rect.top}px`;
    this.outline.style.width = `${Math.max(4, rect.width)}px`;
    this.outline.style.height = `${Math.max(4, rect.height)}px`;
  }

  onPointerUp(event) {
    if (this.pending && !this.drag) {
      this.pending = null;
      return;
    }
    if (!this.drag) return;
    const drag = this.drag;
    const target =
      drag.target ?? this.computeTarget(event.clientX, event.clientY, event.shiftKey);
    this.cleanup();
    this.app.suppressClick();
    this.applyDrop(drag, target);
  }

  onPointerCancel() {
    this.cleanup();
  }

  cleanup() {
    this.pending = null;
    this.drag = null;
    this.layer.classList.remove("is-active");
    this.line.style.display = "none";
    this.outline.style.display = "none";
    this.ghost.textContent = "";
    this.ghost.classList.remove("is-invalid");
    document.body.classList.remove("is-dragging-node");
    for (const element of this.canvas.querySelectorAll(".is-drag-source")) {
      element.classList.remove("is-drag-source");
    }
  }

  applyDrop(drag, target) {
    if (!target || target.kind === "invalid") {
      this.app.showToast(target?.reason ?? "这里不能放", { error: true });
      return;
    }

    if (drag.escapeDrag) {
      if (target.kind !== "escape") {
        this.app.showToast("悬浮元素先在原父容器内移动；跨容器请先取消悬浮", { error: true });
        return;
      }
      this.app.applyEscapeDrop(drag.nodeId, target.anchor, target.inset);
      return;
    }

    if (drag.kind === "template") {
      const node = drag.node;
      const item = paletteItem(drag.template);
      this.app.commit(
        `拖入${item?.label ?? "节点"}`,
        (draft) => {
          if (target.kind === "free") {
            insertNode(draft, target.parentId, node, {
              slot: null,
              index: target.index,
            });
            draft.nodes[node.id].frame = { ...target.frame };
          } else {
            insertNode(draft, target.parentId, node, {
              slot: target.slot ?? null,
              index: target.index,
            });
          }
        },
        { select: node.id },
      );
      return;
    }

    if (drag.kind === "node") {
      this.app.commit(
        "移动节点",
        (draft) => {
          if (target.kind === "free") {
            moveNode(draft, drag.nodeId, target.parentId, {
              slot: null,
              index: target.index,
              frame: target.frame,
            });
          } else {
            moveNode(draft, drag.nodeId, target.parentId, {
              slot: target.slot ?? null,
              index: target.index,
            });
          }
        },
        { select: drag.nodeId },
      );
    }
  }
}

function tokenForDistance(distance) {
  const value = Math.max(0, Number(distance) || 0);
  let best = "md";
  let delta = Infinity;
  for (const [token, size] of Object.entries(GAP_VALUES)) {
    const current = Math.abs(size - value);
    if (current < delta) {
      best = token;
      delta = current;
    }
  }
  return best;
}

function cssEscape(value) {
  return globalThis.CSS?.escape ? CSS.escape(value) : value;
}
