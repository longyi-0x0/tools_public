import { GAP_VALUES, LAYOUT_LABELS } from "../core/constants.js";
import {
  childrenOf,
  descendantIds,
  nodeDisplayName,
} from "../core/ast.js";
import {
  cloneDocument,
  insertNode,
  removeNode,
  setLayout,
  snapshotDiff,
  applySnapshot,
} from "../core/ops.js";
import { slotNamesOf } from "../core/schema.js";
import { validateDocument } from "../core/validate.js";
import { migrateDocument } from "../core/migrate.js";
import { parseDocument, serializeDocument } from "../core/serialize.js";
import { CanvasRenderer } from "../render/render.js";
import { renderOutline } from "./outline.js";
import { renderInspector } from "./inspector.js";
import { DndController } from "./dnd.js";
import {
  PALETTE_GROUPS,
  createFromTemplate,
  defaultFrameFor,
  paletteItem,
} from "./templates.js";
import {
  loadSession,
  loadStoredDocument,
  requestPersistence,
  saveDocument,
  saveSession,
} from "../persistence.js";
import { createSampleDocument } from "../sample.js";

const MAX_HISTORY = 60;

export class WireframeApp {
  constructor() {
    this.appEl = document.querySelector("#app");
    this.canvasEl = document.querySelector("#canvas");
    this.canvasFrame = document.querySelector("#canvas-frame");
    this.paletteEl = document.querySelector("#palette");
    this.outlineEl = document.querySelector("#outline");
    this.inspectorEl = document.querySelector("#inspector");
    this.titleInput = document.querySelector("#page-title");
    this.undoButton = document.querySelector("#undo");
    this.redoButton = document.querySelector("#redo");
    this.saveStateEl = document.querySelector("#save-state");
    this.selectionSummaryEl = document.querySelector("#selection-summary");
    this.nodeCountEl = document.querySelector("#node-count");
    this.canvasLabelEl = document.querySelector("#canvas-label");
    this.canvasModeEl = document.querySelector("#canvas-mode");
    this.stageHintEl = document.querySelector("#stage-hint");
    this.toastEl = document.querySelector("#toast");
    this.dialog = document.querySelector("#confirm-dialog");
    this.dialogTitle = document.querySelector("#confirm-title");
    this.dialogBody = document.querySelector("#confirm-body");
    this.dialogOk = document.querySelector("#confirm-ok");
    this.dialogCancel = document.querySelector("#confirm-cancel");
    this.importInput = document.querySelector("#import-file");
    this.importButton = document.querySelector("#import-btn");
    this.exportButton = document.querySelector("#export-btn");
    this.resetButton = document.querySelector("#reset-btn");
    this.viewportSwitch = document.querySelector("#viewport-switch");
    this.modeSwitch = document.querySelector("#mode-switch");

    const stored = loadStoredDocument();
    const session = loadSession();
    this.doc = stored.doc ?? createSampleDocument();
    this.selectionId = this.doc.nodes[session.selectionId]
      ? session.selectionId
      : this.doc.root;
    this.mode = session.mode === "preview" ? "preview" : "edit";
    this.viewport = session.viewport === "desktop" ? "desktop" : "mobile";
    this.historyUndo = [];
    this.historyRedo = [];
    this.lastDragAt = 0;
    this.toastTimer = 0;
    this.saveTimer = 0;
    this.saveErrorShown = false;
    this.storageWarning = stored.error;
    this.hadStoredDocument = Boolean(stored.doc);

    this.renderer = new CanvasRenderer(this, this.canvasEl);
    this.dnd = new DndController(this);
  }

  boot() {
    this.renderPalette();
    this.applyViewport(this.viewport, { silent: true });
    this.applyMode(this.mode, { silent: true });
    this.bindEvents();
    this.renderAll();
    this.setSaveState(this.hadStoredDocument ? "已载入本机草稿" : "本机保存");
    requestPersistence();

    if (this.storageWarning) {
      this.showToast(`本机草稿无法读取，已打开示例页：${this.storageWarning}`, {
        error: true,
        duration: 6500,
      });
    } else if (!this.hadStoredDocument) {
      window.setTimeout(() => {
        this.showToast("示例页里有一张真组件商品卡。试着拖动节点，或选中叶子在右侧切换组件。", {
          duration: 6200,
        });
      }, 450);
    }
  }

