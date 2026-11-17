/**
 * 最小自测（node:test，无 DOM）：树增删改 + JSON 往返。
 * 运行：`npm test`（= node src/domain/doc.test.ts）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Workspace } from './types.ts';
import { createWorkspace, addQuestion, removeNode, renameNode, setQuestionStatus } from './factory.ts';
import { buildIndex, withDefaults } from './normalize.ts';
import { stableStringify } from './serialize.ts';

const NOW = '2026-11-17T00:00:00.000Z';

function seed(): { ws: Workspace; rootId: string } {
  const base = createWorkspace(NOW);
  const root = addQuestion(base, { title: '如何正确处理选课？', now: NOW });
  return { ws: root.ws, rootId: root.id };
}

test('建问题：落入 nodes 并成为核心问题', () => {
  const { ws, rootId } = seed();
  assert.equal(ws.nodes.length, 1);
  assert.equal(ws.coreQuestionId, rootId);
  assert.equal(ws.nodes[0]?.type, 'question');
  assert.equal(ws.nodes[0]?.data.status, '未澄清');
  assert.equal(ws.edges.length, 0);
});

test('建子问题：生成 decomposesTo 边，只继承 boundary、状态重置', () => {
  const { ws, rootId } = seed();
  const withBoundary: Workspace = {
    ...ws,
    nodes: ws.nodes.map((node) =>
      node.id === rootId && node.type === 'question'
        ? { ...node, data: { ...node.data, boundary: '只处理本科生选课', status: '已回答' } }
        : node,
    ),
  };
  const child = addQuestion(withBoundary, { title: '选课资格如何判定？', parentId: rootId, now: NOW });

  assert.equal(child.ws.nodes.length, 2);
  assert.deepEqual(child.ws.edges, [
    { type: 'decomposesTo', source: rootId, target: child.id },
  ]);
  const childNode = child.ws.nodes.find((node) => node.id === child.id);
  assert.equal(childNode?.type, 'question');
  assert.deepEqual(childNode?.type === 'question' ? childNode.data : null, {
    status: '未澄清',
    boundary: '只处理本科生选课',
  });

  const index = buildIndex(child.ws);
  assert.deepEqual([...(index.childrenOf.get(rootId) ?? [])], [child.id]);
  assert.deepEqual([...(index.parentsOf.get(child.id) ?? [])], [rootId]);
  assert.equal(index.codes.get(rootId), 'P0');
  assert.equal(index.codes.get(child.id), 'P1');
});

test('删父问题：子问题保留且边消失，coreQuestionId 置空', () => {
  const { ws, rootId } = seed();
  const child = addQuestion(ws, { title: '选课资格如何判定？', parentId: rootId, now: NOW });
  const removed = removeNode(child.ws, rootId, NOW);

  assert.equal(removed.ws.nodes.length, 1);
  assert.equal(removed.ws.nodes[0]?.id, child.id);
  assert.deepEqual(removed.ws.edges, []);
  assert.equal(removed.ws.coreQuestionId, null);
  assert.equal(removed.removedEdges, 1);
  assert.deepEqual(removed.orphanedChildren, [child.id]);

  const index = buildIndex(removed.ws);
  assert.equal(index.childrenOf.size, 0);
  assert.equal(index.parentsOf.size, 0);
});

test('改名与状态：改名拒绝空标题，状态可流转', () => {
  const { ws, rootId } = seed();
  assert.equal(renameNode(ws, rootId, '   ', NOW), ws);
  const renamed = renameNode(ws, rootId, '  如何正确处理选课（改名）  ', NOW);
  assert.equal(renamed.nodes[0]?.title, '如何正确处理选课（改名）');
  const answered = setQuestionStatus(renamed, rootId, '已回答', NOW);
  assert.equal(
    answered.nodes[0]?.type === 'question' ? answered.nodes[0].data.status : null,
    '已回答',
  );
});

test('JSON 往返不丢字段（含 viewports / meta / 边）', () => {
  const { ws, rootId } = seed();
  const child = addQuestion(ws, { title: '容量检查', parentId: rootId, now: NOW });
  const roundTrip = JSON.parse(JSON.stringify(child.ws)) as Workspace;
  assert.deepEqual(roundTrip, child.ws);
  assert.equal(stableStringify(roundTrip), stableStringify(child.ws));

  const normalized = withDefaults(roundTrip);
  assert.equal(normalized.schemaVersion, 2);
  assert.equal(normalized.nodes.length, 2);
  assert.deepEqual(normalized.viewports.problem, { x: 0, y: 0, zoom: 1 });
  assert.equal(normalized.meta.updatedAt, NOW);
});
