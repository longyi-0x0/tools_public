/**
 * 文档 → React Flow 元素（IMP7）。纯函数、无 JSX、不 import 库的运行时：
 * 节点只产 data（长相在 flow/nodes.tsx），边只产 data/style（长相在 flow/edges.tsx）。
 * 因此整套映射能脱离浏览器用 node:test 直接断死（npm test 里跑）。
 *
 * 边的几何按关系语法分（FIX3，长相在 flow/edges.tsx）：
 *   decomposesTo / dependsOn → 纯直线（getStraightPath，d 里只有 M/L）；
 *   entityRelation → 正交折线（getSmoothStepPath，横竖直角，带关系名/基数标签）。
 * 这里只产 kind，具体路径函数由边组件按 kind 选——映射层保持纯函数、可被 node:test 直接断死。
 */
import type { Edge, Node } from '@xyflow/react';
import type { CSSProperties } from 'react';
import type {
  DocIndex,
  EdgeKey,
  EntityField,
  NodeId,
  Point,
  QuestionStatus,
  Workspace,
} from '../../domain/types.ts';
import { cardSizeOf, layoutProblemTree, layoutSolveModel, resolvePositions } from '../../domain/layout.ts';
import { edgeKey } from '../../domain/schema.ts';
import { ELEMENT_EDGE, PROBLEM_ELEMENT_TYPES } from '../../domain/elementFields.ts';
import { statusClassOf, statusOf } from '../nodeStyle.ts';
import { resolveEdgePorts, type EdgePorts, type PortRect } from './ports.ts';

export const QUESTION_NODE_TYPE = 'question';
export const ENTITY_NODE_TYPE = 'entity';
export const FLOW_EDGE_TYPE = 'pdc';
/** 实心 / 空心箭头。defs 由 flow/edges.tsx 的 <FlowEdgeMarkers/> 画在画板上（随主题换色）。 */
export const MARKER_SOLID = 'url(#pdc-arrow)';
export const MARKER_HOLLOW = 'url(#pdc-arrow-hollow)';
/** 吸附网格 8px：与背景点阵 24px 整除对齐（24 = 3 × 8）。 */
export const SNAP_GRID: [number, number] = [8, 8];

/**
 * 松手吸附（IMPFIX3）：拖动中不吸附（snapToGrid=false，全程跟手），
 * 落点在这里取 8px 网格的整数倍，再由 onNodeDragStop 写回文档。
 */
export function snapPoint(point: Point): Point {
  const [gridX, gridY] = SNAP_GRID;
  return { x: Math.round(point.x / gridX) * gridX, y: Math.round(point.y / gridY) * gridY };
}

export type PdcEdgeKind = 'decomposes' | 'depends' | 'relation';

export interface QuestionLink {
  id: NodeId;
  title: string;
}

/** 问题卡的数据（02 §3 组件 3）：状态点、编号、标题、关联胶囊、检查角标缺一不可。 */
export interface QuestionNodeData extends Record<string, unknown> {
  title: string;
  code: string;
  status: QuestionStatus;
  statusClass: string;
  core: boolean;
  selected: boolean;
  links: readonly QuestionLink[];
  linkMore: number;
  checks: readonly string[];
}

export interface EntityFieldData {
  name: string;
  type?: string;
  required?: boolean;
}

export interface EntityTagData {
  id: NodeId;
  title: string;
  kind: 'behavior' | 'constraint';
  supportCode: string | null;
  unsupported: boolean;
}

export interface SupportCode {
  code: string;
  questionId: NodeId;
}

/** 实体卡的数据（03 §1 屏 2）：主键、字段、挂着的约束/行为贴条、支撑徽标。 */
export interface EntityNodeData extends Record<string, unknown> {
  title: string;
  identity: string;
  fields: readonly EntityFieldData[];
  tags: readonly EntityTagData[];
  supportCodes: readonly SupportCode[];
  unsupported: boolean;
  selected: boolean;
  connectSource: boolean;
}

export interface PdcEdgeData extends Record<string, unknown> {
  kind: PdcEdgeKind;
  /** 关系名（entityRelation 才有），如「持有」。 */
  label?: string;
  /** 基数，如 `1:N`。 */
  cardinality?: string;
  selected?: boolean;
}

/**
 * 边的线条语法（02 §5 / FIX3）：一律主色 --pd-accent（浅色 #6E5CC4 / 深色 #A99BF0），2px；
 * dependsOn 虚线 6/4，选中加粗到 3px。颜色不用 --pd-line-1/-2（边框色太浅，浅色主题下几乎看不见）。
 */
export function edgeStyleOf(kind: PdcEdgeKind, selected = false): CSSProperties {
  return {
    stroke: 'var(--pd-accent)',
    strokeWidth: selected ? 3 : 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeDasharray: kind === 'depends' ? '6 4' : undefined,
    opacity: kind === 'depends' ? 0.85 : 1,
  };
}

