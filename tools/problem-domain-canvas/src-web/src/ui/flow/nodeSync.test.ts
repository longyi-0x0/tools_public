/**
 * 拖动同步闸门自测（IMPFIX3，node:test，无 DOM）：
 * 用户报的「拖拽没有动画、瞬间到达」= 拖动中把文档算出来的节点灌回库内节点，正在拖的节点被打回原位。
 * 这里直接断死闸门的三条语义：
 * ① 拖动中（dragging=true）：连续多次拖动位置变化都不被文档接管（跟手）；
 * ② 拖动中外部改名：文档变了也不打断拖动，松手后才生效；
 * ③ 松手（settleNode 清掉 dragging）后：文档接管，落点已吸附取整，且拖动期间撤销栈零增长。
 * ④ FIX4「每次落子整个画板刷一下」：合并必须**保住未变节点的对象引用**（拖一个只产生 1 个新引用），
 *    内容全没变时返回 null（不 setState，否则 setNodes→effect→setNodes 转不停）；
 *    另外用源码守卫钉死 nodeTypes / edgeTypes 是模块级常量、画板不许内联对象、effect 不许依赖 nodes。
 * 运行：`npm test`（或 `node src/ui/flow/nodeSync.test.ts`）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

/** 文档派生的两节点数组：每次调用都是**全新对象**（模拟 toProblemFlow 每次重算）。 */
function twoDocNodes(a: { x: number; y: number }, b: { x: number; y: number }, checks: string[] = ['C1']): Node[] {
  return [
    {
      id: 'q1',
      type: 'question',
      position: a,
      data: { title: '一问', code: '1', checks, links: [{ id: 'e1', title: '教务老师' }] },
      style: { width: 180, height: 64 },
    },
    {
      id: 'q2',
      type: 'question',
      position: b,
      data: { title: '二问', code: '2', checks: ['C2'], links: [] },
      style: { width: 180, height: 64 },
    },
  ];
}

test('FIX4 引用稳定：拖一个节点后只有 1 个节点换新引用，其余沿用旧对象', () => {
  // 首次接管：库内为空 → 全部用文档节点
  const first = syncNodes([], twoDocNodes({ x: 0, y: 0 }, { x: 0, y: 120 }));
  assert.ok(first, '首次接管返回数组');
  const before = first as Node[];

  // 落子：文档里 q1 位置变了，整体重算（q2 的对象是新建的，但内容一样）
  const after = syncNodes(before, twoDocNodes({ x: 8, y: 16 }, { x: 0, y: 120 }));
  assert.ok(after, '有一次真变化 → 返回新数组');
  const merged = after as Node[];

  const fresh = merged.filter((node, index) => node !== before[index]);
  console.log(`[FIX4] 2 个节点，拖 q1 落子后新引用数 = ${fresh.length}，沿用旧引用 = ${merged.length - fresh.length}`);
  assert.equal(fresh.length, 1, '只有被拖的那一个节点换新引用（改回 [...derived] 会变成 2）');
  assert.equal(fresh[0]?.id, 'q1', '换引用的是被拖的节点');
  assert.equal(merged[1], before[1], '没动过的 q2 保持原对象引用');
  assert.deepEqual(merged[0]?.position, { x: 8, y: 16 }, '落点确实写进了新对象');
});

test('FIX4 无变化返回 null：内容一样就不 setState（打断 setNodes→effect→setNodes 的重渲染环）', () => {
  const first = syncNodes([], twoDocNodes({ x: 0, y: 0 }, { x: 0, y: 120 })) as Node[];
  // 同一份文档再算一遍：data/style/position 全是新对象但内容一致
  assert.equal(syncNodes(first, twoDocNodes({ x: 0, y: 0 }, { x: 0, y: 120 })), null);
});

test('FIX4 检查码深比较：checks 每次是新数组但内容不变 → 引用不动（不把 checks 数组塞进比较键）', () => {
  const first = syncNodes([], twoDocNodes({ x: 0, y: 0 }, { x: 0, y: 120 }, ['C1', 'C3'])) as Node[];
  const again = syncNodes(first, twoDocNodes({ x: 0, y: 0 }, { x: 0, y: 120 }, ['C1', 'C3']));
  assert.equal(again, null, '同内容的新数组不算变化');
  // 真的多了一条检查码 → 只有 q1 换引用
  const changed = syncNodes(first, twoDocNodes({ x: 0, y: 0 }, { x: 0, y: 120 }, ['C1', 'C3', 'C6'])) as Node[];
  assert.equal(changed.filter((node, index) => node !== first[index]).length, 1, '只有检查码变了的那条换引用');
});

test('FIX4 源码守卫：nodeTypes / edgeTypes 是模块级常量，画板里不许内联，effect 不许依赖 nodes', () => {
  const here = new URL('.', import.meta.url);
  const read = (name: string): string => readFileSync(new URL(name, here), 'utf8');
  const nodes = read('nodes.tsx');
  const edges = read('edges.tsx');
  assert.match(nodes, /export const nodeTypes = \{ question: QuestionNode, entity: EntityNode \}/, 'nodeTypes 必须模块级导出');
  assert.match(edges, /export const edgeTypes = \{ pdc: PdcEdge \}/, 'edgeTypes 必须模块级导出');

  for (const file of ['../ProblemCanvas.tsx', '../SolveFlowCanvas.tsx']) {
    const source = read(file);
    assert.match(source, /nodeTypes=\{nodeTypes\}/, `${file} 必须引用模块级常量`);
    assert.match(source, /edgeTypes=\{edgeTypes\}/, `${file} 必须引用模块级常量`);
    assert.doesNotMatch(source, /nodeTypes=\{\{/, `${file}: 内联对象每次渲染都是新引用 → 全部节点重挂载`);
    assert.doesNotMatch(source, /edgeTypes=\{\{/, `${file}: 内联对象每次渲染都是新引用 → 全部边重挂载`);
    assert.doesNotMatch(source, /\}, \[nodes, derived\.nodes/, `${file}: effect 依赖 nodes 会自激重渲染（FIX4 用函数式更新）`);
    assert.match(source, /syncNodes\(current, derived\.nodes\) \?\? current/, `${file}: 无变化时不 setState`);
  }
});