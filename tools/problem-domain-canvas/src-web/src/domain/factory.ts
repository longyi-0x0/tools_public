/**
 * 工作区与节点的纯函数工厂 + 本轮用到的编辑操作（每条都是 (Workspace) => Workspace）。
 * 时间戳由调用方传（`now`），这里不读时钟，保证可测。
 */
import type {
  AnyNode,
  AnyNodeOf,
  BehaviorData,
  Cardinality,
  ConstraintData,
  Edge,
  EdgeKey,
  EdgeType,
  EntityData,
  EntityField,
  NodeId,
  NodeType,
  NodeDataOf,
  Point,
  QuestionData,
  QuestionStatus,
  Workspace,
} from './types.ts';
import { SCHEMA_VERSION } from './types.ts';
import { DEFAULT_VIEWPORT, edgeKey, isEdgeAllowed } from './schema.ts';
import { ELEMENT_EDGE, isElementField, isProblemElementType, type ProblemElementType } from './elementFields.ts';
import { newId } from './id.ts';

export function createWorkspace(now = ''): Workspace {
  return {
    schemaVersion: SCHEMA_VERSION,
    name: '未命名工作区',
    goal: '',
    coreQuestionId: null,
    nodes: [],
    edges: [],
    viewports: { ...DEFAULT_VIEWPORT },
    meta: { createdAt: now, updatedAt: now },
  };
}

export function createNode<T extends NodeType>(
  type: T,
  init: { title?: string; pos?: Point; data?: NodeDataOf<T>; notes?: string },
  existing: readonly AnyNode[],
): AnyNodeOf<T> {
  const node = {
    id: newId(type, existing),
    type,
    title: init.title ?? '',
    notes: init.notes ?? '',
    data: init.data ?? {},
    pos: init.pos ?? { x: 0, y: 0 },
  };
  return node as unknown as AnyNodeOf<T>;
}

/** 端点类型不合法直接抛：01 §10「每条线都必须属于 11 类边之一，端点类型不合法直接拒绝」。 */
export function createEdge(
  type: EdgeType,
  source: NodeId,
  target: NodeId,
  nodes: readonly AnyNode[],
): Edge {
  const sourceNode = nodes.find((n) => n.id === source);
  const targetNode = nodes.find((n) => n.id === target);
  if (!sourceNode || !targetNode) throw new Error(`边 ${type}：端点不存在（${source} → ${target}）`);
  if (!isEdgeAllowed(type, sourceNode.type, targetNode.type)) {
    throw new Error(
      `边 ${type} 不允许 ${sourceNode.type} → ${targetNode.type}（01 §4.3 的端点类型表）`,
    );
  }
  return { type, source, target };
}

function touch(ws: Workspace, now: string): Workspace['meta'] {
  return { createdAt: ws.meta.createdAt || now, updatedAt: now };
}

export function byId(ws: Workspace, id: NodeId): AnyNode | undefined {
  return ws.nodes.find((node) => node.id === id);
}

/**
 * 新建问题（01 §7）。
 * - 无父问题：段头 `+` 的语义；工作区还没有核心问题时顺手写成核心问题（01 §7 空态主按钮）。
 * - 有父问题：行内 `+` 的语义，自动建 `decomposesTo` 边；只继承父的 `boundary`，状态重置为「未澄清」（01 §7.2）。
 */
export function addQuestion(
  ws: Workspace,
  input: { title: string; parentId?: NodeId | null; now: string; pos?: Point },
): { ws: Workspace; id: NodeId } {
  const parent = input.parentId
    ? ws.nodes.find((node) => node.id === input.parentId && node.type === 'question')
    : undefined;

  const data: QuestionData = { status: '未澄清' };
  if (parent && parent.type === 'question' && parent.data.boundary) {
    data.boundary = parent.data.boundary;
  }

  const node = createNode(
    'question',
    { title: input.title, data, pos: input.pos },
    ws.nodes,
  );
  const nodes = [...ws.nodes, node];
  const edges = parent ? [...ws.edges, createEdge('decomposesTo', parent.id, node.id, nodes)] : ws.edges;
  const coreQuestionId = !parent && ws.coreQuestionId === null ? node.id : ws.coreQuestionId;

  return {
    ws: { ...ws, nodes, edges, coreQuestionId, meta: touch(ws, input.now) },
    id: node.id,
  };
}

/** 改名：空标题不接受（草稿丢弃在 UI 层做，文档里不留空壳，01 §7.1）。 */
export function renameNode(
  ws: Workspace,
  id: NodeId,
  title: string,
  now: string,
): Workspace {
  const next = title.trim();
  if (!next) return ws;
  if (!ws.nodes.some((node) => node.id === id)) return ws;
  return {
    ...ws,
    nodes: ws.nodes.map((node) => (node.id === id ? { ...node, title: next } : node)),
    meta: touch(ws, now),
  };
}