/**
 * 一条边进 React Flow 的形状：kind 决定几何（flow/edges.tsx），ports 决定端点贴哪个端口
 * （IMP10：用户拖的端口记在 ui/flow/ports.ts，没记录就按两卡相对位置推）。
 */
function makeEdge(
  id: string,
  source: NodeId,
  target: NodeId,
  kind: PdcEdgeKind,
  ports: EdgePorts,
  extra: { label?: string; cardinality?: string; selected?: boolean } = {},
): Edge {
  const data: PdcEdgeData = { kind, ...extra };
  return {
    id,
    source,
    target,
    sourceHandle: ports.source,
    targetHandle: ports.target,
    type: FLOW_EDGE_TYPE,
    data,
    style: edgeStyleOf(kind, extra.selected === true),
    markerEnd: kind === 'depends' ? MARKER_HOLLOW : MARKER_SOLID,
    className: `pdc-edge pdc-edge--${kind}`,
  };
}

/**
 * 屏幕坐标 → 流坐标（`<div className="react-flow">` 内容层的坐标）。
 * 与 React Flow 的 `screenToFlowPosition` 同一式：平移取反、除以缩放，即视口变换 [x,y,zoom] 的逆。
 * 之所以在映射层留一份，是因为库的方法只在浏览器里可调用；这个纯函数让换算能被单测锚住。
 */
export function flowPointFromClient(
  client: Point,
  rect: { left: number; top: number },
  viewport: { x: number; y: number; zoom: number },
): Point {
  return {
    x: Math.round((client.x - rect.left - viewport.x) / viewport.zoom),
    y: Math.round((client.y - rect.top - viewport.y) / viewport.zoom),
  };
}

/** 问题卡底部的关联胶囊（最多 3 个 + `+N`，01 §4.3 的建边顺序）。 */
function linksByQuestion(ws: Workspace, index: DocIndex): Map<NodeId, NodeId[]> {
  const elementEdges = new Set(PROBLEM_ELEMENT_TYPES.map((type) => ELEMENT_EDGE[type]));
  const map = new Map<NodeId, NodeId[]>();
  for (const edge of ws.edges) {
    if (!elementEdges.has(edge.type)) continue;
    if (index.byId.get(edge.source)?.type !== 'question') continue;
    if (!index.byId.has(edge.target)) continue;
    const list = map.get(edge.source);
    if (list) list.push(edge.target);
    else map.set(edge.source, [edge.target]);
  }
  return map;
}

export interface FlowSelection {
  /** 唯一真相（FIX6）：uiStore.selectedId。下面两个字段都从这里派生，节点绝不自己记选中。 */
  selectedId: NodeId | null;
}

export interface ProblemFlowInput extends FlowSelection {
  ws: Workspace;
  index: DocIndex;
  checksByNode: ReadonlyMap<NodeId, readonly string[]>;
}

/** 问题域：只有问题卡 + 问题间的两种边（decomposesTo / dependsOn）。 */
export function toProblemFlow(input: ProblemFlowInput): { nodes: Node[]; edges: Edge[] } {
  const { ws, index } = input;
  const layout = layoutProblemTree(ws, index);
  const positions = resolvePositions(ws, index, layout);
  const links = linksByQuestion(ws, index);
  const rects = new Map<NodeId, PortRect>();

  const nodes: Node[] = [];
  for (const node of ws.nodes) {
    if (node.type !== 'question') continue;
    const pos = positions.get(node.id);
    if (!pos) continue;
    const size = cardSizeOf(ws.coreQuestionId, node.id);
    rects.set(node.id, { x: pos.x, y: pos.y, w: size.width, h: size.height });
    const linked = (links.get(node.id) ?? []).map((id) => ({
      id,
      title: index.byId.get(id)?.title || '未命名',
    }));
    const data: QuestionNodeData = {
      title: node.title || '未命名',
      code: index.codes.get(node.id) ?? '',
      status: statusOf(node),
      statusClass: statusClassOf(node),
      core: node.id === ws.coreQuestionId,
      selected: input.selectedId === node.id,
      links: linked.slice(0, 3),
      linkMore: Math.max(0, linked.length - 3),
      checks: input.checksByNode.get(node.id) ?? [],
    };
    nodes.push({
      id: node.id,
      type: QUESTION_NODE_TYPE,
      position: { x: pos.x, y: pos.y },
      data,
      // FIX6：视觉选中看 data.selected；顶层 selected 同一份值，只是回灌给库，免得它把选中清掉
      // （库 adoptUserNodes 会用 userNode 重建内部节点，缺 selected 就等于取消选中）。
      selected: input.selectedId === node.id,
      style: { width: size.width, height: size.height },
    });
  }

  const edges: Edge[] = [];
  for (const edge of ws.edges) {
    if (edge.type !== 'decomposesTo' && edge.type !== 'dependsOn') continue;
    if (index.byId.get(edge.source)?.type !== 'question') continue;
    if (index.byId.get(edge.target)?.type !== 'question') continue;
    if (!positions.has(edge.source) || !positions.has(edge.target)) continue;
    const kind: PdcEdgeKind = edge.type === 'dependsOn' ? 'depends' : 'decomposes';
    const key = edgeKey(edge);
    // IMP11：端口以边上的字段为准，缺的一端按几何推导补（老数据行为不变）。
    const ports = resolveEdgePorts(
      edge,
      rects.get(edge.source) as PortRect,
      rects.get(edge.target) as PortRect,
    );
    edges.push(
      makeEdge(key, edge.source, edge.target, kind, ports, edge.label ? { label: edge.label } : {}),
    );
  }
  return { nodes, edges };
}

