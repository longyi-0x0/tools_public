/**
 * 解域自测（node:test，无 DOM）：
 * - `entityRelation` 端点必须是 entity（domain 层与 createEdge 双重拒绝）
 * - `supportsQuestion` 只能从 entity/behavior/constraint 指向 question
 * - C6 命中 / 不命中（01 §5：没有 supportsQuestion 出边的解域元素，error）
 * 运行：`npm test`（或 `node src/domain/solve.test.ts`）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Workspace } from './types.ts';
import {
  addBehavior,
  addEntity,
  addEntityRelation,
  addQuestion,
  createEdge,
  createWorkspace,
  setSupportsQuestion,
} from './factory.ts';
import { buildIndex } from './normalize.ts';
import { runChecks, type CheckResult } from './checks/index.ts';

const NOW = '2026-11-17T00:00:00.000Z';

function base(): { ws: Workspace; q0: string; q1: string; e0: string; e1: string } {
  const start = createWorkspace(NOW);
  const root = addQuestion(start, { title: '如何正确处理选课？', now: NOW });
  const child = addQuestion(root.ws, { title: '选课资格如何判定？', parentId: root.id, now: NOW });
  const student = addEntity(child.ws, { title: '学生', now: NOW });
  const record = addEntity(student.ws, { title: '选课记录', now: NOW });
  return { ws: record.ws, q0: root.id, q1: child.id, e0: student.id, e1: record.id };
}

function run(ws: Workspace): CheckResult {
  return runChecks(ws, buildIndex(ws));
}

function c6Of(result: CheckResult): string[] {
  return result.findings.filter((finding) => finding.code === 'C6').map((finding) => finding.nodeIds[0] ?? '');
}

test('entityRelation 合法：两端都是 entity，写关系名与基数', () => {
  const { ws, e0, e1 } = base();
  const added = addEntityRelation(ws, {
    source: e0,
    target: e1,
    label: '持有',
    cardinality: '1:N',
    now: NOW,
  });
  assert.equal(added.key, `entityRelation|${e0}>${e1}`);
  const edges = added.ws.edges.filter((edge) => edge.type === 'entityRelation');
  assert.equal(edges.length, 1);
  assert.deepEqual(edges[0], {
    type: 'entityRelation',
    source: e0,
    target: e1,
    cardinality: '1:N',
    label: '持有',
  });
});

test('entityRelation 拒绝非 entity 端点：不写边，createEdge 直接抛', () => {
  const { ws, q0, e0, e1 } = base();
  assert.equal(addEntityRelation(ws, { source: q0, target: e1, now: NOW }).key, null);
  assert.equal(addEntityRelation(ws, { source: e0, target: q0, now: NOW }).key, null);
  assert.equal(addEntityRelation(ws, { source: e0, target: e0, now: NOW }).key, null);
  assert.equal(ws.edges.filter((edge) => edge.type === 'entityRelation').length, 0);
  assert.throws(() => createEdge('entityRelation', q0, e1, ws.nodes), /不允许/);
});

test('entityRelation 拒绝重复边', () => {
  const { ws, e0, e1 } = base();
  const first = addEntityRelation(ws, { source: e0, target: e1, now: NOW });
  const second = addEntityRelation(first.ws, { source: e0, target: e1, now: NOW });
  assert.equal(second.key, null);
  assert.equal(second.ws.edges.filter((edge) => edge.type === 'entityRelation').length, 1);
});

test('supportsQuestion 只能解域元素 → question', () => {
  const { ws, q0, q1, e0, e1 } = base();
  const on = setSupportsQuestion(ws, e0, q1, true, NOW);
  assert.deepEqual(
    on.edges.filter((edge) => edge.type === 'supportsQuestion'),
    [{ type: 'supportsQuestion', source: e0, target: q1 }],
  );
  // 问题 → 问题、实体 → 实体都不许
  assert.equal(setSupportsQuestion(ws, q1, q0, true, NOW), ws);
  assert.equal(setSupportsQuestion(ws, e0, e1, true, NOW), ws);
  // 摘掉
  assert.equal(
    setSupportsQuestion(on, e0, q1, false, NOW).edges.filter(
      (edge) => edge.type === 'supportsQuestion',
    ).length,
    0,
  );
});

test('C6 命中：每个未支撑的解域元素一条 error，文案与跳转按 01 §5', () => {
  const { ws, e0, e1 } = base();
  const behavior = addBehavior(ws, { title: '提交选课', entityId: e1, now: NOW });
  assert.ok(behavior.id);
  const result = run(behavior.ws);
  const hits = result.findings.filter((finding) => finding.code === 'C6');
  assert.deepEqual(hits.map((finding) => finding.nodeIds[0]).sort(), [e0, e1, behavior.id].sort());
  assert.equal(hits[0]?.severity, 'error');
  assert.equal(hits[0]?.message, '这个实体不支撑任何问题，先回答它为什么存在');
  assert.deepEqual(hits[0]?.goto.domain, 'solve');
  assert.equal(hits[0]?.goto.focus, 'checks');
});

test('C6 不命中：挂上 supportsQuestion 后从命中里消失', () => {
  const { ws, q0, q1, e0, e1 } = base();
  const result = run(ws);
  assert.deepEqual(c6Of(result), [e0, e1]);

  const studentSupported = setSupportsQuestion(ws, e0, q0, true, NOW);
  assert.deepEqual(c6Of(run(studentSupported)), [e1]);

  const both = setSupportsQuestion(studentSupported, e1, q1, true, NOW);
  assert.deepEqual(c6Of(run(both)), []);
  // 支撑到不存在的 question 不算支撑
  const dangling = {
    ...both,
    edges: [...both.edges, { type: 'supportsQuestion' as const, source: e0, target: 'q404' }],
  };
  assert.deepEqual(c6Of(run(dangling)), []);
});
