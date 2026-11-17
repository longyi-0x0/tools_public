/**
 * 检查引擎（04 §6，文案逐字取 01 §5）。
 *
 * 本轮实现 C1–C6；C6 是解域的孤儿检测（01 §5 / §6.4）。
 * 严重度只有两档 `error` / `warning`（Router 已裁决；04 里的 `hint` 不再产出）。
 * 触发时机由 docStore 保证：每次 commit 同步全量重算；同一 `fingerprint` 复用上一次结果。
 */
import type { DocIndex, Domain, EdgeKey, NodeId, Severity, Workspace } from '../types.ts';
import { edgeKey } from '../schema.ts';

export type CheckCode = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6';

export interface Finding {
  code: CheckCode;
  severity: Severity;
  message: string;
  nodeIds: readonly NodeId[];
  edgeKeys: readonly EdgeKey[];
  goto: { domain: Domain; nodeId: NodeId | null; focus?: 'tree' | 'cases' | 'assumptions' | 'checks' };
}

export interface CheckResult {
  findings: readonly Finding[];
  byNode: ReadonlyMap<NodeId, readonly CheckCode[]>;
  counts: { error: number; warning: number };
  fingerprint: string;
}

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1 };

function make(
  code: CheckCode,
  severity: Severity,
  message: string,
  nodeIds: readonly NodeId[] = [],
  edgeKeys: readonly EdgeKey[] = [],
  goto: Finding['goto'] = { domain: 'problem', nodeId: null },
): Finding {
  return { code, severity, message, nodeIds, edgeKeys, goto };
}

function questionIds(ws: Workspace, index: DocIndex): NodeId[] {
  return ws.nodes
    .filter((node) => node.type === 'question' && index.byId.has(node.id))
    .map((node) => node.id);
}

/** C1：核心问题为空，或核心问题没有任何 `decomposesTo` 出边。 */
function checkC1(ws: Workspace, index: DocIndex): Finding[] {
  const coreId = ws.coreQuestionId;
  const core = coreId ? index.byId.get(coreId) : undefined;
  if (!core || core.type !== 'question') {
    return [make('C1', 'error', '核心问题还没写', [], [], { domain: 'problem', nodeId: null, focus: 'tree' })];
  }
  const kids = (index.childrenOf.get(core.id) ?? []).filter(
    (id) => index.byId.get(id)?.type === 'question',
  );
  if (kids.length === 0) {
    return [
      make('C1', 'error', '核心问题还没拆成子问题', [core.id], [], {
        domain: 'problem',
        nodeId: core.id,
        focus: 'tree',
      }),
    ];
  }
  return [];
}

/** C2：除核心问题外，某问题没有任何问题间边（decomposesTo / dependsOn，入出都算）。 */
function checkC2(ws: Workspace, index: DocIndex): Finding[] {
  const coreId = ws.coreQuestionId;
  const questionEdges = ws.edges.filter((edge) => {
    if (edge.type !== 'decomposesTo' && edge.type !== 'dependsOn') return false;
    return index.byId.has(edge.source) && index.byId.has(edge.target);
  });
  const findings: Finding[] = [];
  for (const id of questionIds(ws, index)) {
    if (id === coreId) continue;
    if (questionEdges.some((edge) => edge.source === id || edge.target === id)) continue;
    findings.push(
      make('C2', 'error', '这个问题跟别的问题都没关系', [id], [], {
        domain: 'problem',
        nodeId: id,
        focus: 'tree',
      }),
    );
  }
  return findings;
}

function cycleKey(cycle: readonly NodeId[]): string {
  let best = '';
  for (let i = 0; i < cycle.length; i += 1) {
    const rotated = [...cycle.slice(i), ...cycle.slice(0, i)].join('>');
    if (!best || rotated < best) best = rotated;
  }
  return best;
}

/** C3：`decomposesTo` 子图成环；迭代 DFS（显式栈），命中即返回环路径。 */
function checkC3(ws: Workspace, index: DocIndex): Finding[] {
  const adjacency = new Map<NodeId, NodeId[]>();
  for (const [parent, kids] of index.childrenOf) {
    if (index.byId.get(parent)?.type !== 'question') continue;
    adjacency.set(
      parent,
      kids.filter((kid) => index.byId.get(kid)?.type === 'question'),
    );
  }

  const state = new Map<NodeId, 1 | 2>();
  const cycles: NodeId[][] = [];
  const seen = new Set<string>();

  for (const start of questionIds(ws, index)) {
    if (state.has(start)) continue;
    const stack: Array<{ id: NodeId; kids: readonly NodeId[]; index: number }> = [];
    const path: NodeId[] = [];
    const enter = (id: NodeId): void => {
      state.set(id, 1);
      path.push(id);
      stack.push({ id, kids: adjacency.get(id) ?? [], index: 0 });
    };
    enter(start);

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      if (!frame) break;
      if (frame.index < frame.kids.length) {
        const kid = frame.kids[frame.index];
        frame.index += 1;
        if (kid === undefined) continue;
        const mark = state.get(kid);
        if (mark === 1) {
          const at = path.indexOf(kid);
          if (at >= 0) {
            const cycle = path.slice(at);
            const key = cycleKey(cycle);
            if (!seen.has(key)) {
              seen.add(key);
              cycles.push(cycle);
            }
          }
          continue;
        }
        if (mark === undefined) enter(kid);
        continue;
      }
      state.set(frame.id, 2);
      path.pop();
      stack.pop();
    }
  }

  const names = (id: NodeId): string => {
    const code = index.codes.get(id);
    const title = index.byId.get(id)?.title;
    return code ? code : title || id;
  };

  return cycles.map((cycle) => {
    const ids = [...cycle, cycle[0] ?? ''];
    const edges: EdgeKey[] = [];
    for (let i = 0; i < cycle.length; i += 1) {
      const source = cycle[i];
      const target = cycle[(i + 1) % cycle.length];
      if (source && target) edges.push(edgeKey({ type: 'decomposesTo', source, target }));
    }
    return make(
      'C3',
      'error',
      `分解成环了：${ids.map((id) => names(id)).join(' → ')}`,
      cycle,
      edges,
      { domain: 'problem', nodeId: cycle[0] ?? null, focus: 'tree' },
    );
  });
}

