/** uiStore（04 §5）：选中 / 域 / 主题 / 面板 / 画布视口 / 拖动态 / 详情分组。全在内存。 */
import type { Domain, EdgeKey, NodeId, Point, Viewport } from '../domain/types.ts';
import type { SessionState } from './persistence.ts';

export type Theme = 'light' | 'dark';
export type DetailSection = 'props' | 'relations' | 'checks' | 'status';

export interface RowDraft {
  /** null = 段头 `+` 的平级新建（摆在树根）；有值 = 该问题的子问题（行内 `+`）。 */
  parentId: NodeId | null;
}

/** 连线模式（解域「关系 ＋」/ 01 §7.3：先点起点实体，再点终点实体）。 */
export interface ConnectState {
  sourceId: NodeId | null;
}

/** 拖动中的 ghost：只活在 uiStore，松手才写回文档（04 §5「一次拖动只产生一条撤销记录」）。 */
export interface DragState {
  id: NodeId;
  /** 按下时的 pos（左上角），Esc 取消时回这里。 */
  origin: Point;
  pos: Point;
}

export interface UiState {
  domain: Domain;
  /** 当前域生效的选中；`selection[domain]` 才是每域各一份（切域不丢选中）。 */
  selectedId: NodeId | null;
  selection: Record<Domain, NodeId | null>;
  /** 解域关系行选中的边（`type|source>target`）。 */
  selectedEdgeKey: EdgeKey | null;
  theme: Theme;
  canvasOpen: boolean;
  detailOpen: boolean;
  /** 正在行内改名的节点 id */
  renamingId: NodeId | null;
  /** 未命名草稿：只活在 UI，不进文档（01 §7.1 / 04 §5） */
  draft: RowDraft | null;
  /** 解域「实体 ＋」的未命名草稿行 */
  solveDraft: boolean;
  /** 打开行菜单的节点 id */
  menuFor: NodeId | null;
  /** 打开行菜单的关系边（解域关系行 `⋯`；与 menuFor 互斥） */
  menuForEdge: EdgeKey | null;
  /** 正在行内改名的关系边 */
  renamingEdgeKey: EdgeKey | null;
  ignoredChecks: readonly string[];
  /** 视口（缩放 + 平移）按域各一份；不进文档，避免拖动视口产生撤销记录。 */
  views: Record<Domain, Viewport>;
  /** 解域连线模式；null = 不在连线。 */
  connect: ConnectState | null;
  /** 问题域「建立依赖…」的选目标模式：起点问题 id；null = 不在该模式（IMP9）。 */
  dependsSourceId: NodeId | null;
  /** 依赖模式的拒绝提示（自环 / 重复 / 非问题）；用 modebar 文案，不弹模态框。 */
  dependsTip: string | null;
  /** 端口连线的拒绝提示（自环 / 跨类型 / 已有上级 / 重复）；同样用 modebar 文案，不弹模态框。 */
  connectTip: string | null;
  drag: DragState | null;
  /** 详情栏当前聚焦的分组：点左列检查行会切到 'checks'。 */
  detailSection: DetailSection;
}

type Listener = () => void;

const listeners = new Set<Listener>();

let state: UiState = {
  domain: 'problem',
  selectedId: null,
  selection: { problem: null, solve: null },
  selectedEdgeKey: null,
  theme: 'light',
  canvasOpen: true,
  detailOpen: true,
  renamingId: null,
  draft: null,
  solveDraft: false,
  menuFor: null,
  menuForEdge: null,
  renamingEdgeKey: null,
  ignoredChecks: [],
  views: {
    problem: { x: 48, y: 48, zoom: 1 },
    solve: { x: 48, y: 48, zoom: 1 },
  },
  connect: null,
  dependsSourceId: null,
  dependsTip: null,
  connectTip: null,
  drag: null,
  detailSection: 'props',
};

export function getUiState(): UiState {
  return state;
}

export function subscribeUi(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setUi(patch: Partial<UiState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export function hydrateUi(session: SessionState): void {
  state = {
    ...state,
    domain: session.domain,
    selectedId: session.selectedId,
    selection: {
      problem: session.domain === 'problem' ? session.selectedId : null,
      solve: session.domain === 'solve' ? session.selectedId : null,
    },
    theme: session.theme,
    canvasOpen: session.canvasOpen,
    detailOpen: session.detailOpen,
  };
  for (const listener of listeners) listener();
}

export function sessionOf(ui: UiState): SessionState {
  return {
    domain: ui.domain,
    selectedId: ui.selectedId,
    theme: ui.theme,
    canvasOpen: ui.canvasOpen,
    detailOpen: ui.detailOpen,
    ignoredChecks: [...ui.ignoredChecks],
  };
}
