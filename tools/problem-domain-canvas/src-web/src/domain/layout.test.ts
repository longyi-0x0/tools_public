/**
 * 布局自测（node:test，无 DOM）：父子相对位置、同级不重叠、环输入不死循环、手动 pos 优先。
 * 运行：`npm test`（或 `node src/domain/layout.test.ts`）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { AnyNodeOf, Edge, NodeId, Workspace } from './types.ts';
import { createWorkspace } from './factory.ts';
import { buildIndex } from './normalize.ts';
import {
  CORE_W,
  GAP_X,
  QUESTION_W,
  ROW_H,
  layoutProblemTree,
  resolvePositions,
} from './layout.ts';

const NOW = '2026-11-17T00:00:00.000Z';

function question(id: NodeId, title: string): AnyNodeOf<'question'> {
  return { id, type: 'question', title, notes: '', data: { status: '未澄清' }, pos: { x: 0, y: 0 } };
}

function wsOf(
  core: NodeId | null,
  nodes: AnyNodeOf<'question'>[],
  edges: Edge[],
): Workspace {
  return { ...createWorkspace(NOW), coreQuestionId: core, nodes, edges };
}

test('父子相对位置：父在上、子在下，行距 = 卡高 + 纵向间距（96）', () => {
  const ws = wsOf('q0', [question('q0', '根'), question('q1', '子')], [
    { type: 'decomposesTo', source: 'q0', target: 'q1' },
  ]);
  const layout = layoutProblemTree(ws, buildIndex(ws));
  const parent = layout.positions.get('q0');
  const child = layout.positions.get('q1');
  assert.ok(parent && child);
  assert.equal(layout.depthOf.get('q0'), 0);
  assert.equal(layout.depthOf.get('q1'), 1);
  assert.equal(ROW_H, 96);
  assert.equal(child.y - parent.y, 96);
  assert.ok(child.y > parent.y);
});

test('同级水平排布不重叠，父节点居子节点中点', () => {
  const ws = wsOf(
    'q0',
    [question('q0', '根'), question('q1', '子一'), question('q2', '子二')],
    [
      { type: 'decomposesTo', source: 'q0', target: 'q1' },
      { type: 'decomposesTo', source: 'q0', target: 'q2' },
    ],
  );
  const layout = layoutProblemTree(ws, buildIndex(ws));
  const left = layout.positions.get('q1');
  const right = layout.positions.get('q2');
  const root = layout.positions.get('q0');
  assert.ok(left && right && root);
  assert.equal(left.y, right.y);
  assert.ok(Math.abs(right.x - left.x) >= QUESTION_W + GAP_X, '同级中心距至少 208');
  assert.equal(root.x, (left.x + right.x) / 2);
});

test('三层层级：孙节点在子节点下一行，仍不重叠', () => {
  const ws = wsOf(
    'q0',
    [question('q0', '根'), question('q1', '子'), question('q11', '孙一'), question('q12', '孙二')],
    [
      { type: 'decomposesTo', source: 'q0', target: 'q1' },
      { type: 'decomposesTo', source: 'q1', target: 'q11' },
      { type: 'decomposesTo', source: 'q1', target: 'q12' },
    ],
  );
  const layout = layoutProblemTree(ws, buildIndex(ws));
  const root = layout.positions.get('q0');
  const child = layout.positions.get('q1');
  const g1 = layout.positions.get('q11');
  const g2 = layout.positions.get('q12');
  assert.ok(root && child && g1 && g2);
  assert.equal(child.y - root.y, 96);
  assert.equal(g1.y - child.y, 96);
  assert.equal(g1.y, g2.y);
  assert.ok(Math.abs(g2.x - g1.x) >= QUESTION_W + GAP_X);
  assert.equal(child.x, (g1.x + g2.x) / 2);
});

test('环输入不死循环：A→B→A 与自环都只返回有限位置', () => {
  const ws = wsOf('q0', [question('q0', 'A'), question('q1', 'B')], [
    { type: 'decomposesTo', source: 'q0', target: 'q1' },
    { type: 'decomposesTo', source: 'q1', target: 'q0' },
    { type: 'decomposesTo', source: 'q1', target: 'q1' },
  ]);
  const layout = layoutProblemTree(ws, buildIndex(ws));
  assert.equal(layout.positions.size, 2);
  const a = layout.positions.get('q0');
  const b = layout.positions.get('q1');
  assert.ok(a && b);
  assert.notEqual(a.y, b.y);
});

test('确定性：同一输入两次布局结果完全相同', () => {
  const ws = wsOf('q0', [question('q0', '根'), question('q1', '子一'), question('q2', '子二')], [
    { type: 'decomposesTo', source: 'q0', target: 'q1' },
    { type: 'decomposesTo', source: 'q0', target: 'q2' },
  ]);
  const index = buildIndex(ws);
  const left = layoutProblemTree(ws, index);
  const right = layoutProblemTree(ws, index);
  assert.deepEqual([...left.positions], [...right.positions]);
});

test('手动 pos 优先：拖过的节点用 pos，未拖过的按布局换算左上角', () => {
  const base = wsOf('q0', [question('q0', '根'), question('q1', '子')], [
    { type: 'decomposesTo', source: 'q0', target: 'q1' },
  ]);
  const moved: Workspace = {
    ...base,
    nodes: base.nodes.map((node) =>
      node.id === 'q1' ? { ...node, pos: { x: 500, y: 300 } } : node,
    ),
  };
  const index = buildIndex(moved);
  const layout = layoutProblemTree(moved, index);
  const positions = resolvePositions(moved, index, layout);

  assert.deepEqual(positions.get('q1'), { x: 500, y: 300 });
  const root = positions.get('q0');
  const center = layout.positions.get('q0');
  assert.ok(root && center);
  assert.equal(root.x, Math.round(center.x - CORE_W / 2));
  assert.equal(root.y, Math.round(center.y - 56 / 2));
});
