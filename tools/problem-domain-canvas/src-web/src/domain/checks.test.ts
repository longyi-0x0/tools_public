/**
 * 检查引擎自测（node:test，无 DOM）：C1–C5 各自命中 / 不命中 + C6 占位恒 0。
 * 运行：`npm test`（或 `node src/domain/checks.test.ts`）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { AnyNodeOf, Edge, NodeId, QuestionData, Workspace } from './types.ts';
import { createWorkspace } from './factory.ts';
import { buildIndex } from './normalize.ts';
import { runChecks, type CheckResult } from './checks/index.ts';

const NOW = '2026-11-17T00:00:00.000Z';

function q(id: NodeId, title: string, data: QuestionData = {}): AnyNodeOf<'question'> {
  return { id, type: 'question', title, notes: '', data, pos: { x: 0, y: 0 } };
}

function wsOf(
  nodes: AnyNodeOf<'question'>[],
  edges: Edge[],
  core: NodeId | null = 'q0',
): Workspace {
  return { ...createWorkspace(NOW), name: '测试', coreQuestionId: core, nodes, edges };
}

function run(ws: Workspace): CheckResult {
  return runChecks(ws, buildIndex(ws));
}

function codes(result: CheckResult): string[] {
  return result.findings.map((finding) => finding.code);
}

const decomposed: Edge[] = [{ type: 'decomposesTo', source: 'q0', target: 'q1' }];

test('C1 未命中：核心问题有 decomposesTo 出边', () => {
  const result = run(wsOf([q('q0', '根'), q('q1', '子')], decomposed));
  assert.equal(codes(result).includes('C1'), false);
});

test('C1 命中：核心问题为空', () => {
  const result = run(wsOf([q('q0', '根')], [], null));
  const finding = result.findings.find((entry) => entry.code === 'C1');
  assert.ok(finding);
  assert.equal(finding.severity, 'error');
  assert.equal(finding.message, '核心问题还没写');
});

test('C1 命中：核心问题没有任何 decomposesTo 出边', () => {
  const result = run(wsOf([q('q0', '根')], []));
  const finding = result.findings.find((entry) => entry.code === 'C1');
  assert.ok(finding);
  assert.deepEqual(finding.nodeIds, ['q0']);
  assert.equal(finding.message, '核心问题还没拆成子问题');
});

test('C2 命中：非核心问题与任何问题都没有问题间边', () => {
  const result = run(
    wsOf([q('q0', '根'), q('q1', '子'), q('q9', '孤岛')], decomposed),
  );
  const finding = result.findings.find((entry) => entry.code === 'C2');
  assert.ok(finding);
  assert.deepEqual(finding.nodeIds, ['q9']);
  assert.equal(finding.severity, 'error');
});

test('C2 未命中：问题靠 dependsOn 入边挂住', () => {
  const result = run(
    wsOf(
      [q('q0', '根'), q('q1', '子'), q('q9', '孤岛')],
      [...decomposed, { type: 'dependsOn', source: 'q1', target: 'q9' }],
    ),
  );
  assert.equal(codes(result).includes('C2'), false);
});

test('C3 命中：decomposesTo 成环，给出环上节点与边', () => {
  const result = run(
    wsOf(
      [q('q0', '根'), q('q1', 'A'), q('q2', 'B')],
      [
        ...decomposed,
        { type: 'decomposesTo', source: 'q1', target: 'q2' },
        { type: 'decomposesTo', source: 'q2', target: 'q1' },
      ],
    ),
  );
  const finding = result.findings.find((entry) => entry.code === 'C3');
  assert.ok(finding);
  assert.equal(finding.severity, 'error');
  assert.deepEqual([...finding.nodeIds].sort(), ['q1', 'q2']);
  assert.equal(finding.edgeKeys.length, 2);
  assert.match(finding.message, /分解成环了/);
});

test('C3 未命中：树 + dependsOn 反向边不算环', () => {
  const result = run(
    wsOf(
      [q('q0', '根'), q('q1', 'A'), q('q2', 'B')],
      [
        ...decomposed,
        { type: 'decomposesTo', source: 'q1', target: 'q2' },
        { type: 'dependsOn', source: 'q2', target: 'q1' },
      ],
    ),
  );
  assert.equal(codes(result).includes('C3'), false);
});

test('C4 命中：已回答但缺反例；补齐后不命中', () => {
  const missing = run(
    wsOf(
      [q('q0', '根'), q('q1', '子', { status: '已回答', positiveCases: ['通过'] })],
      decomposed,
    ),
  );
  const finding = missing.findings.find((entry) => entry.code === 'C4');
  assert.ok(finding);
  assert.deepEqual(finding.nodeIds, ['q1']);
  assert.equal(finding.severity, 'error');

  const complete = run(
    wsOf(
      [
        q('q0', '根'),
        q('q1', '子', { status: '已回答', positiveCases: ['通过'], negativeCases: ['拒绝'] }),
      ],
      decomposed,
    ),
  );
  assert.equal(codes(complete).includes('C4'), false);
});

test('C5 命中：未澄清有问题，且假设未处理；严重度只有 warning', () => {
  const result = run(
    wsOf(
      [q('q0', '根'), q('q1', '子', { status: '未澄清', assumptions: ['假设容量固定'] })],
      decomposed,
    ),
  );
  const finding = result.findings.find((entry) => entry.code === 'C5');
  assert.ok(finding);
  assert.equal(finding.severity, 'warning');
  assert.deepEqual(finding.nodeIds, ['q1']);
  assert.match(finding.message, /1 条假设/);
});

test('C5 命中：constrainedByRule 引用了已不存在的规则', () => {
  const result = run(
    wsOf(
      [q('q0', '根'), q('q1', '子', { status: '已澄清' })],
      [...decomposed, { type: 'constrainedByRule', source: 'q1', target: 'r9' }],
    ),
  );
  const finding = result.findings.find(
    (entry) => entry.code === 'C5' && entry.message === '引用了不存在的规则',
  );
  assert.ok(finding);
  assert.deepEqual(finding.nodeIds, ['q1']);
  assert.deepEqual(finding.edgeKeys, ['constrainedByRule|q1>r9']);
});

test('C5 未命中：已澄清、无未处理假设、规则存在', () => {
  const base = wsOf(
    [q('q0', '根'), q('q1', '子', { status: '已澄清' })],
    [...decomposed, { type: 'constrainedByRule', source: 'q1', target: 'r1' }],
  );
  const withRule: Workspace = {
    ...base,
    nodes: [
      ...base.nodes,
      { id: 'r1', type: 'rule', title: '不得超容量', notes: '', data: { statement: '已选满即拒绝' }, pos: { x: 0, y: 0 } },
    ],
  };
  const result = run(withRule);
  assert.equal(codes(result).includes('C5'), false);
});

test('C6 未命中：只有问题节点时没有解域孤儿', () => {
  const result = run(
    wsOf([q('q0', '根'), q('q1', '子', { status: '已回答', positiveCases: ['a'], negativeCases: ['b'] })], decomposed),
  );
  assert.equal(codes(result).includes('C6'), false);
});

test('聚合：counts / byNode / fingerprint 与缓存', () => {
  const ws = wsOf(
    [q('q0', '根'), q('q1', '子', { status: '未澄清' }), q('q9', '孤岛')],
    decomposed,
  );
  const index = buildIndex(ws);
  const first = runChecks(ws, index);
  const second = runChecks(ws, index);
  assert.equal(first, second, '同一 fingerprint 复用上次结果');
  assert.equal(first.fingerprint, index.fingerprint);
  assert.equal(first.counts.error, 1); // C2（q9）
  assert.equal(first.counts.warning, 1); // C5（q1 未澄清）
  assert.deepEqual(first.byNode.get('q9'), ['C2']);
  assert.deepEqual(first.byNode.get('q1'), ['C5']);
});