export interface SolveFlowInput extends FlowSelection {
  ws: Workspace;
  index: DocIndex;
  selectedEdgeKey: EdgeKey | null;
  connectSourceId: NodeId | null;
}

/** 解域：实体卡 + 挂着的行为/约束贴条 + entityRelation 连线（带关系名与基数）。 */
export function toSolveFlow(input: SolveFlowInput): { nodes: Node[]; edges: Edge[] } {
  const { ws, index } = input;
  const layout = layoutSolveModel(ws, index);

  const supportCodesOf = (id: NodeId): SupportCode[] =>
    (index.supportsByNode.get(id) ?? [])
      .filter((questionId) => index.byId.get(questionId)?.type === 'question')
      .map((questionId) => ({ code: index.codes.get(questionId) ?? '', questionId }))
      .filter((entry) => entry.code.length > 0);

  const tagsByEntity = new Map<NodeId, EntityTagData[]>();
  for (const edge of ws.edges) {
    if (edge.type !== 'behaviorOnEntity' && edge.type !== 'constraintOnEntity') continue;
    const unit = index.byId.get(edge.source);
    if (!unit) continue;
    const kind = edge.type === 'behaviorOnEntity' ? 'behavior' : 'constraint';
    const supportCode = supportCodesOf(unit.id)[0]?.code ?? null;
    const list = tagsByEntity.get(edge.target) ?? [];
    list.push({
      id: unit.id,
      title: unit.title || '未命名',
      kind,
      supportCode,
      unsupported: supportCode === null,
    });
    tagsByEntity.set(edge.target, list);
  }

  const rects = new Map<NodeId, PortRect>();
  const nodes: Node[] = [];
  for (const node of ws.nodes) {
    if (node.type !== 'entity') continue;
    const placed = layout.positions.get(node.id);
    const size = layout.sizes.get(node.id);
    if (!placed || !size) continue;
    const pos = placed;
    rects.set(node.id, { x: pos.x, y: pos.y, w: size.width, h: size.height });
    const supportCodes = supportCodesOf(node.id);
    const fields: EntityFieldData[] = (node.data.fields ?? []).map((field: EntityField) => ({
      name: field.name,
      type: field.type,
      required: field.required,
    }));
    const data: EntityNodeData = {
      title: node.title || '未命名',
      identity: node.data.identity ? `# ${node.data.identity}` : '（缺主键）',
      fields,
      tags: tagsByEntity.get(node.id) ?? [],
      supportCodes,
      unsupported: supportCodes.length === 0,
      selected: input.selectedId === node.id,
      connectSource: input.connectSourceId === node.id,
    };
    nodes.push({
      id: node.id,
      type: ENTITY_NODE_TYPE,
      position: { x: pos.x, y: pos.y },
      data,
      // FIX6：同问题卡——data.selected 画环，顶层 selected 回灌给库。
      selected: input.selectedId === node.id,
      style: { width: size.width, height: size.height },
    });
  }

  const edges: Edge[] = [];
  for (const edge of ws.edges) {
    if (edge.type !== 'entityRelation') continue;
    if (!layout.positions.has(edge.source) || !layout.positions.has(edge.target)) continue;
    const key = edgeKey(edge);
    // IMP11：同上——边上的端口优先，缺失的端按几何推导。
    const ports = resolveEdgePorts(
      edge,
      rects.get(edge.source) as PortRect,
      rects.get(edge.target) as PortRect,
    );
    edges.push(
      makeEdge(key, edge.source, edge.target, 'relation', ports, {
        // 端口连线默认不写关系名（label 留空），屏幕上显示「关系」；写过的名照原样显示。
        label: edge.label || '关系',
        cardinality: edge.cardinality ?? '1:N',
        selected: input.selectedEdgeKey === key,
      }),
    );
  }
  return { nodes, edges };
}
