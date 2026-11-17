/**
 * commands（04 §4 第 3 条）：一次命令 = 一次 commitDoc。组件只发命令，不自己拼 workspace。
 * 拖动走「按下只记 before → 移动只写 ghost → 松手一次 commit」，所以一次拖动只有一条撤销记录。
 * 解域的新建/删除同样各算一条撤销记录（01 §7.4）。
 */
import type {
  Cardinality,
  Domain,
  EdgeKey,
  EntityField,
  NodeId,
  Point,
  PortId,
  QuestionStatus,
  Viewport,
} from '../domain/types.ts';
import {
  addBehavior,
  addConstraint,
  addDecomposesTo,
  addDependsOn,
  addEntity,
  addEntityField,
  addEntityRelation,
  addLinkedElement,
  addQuestion,
  clearWorkspace,
  moveNode,
  removeEdgeByKey,
  removeEntityField,
  removeNode,
  renameNode as renameNodeInDoc,
  renameWorkspace,
  setEdgeProps,
  setEntityField,
  setGoal,
  setQuestionField,
  setQuestionStatus,
  setSupportsQuestion,
  updateBehavior,
  updateConstraint,
  updateElementField,
  updateEntity,
  type QuestionListField,
  type QuestionTextField,
} from '../domain/factory.ts';
import { NODE_LABEL } from '../domain/schema.ts';
import { isProblemElementType, type ProblemElementType } from '../domain/elementFields.ts';
import { commitDoc, getDocState, getHistoryState, redo as redoDoc, undo as undoDoc } from './docStore.ts';
import { getUiState, setUi } from './uiStore.ts';
import { inferConnection } from '../ui/flow/ports.ts';

const now = (): string => new Date().toISOString();

export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 2.5;

