/**
 * 解域 store 自测（node:test，无 DOM）：
 * - 新建/删除/连线各进一次撤销栈（一次操作一条记录）
 * - 解域视口独立于问题域，切域不丢各自选中
 * 运行：`npm test`（或 `node src/store/solve.test.ts`）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Workspace } from '../domain/types.ts';
import { addQuestion, createWorkspace } from '../domain/factory.ts';
import { getDocState, getHistoryState, initDoc, undo } from './docStore.ts';
import {
  createBehavior,
  createEntityAt,
  createRelation,
  deleteSolveNode,
  select,
  setDomain,
  setView,
  toggleSupport,
} from './commands.ts';
import { getUiState, setUi } from './uiStore.ts';

const NOW = '2026-11-17T00:00:00.000Z';

function base(): { ws: Workspace; q0: string; q1: string } {
  const start = createWorkspace(NOW);
  const root = addQuestion(start, { title: '如何正确处理选课？', now: NOW });
  const child = addQuestion(root.ws, { title: '选课资格如何判定？', parentId: root.id, now: NOW });
  return { ws: child.ws, q0: root.id, q1: child.id };
}

function setup(): { q0: string; q1: string } {
  const seeded = base();
  initDoc(seeded.ws);
  return { q0: seeded.q0, q1: seeded.q1 };
}

function entityCount(): number {
  return getDocState().ws.nodes.filter((node) => node.type === 'entity').length;
}

test('新建实体进撤销栈：一次操作一条记录，undo 回滚', () => {
  setup();
  assert.equal(getHistoryState().stack.length, 0);
  const id = createEntityAt({ x: 40, y: 60 });
  assert.ok(id);
  assert.equal(entityCount(), 1);
  assert.equal(getHistoryState().stack.length, 1);
  assert.equal(getHistoryState().stack[0]?.label, '新建实体');

  undo();
  assert.equal(entityCount(), 0);
  assert.equal(getHistoryState().stack.length, 0);
});

test('连线落库：edges 里出现 entityRelation，端点都是 entity，一条撤销记录', () => {
  setup();
  const a = createEntityAt({ x: 40, y: 60 });
  const b = createEntityAt({ x: 320, y: 60 });
  assert.ok(a && b);
  const before = getHistoryState().stack.length;

  const key = createRelation(a, b);
  assert.equal(key, `entityRelation|${a}>${b}`);
  const ws = getDocState().ws;
  const edge = ws.edges.find((entry) => entry.type === 'entityRelation');
  assert.ok(edge);
  assert.equal(edge.cardinality, '1:N');
  assert.equal(edge.label, '关系');
  assert.equal(ws.nodes.find((node) => node.id === edge.source)?.type, 'entity');
  assert.equal(ws.nodes.find((node) => node.id === edge.target)?.type, 'entity');
  assert.equal(getHistoryState().stack.length, before + 1);
  assert.equal(getHistoryState().stack[before]?.label, '新建关系');

  undo();
  assert.equal(
    getDocState().ws.edges.filter((entry) => entry.type === 'entityRelation').length,
    0,
  );
  assert.equal(entityCount(), 2);
});

test('非法连线（非 entity 端点）不写文档、不进撤销栈', () => {
  const { q0 } = setup();
  const a = createEntityAt({ x: 40, y: 60 });
  assert.ok(a);
  const before = getHistoryState().stack.length;
  assert.equal(createRelation(q0, a), null);
  assert.equal(createRelation(a, q0), null);
  assert.equal(getHistoryState().stack.length, before);
  assert.equal(
    getDocState().ws.edges.filter((entry) => entry.type === 'entityRelation').length,
    0,
  );
});

test('删除实体级联删行为：只算一条记录，undo 后关系与行为一起回来', () => {
  setup();
  const a = createEntityAt({ x: 40, y: 60 });
  const b = createEntityAt({ x: 320, y: 60 });
  assert.ok(a && b);
  createRelation(a, b);
  const behaviorId = createBehavior(a, '提交选课');
  assert.ok(behaviorId);
  const before = getHistoryState().stack.length;

  deleteSolveNode(a);
  assert.equal(getHistoryState().stack.length, before + 1);
  assert.equal(getHistoryState().stack[before]?.label, '删除实体');
  const after = getDocState().ws;
  assert.equal(after.nodes.filter((node) => node.id === a).length, 0);
  assert.equal(after.edges.filter((edge) => edge.source === a || edge.target === a).length, 0);
  assert.equal(after.nodes.filter((node) => node.id === behaviorId).length, 0);

  undo();
  assert.equal(entityCount(), 2);
  assert.equal(
    getDocState().ws.edges.filter((edge) => edge.type === 'entityRelation').length,
    1,
  );
  assert.equal(
    getDocState().ws.nodes.filter((node) => node.id === behaviorId).length,
    1,
    'undo 后级联删掉的行为跟着实体一起回来',
  );
});

test('挂/摘 supportsQuestion 各一条记录；非法方向零记录', () => {
  const { q0 } = setup();
  const a = createEntityAt({ x: 40, y: 60 });
  assert.ok(a);
  const before = getHistoryState().stack.length;

  toggleSupport(a, q0, true);
  assert.equal(getHistoryState().stack.length, before + 1);
  assert.equal(
    getDocState().ws.edges.filter((edge) => edge.type === 'supportsQuestion').length,
    1,
  );

  toggleSupport(a, q0, false);
  assert.equal(getHistoryState().stack.length, before + 2);
  assert.equal(
    getDocState().ws.edges.filter((edge) => edge.type === 'supportsQuestion').length,
    0,
  );

  toggleSupport(q0, a, true);
  assert.equal(getHistoryState().stack.length, before + 2);
});

test('解域视口独立：切域不丢各自选中、不动另一域视口', () => {
  const { q0 } = setup();
  // 本文件前面的用例会留下选中态，这里显式归零，保证断言与执行顺序无关。
  setUi({
    domain: 'problem',
    selectedId: null,
    selection: { problem: null, solve: null },
    selectedEdgeKey: null,
    connect: null,
    drag: null,
    solveDraft: false,
    views: {
      problem: { x: 48, y: 48, zoom: 1 },
      solve: { x: 48, y: 48, zoom: 1 },
    },
  });
  setDomain('problem');
  select(q0);
  setView({ x: 100, y: 20, zoom: 1.5 });
  const problemView = { ...getUiState().views.problem };
  assert.deepEqual(problemView, { x: 100, y: 20, zoom: 1.5 });

  setDomain('solve');
  assert.deepEqual(getUiState().views.solve, { x: 48, y: 48, zoom: 1 });
  assert.notDeepEqual(getUiState().views.solve, problemView);
  assert.equal(getUiState().selectedId, null);

  const entity = createEntityAt({ x: 10, y: 10 });
  assert.ok(entity);
  assert.equal(getUiState().selectedId, entity);

  setView({ x: 5, y: 5, zoom: 0.8 });
  assert.deepEqual(getUiState().views.problem, problemView);
  assert.deepEqual(getUiState().views.solve, { x: 5, y: 5, zoom: 0.8 });

  setDomain('problem');
  assert.equal(getUiState().selectedId, q0);
  assert.deepEqual(getUiState().views.problem, problemView);

  setDomain('solve');
  assert.equal(getUiState().selectedId, entity);
  assert.deepEqual(getUiState().views.solve, { x: 5, y: 5, zoom: 0.8 });
});
