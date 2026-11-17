/**
 * 拖动中 Esc = 取消（IMPFIX2）：flow 画布把「按下记起点 → Esc 转取消 → 松手不提交」抽在
 * flow/dragCancel.ts，这里用 node:test 断死四件事：
 * 位置回起点、撤销栈零增长、文档里的 pos 没变、松手后不再误写回；没有拖动时 Esc 不误伤别的语义。
 * 运行：`npm test`（或 `node src/ui/flow/dragCancel.test.ts`）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { addQuestion, createWorkspace } from '../../domain/factory.ts';
import { getDocState, getHistoryState, initDoc } from '../../store/docStore.ts';
import { createDragGuard, restoreDragged } from './dragCancel.ts';

const NOW = '2026-11-17T00:00:00.000Z';

function setup(): { id: string; otherId: string; start: { x: number; y: number } } {
  const base = createWorkspace(NOW);
  const root = addQuestion(base, { title: '如何正确处理选课？', now: NOW });
  const other = addQuestion(root.ws, { title: '选课资格如何判定？', parentId: root.id, now: NOW });
  initDoc(other.ws);
  return { id: root.id, otherId: other.id, start: { x: 0, y: 0 } };
}

function posOf(id: string): { x: number; y: number } {
  const node = getDocState().ws.nodes.find((entry) => entry.id === id);
  assert.ok(node);
  return { x: node.pos.x, y: node.pos.y };
}

test('拖动中 Esc：节点回起点、撤销栈 0 条、文档 pos 未变', () => {
  const { id, otherId, start } = setup();
  const guard = createDragGuard();
  guard.begin(id, start); // 按下：只记起点，不碰 uiStore、不进撤销栈

  // 拖动中：位置只在库内部变（这里用库回调里会拿到的坐标模拟），文档仍是起点
  const dragged = { x: 240, y: 180 };
  assert.deepEqual(posOf(id), start);
  assert.equal(getHistoryState().stack.length, 0);

  // Esc：拿到起点，并把库里的节点放回起点（其余节点不动）
  const cancelled = guard.cancel();
  assert.ok(cancelled);
  assert.deepEqual(cancelled, { id, pos: start });
  const restored = restoreDragged(
    [
      { id, position: dragged },
      { id: otherId, position: { x: 300, y: 40 } },
    ],
    cancelled,
  );
  assert.deepEqual(restored[0]?.position, start);
  assert.deepEqual(restored[1]?.position, { x: 300, y: 40 });

  // 指针抬起：库照样回调 onNodeDragStop，但 settle() 返回 null → 画布不提交
  assert.equal(guard.settle(), null);
  assert.equal(getHistoryState().stack.length, 0);
  assert.deepEqual(posOf(id), start);
});

test('取消后松手不再回写；下一次拖动照常拿到起点可提交', () => {
  const { id, start } = setup();
  const guard = createDragGuard();
  guard.begin(id, start);
  assert.ok(guard.cancel());
  assert.equal(guard.settle(), null); // 第一次松手：不提交
  assert.equal(guard.settle(), null); // 再松一次也不写回（状态已清）
  assert.equal(getHistoryState().stack.length, 0);
  assert.deepEqual(posOf(id), start);

  guard.begin(id, start);
  guard.begin(id, start); // 重复按下不叠状态
  assert.deepEqual(guard.settle(), { id, pos: start }); // 这次没 Esc：允许提交
});

test('没有拖动时 Esc 返回 null（连线模式的 Esc 各管各的）', () => {
  const guard = createDragGuard();
  assert.equal(guard.cancel(), null);
  assert.equal(guard.active(), false);
  assert.equal(guard.settle(), null);

  const { id, start } = setup();
  guard.begin(id, start);
  assert.equal(guard.active(), true);
  guard.settle();
  assert.equal(guard.active(), false);
  assert.equal(guard.cancel(), null);
});