export function moveNode(ws: Workspace, id: NodeId, pos: Point, now: string): Workspace {
  if (!ws.nodes.some((node) => node.id === id)) return ws;
  return {
    ...ws,
    nodes: ws.nodes.map((node) =>
      node.id === id ? { ...node, pos: { x: pos.x, y: pos.y } } : node,
    ),
    meta: touch(ws, now),
  };
}

export type QuestionTextField = 'statement' | 'goal' | 'boundary' | 'answerForm' | 'deferReason';
export type QuestionListField =
  | 'knowns'
  | 'assumptions'
  | 'positiveCases'
  | 'negativeCases'
  | 'criteria';

export function setQuestionField(
  ws: Workspace,
  id: NodeId,
  field: QuestionTextField | QuestionListField,
  value: string | string[],
  now: string,
): Workspace {
  return {
    ...ws,
    nodes: ws.nodes.map((node) =>
      node.id === id && node.type === 'question'
        ? { ...node, data: { ...node.data, [field]: value } }
        : node,
    ),
    meta: touch(ws, now),
  };
}

export function setQuestionStatus(
  ws: Workspace,
  id: NodeId,
  status: QuestionStatus,
  now: string,
): Workspace {
  return {
    ...ws,
    nodes: ws.nodes.map((node) =>
      node.id === id && node.type === 'question'
        ? { ...node, data: { ...node.data, status } }
        : node,
    ),
    meta: touch(ws, now),
  };
}

/**
 * 删节点（01 §7.4）：连带删掉它的全部出入边；删实体时级联删掉挂在它身上的 behavior/constraint
 * （`behaviorOnEntity`/`constraintOnEntity` 的另一端），整步仍是一条记录；子问题不删、脱挂；
 * 删的是核心问题时 `coreQuestionId` 置空。
 */
export function removeNode(
  ws: Workspace,
  id: NodeId,
  now: string,
): { ws: Workspace; removedEdges: number; orphanedChildren: NodeId[] } {
  const target = ws.nodes.find((node) => node.id === id);
  if (!target) {
    return { ws, removedEdges: 0, orphanedChildren: [] };
  }
  const orphanedChildren = ws.edges
    .filter((edge) => edge.type === 'decomposesTo' && edge.source === id)
    .map((edge) => edge.target);
  // 级联只对实体生效：删行为/约束时边另一端是宿主实体，不能跟着删。
  const attachTypes = new Set(['behaviorOnEntity', 'constraintOnEntity']);
  const cascaded =
    target.type === 'entity'
      ? new Set(
          ws.edges
            .filter((edge) => attachTypes.has(edge.type))
            .filter((edge) => edge.source === id || edge.target === id)
            .map((edge) => (edge.source === id ? edge.target : edge.source)),
        )
      : new Set<NodeId>();

  const nodes = ws.nodes.filter((node) => node.id !== id && !cascaded.has(node.id));
  const edges = ws.edges.filter(
    (edge) =>
      edge.source !== id &&
      edge.target !== id &&
      !cascaded.has(edge.source) &&
      !cascaded.has(edge.target),
  );
  const coreQuestionId = ws.coreQuestionId === id ? null : ws.coreQuestionId;

  return {
    ws: {
      ...ws,
      nodes,
      edges,
      coreQuestionId,
      meta: touch(ws, now),
    },
    removedEdges: ws.edges.length - edges.length,
    orphanedChildren,
  };
}

export function renameWorkspace(ws: Workspace, name: string, now: string): Workspace {
  const next = name.trim();
  if (!next) return ws;
  return { ...ws, name: next, meta: touch(ws, now) };
}

export function setGoal(ws: Workspace, goal: string, now: string): Workspace {
  return { ...ws, goal, meta: touch(ws, now) };
}

/** 子问题继承（01 §7.2）：只有 boundary 原样复制；其余不继承。 */
export function inheritedChildData(parent: QuestionData): QuestionData {
  const data: QuestionData = { status: '未澄清' };
  if (parent.boundary) data.boundary = parent.boundary;
  return data;
}

/* ---------- 问题域五类元素（IMP6）：actor / scene / concept / rule / event ---------- */

/**
 * 新建元素并同时建边（01 §4.3：方向恒为 question → 元素）。
 * 节点与边在同一个 Workspace 里落地，所以调用方一次 commit 就是一条撤销记录（01 §7.4）。
 */
