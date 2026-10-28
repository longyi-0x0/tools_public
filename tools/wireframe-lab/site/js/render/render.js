import { h } from "./h.js";
import { WireNode } from "./WireNode.js";
import { buildIR } from "../ir/build-ir.js";
import { describeIntent } from "../ir/describe.js";
import { registry } from "../resolve/bootstrap.js";

/**
 * 画布的 React 根。整棵树每次重建，和改造前一样是幂等重画。
 */
export class CanvasRenderer {
  constructor(app, canvas) {
    this.app = app;
    this.canvas = canvas;
    this.root = globalThis.ReactDOM.createRoot(canvas);
    this.nodeEls = new Map();
    this.warnings = [];
  }

  get doc() {
    return this.app.doc;
  }

  render() {
    const warnings = [];
    const ir = buildIR(this.doc, this.doc.root, registry, warnings);
    this.warnings = warnings;
    const paint = () => {
      if (!ir) {
        this.root.render(null);
        return;
      }
      this.root.render(
        h(WireNode, {
          node: ir,
          ctx: {
            editMode: this.app.mode === "edit",
            registry,
            rootId: this.doc.root,
          },
        }),
      );
    };
    if (globalThis.ReactDOM.flushSync) globalThis.ReactDOM.flushSync(paint);
    else paint();
    this.collectElements();
    this.applySelection(this.app.selectionId);
  }

  collectElements() {
    this.nodeEls.clear();
    for (const element of this.canvas.querySelectorAll("[data-node-id]")) {
      this.nodeEls.set(element.dataset.nodeId, element);
    }
  }

  elementFor(id) {
    return this.nodeEls.get(id) ?? null;
  }

  applySelection(selectedId) {
    for (const [id, element] of this.nodeEls) {
      element.classList.toggle("is-selected", id === selectedId);
    }
  }

  setSelection(selectedId) {
    this.applySelection(selectedId);
  }

  /** 切到自由布局前量一次子节点的画面位置，物化成绝对坐标。 */
  captureLayoutFrames(containerId) {
    const parent = this.elementFor(containerId);
    if (!parent) return {};
    const parentRect = parent.getBoundingClientRect();
    const style = getComputedStyle(parent);
    const originX = parentRect.left + (Number.parseFloat(style.borderLeftWidth) || 0);
    const originY = parentRect.top + (Number.parseFloat(style.borderTopWidth) || 0);
    const frames = {};
    for (const child of Object.values(this.doc.nodes)) {
      if (child.parent !== containerId) continue;
      if (child.slot != null) continue;
      if (child.position?.mode === "anchor") continue;
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
    return describeIntent(this.doc.nodes[this.app.selectionId]);
  }
}