  bindEvents() {
    this.undoButton.addEventListener("click", () => this.undo());
    this.redoButton.addEventListener("click", () => this.redo());

    this.viewportSwitch.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-viewport]");
      if (button) this.applyViewport(button.dataset.viewport);
    });
    this.modeSwitch.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-mode]");
      if (button) this.applyMode(button.dataset.mode);
    });

    this.titleInput.addEventListener("change", () => {
      const title = this.titleInput.value.trim() || "未命名页面";
      this.commit("修改页面标题", (draft) => {
        draft.title = title;
      });
      this.titleInput.value = this.doc.title;
    });
    this.titleInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.titleInput.blur();
      }
    });

    this.paletteEl.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-template]");
      if (!button) return;
      if (this.clickSuppressed()) return;
      this.addTemplate(button.dataset.template);
    });

    this.canvasEl.addEventListener("click", (event) => {
      if (this.mode !== "edit" || this.clickSuppressed()) return;
      const nodeEl = event.target.closest("[data-node-id]");
      if (nodeEl) this.select(nodeEl.dataset.nodeId);
      else this.select(this.doc.root);
    });

    this.exportButton.addEventListener("click", () => this.exportJson());
    this.importButton.addEventListener("click", () => this.importInput.click());
    this.importInput.addEventListener("change", () => this.importFile());
    this.resetButton.addEventListener("click", () => this.resetSample());

    window.addEventListener("keydown", (event) => this.onKeydown(event));
    window.addEventListener("beforeunload", () => this.flushSave({ quiet: true }));
  }

  onKeydown(event) {
    const target = event.target;
    const typing =
      target instanceof HTMLElement &&
      (target.matches("input, textarea, select") || target.isContentEditable);
    if (typing) return;

    const command = event.metaKey || event.ctrlKey;
    if (command && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (command && event.key.toLowerCase() === "y") {
      event.preventDefault();
      this.redo();
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      if (this.selectionId === this.doc.root) return;
      event.preventDefault();
      this.deleteNode(this.selectionId);
      return;
    }
    if (event.key === "Escape" && this.mode === "preview") {
      this.applyMode("edit");
    }
  }

  renderPalette() {
    this.paletteEl.replaceChildren();
    for (const group of PALETTE_GROUPS) {
      const section = document.createElement("section");
      section.className = "palette-group";
      const title = document.createElement("div");
      title.className = "palette-group-title";
      title.innerHTML = `<span>${group.label}</span><small>${group.hint}</small>`;
      const grid = document.createElement("div");
      grid.className = "palette-grid";
      for (const item of group.items) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "palette-item";
        button.dataset.template = item.template;
        button.title = `${item.label}：${item.hint}。拖到画布，或点一下加入选中容器`;
        button.innerHTML = `
          <span class="palette-glyph">${escapeText(item.glyph)}</span>
          <span class="palette-copy"><b>${escapeText(item.label)}</b><small>${escapeText(item.hint)}</small></span>`;
        grid.append(button);
      }
      section.append(title, grid);
      this.paletteEl.append(section);
    }
  }

  renderAll() {
    this.renderer.render();
    renderOutline(this);
    renderInspector(this);
    this.updateStatus();
    this.updateHistory();
    this.updateTitle();
    this.saveSession();
  }

  updateStatus() {
    const node = this.doc.nodes[this.selectionId];
    const count = Object.keys(this.doc.nodes).length;
    this.nodeCountEl.textContent = `${count} 个节点`;
    this.selectionSummaryEl.textContent = node
      ? `${nodeDisplayName(node)} · ${this.renderer.selectionSummary()}`
      : "未选中节点";
    this.canvasModeEl.textContent = this.mode === "preview" ? "真实组件交互" : "线框视图";
    this.stageHintEl.textContent =
      this.mode === "preview"
        ? "预览态：真组件可点击，退出预览后可继续编辑"
        : "拖节点改位置 · 选中后在右侧改属性";
  }

  updateHistory() {
    this.undoButton.disabled = this.historyUndo.length === 0;
    this.redoButton.disabled = this.historyRedo.length === 0;
    this.undoButton.title = this.historyUndo.length
      ? `撤销：${this.historyUndo.at(-1).label}`
      : "没有可撤销的操作";
    this.redoButton.title = this.historyRedo.length
      ? `重做：${this.historyRedo.at(-1).label}`
      : "没有可重做的操作";
  }

  updateTitle() {
    this.titleInput.value = this.doc.title;
    document.title = `${this.doc.title} · 线框实验室`;
  }

  commit(label, mutate, { select = undefined } = {}) {
    const before = cloneDocument(this.doc);
    const draft = cloneDocument(this.doc);
    try {
      mutate(draft);
    } catch (error) {
      this.showToast(`操作没有完成：${error.message}`, { error: true });
      console.error(error);
      return false;
    }
    const errors = validateDocument(draft);
    if (errors.length > 0) {
      this.showToast(`操作没有完成：${errors[0]}`, { error: true });
      console.error(errors);
      return false;
    }

    const diff = snapshotDiff(before, draft);
    if (!diff) return false;
    const selectionBefore = this.selectionId;
    this.selectionId =
      select && draft.nodes[select] ? select : draft.nodes[selectionBefore] ? selectionBefore : draft.root;
    this.historyUndo.push({
      label,
      diff,
      selectionBefore,
      selectionAfter: this.selectionId,
    });
    if (this.historyUndo.length > MAX_HISTORY) this.historyUndo.shift();
    this.historyRedo = [];
    this.doc = draft;
    this.renderAll();
    this.scheduleSave();
    return true;
  }

  undo() {
    const entry = this.historyUndo.pop();
    if (!entry) return;
    const draft = cloneDocument(this.doc);
    applySnapshot(draft, entry.diff.before);
    this.doc = draft;
    this.selectionId = draft.nodes[entry.selectionBefore] ? entry.selectionBefore : draft.root;
    this.historyRedo.push(entry);
    this.renderAll();
    this.scheduleSave();
  }

  redo() {
    const entry = this.historyRedo.pop();
    if (!entry) return;
    const draft = cloneDocument(this.doc);
    applySnapshot(draft, entry.diff.after);
    this.doc = draft;
    this.selectionId = draft.nodes[entry.selectionAfter] ? entry.selectionAfter : draft.root;
    this.historyUndo.push(entry);
    this.renderAll();
    this.scheduleSave();
  }

  select(id, { reveal = false } = {}) {
    if (!this.doc.nodes[id]) return;
    this.selectionId = id;
    this.renderer.setSelection(id);
    renderOutline(this);
    renderInspector(this);
    this.updateStatus();
    this.saveSession();
    if (reveal) {
      window.requestAnimationFrame(() => {
        this.renderer.elementFor(id)?.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: "smooth",
        });
      });
    }
  }

  addTemplate(template) {
    const item = paletteItem(template);
    if (!item) return;
    const target = this.quickTarget();
    if (target.error) {
      this.showToast(target.error, { error: true });
      return;
    }
    const node = createFromTemplate(template);
    const parentNode = this.doc.nodes[target.parentId];
    const parentIsFree = parentNode?.layout === "free";
    const nextIndex = Number.isFinite(target.index)
      ? target.index
      : childrenOf(this.doc, target.parentId, target.slot ?? null).length;

    const ok = this.commit(
      `添加${item.label}`,
      (draft) => {
        insertNode(draft, target.parentId, node, {
          slot: target.slot ?? null,
          index: nextIndex,
        });
        if (parentIsFree) {
          const frame = defaultFrameFor(node);
          const ordinal = Math.max(0, childrenOf(draft, target.parentId, null).length - 1);
          draft.nodes[node.id].position = {
            mode: "absolute",
            x: frame.x + (ordinal % 4) * 10,
            y: frame.y + (ordinal % 4) * 10,
            w: frame.w,
            h: frame.h,
          };
        }
      },
      { select: node.id },
    );
    if (ok && parentIsFree) {
      this.showToast("已放进自由容器。它现在使用绝对坐标，可继续拖动或改尺寸。");
    }
  }

  quickTarget() {
    const selected = this.doc.nodes[this.selectionId];
    if (!selected) {
      return { parentId: this.doc.root, slot: null, index: Infinity };
    }
    // 有布局就往下装；声明了槽位就装进第一个槽位；否则插在它后面。
    if (selected.layout) {
      return { parentId: selected.id, slot: null, index: Infinity };
    }
    const slots = slotNamesOf(selected);
    if (slots.length > 0) {
      return { parentId: selected.id, slot: slots[0], index: Infinity };
    }

    const parent = this.doc.nodes[selected.parent];
    if (!parent) return { parentId: this.doc.root, slot: null, index: Infinity };
    const siblings = childrenOf(this.doc, parent.id, selected.slot ?? null);
    const at = siblings.findIndex((item) => item.id === selected.id);
    return {
      parentId: parent.id,
      slot: selected.slot ?? null,
      index: at >= 0 ? at + 1 : Infinity,
    };
  }

  changeLayout(nodeId, layout) {
    const node = this.doc.nodes[nodeId];
    if (!node || node.layout === layout) return;
    const frames =
      layout === "free" ? this.renderer.captureLayoutFrames(nodeId) : undefined;
    const ok = this.commit(
      `切换为${LAYOUT_LABELS[layout]}布局`,
      (draft) => setLayout(draft, nodeId, layout, frames),
      { select: nodeId },
    );
    if (ok && layout === "free") {
      this.showToast("已切成自由容器：直接子节点按当前画面落成绝对坐标，不参与多尺寸重排。", {
        duration: 4800,
      });
    }
  }

  /** 把节点挂到某个锚点上，脱离父容器的流。拖拽落点与 inspector 共用。 */
  applyAnchorDrop(nodeId, anchor, inset) {
    const node = this.doc.nodes[nodeId];
    if (!node || nodeId === this.doc.root) return;
    this.commit(
      "移动悬浮元素",
      (draft) => {
        draft.nodes[nodeId].position = { mode: "anchor", anchor, inset };
      },
      { select: nodeId },
    );
  }

  async deleteNode(nodeId) {
    const node = this.doc.nodes[nodeId];
    if (!node || nodeId === this.doc.root) return;
    const children = descendantIds(this.doc, nodeId);
    const message = children.length
      ? `删除「${nodeDisplayName(node)}」以及它下面的 ${children.length} 个节点？可以用撤销找回。`
      : `删除「${nodeDisplayName(node)}」？可以用撤销找回。`;
    const confirmed = await this.askConfirm({
      title: "删除节点",
      body: message,
      confirmLabel: "删除",
      danger: true,
    });
    if (!confirmed) return;
    const parent = node.parent ?? this.doc.root;
    this.commit("删除节点", (draft) => removeNode(draft, nodeId), {
      select: this.doc.nodes[parent] ? parent : this.doc.root,
    });
  }

  applyViewport(viewport, { silent = false } = {}) {
    this.viewport = viewport === "desktop" ? "desktop" : "mobile";
    this.canvasFrame.classList.toggle("viewport-desktop", this.viewport === "desktop");
    this.canvasFrame.classList.toggle("viewport-mobile", this.viewport === "mobile");
    this.canvasLabelEl.textContent =
      this.viewport === "desktop" ? "桌面 · 自适应" : "手机 · 390";
    for (const button of this.viewportSwitch.querySelectorAll("button")) {
      button.classList.toggle("is-active", button.dataset.viewport === this.viewport);
    }
    if (!silent) this.saveSession();
  }

  applyMode(mode, { silent = false } = {}) {
    this.mode = mode === "preview" ? "preview" : "edit";
    this.appEl.dataset.mode = this.mode;
    for (const button of this.modeSwitch.querySelectorAll("button")) {
      button.classList.toggle("is-active", button.dataset.mode === this.mode);
    }
    this.updateStatus();
    if (!silent) {
      this.saveSession();
      if (this.mode === "preview") {
        this.showToast("预览态：真实组件可以点击。按 Esc 或顶栏「编辑」返回。");
      }
    }
  }

  exportJson() {
    const text = serializeDocument(this.doc);
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFileName(this.doc.title)}.wireframe.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    this.showToast("已导出页面 JSON。文件重新导入后应保持同一棵 AST。");
  }

  async importFile() {
    const file = this.importInput.files?.[0];
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) {
        throw new Error("文件超过 2 MB，不像是线框页面");
      }
      const text = await file.text();
      const doc = migrateDocument(parseDocument(text));
      const errors = validateDocument(doc);
      if (errors.length > 0) {
        throw new Error(errors[0]);
      }
      this.replaceDocument(doc, "导入页面");
      this.showToast("已导入页面。可以用撤销回到导入前的版本。");
    } catch (error) {
      this.showToast(`导入失败：${error.message}`, { error: true, duration: 6000 });
      console.error(error);
    } finally {
      this.importInput.value = "";
    }
  }

  replaceDocument(doc, label) {
    const before = cloneDocument(this.doc);
    const diff = snapshotDiff(before, doc);
    if (!diff) return;
    const next = cloneDocument(doc);
    this.historyUndo.push({
      label,
      diff,
      selectionBefore: this.selectionId,
      selectionAfter: next.root,
    });
    if (this.historyUndo.length > MAX_HISTORY) this.historyUndo.shift();
    this.historyRedo = [];
    this.doc = next;
    this.selectionId = next.root;
    this.renderAll();
    this.flushSave();
  }

  async resetSample() {
    const confirmed = await this.askConfirm({
      title: "恢复示例页",
      body: "当前页面会被示例页替换。这一步可以撤销；要留档就先导出 JSON。",
      confirmLabel: "恢复示例",
    });
    if (!confirmed) return;
    this.replaceDocument(createSampleDocument(), "恢复示例页");
    this.showToast("已恢复示例页。");
  }

  askConfirm({ title, body, confirmLabel = "确认", danger = false }) {
    this.dialogTitle.textContent = title;
    this.dialogBody.textContent = body;
    this.dialogOk.textContent = confirmLabel;
    this.dialogOk.classList.toggle("btn-danger", danger);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        if (this.dialog.open) this.dialog.close();
        resolve(value);
      };
      this.dialogOk.onclick = () => finish(true);
      this.dialogCancel.onclick = () => finish(false);
      this.dialog.oncancel = (event) => {
        event.preventDefault();
        finish(false);
      };
      this.dialog.showModal();
    });
  }

  showToast(message, { error = false, duration = 3600 } = {}) {
    window.clearTimeout(this.toastTimer);
    this.toastEl.textContent = message;
    this.toastEl.classList.toggle("is-error", error);
    this.toastEl.classList.add("is-visible");
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.classList.remove("is-visible");
    }, duration);
  }

  setSaveState(text, state = "") {
    this.saveStateEl.textContent = text;
    this.saveStateEl.className = `save-state${state ? ` ${state}` : ""}`;
  }

  scheduleSave() {
    this.setSaveState("保存中…", "is-saving");
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.flushSave(), 260);
  }

  flushSave({ quiet = false } = {}) {
    window.clearTimeout(this.saveTimer);
    try {
      saveDocument(this.doc);
      if (!quiet) this.setSaveState("已保存到本机");
    } catch (error) {
      this.setSaveState("保存失败", "is-error");
      if (!quiet && !this.saveErrorShown) {
        this.saveErrorShown = true;
        this.showToast(`本机保存失败：${error.message}`, { error: true, duration: 6000 });
      }
    }
  }

  saveSession() {
    saveSession({
      viewport: this.viewport,
      mode: this.mode,
      selectionId: this.selectionId,
    });
  }

  suppressClick() {
    this.lastDragAt = performance.now();
  }

  clickSuppressed() {
    return performance.now() - this.lastDragAt < 350;
  }
}

function escapeText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function safeFileName(title) {
  return (title || "未命名页面").replace(/[\\/:*?"<>|]/g, "-").slice(0, 60);
}

function tokenForDistance(distance) {
  const value = Math.abs(Number(distance) || 0);
  let best = "md";
  let bestDelta = Infinity;
  for (const [token, size] of Object.entries(GAP_VALUES)) {
    const delta = Math.abs(size - value);
    if (delta < bestDelta) {
      best = token;
      bestDelta = delta;
    }
  }
  return best;
}