export function addLinkedElement(
  ws: Workspace,
  input: { questionId: NodeId; type: ProblemElementType; title: string; now: string },
): { ws: Workspace; id: NodeId | null } {
  const question = byId(ws, input.questionId);
  if (!question || question.type !== 'question') return { ws, id: null };
  const node = createNode(input.type, { title: input.title, data: {} }, ws.nodes) as AnyNode;
  const nodes = [...ws.nodes, node];
  const edges = [...ws.edges, createEdge(ELEMENT_EDGE[input.type], question.id, node.id, nodes)];
  return { ws: { ...ws, nodes, edges, meta: touch(ws, input.now) }, id: node.id };
}

/** 改元素字段：字段名不在 01 §4.2 的表里直接拒（不许自创字段）。 */
export function updateElementField(
  ws: Workspace,
  id: NodeId,
  field: string,
  value: string | string[],
  now: string,
): Workspace {
  const node = byId(ws, id);
  if (!node || !isProblemElementType(node.type)) return ws;
  if (!isElementField(node.type, field)) return ws;
  return {
    ...ws,
    nodes: ws.nodes.map((entry) =>
      entry.id === id
        ? ({ ...entry, data: { ...(entry.data as Record<string, unknown>), [field]: value } } as AnyNode)
        : entry,
    ),
    meta: touch(ws, now),
  };
}

/* ---------- 解域（IMP3）：实体 / 行为 / 约束 / entityRelation / supportsQuestion ---------- */

/** 新建实体（01 §7 段头 `+`）：只写 type/id/pos；identity 允许先空着，由 C6 与详情兜底。 */
export function addEntity(
  ws: Workspace,
  input: { title?: string; pos?: Point; now: string },
): { ws: Workspace; id: NodeId } {
  const node = createNode(
    'entity',
    { title: input.title ?? '', data: { identity: '', fields: [], states: [] }, pos: input.pos },
    ws.nodes,
  );
  return {
    ws: { ...ws, nodes: [...ws.nodes, node], meta: touch(ws, input.now) },
    id: node.id,
  };
}

/** 新建行为并挂到实体（01 §7 行内 `+` 的一半，自动建 `behaviorOnEntity`）。 */
export function addBehavior(
  ws: Workspace,
  input: { title: string; entityId: NodeId; now: string },
): { ws: Workspace; id: NodeId | null } {
  const entity = byId(ws, input.entityId);
  if (!entity || entity.type !== 'entity') return { ws, id: null };
  const node = createNode(
    'behavior',
    { title: input.title, data: { inputs: [], output: '', preconditions: [], effects: [] } },
    ws.nodes,
  );
  const nodes = [...ws.nodes, node];
  const edges = [...ws.edges, createEdge('behaviorOnEntity', node.id, entity.id, nodes)];
  return {
    ws: { ...ws, nodes, edges, meta: touch(ws, input.now) },
    id: node.id,
  };
}

/** 新建约束并挂到实体：自动建 `constraintOnEntity`。 */
export function addConstraint(
  ws: Workspace,
  input: { title: string; entityId: NodeId; now: string },
): { ws: Workspace; id: NodeId | null } {
  const entity = byId(ws, input.entityId);
  if (!entity || entity.type !== 'entity') return { ws, id: null };
  const node = createNode(
    'constraint',
    { title: input.title, data: { expr: '', kind: '必须' } },
    ws.nodes,
  );
  const nodes = [...ws.nodes, node];
  const edges = [...ws.edges, createEdge('constraintOnEntity', node.id, entity.id, nodes)];
  return {
    ws: { ...ws, nodes, edges, meta: touch(ws, input.now) },
    id: node.id,
  };
}

/**
 * 连线建 `entityRelation`（01 §7.3「先选元素再建边」）：
 * 两端都必须是 entity，自环与重复边直接拒绝；关系名与基数缺省为「关系」/ 1:N。
 */
export function addEntityRelation(
  ws: Workspace,
  input: {
    source: NodeId;
    target: NodeId;
    label?: string;
    cardinality?: Cardinality;
    now: string;
  },
): { ws: Workspace; key: EdgeKey | null } {
  if (input.source === input.target) return { ws, key: null };
  const sourceNode = byId(ws, input.source);
  const targetNode = byId(ws, input.target);
  if (!sourceNode || sourceNode.type !== 'entity') return { ws, key: null };
  if (!targetNode || targetNode.type !== 'entity') return { ws, key: null };
  if (
    ws.edges.some(
      (edge) =>
        edge.type === 'entityRelation' &&
        edge.source === input.source &&
        edge.target === input.target,
    )
  ) {
    return { ws, key: null };
  }
  const edge: Edge = {
    ...createEdge('entityRelation', input.source, input.target, ws.nodes),
    cardinality: input.cardinality ?? '1:N',
    label: input.label ?? '关系',
  };
  return {
    ws: { ...ws, edges: [...ws.edges, edge], meta: touch(ws, input.now) },
    key: edgeKey(edge),
  };
}