const clampZoom = (zoom: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** 段头 `+` / 行内 `+` / `N` 的落库函数（草稿提交后调）：parentId 决定平级还是子问题。 */
function createQuestion(input: { title: string; parentId: NodeId | null }): NodeId | null {
  let createdId: NodeId | null = null;
  commitDoc(
    (ws) => {
      const result = addQuestion(ws, { title: input.title, parentId: input.parentId, now: now() });
      createdId = result.id;
      return result.ws;
    },
    { label: '新建问题' },
  );
  const id: NodeId | null = createdId;
  if (id) setUi({ selectedId: id, draft: null, renamingId: null, menuFor: null });
  return id;
}

/** 画布空白双击（01 §7「在这儿放一个框」）：pos = 双击点，不建边、不改 coreQuestionId。 */
export function createQuestionAt(pos: Point): NodeId | null {
  let createdId: NodeId | null = null;
  commitDoc(
    (ws) => {
      const created = addQuestion(ws, { title: '未命名', parentId: null, now: now() });
      createdId = created.id;
      return moveNode(created.ws, created.id, pos, now());
    },
    { label: '新建问题' },
  );
  const id: NodeId | null = createdId;
  if (id) setUi({ selectedId: id, renamingId: id, draft: null, menuFor: null });
  return id;
}

export function deleteQuestion(id: NodeId): void {
  commitDoc((ws) => removeNode(ws, id, now()).ws, { label: '删除问题' });
  const ui = getUiState();
  if (ui.selectedId === id) setUi({ selectedId: null });
  if (ui.renamingId === id) setUi({ renamingId: null });
  if (ui.menuFor === id) setUi({ menuFor: null });
}

/** 提交行内改名：空标题丢弃（返回 false 让 UI 收掉输入框）。 */
export function commitRename(id: NodeId, title: string): boolean {
  const next = title.trim();
  setUi({ renamingId: null });
  if (!next) return false;
  commitDoc((ws) => renameNodeInDoc(ws, id, next, now()), {
    label: '重命名',
    coalesceKey: `title:${id}`,
  });
  return true;
}

export function applyStatus(id: NodeId, status: QuestionStatus): void {
  commitDoc((ws) => setQuestionStatus(ws, id, status, now()), { label: '标记状态' });
  setUi({ menuFor: null, detailSection: 'status' });
}

export function setQuestionText(id: NodeId, field: QuestionTextField, value: string): void {
  const current = getDocState().ws.nodes.find((node) => node.id === id);
  if (!current || current.type !== 'question') return;
  commitDoc((ws) => setQuestionField(ws, id, field, value, now()), {
    label: '改属性',
    coalesceKey: `field:${field}:${id}`,
  });
}

export function setQuestionList(id: NodeId, field: QuestionListField, text: string): void {
  const list = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  commitDoc((ws) => setQuestionField(ws, id, field, list, now()), {
    label: '改属性',
    coalesceKey: `field:${field}:${id}`,
  });
}

export function renameWorkspaceTo(name: string): void {
  commitDoc((ws) => renameWorkspace(ws, name, now()), { label: '改工作区名' });
}

export function setWorkspaceGoal(goal: string): void {
  commitDoc((ws) => setGoal(ws, goal, now()), { label: '改目标', coalesceKey: 'goal' });
}

/* ---------- 拖动（一次拖动 = 一条撤销记录） ---------- */

export function beginDrag(id: NodeId): void {
  const node = getDocState().ws.nodes.find((entry) => entry.id === id);
  if (!node) return;
  const ui = getUiState();
  setUi({
    drag: { id, origin: node.pos, pos: node.pos },
    selectedId: id,
    selection: { ...ui.selection, [ui.domain]: id },
    selectedEdgeKey: null,
  });
}

export function dragTo(pos: Point): void {
  const drag = getUiState().drag;
  if (!drag) return;
  setUi({ drag: { ...drag, pos: { x: pos.x, y: pos.y } } });
}

export function endDrag(): void {
  const drag = getUiState().drag;
  setUi({ drag: null });
  if (!drag) return;
  if (drag.pos.x === drag.origin.x && drag.pos.y === drag.origin.y) return;
  commitDoc((ws) => moveNode(ws, drag.id, drag.pos, now()), {
    label: '移动节点',
    coalesceKey: `pos:${drag.id}`,
  });
}

/** 撤销/重做后选中兜底：选中对象已不在文档里就清空，详情栏回到「工作区概览」（detailSection 复位）。 */
function pruneSelectionAfterHistory(): void {
  const ui = getUiState();
  const index = getDocState().index;
  const alive = (id: NodeId | null): NodeId | null =>
    id !== null && index.byId.has(id) ? id : null;
  const nodeGone = ui.selectedId !== null && alive(ui.selectedId) === null;
  const edgeGone = ui.selectedEdgeKey !== null && !index.edgeByKey.has(ui.selectedEdgeKey);
  if (!nodeGone && !edgeGone) return;
  setUi({
    selectedId: alive(ui.selectedId),
    selection: { problem: alive(ui.selection.problem), solve: alive(ui.selection.solve) },
    selectedEdgeKey: edgeGone ? null : ui.selectedEdgeKey,
    renamingId: alive(ui.renamingId),
    menuFor: alive(ui.menuFor),
    detailSection: 'props',
  });
}

export function undo(): void {
  if (undoDoc()) {
    setUi({ drag: null });
    pruneSelectionAfterHistory();
  }
}

export function redo(): void {
  if (redoDoc()) {
    setUi({ drag: null });
    pruneSelectionAfterHistory();
  }
}

export function canUndo(): boolean {
  return getHistoryState().stack.length > 0;
}

export function canRedo(): boolean {
  return getHistoryState().redo.length > 0;
}

/* ---------- 视口（按域各一份，只写 uiStore，不进撤销栈） ---------- */

export function setView(view: Viewport): void {
  const ui = getUiState();
  setUi({
    views: {
      ...ui.views,
      [ui.domain]: { x: view.x, y: view.y, zoom: clampZoom(view.zoom) },
    },
  });
}

/* ---------- UI 动作（不改文档） ---------- */

export function select(id: NodeId | null): void {
  const ui = getUiState();
  setUi({
    selectedId: id,
    selection: { ...ui.selection, [ui.domain]: id },
    selectedEdgeKey: null,
  });
}

/** 解域关系行：选边（画布对应连线高亮），同时清掉节点选中。 */
export function selectEdge(key: EdgeKey | null): void {
  const ui = getUiState();
  setUi({
    selectedEdgeKey: key,
    selectedId: null,
    selection: { ...ui.selection, [ui.domain]: null },
  });
}

/** 支撑徽标 / 支撑列表：切回问题域并选中该问题（01 §6.2 的回跳）。 */
export function gotoQuestion(questionId: NodeId): void {
  const ui = getUiState();
  setUi({
    domain: 'problem',
    selectedId: questionId,
    // 只改问题域那一格：解域选中留着，切回解域还能回到刚才的元素。
    selection: { ...ui.selection, problem: questionId },
    selectedEdgeKey: null,
    detailOpen: true,
    detailSection: 'props',
    connect: null,
    dependsSourceId: null,
    dependsTip: null,
  });
}

/* ---------- 问题域「建立依赖…」选目标模式（IMP9）：一次 commit 一条撤销记录 ---------- */

/** 三种拒绝情形的提示原文（不弹模态框：画布底部 modebar 换一句话）。 */
export const DEPEND_TIPS = {
  self: '不能连自己：起点和终点得是两个问题',
  duplicate: '这条依赖已经建过了',
  notQuestion: '只能连问题：依赖的终点必须是问题',
} as const;

export type DependPickResult =
  | 'created'
  | 'self'
  | 'duplicate'
  | 'not-question'
  | 'not-in-mode';

/** 问题行 `⋯` →「建立依赖…」：记下起点问题，进入选目标模式（Esc 取消，不留边）。 */
export function startDepends(sourceId: NodeId): void {
  const node = getDocState().ws.nodes.find((entry) => entry.id === sourceId);
  if (!node || node.type !== 'question') return;
  setUi({
    dependsSourceId: sourceId,
    dependsTip: null,
    menuFor: null,
    menuForEdge: null,
    renamingId: null,
    draft: null,
    solveDraft: false,
    connect: null,
  });
}

export function cancelDepends(): void {
  if (getUiState().dependsSourceId) setUi({ dependsSourceId: null, dependsTip: null });
}

/**
 * 选目标：自环 / 已有同向边 / 非问题节点一律拒绝并给一句提示（栈不变）；
 * 合法则 `dependsOn`（source = 起点，target = 选中的问题）一次 commit 落地，退出模式。
 */
export function pickDependsTarget(id: NodeId): DependPickResult {
  const ui = getUiState();
  const sourceId = ui.dependsSourceId;
  if (!sourceId) return 'not-in-mode';
  if (id === sourceId) {
    setUi({ dependsTip: DEPEND_TIPS.self });
    return 'self';
  }
  const doc = getDocState();
  const target = doc.ws.nodes.find((node) => node.id === id);
  if (!target || target.type !== 'question') {
    setUi({ dependsTip: DEPEND_TIPS.notQuestion });
    return 'not-question';
  }
  if (
    doc.ws.edges.some(
      (edge) => edge.type === 'dependsOn' && edge.source === sourceId && edge.target === id,
    )
  ) {
    setUi({ dependsTip: DEPEND_TIPS.duplicate });
    return 'duplicate';
  }
  commitDoc((ws) => addDependsOn(ws, { source: sourceId, target: id, now: now() }).ws, {
    label: '建立依赖',
  });
  setUi({
    dependsSourceId: null,
    dependsTip: null,
    selectedId: id,
    selection: { ...ui.selection, problem: id },
  });
  return 'created';
}

/* ---------- 端口连线（IMP10）：拖端口 → 松手建边，语义由 ui/flow/ports.ts 判 ---------- */

/**
 * 端口连线的拒绝提示原文（三种被拒情形：自环 / 跨类型 / 已有上级；重复另算）。
 * 一律不弹模态框：画布底部把 modebar 换一句话。
 */
export const CONNECT_TIPS = {
  self: '不能连自己：起点和终点得是两个节点',
  crossType: '只能连同类节点：问题连问题、实体连实体，跨域的那条线不建',
  parentExists: '这个子问题已经有上一级了，删掉旧的那条再连',
  duplicate: '这条线已经建过了',
} as const;

export type ConnectResult =
  | 'created-decomposes'
  | 'created-depends'
  | 'created-relation'
  | 'self'
  | 'cross-type'
  | 'parent-exists'
  | 'duplicate'
  | 'not-found';

export function clearConnectTip(): void {
  if (getUiState().connectTip) setUi({ connectTip: null });
}

export interface ConnectInput {
  domain: Domain;
  source: NodeId;
  target: NodeId;
  sourcePort: PortId;
  targetPort: PortId;
}

/**
 * 从端口连线（IMPP10）：起点/终点端口都由用户选，这里只做「读类型 → 判语义 → 一次 commit」。
 * 语义判断顺序在 ui/flow/ports.ts 的 inferConnection 里（自环 → 跨类型 → 解域关系 →
 * 问题域下→上分解 → 其余依赖）；文档层的兜底校验（重复边、子问题已有上级）在这里，
 * 被拒一律只写一句提示，不 commit —— 撤销栈零增长。
 */
export function connectPorts(input: ConnectInput): ConnectResult {
  const doc = getDocState();
  const sourceNode = doc.ws.nodes.find((node) => node.id === input.source);
  const targetNode = doc.ws.nodes.find((node) => node.id === input.target);
  if (!sourceNode || !targetNode) return 'not-found';

  const plan = inferConnection({
    domain: input.domain,
    self: input.source === input.target,
    sourceType: sourceNode.type,
    targetType: targetNode.type,
    sourcePort: input.sourcePort,
    targetPort: input.targetPort,
  });

  if ('rejected' in plan) {
    setUi({ connectTip: plan.rejected === 'self' ? CONNECT_TIPS.self : CONNECT_TIPS.crossType });
    return plan.rejected;
  }

  if (
    plan.kind === 'decomposesTo' &&
    doc.ws.edges.some((edge) => edge.type === 'decomposesTo' && edge.target === input.target)
  ) {
    setUi({ connectTip: CONNECT_TIPS.parentExists });
    return 'parent-exists';
  }
  const sameEdge = (type: 'dependsOn' | 'entityRelation'): boolean =>
    doc.ws.edges.some(
      (edge) =>
        edge.type === type && edge.source === input.source && edge.target === input.target,
    );
  if (plan.kind !== 'decomposesTo' && sameEdge(plan.kind)) {
    setUi({ connectTip: CONNECT_TIPS.duplicate });
    return 'duplicate';
  }

  let createdKey: EdgeKey | null = null;
  if (plan.kind === 'decomposesTo') {
    commitDoc(
      (ws) => {
        const result = addDecomposesTo(ws, {
          parent: input.source,
          child: input.target,
          now: now(),
          sourcePort: input.sourcePort,
          targetPort: input.targetPort,
        });
        createdKey = result.key;
        return result.ws;
      },
      { label: '建立分解' },
    );
  } else if (plan.kind === 'dependsOn') {
    commitDoc(
      (ws) => {
        const result = addDependsOn(ws, {
          source: input.source,
          target: input.target,
          now: now(),
          sourcePort: input.sourcePort,
          targetPort: input.targetPort,
        });
        createdKey = result.key;
        return result.ws;
      },
      { label: '建立依赖' },
    );
  } else {
    commitDoc(
      (ws) => {
        const result = addEntityRelation(ws, {
          source: input.source,
          target: input.target,
          label: '',
          cardinality: '1:N',
          now: now(),
          sourcePort: input.sourcePort,
          targetPort: input.targetPort,
        });
        createdKey = result.key;
        return result.ws;
      },
      { label: '新建关系' },
    );
  }
  if (!createdKey) {
    setUi({ connectTip: CONNECT_TIPS.duplicate });
    return 'duplicate';
  }

  // 用户选的端口随边落进文档（Edge.sourcePort / targetPort），不再记 UI 侧的内存表（IMP11）。
  const ui = getUiState();
  const selection =
    input.domain === 'problem'
      ? { ...ui.selection, problem: input.target }
      : { ...ui.selection, solve: input.target };
  setUi({
    connectTip: null,
    selectedId: input.target,
    selection,
    selectedEdgeKey: plan.kind === 'entityRelation' ? createdKey : null,
    connect: null,
    dependsSourceId: null,
    dependsTip: null,
  });
  return plan.kind === 'decomposesTo'
    ? 'created-decomposes'
    : plan.kind === 'dependsOn'
      ? 'created-depends'
      : 'created-relation';
}

export function beginDraft(parentId: NodeId | null): void {
  setUi({ draft: { parentId }, renamingId: null, menuFor: null, solveDraft: false });
}

export function cancelDraft(): void {
  if (getUiState().draft) setUi({ draft: null });
}

/** 草稿提交：空标题 = 丢弃，不写盘、不进检查（01 §7.1 第 1 条）。 */
export function submitDraft(title: string): void {
  const draft = getUiState().draft;
  if (!draft) return;
  const next = title.trim();
  if (!next) {
    cancelDraft();
    return;
  }
  createQuestion({ title: next, parentId: draft.parentId });
}

export function beginRename(id: NodeId): void {
  setUi({ renamingId: id, menuFor: null, selectedId: id });
}

export function endRename(): void {
  setUi({ renamingId: null });
}

export function openRowMenu(id: NodeId): void {
  setUi({
    menuFor: getUiState().menuFor === id ? null : id,
    renamingId: null,
    menuForEdge: null,
  });
}

/** 解域关系行 `⋯`：打开边菜单（与节点行菜单互斥）。 */
export function openEdgeMenu(key: EdgeKey): void {
  setUi({ menuForEdge: getUiState().menuForEdge === key ? null : key, menuFor: null });
}

export function closeRowMenu(): void {
  setUi({ menuFor: null, menuForEdge: null });
}

export function setDomain(domain: Domain): void {
  const ui = getUiState();
  setUi({
    domain,
    selectedId: ui.selection[domain],
    selectedEdgeKey: null,
    draft: null,
    solveDraft: false,
    renamingId: null,
    menuFor: null,
    connect: null,
    dependsSourceId: null,
    dependsTip: null,
  });
}

export function setTheme(theme: 'light' | 'dark'): void {
  setUi({ theme });
}

/**
 * 面板收起（03 §2.4.2 / 02 §109）：画板与详情互斥——先收一块、再收另一块时，把前一块放回来。
 * `[` / `]` 两个键与两个 24px 把手都只走这四个命令。
 */
export function setDetailOpen(open: boolean): void {
  setUi(open ? { detailOpen: true } : { detailOpen: false, canvasOpen: true });
}

export function toggleDetail(): void {
  setDetailOpen(!getUiState().detailOpen);
}

export function setCanvasOpen(open: boolean): void {
  setUi(open ? { canvasOpen: true } : { canvasOpen: false, detailOpen: true });
}

export function toggleCanvas(): void {
  setCanvasOpen(!getUiState().canvasOpen);
}

/** 点左列底部检查行：展开详情并切到「检查」分组（03 §2.2）。 */
export function focusChecks(): void {
  setUi({ detailOpen: true, detailSection: 'checks' });
}


/** 键盘：N 新建（解域 = 实体）、Shift+N 新建同级（问题域）。 */
export function shortcutNewQuestion(sibling: boolean): void {
  if (getUiState().domain === 'solve') {
    beginEntityDraft();
    return;
  }
  if (!sibling) {
    beginDraft(null);
    return;
  }
  const ui = getUiState();
  const doc = getDocState();
  const selected = ui.selectedId;
  const parents = selected ? doc.index.parentsOf.get(selected) ?? [] : [];
  const parentId = parents[0] ?? null;
  if (parentId) setUi({ selectedId: parentId });
  beginDraft(parentId);
}

/* ---------- 解域：实体 / 行为 / 约束 / 关系（IMP3） ---------- */

function selectSolveNode(id: NodeId | null): void {
  const ui = getUiState();
  setUi({
    selectedId: id,
    selection: { ...ui.selection, solve: id },
    selectedEdgeKey: null,
  });
}

/** 实体段头 `+` / `N`：树里先出现一条只活在 UI 的未命名行。 */
export function beginEntityDraft(): void {
  setUi({
    solveDraft: true,
    draft: null,
    renamingId: null,
    menuFor: null,
    connect: null,
    selectedEdgeKey: null,
  });
}

export function cancelEntityDraft(): void {
  if (getUiState().solveDraft) setUi({ solveDraft: false });
}

/** 草稿提交：空标题丢弃，不产生空节点、不写盘。 */
export function submitEntityDraft(title: string): void {
  if (!getUiState().solveDraft) return;
  const next = title.trim();
  if (!next) {
    cancelEntityDraft();
    return;
  }
  let createdId: NodeId | null = null;
  commitDoc(
    (ws) => {
      const result = addEntity(ws, { title: next, now: now() });
      createdId = result.id;
      return result.ws;
    },
    { label: '新建实体' },
  );
  const id: NodeId | null = createdId;
  setUi({ solveDraft: false });
  if (id) selectSolveNode(id);
}

/** 解域画布空白双击：在落点建实体并选中（不改任何边）。 */
export function createEntityAt(pos: Point): NodeId | null {
  let createdId: NodeId | null = null;
  commitDoc(
    (ws) => {
      const result = addEntity(ws, { title: '未命名', pos, now: now() });
      createdId = result.id;
      return result.ws;
    },
    { label: '新建实体' },
  );
  const id: NodeId | null = createdId;
  if (id) selectSolveNode(id);
  return id;
}

/** 关系段头 `+`：进入连线模式（Esc 取消，不留空节点）。 */
export function startConnect(): void {
  setUi({ connect: { sourceId: null }, solveDraft: false, selectedEdgeKey: null, menuFor: null });
}

export function cancelConnect(): void {
  if (getUiState().connect) setUi({ connect: null });
}

/** 连线模式里点实体：第一次记起点，第二次落库成 entityRelation（一次 commit）。 */
export function pickConnectEntity(id: NodeId): void {
  const ui = getUiState();
  const connect = ui.connect;
  if (!connect) return;
  if (!connect.sourceId) {
    setUi({
      connect: { sourceId: id },
      selectedId: id,
      selection: { ...ui.selection, solve: id },
      selectedEdgeKey: null,
    });
    return;
  }
  if (connect.sourceId === id) return;
  createRelation(connect.sourceId, id);
}

/** 建关系：两端都得是 entity（domain 层再校验一次），成功后选中这条边。 */
export function createRelation(source: NodeId, target: NodeId): EdgeKey | null {
  let createdKey: EdgeKey | null = null;
  commitDoc(
    (ws) => {
      const result = addEntityRelation(ws, {
        source,
        target,
        label: '关系',
        cardinality: '1:N',
        now: now(),
      });
      createdKey = result.key;
      return result.ws;
    },
    { label: '新建关系' },
  );
  const key: EdgeKey | null = createdKey;
  setUi({ connect: null });
  if (key) selectEdge(key);
  return key;
}

export function createBehavior(entityId: NodeId, title: string): NodeId | null {
  const next = title.trim();
  if (!next) return null;
  let createdId: NodeId | null = null;
  commitDoc(
    (ws) => {
      const result = addBehavior(ws, { title: next, entityId, now: now() });
      createdId = result.id;
      return result.ws;
    },
    { label: '新建行为' },
  );
  const id: NodeId | null = createdId;
  if (id) selectSolveNode(id);
  return id;
}

export function createConstraint(entityId: NodeId, title: string): NodeId | null {
  const next = title.trim();
  if (!next) return null;
  let createdId: NodeId | null = null;
  commitDoc(
    (ws) => {
      const result = addConstraint(ws, { title: next, entityId, now: now() });
      createdId = result.id;
      return result.ws;
    },
    { label: '新建约束' },
  );
  const id: NodeId | null = createdId;
  if (id) selectSolveNode(id);
  return id;
}

/** 删解域元素（01 §7.4）：按类型给撤销记录名；删实体连带它的边，子元素不删。 */
export function deleteSolveNode(id: NodeId): void {
  const node = getDocState().ws.nodes.find((entry) => entry.id === id);
  if (!node) return;
  const label =
    node.type === 'entity' ? '删除实体' : node.type === 'behavior' ? '删除行为' : '删除约束';
  commitDoc((ws) => removeNode(ws, id, now()).ws, { label });
  const ui = getUiState();
  setUi({
    selectedId: ui.selectedId === id ? null : ui.selectedId,
    selection: {
      problem: ui.selection.problem,
      solve: ui.selection.solve === id ? null : ui.selection.solve,
    },
    renamingId: ui.renamingId === id ? null : ui.renamingId,
    menuFor: ui.menuFor === id ? null : ui.menuFor,
    connect: ui.connect?.sourceId === id ? { sourceId: null } : ui.connect,
  });
}

/* ---------- 问题域五类元素（IMP6）：关联区 `＋` → 输入 → 回车 ---------- */

/**
 * 关联区行内 `＋` 提交（01 §7.3「在问题详情里挂」）：
 * 建节点 + 建 `question → 元素` 的边在**一次 commit**里落地，因此撤销栈只 +1（01 §7.4）；
 * 建完选中它，右栏就地展开它的字段。
 */
export function createElementLink(
  questionId: NodeId,
  type: ProblemElementType,
  title: string,
): NodeId | null {
  const next = title.trim();
  if (!next) return null;
  let createdId: NodeId | null = null;
  commitDoc(
    (ws) => {
      const result = addLinkedElement(ws, { questionId, type, title: next, now: now() });
      createdId = result.id;
      return result.ws;
    },
    { label: `新建${NODE_LABEL[type]}` },
  );
  const id: NodeId | null = createdId;
  if (id) select(id);
  return id;
}

export function setElementText(id: NodeId, field: string, value: string): void {
  commitDoc((ws) => updateElementField(ws, id, field, value, now()), {
    label: '改属性',
    coalesceKey: `element:${field}:${id}`,
  });
}

export function setElementList(id: NodeId, field: string, text: string): void {
  const list = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  commitDoc((ws) => updateElementField(ws, id, field, list, now()), {
    label: '改属性',
    coalesceKey: `element:${field}:${id}`,
  });
}

/** 删元素（01 §7.4）：节点与它的全部关联边一起删，一条撤销记录；被它挂过的问题不动。 */
export function deleteElement(id: NodeId): void {
  const node = getDocState().ws.nodes.find((entry) => entry.id === id);
  if (!node || !isProblemElementType(node.type)) return;
  commitDoc((ws) => removeNode(ws, id, now()).ws, { label: `删除${NODE_LABEL[node.type]}` });
  const ui = getUiState();
  setUi({
    selectedId: ui.selectedId === id ? null : ui.selectedId,
    selection: {
      problem: ui.selection.problem === id ? null : ui.selection.problem,
      solve: ui.selection.solve,
    },
    renamingId: ui.renamingId === id ? null : ui.renamingId,
    menuFor: ui.menuFor === id ? null : ui.menuFor,
  });
}

/** 挂 / 摘 supportsQuestion（01 §4.3：只允许解域元素 → 问题）。 */export function toggleSupport(elementId: NodeId, questionId: NodeId, on: boolean): void {
  commitDoc((ws) => setSupportsQuestion(ws, elementId, questionId, on, now()), {
    label: on ? '挂支撑' : '摘支撑',
  });
}

export function setEntityIdentity(id: NodeId, identity: string): void {
  commitDoc((ws) => updateEntity(ws, id, { identity }, now()), {
    label: '改主键',
    coalesceKey: `identity:${id}`,
  });
}

export function addEntityFieldRow(id: NodeId): void {
  commitDoc((ws) => addEntityField(ws, id, now()), { label: '加字段' });
}

export function setEntityFieldValue(
  id: NodeId,
  index: number,
  patch: Partial<EntityField>,
): void {
  commitDoc((ws) => setEntityField(ws, id, index, patch, now()), {
    label: '改字段',
    coalesceKey: `field:${id}:${index}`,
  });
}

export function removeEntityFieldRow(id: NodeId, index: number): void {
  commitDoc((ws) => removeEntityField(ws, id, index, now()), { label: '删字段' });
}

export function setBehaviorText(id: NodeId, field: 'output', value: string): void {
  const patch: { output: string } = { output: value };
  commitDoc((ws) => updateBehavior(ws, id, patch, now()), {
    label: '改属性',
    coalesceKey: `behavior:${field}:${id}`,
  });
}

export function setBehaviorList(
  id: NodeId,
  field: 'inputs' | 'preconditions' | 'effects',
  text: string,
): void {
  const list = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const patch =
    field === 'inputs' ? { inputs: list } : field === 'preconditions' ? { preconditions: list } : { effects: list };
  commitDoc((ws) => updateBehavior(ws, id, patch, now()), {
    label: '改属性',
    coalesceKey: `behavior:${field}:${id}`,
  });
}

export function setConstraintText(
  id: NodeId,
  field: 'expr' | 'enforcementPoint',
  value: string,
): void {
  const patch = field === 'expr' ? { expr: value } : { enforcementPoint: value };
  commitDoc((ws) => updateConstraint(ws, id, patch, now()), {
    label: '改属性',
    coalesceKey: `constraint:${field}:${id}`,
  });
}

export function setConstraintKind(id: NodeId, kind: '必须' | '禁止'): void {
  commitDoc((ws) => updateConstraint(ws, id, { kind }, now()), { label: '改约束类型' });
}

export function setRelationLabel(key: EdgeKey, label: string): void {
  commitDoc((ws) => setEdgeProps(ws, key, { label }, now()), {
    label: '改关系名',
    coalesceKey: `rel-label:${key}`,
  });
}

/** 关系行菜单「重命名」：进行内输入；空标题丢弃（与节点改名同口径）。 */
export function beginRelationRename(key: EdgeKey): void {
  setUi({
    renamingEdgeKey: key,
    menuForEdge: null,
    menuFor: null,
    selectedEdgeKey: key,
    selectedId: null,
  });
}

export function cancelRelationRename(): void {
  if (getUiState().renamingEdgeKey) setUi({ renamingEdgeKey: null });
}

export function commitRelationRename(key: EdgeKey, label: string): boolean {
  const next = label.trim();
  setUi({ renamingEdgeKey: null });
  if (!next) return false;
  setRelationLabel(key, next);
  return true;
}

export function setRelationCardinality(key: EdgeKey, cardinality: Cardinality): void {
  commitDoc((ws) => setEdgeProps(ws, key, { cardinality }, now()), { label: '改基数' });
}

/**
 * 改连线端口（IMP11）：详情栏「关系端口」下拉进来，一次 commit 一条撤销记录。
 * 传 null = 退回几何推导（字段删掉）；没传的一端保持原样。
 */
export function setEdgePorts(
  key: EdgeKey,
  patch: { sourcePort?: PortId | null; targetPort?: PortId | null },
): void {
  commitDoc((ws) => setEdgeProps(ws, key, patch, now()), { label: '改连线端口' });
}

export function deleteRelation(key: EdgeKey): void {
  commitDoc((ws) => removeEdgeByKey(ws, key, now()), { label: '删除关系' });
  const ui = getUiState();
  setUi({
    selectedEdgeKey: ui.selectedEdgeKey === key ? null : ui.selectedEdgeKey,
    menuForEdge: ui.menuForEdge === key ? null : ui.menuForEdge,
    renamingEdgeKey: ui.renamingEdgeKey === key ? null : ui.renamingEdgeKey,
  });
}

/** 清空工作区（二次确认在详情栏做）：一次 commit 一条撤销记录。 */
export function clearWorkspaceNow(): void {
  commitDoc((ws) => clearWorkspace(ws, now()), { label: '清空工作区' });
  setUi({
    selectedId: null,
    selection: { problem: null, solve: null },
    selectedEdgeKey: null,
    draft: null,
    solveDraft: false,
    renamingId: null,
    menuFor: null,
    connect: null,
    detailSection: 'props',
  });
}