/** C4：状态「已回答」但正例或反例至少一边为空。 */
function checkC4(ws: Workspace, index: DocIndex): Finding[] {
  const findings: Finding[] = [];
  for (const id of questionIds(ws, index)) {
    const node = index.byId.get(id);
    if (!node || node.type !== 'question') continue;
    if (node.data.status !== '已回答') continue;
    const positive = (node.data.positiveCases ?? []).filter((line) => line.trim().length > 0);
    const negative = (node.data.negativeCases ?? []).filter((line) => line.trim().length > 0);
    if (positive.length > 0 && negative.length > 0) continue;
    findings.push(
      make('C4', 'error', '已回答，但没有例子', [id], [], {
        domain: 'problem',
        nodeId: id,
        focus: 'cases',
      }),
    );
  }
  return findings;
}

/** C5：待澄清与假设未处理（warning），含 `constrainedByRule` 引用了已不存在的规则。 */
function checkC5(ws: Workspace, index: DocIndex): Finding[] {
  const findings: Finding[] = [];
  for (const id of questionIds(ws, index)) {
    const node = index.byId.get(id);
    if (!node || node.type !== 'question') continue;
    const assumptions = (node.data.assumptions ?? []).filter((line) => line.trim().length > 0);
    if (node.data.status === '未澄清') {
      const count = Math.max(assumptions.length, 1);
      findings.push(
        make('C5', 'warning', `还有 ${count} 条假设 / 待澄清没处理`, [id], [], {
          domain: 'problem',
          nodeId: id,
          focus: 'assumptions',
        }),
      );
    } else if (assumptions.length > 0) {
      findings.push(
        make('C5', 'warning', `还有 ${assumptions.length} 条假设没处理`, [id], [], {
          domain: 'problem',
          nodeId: id,
          focus: 'assumptions',
        }),
      );
    }
  }

  for (const edge of ws.edges) {
    if (edge.type !== 'constrainedByRule') continue;
    if (index.byId.has(edge.target)) continue;
    findings.push(
      make('C5', 'warning', '引用了不存在的规则', [edge.source], [edgeKey(edge)], {
        domain: 'problem',
        nodeId: edge.source,
        focus: 'checks',
      }),
    );
  }
  return findings;
}

/**
 * C6（01 §5）：解域的 entity / behavior / constraint 没有指向 question 的 `supportsQuestion` 出边。
 * 严重度按 01 §5 取 error；文案逐字取 01 §5。跳转落在解域该元素上。
 */
function checkC6(ws: Workspace, index: DocIndex): Finding[] {
  const findings: Finding[] = [];
  for (const node of ws.nodes) {
    if (node.type !== 'entity' && node.type !== 'behavior' && node.type !== 'constraint') continue;
    const targets = index.supportsByNode.get(node.id) ?? [];
    const supported = targets.some((id) => index.byId.get(id)?.type === 'question');
    if (supported) continue;
    findings.push(
      make('C6', 'error', '这个实体不支撑任何问题，先回答它为什么存在', [node.id], [], {
        domain: 'solve',
        nodeId: node.id,
        focus: 'checks',
      }),
    );
  }
  return findings;
}

const cache = new Map<string, CheckResult>();

/** 同一 fingerprint 直接复用（撤销 / redo 回同一份文档时省一次全量）。 */
export function runChecks(ws: Workspace, index: DocIndex): CheckResult {
  const cached = cache.get(index.fingerprint);
  if (cached) return cached;

  const findings = [
    ...checkC1(ws, index),
    ...checkC2(ws, index),
    ...checkC3(ws, index),
    ...checkC4(ws, index),
    ...checkC5(ws, index),
    ...checkC6(ws, index),
  ].sort((left, right) => {
    const bySeverity = SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity];
    if (bySeverity !== 0) return bySeverity;
    if (left.code !== right.code) return left.code < right.code ? -1 : 1;
    return left.nodeIds.join(',') < right.nodeIds.join(',') ? -1 : 1;
  });

  const byNode = new Map<NodeId, CheckCode[]>();
  for (const finding of findings) {
    for (const id of finding.nodeIds) {
      const codes = byNode.get(id) ?? [];
      if (!codes.includes(finding.code)) codes.push(finding.code);
      byNode.set(id, codes);
    }
  }

  const counts = {
    error: findings.filter((finding) => finding.severity === 'error').length,
    warning: findings.filter((finding) => finding.severity === 'warning').length,
  };

  const result: CheckResult = { findings, byNode, counts, fingerprint: index.fingerprint };
  cache.set(index.fingerprint, result);
  if (cache.size > 32) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return result;
}

export function clearCheckCache(): void {
  cache.clear();
}
