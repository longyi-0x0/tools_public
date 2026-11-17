/**
 * 拖动与撤销自测（node:test，无 DOM）：
 * 一次拖动（按下 → 多次移动 → 松手）只进一条撤销记录；同名 key 600ms 内合并。
 * 「Esc 取消拖动」不在这条命令层：它由画布的 dragGuard + restoreDragged 负责，
 * 三条用例在 src/ui/flow/dragCancel.test.ts（旧画布删掉后 cancelDrag 命令已无调用方，一并删除）。
 * 运行：`npm test`（或 `node src/store/drag.test.ts`）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Workspace } from '../domain/types.ts';
import { addQuestion, createWorkspace, renameNode } from '../domain/factory.ts';
import { commitDoc, getDocState, getHistoryState, initDoc, undo } from './docStore.ts';
import { beginDrag, dragTo, endDrag } from './commands.ts';

const NOW = '2026-11-17T00:00:00.000Z';

function setup(): { rootId: string; childId: string } {
  const base = createWorkspace(NOW);
  const root = addQuestion(base, { title: '如何正确处理选课？', now: NOW });
  const child = addQuestion(root.ws, { title: '选课资格如何判定？', parentId: root.id, now: NOW });
  initDoc(child.ws);
  return { rootId: root.id, childId: child.id };
}

function posOf(id: string): { x: number; y: number } {
  const node = getDocState().ws.nodes.find((entry) => entry.id === id);
  assert.ok(node);
  return { x: node.pos.x, y: node.pos.y };
}

test('一次拖动只产生一条撤销记录', () => {
  const { childId } = setup();
  assert.equal(getHistoryState().stack.length, 0);

  beginDrag(childId);
  for (let step = 1; step <= 5; step += 1) dragTo({ x: step * 10, y: step * 20 });
  // 拖动过程中：文档没变、撤销栈没长
  assert.equal(getHistoryState().stack.length, 0);
  assert.deepEqual(posOf(childId), { x: 0, y: 0 });

  endDrag();
  assert.equal(getHistoryState().stack.length, 1);
  assert.equal(getHistoryState().stack[0]?.label, '移动节点');
  assert.deepEqual(posOf(childId), { x: 50, y: 100 });

  undo();
  assert.deepEqual(posOf(childId), { x: 0, y: 0 });
  assert.equal(getHistoryState().stack.length, 0);
});

test('拖动后落回原点不产生记录（空操作不写栈）', () => {
  const { childId } = setup();
  beginDrag(childId);
  dragTo({ x: 0, y: 0 });
  endDrag();
  assert.equal(getHistoryState().stack.length, 0);
});

test('相邻同名 coalesceKey 在 600ms 内并成一条，超时则分条', () => {
  const { childId } = setup();
  const write = (title: string, at: number): void => {
    commitDoc((ws: Workspace) => renameNode(ws, childId, title, NOW), {
      label: '改标题',
      coalesceKey: `title:${childId}`,
      at,
    });
  };
  write('选课资格', 1000);
  write('选课资格 2', 1200);
  assert.equal(getHistoryState().stack.length, 1);

  write('选课资格 3', 5000);
  assert.equal(getHistoryState().stack.length, 2);
});
