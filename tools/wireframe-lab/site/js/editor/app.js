import { GAP_VALUES, LAYOUT_LABELS } from "../core/constants.js";
import {
  childrenOf,
  descendantIds,
  newId,
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
import { isPlainObject, slotNamesOf } from "../core/schema.js";
import { validateDocument } from "../core/validate.js";
import { serializeDocument } from "../core/serialize.js";
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
  loadProject,
  loadSession,
  openWorkspace,
  persistProject,
  removeProject,
  requestPersistence,
  saveSession,
  saveWorkspace,
} from "../persistence.js";
import { createSampleProject } from "../sample-project.js";
import {
  addPage,
  clonePage,
  createPage,
  createProject,
  mergeSets,
  movePage,
  pageIndexOf,
  pageOf,
  removePage,
  renamePage,
  renameProject,
} from "../core/project.js";
import { renderPages, renderProjectChip, openMenu, closeMenu, projectMenuItems } from "./workspace.js";
import {
  PAGE_SUFFIX,
  PROJECT_SUFFIX,
  SIZE_LIMITS,
  detectKind,
  downloadFile,
  parseImport,
  serializeProject,
} from "../io.js";

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
    this.promptDialog = document.querySelector("#prompt-dialog");
    this.promptTitle = document.querySelector("#prompt-title");
    this.promptLabel = document.querySelector("#prompt-label");
    this.promptInput = document.querySelector("#prompt-input");
    this.promptOk = document.querySelector("#prompt-ok");
    this.promptCancel = document.querySelector("#prompt-cancel");
    this.importInput = document.querySelector("#import-file");
    this.importButton = document.querySelector("#import-btn");
    this.exportButton = document.querySelector("#export-btn");
    this.projectChip = document.querySelector("#project-chip");
    this.pageAddButton = document.querySelector("#page-add");
    this.viewportSwitch = document.querySelector("#viewport-switch");
    this.modeSwitch = document.querySelector("#mode-switch");

    const opened = openWorkspace();
    this.workspace = opened.workspace;
    this.project = opened.project;
    this.notices = opened.notices;

    const session = loadSession();
    const sameProject = session.projectId === this.project.id;
    this.viewport = session.viewport === "desktop" ? "desktop" : "mobile";
    this.mode = sameProject && session.mode === "preview" ? "preview" : "edit";
    this.pageId =
      sameProject && pageOf(this.project, session.pageId)
        ? session.pageId
        : this.project.pages[0].id;
    this.selectionByPage =
      sameProject && isPlainObject(session.selection) ? { ...session.selection } : {};
    const remembered = this.selectionByPage[this.pageId];
    this.selectionId = this.doc.nodes[remembered] ? remembered : this.doc.root;

    this.histories = new Map();
    this.lastDragAt = 0;
    this.toastTimer = 0;
    this.saveTimer = 0;
    this.saveErrorShown = false;

    this.renderer = new CanvasRenderer(this, this.canvasEl);
    this.dnd = new DndController(this);
  }

  /** 当前页的文档。所有编辑动作照旧打在 doc 上，落点由 setter 写回项目。 */
  get page() {
    return pageOf(this.project, this.pageId) ?? this.project.pages[0];
  }

  get doc() {
    return this.page.doc;
  }

  set doc(next) {
    this.page.doc = next;
  }

  get sets() {
    return this.project.sets;
  }

  boot() {
    this.renderPalette();
    this.applyViewport(this.viewport, { silent: true });
    this.applyMode(this.mode, { silent: true });
    this.bindEvents();
    this.renderAll();

    const firstRun = this.notices.length === 0 && this.workspace.projects.length === 1;
    this.setSaveState(this.notices.length > 0 ? "已整理本机项目" : "本机保存");
    requestPersistence();

    for (const notice of this.notices) {
      this.showToast(notice, { duration: 6500 });
    }
    if (firstRun) {
      window.setTimeout(() => {
        this.showToast("示例项目有三张页面。左边切页，顶栏的项目菜单里可以新建自己的项目。", {
          duration: 6200,
        });
      }, 450);
    }
  }

  bindEvents() {
    this.undoButton.addEventListener("click", () => this.undo());
    this.redoButton.addEventListener("click", () => this.redo());

    this.projectChip.addEventListener("click", () => {
      openMenu(this.projectChip, projectMenuItems(this));
    });
    this.pageAddButton.addEventListener("click", () => this.newPage());

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
      const ok = this.commit("修改页面标题", (draft) => {
        draft.title = title;
      });
      if (ok) {
        this.page.title = title;
        renderPages(this);
      }
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

    this.exportButton.addEventListener("click", () => this.exportPage());
    this.importButton.addEventListener("click", () => this.importInput.click());
    this.importInput.addEventListener("change", () => this.importFile());

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
    if (event.key === "Escape") {
      if (this.mode === "preview") this.applyMode("edit");
      else closeMenu();
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
    renderPages(this);
    renderProjectChip(this);
    this.updateStatus();
    this.updateHistory();
    this.updateTitle();
    this.saveSession();
  }

  updateStatus() {
    const node = this.doc.nodes[this.selectionId];
    const count = Object.keys(this.doc.nodes).length;
    const at = pageIndexOf(this.project, this.pageId) + 1;
    this.nodeCountEl.textContent = `${count} 个节点 · 第 ${at}/${this.project.pages.length} 页`;
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
    const stack = this.historyFor();
    this.undoButton.disabled = stack.undo.length === 0;
    this.redoButton.disabled = stack.redo.length === 0;
    this.undoButton.title = stack.undo.length
      ? `撤销：${stack.undo.at(-1).label}`
      : "没有可撤销的操作";
    this.redoButton.title = stack.redo.length
      ? `重做：${stack.redo.at(-1).label}`
      : "没有可重做的操作";
  }

  updateTitle() {
    this.titleInput.value = this.doc.title;
    document.title = `${this.project.name} · ${this.doc.title} · 线框实验室`;
  }

  /** 撤销栈按页面各记一份：切页不会把上一页的操作带过来。 */
  historyFor(pageId = this.pageId) {
    let stack = this.histories.get(pageId);
    if (!stack) {
      stack = { undo: [], redo: [] };
      this.histories.set(pageId, stack);
    }
    return stack;
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
    const stack = this.historyFor();
    stack.undo.push({
      label,
      diff,
      selectionBefore,
      selectionAfter: this.selectionId,
    });
    if (stack.undo.length > MAX_HISTORY) stack.undo.shift();
    stack.redo = [];
    this.doc = draft;
    this.renderAll();
    this.scheduleSave();
    return true;
  }

  undo() {
    const stack = this.historyFor();
    const entry = stack.undo.pop();
    if (!entry) return;
    const draft = cloneDocument(this.doc);
    applySnapshot(draft, entry.diff.before);
    this.doc = draft;
    this.selectionId = draft.nodes[entry.selectionBefore] ? entry.selectionBefore : draft.root;
    stack.redo.push(entry);
    this.renderAll();
    this.scheduleSave();
  }

  redo() {
    const stack = this.historyFor();
    const entry = stack.redo.pop();
    if (!entry) return;
    const draft = cloneDocument(this.doc);
    applySnapshot(draft, entry.diff.after);
    this.doc = draft;
    this.selectionId = draft.nodes[entry.selectionAfter] ? entry.selectionAfter : draft.root;
    stack.undo.push(entry);
    this.renderAll();
    this.scheduleSave();
  }

  select(id, { reveal = false } = {}) {
    if (!this.doc.nodes[id]) return;
    this.selectionId = id;
    this.selectionByPage[this.pageId] = id;
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

  /* ---------- 项目与页面 ---------- */

  adoptProject(project) {
    this.project = project;
    this.pageId = project.pages[0].id;
    this.selectionByPage = {};
    this.histories.clear();
    this.selectionId = this.doc.root;
    this.renderAll();
  }

  switchProject(projectId) {
    if (projectId === this.project.id) return;
    this.flushSave({ quiet: true });
    const loaded = loadProject(projectId);
    if (!loaded.project) {
      this.workspace.projects = this.workspace.projects.filter((entry) => entry.id !== projectId);
      saveWorkspace(this.workspace);
      renderProjectChip(this);
      this.showToast(`项目打不开，已从列表里去掉：${loaded.error}`, { error: true, duration: 6000 });
      return;
    }
    this.workspace.currentProjectId = projectId;
    saveWorkspace(this.workspace);
    this.adoptProject(loaded.project);
    this.showToast(`已打开项目「${this.project.name}」。`);
  }

  switchPage(pageId) {
    if (!pageOf(this.project, pageId) || pageId === this.pageId) return;
    this.pageId = pageId;
    const remembered = this.selectionByPage[pageId];
    this.selectionId = this.doc.nodes[remembered] ? remembered : this.doc.root;
    this.renderAll();
  }

  async newProject() {
    const name = await this.askPrompt({
      title: "新建项目",
      label: "项目名称",
      value: "未命名项目",
      confirmLabel: "新建",
    });
    if (name == null) return;
    this.flushSave({ quiet: true });
    const project = createProject({ name });
    persistProject(this.workspace, project);
    this.adoptProject(project);
    this.showToast(`已新建项目「${project.name}」，组件集沿用内置 default 集。`);
  }

  async renameProject() {
    const name = await this.askPrompt({
      title: "重命名项目",
      label: "项目名称",
      value: this.project.name,
      confirmLabel: "改名",
    });
    if (name == null) return;
    renameProject(this.project, name);
    this.renderAll();
    this.scheduleSave();
  }

  async deleteProject() {
    const confirmed = await this.askConfirm({
      title: "删除项目",
      body: `删除「${this.project.name}」以及它的 ${this.project.pages.length} 张页面？这一步不能撤销，要留档就先导出项目。`,
      confirmLabel: "删除项目",
      danger: true,
    });
    if (!confirmed) return;
    removeProject(this.project.id);
    this.workspace.projects = this.workspace.projects.filter((entry) => entry.id !== this.project.id);
    if (this.workspace.projects.length === 0) {
      const sample = createSampleProject();
      persistProject(this.workspace, sample);
      this.adoptProject(sample);
      this.showToast("项目删完了，已重建示例项目。");
      return;
    }
    const next = this.workspace.projects[0];
    const loaded = loadProject(next.id);
    if (!loaded.project) {
      removeProject(next.id);
      this.workspace.projects = this.workspace.projects.filter((entry) => entry.id !== next.id);
      const sample = createSampleProject();
      persistProject(this.workspace, sample);
      this.adoptProject(sample);
      this.showToast("剩下的项目也打不开，已重建示例项目。", { error: true });
      return;
    }
    this.workspace.currentProjectId = next.id;
    saveWorkspace(this.workspace);
    this.adoptProject(loaded.project);
    this.showToast(`已删除项目，打开了「${this.project.name}」。`);
  }

  async rebuildSampleProject() {
    const confirmed = await this.askConfirm({
      title: "重建示例项目",
      body: "会新建一个示例项目（三张页面），不动你现有的项目。",
      confirmLabel: "重建",
    });
    if (!confirmed) return;
    this.flushSave({ quiet: true });
    const sample = createSampleProject();
    persistProject(this.workspace, sample);
    this.adoptProject(sample);
    this.showToast("已新建示例项目。");
  }

  async newPage() {
    const title = await this.askPrompt({
      title: "新建页面",
      label: "页面标题",
      value: "新页面",
      confirmLabel: "新建",
    });
    if (title == null) return;
    const page = createPage({ title });
    addPage(this.project, page);
    this.switchPage(page.id);
    this.scheduleSave();
    this.showToast(`已新建页面「${page.title}」。`);
  }

  async renamePage(pageId) {
    const page = pageOf(this.project, pageId);
    if (!page) return;
    const title = await this.askPrompt({
      title: "重命名页面",
      label: "页面标题",
      value: page.title,
      confirmLabel: "改名",
    });
    if (title == null) return;
    renamePage(this.project, pageId, title);
    this.renderAll();
    this.scheduleSave();
  }

  duplicatePage(pageId) {
    const copy = clonePage(this.project, pageId);
    if (!copy) return;
    this.switchPage(copy.id);
    this.scheduleSave();
    this.showToast(`已复制出「${copy.title}」。`);
  }

  shiftPage(pageId, delta) {
    const at = pageIndexOf(this.project, pageId);
    if (at < 0) return;
    movePage(this.project, pageId, at + delta);
    this.renderAll();
    this.scheduleSave();
  }

  async deletePage(pageId) {
    if (this.project.pages.length <= 1) {
      this.showToast("项目至少要留一页。", { error: true });
      return;
    }
    const page = pageOf(this.project, pageId);
    if (!page) return;
    const confirmed = await this.askConfirm({
      title: "删除页面",
      body: `删除页面「${page.title}」？这一步不能撤销，要留档就先导出页面。`,
      confirmLabel: "删除页面",
      danger: true,
    });
    if (!confirmed) return;
    const at = pageIndexOf(this.project, pageId);
    removePage(this.project, pageId);
    this.histories.delete(pageId);
    const next = this.project.pages[Math.min(at, this.project.pages.length - 1)];
    this.pageId = next.id;
    this.selectionId = this.doc.root;
    this.renderAll();
    this.scheduleSave();
    this.showToast(`已删除页面，现在在「${next.title}」。`);
  }

  /* ---------- 导入导出 ---------- */

  exportPage() {
    const text = serializeDocument(this.doc);
    downloadFile(`${safeFileName(this.doc.title)}${PAGE_SUFFIX}`, text);
    this.showToast("已导出当前页面 JSON。重新导入后应保持同一棵 AST。");
  }

  exportProject() {
    const text = serializeProject(this.project);
    downloadFile(`${safeFileName(this.project.name)}${PROJECT_SUFFIX}`, text);
    this.showToast("已导出整个项目，含组件集与全部页面。");
  }

  async importFile() {
    const file = this.importInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const kind = detectKind(JSON.parse(text));
      if (!kind) throw new Error("不认识这份 JSON：既不是页面也不是项目");
      if (file.size > SIZE_LIMITS[kind]) {
        throw new Error(
          `文件超过 ${Math.round(SIZE_LIMITS[kind] / 1024 / 1024)} MB，不像是导出的${kind === "project" ? "项目" : "页面"}`,
        );
      }
      const imported = parseImport(text);
      if (imported.kind === "project") {
        this.importProject(imported.project);
      } else {
        this.importPage(imported.doc, imported.sets);
      }
    } catch (error) {
      this.showToast(`导入失败：${error.message}`, { error: true, duration: 6000 });
      console.error(error);
    } finally {
      this.importInput.value = "";
    }
  }

  /** 导入的页面作为新页面加进来，不覆盖正在画的那一页；自带的组件集并进项目。 */
  importPage(doc, sets = null) {
    const added = mergeSets(this.project, sets);
    const page = createPage({ title: doc.title || "导入的页面", doc });
    addPage(this.project, page);
    this.switchPage(page.id);
    this.scheduleSave();
    this.showToast(
      added > 0
        ? `已把页面「${page.title}」加进当前项目，并并入 ${added} 条组件集声明。`
        : `已把页面「${page.title}」加进当前项目。`,
    );
  }

  importProject(imported) {
    this.flushSave({ quiet: true });
    const exists = this.workspace.projects.some((entry) => entry.id === imported.id);
    if (exists) {
      imported.id = newId("pj");
      imported.name = `${imported.name}（导入）`;
    }
    persistProject(this.workspace, imported);
    this.adoptProject(imported);
    this.showToast(
      exists
        ? `项目 id 与本机已有项目重复，已改名导入「${imported.name}」。`
        : `已导入项目「${imported.name}」，共 ${imported.pages.length} 页。`,
      { duration: 5200 },
    );
  }

  replaceDocument(doc, label) {
    const before = cloneDocument(this.doc);
    const diff = snapshotDiff(before, doc);
    if (!diff) return;
    const next = cloneDocument(doc);
    const stack = this.historyFor();
    stack.undo.push({
      label,
      diff,
      selectionBefore: this.selectionId,
      selectionAfter: next.root,
    });
    if (stack.undo.length > MAX_HISTORY) stack.undo.shift();
    stack.redo = [];
    this.doc = next;
    this.selectionId = next.root;
    this.renderAll();
    this.flushSave();
  }

  /* ---------- 画布状态与本机会话 ---------- */

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

  async askConfirm({ title, body, confirmLabel = "确认", danger = false }) {
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

  /** 带输入框的对话框。取消返回 null，确认返回 trim 过的字符串。 */
  askPrompt({ title, label, value = "", confirmLabel = "确认" }) {
    this.promptTitle.textContent = title;
    this.promptLabel.textContent = label;
    this.promptInput.value = value;
    this.promptOk.textContent = confirmLabel;
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        if (this.promptDialog.open) this.promptDialog.close();
        resolve(result);
      };
      this.promptOk.onclick = () => {
        const text = this.promptInput.value.trim();
        finish(text || null);
      };
      this.promptCancel.onclick = () => finish(null);
      this.promptInput.onkeydown = (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.promptOk.click();
        }
      };
      this.promptDialog.oncancel = (event) => {
        event.preventDefault();
        finish(null);
      };
      this.promptDialog.showModal();
      this.promptInput.select();
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
      persistProject(this.workspace, this.project);
      if (!quiet) this.setSaveState("已保存到本机");
    } catch (error) {
      this.setSaveState("保存失败", "is-error");
      if (!quiet && !this.saveErrorShown) {
        this.saveErrorShown = true;
        this.showToast(`本机保存失败：${error.message}。先导出项目留档。`, {
          error: true,
          duration: 6000,
        });
      }
    }
  }

  saveSession() {
    saveSession({
      projectId: this.project.id,
      pageId: this.pageId,
      viewport: this.viewport,
      mode: this.mode,
      selection: this.selectionByPage,
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
  return (title || "未命名").replace(/[\\/:*?"<>|]/g, "-").slice(0, 60);
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
