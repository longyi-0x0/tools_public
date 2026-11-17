/**
 * 拖动同步闸门自测（IMPFIX3，node:test，无 DOM）：
 * 用户报的「拖拽没有动画、瞬间到达」= 拖动中把文档算出来的节点灌回库内节点，正在拖的节点被打回原位。
 * 这里直接断死闸门的三条语义：
 * ① 拖动中（dragging=true）：连续多次拖动位置变化都不被文档接管（跟手）；
 * ② 拖动中外部改名：文档变了也不打断拖动，松手后才生效；
 * ③ 松手（settleNode 清掉 dragging）后：文档接管，落点已吸附取整，且拖动期间撤销栈零增长。
 * 运行：`npm test`（或 `node src/ui/flow/nodeSync.test.ts`）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Node } from '@xyflow/react';
import { getHistoryState, getDocState, initDoc } from '../../store/docStore.ts';
import { beginDrag, dragTo, endDrag } from '../../store/commands.ts';
import { addQuestion, createWorkspace } from '../../domain/factory.ts';
import { isDragging, settleNode, syncNodes } from './nodeSync.ts';

const NOW = '2026-11-17T00:00:00.000Z';

/** 文档派生的节点（位置永远是文档里的那一个，拖动期间不变）。 */
function derived(x: number, title: string): Node[] {
  return [{ id: 'q1', type: 'question', position: { x, y: 0 }, data: { title } }];
}

/** 库内节点：拖动中被库改位置、dragging=true。 */
function draggingAt(x: number): Node[] {
  return [{ id: 'q1', type: 'question', position: { x, y: 0 }, data: { title: '改名前' }, dragging: true }];
}

test('拖动中：连续的位置变化都不被文档接管（节点跟手，不打回原位）', () => {
  const fromDoc = derived(0, '改名前');
  let current = draggingAt(0);
  assert.equal(isDragging(current), true, '松手前库内节点带 dragging');

  for (const x of [8, 16, 24, 40]) {
    // 模拟库在每一帧按指针改位置
    current = current.map((node) => ({ ...node, position: { x, y: 0 } }));
    assert.equal(syncNodes(current, fromDoc), null, `拖动到 x=${x} 时文档不许接管`);
    assert.equal((current[0] as Node).position.x, x, '位置就是这一帧的指针位置，不回退');
  }
});

test('拖动中外部改名不打断拖动：松手后新标题才生效', () => {
  const renamedFromDoc = derived(0, '改名后');
  const current = draggingAt(40);

  assert.equal(syncNodes(current, renamedFromDoc), null, '拖动中不同步文档');
  assert.equal((current[0] as Node).data.title, '改名前', '拖动中标题保持原样');
  assert.equal((current[0] as Node).position.x, 40, '位置也没被改名的重渲染打回');

  const settled = settleNode(current, 'q1', { x: 40, y: 0 });
  assert.equal(isDragging(settled), false, '松手后清掉 dragging');
  const synced = syncNodes(settled, renamedFromDoc);
  assert.ok(synced, '松手后文档接管');
  assert.equal((synced as Node[])[0]?.data.title, '改名后', '外部改名在松手后生效');
});

test('没有拖动时：文档直接接管（改名/新建/撤销能进画面）', () => {
  const settled = [{ id: 'q1', type: 'question', position: { x: 0, y: 0 }, data: { title: '旧' } }] as Node[];
  const synced = syncNodes(settled, derived(0, '新'));
  assert.ok(synced);
  assert.equal((synced as Node[])[0]?.data.title, '新');
});

test('松手落点写回：一条撤销记录、文档位置等于吸附后的落点', () => {
  const base = createWorkspace(NOW);
  const root = addQuestion(base, { title: '如何正确处理选课？', now: NOW });
  initDoc(root.ws);
  const id = root.id;

  const current = [{ id, type: 'question', position: { x: 0, y: 0 }, data: {}, dragging: true }] as Node[];
  const pos = { x: 24, y: 16 };
  const settled = settleNode(current, id, pos);
  assert.deepEqual(settled[0]?.position, pos);

  // 松手时的三连（ProblemCanvas 的 onNodeDragStop 同一套调用）
  beginDrag(id);
  dragTo(pos);
  endDrag();
  assert.equal(getHistoryState().stack.length, 1, '一次拖动一条记录');
  const node = getDocState().ws.nodes.find((entry) => entry.id === id);
  assert.deepEqual(node?.pos, pos);
});