export function updateEntity(
  ws: Workspace,
  id: NodeId,
  patch: Partial<EntityData>,
  now: string,
): Workspace {
  return {
    ...ws,
    nodes: ws.nodes.map((node) =>
      node.id === id && node.type === 'entity'
        ? { ...node, data: { ...node.data, ...patch } }
        : node,
    ),
    meta: touch(ws, now),
  };
}

export function updateBehavior(
  ws: Workspace,
  id: NodeId,
  patch: Partial<BehaviorData>,
  now: string,
): Workspace {
  return {
    ...ws,
    nodes: ws.nodes.map((node) =>
      node.id === id && node.type === 'behavior'
        ? { ...node, data: { ...node.data, ...patch } }
        : node,
    ),
    meta: touch(ws, now),
  };
}

export function updateConstraint(
  ws: Workspace,
  id: NodeId,
  patch: Partial<ConstraintData>,
  now: string,
): Workspace {
  return {
    ...ws,
    nodes: ws.nodes.map((node) =>
      node.id === id && node.type === 'constraint'
        ? { ...node, data: { ...node.data, ...patch } }
        : node,
    ),
    meta: touch(ws, now),
  };
}

export function addEntityField(ws: Workspace, id: NodeId, now: string): Workspace {
  const node = byId(ws, id);
  if (!node || node.type !== 'entity') return ws;
  const fields: EntityField[] = [...(node.data.fields ?? []), { name: '', type: 'string' }];
  return updateEntity(ws, id, { fields }, now);
}

export function setEntityField(
  ws: Workspace,
  id: NodeId,
  index: number,
  patch: Partial<EntityField>,
  now: string,
): Workspace {
  const node = byId(ws, id);
  if (!node || node.type !== 'entity') return ws;
  const fields = (node.data.fields ?? []).map((field, position) =>
    position === index ? { ...field, ...patch } : field,
  );
  return updateEntity(ws, id, { fields }, now);
}

export function removeEntityField(ws: Workspace, id: NodeId, index: number, now: string): Workspace {
  const node = byId(ws, id);
  if (!node || node.type !== 'entity') return ws;
  return updateEntity(
    ws,
    id,
    { fields: (node.data.fields ?? []).filter((_, position) => position !== index) },
    now,
  );
}

/** 关系属性（关系名 / 基数）：键是 `type|source>target`，改属性不换键。 */
export function setEdgeProps(
  ws: Workspace,
  key: EdgeKey,
  patch: { label?: string; cardinality?: Cardinality },
  now: string,
): Workspace {
  let changed = false;
  const edges = ws.edges.map((edge) => {
    if (edgeKey(edge) !== key) return edge;
    changed = true;
    return { ...edge, ...patch };
  });
  return changed ? { ...ws, edges, meta: touch(ws, now) } : ws;
}

export function removeEdgeByKey(ws: Workspace, key: EdgeKey, now: string): Workspace {
  const edges = ws.edges.filter((edge) => edgeKey(edge) !== key);
  return edges.length === ws.edges.length ? ws : { ...ws, edges, meta: touch(ws, now) };
}

/**
 * 支撑关系（01 §4.3 / §6）：只有 entity | behavior | constraint → question 一条方向；
 * 类型不合法的组合直接拒绝，不造非法边（与 createEdge 的端点表一致）。
 */
export function setSupportsQuestion(
  ws: Workspace,
  elementId: NodeId,
  questionId: NodeId,
  on: boolean,
  now: string,
): Workspace {
  const element = byId(ws, elementId);
  const question = byId(ws, questionId);
  if (!element || !question) return ws;
  if (element.type !== 'entity' && element.type !== 'behavior' && element.type !== 'constraint') {
    return ws;
  }
  if (question.type !== 'question') return ws;
  const key = edgeKey({ type: 'supportsQuestion', source: elementId, target: questionId });
  const exists = ws.edges.some((edge) => edgeKey(edge) === key);
  if (on && !exists) {
    return {
      ...ws,
      edges: [...ws.edges, { type: 'supportsQuestion', source: elementId, target: questionId }],
      meta: touch(ws, now),
    };
  }
  if (!on && exists) {
    return {
      ...ws,
      edges: ws.edges.filter((edge) => edgeKey(edge) !== key),
      meta: touch(ws, now),
    };
  }
  return ws;
}

/** 清空工作区：保留工作区名与目标，节点、边、核心问题清零（一次 commit 一条撤销记录）。 */
export function clearWorkspace(ws: Workspace, now: string): Workspace {
  return {
    ...createWorkspace(now),
    name: ws.name,
    goal: ws.goal,
    viewports: { ...DEFAULT_VIEWPORT },
  };
}
