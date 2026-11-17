/** withDefaults + buildIndex（04 §2.1 / §1.3）：纯函数，载入与每次 commit 都走这里。 */
import type {
  AnyNode,
  DocIndex,
  Edge,
  EdgeKey,
  NodeId,
  NodeType,
  Point,
  QuestionStatus,
  Viewport,
  Workspace,
} from './types.ts';
import { SCHEMA_VERSION } from './types.ts';
import { DEFAULT_VIEWPORT, QUESTION_STATUSES, edgeKey } from './schema.ts';
import { fingerprint } from './serialize.ts';

function isPoint(value: unknown): value is Point {
  if (!value || typeof value !== 'object') return false;
  const point = value as Record<string, unknown>;
  return Number.isFinite(point['x']) && Number.isFinite(point['y']);
}

function asStatus(value: unknown): QuestionStatus {
  return QUESTION_STATUSES.includes(value as QuestionStatus)
    ? (value as QuestionStatus)
    : '未澄清';
}

function normalizeNode(raw: AnyNode): AnyNode {
  const node = raw as unknown as Record<string, unknown>;
  const rawPos = node['pos'];
  const pos = isPoint(rawPos) ? { x: rawPos.x, y: rawPos.y } : { x: 0, y: 0 };
  const rawData = node['data'];
  const data: Record<string, unknown> =
    rawData && typeof rawData === 'object' && !Array.isArray(rawData)
      ? (rawData as Record<string, unknown>)
      : {};

  const base: Record<string, unknown> = {
    ...node,
    title: typeof node['title'] === 'string' ? node['title'] : '',
    notes: typeof node['notes'] === 'string' ? node['notes'] : '',
    pos,
    data,
  };
  if (raw.type === 'question') {
    base['data'] = { ...data, status: asStatus(data['status']) };
  }
  return base as unknown as AnyNode;
}

function normalizeViewport(raw: unknown): Viewport {
  if (isPoint(raw)) {
    const zoom = Number((raw as unknown as Record<string, unknown>)['zoom']);
    return { x: raw.x, y: raw.y, zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : 1 };
  }
  return { x: 0, y: 0, zoom: 1 };
}

export function withDefaults(input: Workspace): Workspace {
  const raw = input as unknown as Record<string, unknown>;
  const nodes = Array.isArray(raw['nodes']) ? (raw['nodes'] as AnyNode[]).map(normalizeNode) : [];
  const edges = Array.isArray(raw['edges']) ? (raw['edges'] as Edge[]) : [];
  const viewportsRaw =
    raw['viewports'] && typeof raw['viewports'] === 'object'
      ? (raw['viewports'] as Record<string, unknown>)
      : {};
  const metaRaw =
    raw['meta'] && typeof raw['meta'] === 'object' ? (raw['meta'] as Record<string, unknown>) : {};
  const coreQuestionId = raw['coreQuestionId'];

  return {
    schemaVersion: SCHEMA_VERSION,
    name: typeof raw['name'] === 'string' && raw['name'] ? raw['name'] : '未命名工作区',
    goal: typeof raw['goal'] === 'string' ? raw['goal'] : '',
    coreQuestionId: typeof coreQuestionId === 'string' ? coreQuestionId : null,
    nodes,
    edges,
    viewports: {
      problem: normalizeViewport(viewportsRaw['problem'] ?? DEFAULT_VIEWPORT.problem),
      solve: normalizeViewport(viewportsRaw['solve'] ?? DEFAULT_VIEWPORT.solve),
    },
    meta: {
      createdAt: typeof metaRaw['createdAt'] === 'string' ? metaRaw['createdAt'] : '',
      updatedAt: typeof metaRaw['updatedAt'] === 'string' ? metaRaw['updatedAt'] : '',
    },
  };
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * 一次遍历建索引。树序只排问题树（coreQuestionId 起沿 decomposesTo 出边 DFS），
 * 环安全靠 visited；code 编号 P0 / P1 / P1.1（P0 的子节点按 P1、P2 编，见 03 §2.1）。
 */
export function buildIndex(ws: Workspace): DocIndex {
  const byId = new Map<NodeId, AnyNode>();
  for (const node of ws.nodes) {
    if (!byId.has(node.id)) byId.set(node.id, node);
  }

  const children = new Map<NodeId, NodeId[]>();
  const parents = new Map<NodeId, NodeId[]>();
  const incident = new Map<NodeId, EdgeKey[]>();
  const supports = new Map<NodeId, NodeId[]>();
  const supportIn = new Map<NodeId, NodeId[]>();
  const edgeByKey = new Map<EdgeKey, Edge>();

  for (const edge of ws.edges) {
    const key = edgeKey(edge);
    if (!edgeByKey.has(key)) edgeByKey.set(key, edge);
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue;

    push(incident, edge.source, key);
    push(incident, edge.target, key);

    if (edge.type === 'decomposesTo') {
      push(children, edge.source, edge.target);
      push(parents, edge.target, edge.source);
    }
    if (edge.type === 'supportsQuestion') {
      push(supports, edge.source, edge.target);
      push(supportIn, edge.target, edge.source);
    }
  }

  const order: NodeId[] = [];
  const codes = new Map<NodeId, string>();
  const seen = new Set<NodeId>();
  const core = ws.coreQuestionId;
  if (core && byId.has(core)) {
    const stack: Array<{ id: NodeId; code: string }> = [{ id: core, code: 'P0' }];
    while (stack.length > 0) {
      const frame = stack.pop();
      if (!frame) break;
      if (seen.has(frame.id)) continue;
      const node = byId.get(frame.id);
      if (!node || node.type !== 'question') continue;
      seen.add(frame.id);
      order.push(frame.id);
      codes.set(frame.id, frame.code);

      const kids = children.get(frame.id) ?? [];
      for (let i = kids.length - 1; i >= 0; i -= 1) {
        const kid = kids[i];
        if (!kid) continue;
        const kidCode = frame.code === 'P0' ? `P${i + 1}` : `${frame.code}.${i + 1}`;
        stack.push({ id: kid, code: kidCode });
      }
    }
  }

  return {
    byId,
    childrenOf: children,
    parentsOf: parents,
    edgesByNode: incident,
    edgeByKey,
    supportsByNode: supports,
    supportedBy: supportIn,
    questionsInTreeOrder: order,
    codes,
    fingerprint: fingerprint(ws),
  };
}

export function nodeTypeOf(ws: Workspace, id: NodeId): NodeType | null {
  const node = ws.nodes.find((entry) => entry.id === id);
  return node ? node.type : null;
}
