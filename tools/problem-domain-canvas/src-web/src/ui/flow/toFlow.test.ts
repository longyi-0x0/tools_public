/**
 * 画布映射与交互契约自测（IMP7，node:test，无 DOM）：
 * ① 问题节点：类型、状态/状态点类名、编号、关联胶囊（≤3 + `+N`）、检查角标、尺寸；
 * ② 边：decomposesTo 实线 + 实心箭头，dependsOn 虚线 6/4 + 空心箭头，线宽/颜色取 02 的关系语法；
 * ②b 边的完整性（IMPFIX3）：5 个问题的链出 4 条 decomposesTo，端点都必须是真实节点 id、边 id 唯一
 *    ——「问题域没有线」的回归锚点：映射层漏边 / 边指向不存在的节点，都会在这里挂；
 * ③ 拖动：React Flow 松手时走的 beginDrag/dragTo/endDrag 三连只进一条撤销记录；
 * ④ 双击新建：屏幕坐标 → 流坐标的视口逆变换（与 screenToFlowPosition 同式）与取整；
 * ⑤ 松手吸附：落点取 8px 网格整数倍（拖动中不吸附）。
 * 运行：`npm test`（或 `node src/ui/flow/toFlow.test.ts`）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Workspace } from '../../domain/types.ts';
import { addLinkedElement, addQuestion, createWorkspace } from '../../domain/factory.ts';
import { getDocState, getHistoryState, initDoc, undo } from '../../store/docStore.ts';
import { beginDrag, dragTo, endDrag } from '../../store/commands.ts';
import {
  flowPointFromClient,
  snapPoint,
  toProblemFlow,
  toSolveFlow,
  type PdcEdgeData,
  type QuestionNodeData,
} from './toFlow.ts';

const NOW = '2026-11-17T00:00:00.000Z';

/**
 * 三问两边的样例文档：
 *   根「如何正确处理选课？」→ 子「选课资格如何判定？」→ 孙「学分门槛多少？」，
 *   根 → 子 是 decomposesTo，孙 → 根 是 dependsOn；子挂 4 个关联元素（胶囊要截到 3 + 1）。
 */
function setup(): { rootId: string; childId: string; grandId: string } {
  const base = createWorkspace(NOW);
  const root = addQuestion(base, { title: '如何正确处理选课？', now: NOW });
  const child = addQuestion(root.ws, { title: '选课资格如何判定？', parentId: root.id, now: NOW });
  const grand = addQuestion(child.ws, { title: '学分门槛多少？', parentId: child.id, now: NOW });

  let ws: Workspace = grand.ws;
  const links = [
    ['actor', '教务老师'],
    ['scene', '选课时段'],
    ['concept', '学分'],
    ['rule', '学籍管理规定'],
  ] as const;
  for (const [type, title] of links) {
    ws = addLinkedElement(ws, { questionId: child.id, type, title, now: NOW }).ws;
  }

  const kept = ws.edges.filter((edge) => edge.type !== 'decomposesTo' && edge.type !== 'dependsOn');
  initDoc({
    ...ws,
    edges: [
      ...kept,
      { type: 'decomposesTo', source: root.id, target: child.id },
      { type: 'dependsOn', source: grand.id, target: root.id },
    ],
  });
  return { rootId: root.id, childId: child.id, grandId: grand.id };
}

function problemFlow(selectedId: string | null = null) {
  const doc = getDocState();
  return toProblemFlow({
    ws: doc.ws,
    index: doc.index,
    checksByNode: doc.checks.byNode,
    selectedId,
  });
}

test('toFlow：问题节点带状态点 / 编号 / 胶囊（≤3 + N）/ 检查角标', () => {
  const { childId } = setup();
  const doc = getDocState();
  const { nodes } = problemFlow(childId);
  assert.equal(nodes.length, 3, '三个问题各一张卡');

  const node = nodes.find((entry) => entry.id === childId);
  assert.ok(node, '子问题有节点');
  assert.equal(node.type, 'question', '自定义节点类型 = question');
  const data = node.data as unknown as QuestionNodeData;
  assert.equal(data.status, '未澄清');
  assert.equal(data.statusClass, 'dot s-unclear', '5 态色靠 nodeStyle 的类名，节点里原样用');
  assert.equal(data.code, doc.index.codes.get(childId), '编号取索引里的树编号');
  assert.equal(data.selected, true, '选中态进 data，节点据此画 1.5px 主色环');
  assert.equal(data.core, false);
  assert.equal(data.links.length, 3, '胶囊最多 3 个');
  assert.deepEqual(
    data.links.map((link) => link.title),
    ['教务老师', '选课时段', '学分'],
    '按 01 §4.3 的建边顺序取前 3 个',
  );
  assert.equal(data.linkMore, 1, '第 4 个收进 +N');
  assert.equal(typeof node.style?.width, 'number');
  assert.equal(typeof node.style?.height, 'number');
});

test('toFlow：边分两种（decomposesTo 实线实心箭头 / dependsOn 虚线 6-4 空心箭头）', () => {
  setup();
  const { edges } = problemFlow();
  assert.equal(edges.length, 2, '问题间只有这两种边');

  const decomposes = edges.find((edge) => (edge.data as PdcEdgeData).kind === 'decomposes');
  const depends = edges.find((edge) => (edge.data as PdcEdgeData).kind === 'depends');
  assert.ok(decomposes, '有 decomposesTo 边');
  assert.ok(depends, '有 dependsOn 边');

  assert.equal(decomposes.type, 'pdc', '自定义边类型（直角折线 + EdgeLabelRenderer）');
  assert.equal(decomposes.markerEnd, 'url(#pdc-arrow)');
  assert.equal(decomposes.style?.stroke, 'var(--pd-accent)');
  assert.equal(decomposes.style?.strokeWidth, 2);
  assert.equal(decomposes.style?.strokeDasharray, undefined, '实线');

  assert.equal(depends.markerEnd, 'url(#pdc-arrow-hollow)');
  assert.equal(depends.style?.strokeDasharray, '6 4', '虚线 6/4');
  assert.equal(depends.style?.opacity, 0.85);
  assert.equal(depends.style?.strokeWidth, 2);
});

test('toFlow：5 个问题的链出 4 条 decomposesTo，端点都是真实节点 id、边 id 唯一', () => {
  const base = createWorkspace(NOW);
  const q1 = addQuestion(base, { title: 'Q1', now: NOW });
  const q2 = addQuestion(q1.ws, { title: 'Q2', parentId: q1.id, now: NOW });
  const q3 = addQuestion(q2.ws, { title: 'Q3', parentId: q2.id, now: NOW });
  const q4 = addQuestion(q3.ws, { title: 'Q4', parentId: q3.id, now: NOW });
  const q5 = addQuestion(q4.ws, { title: 'Q5', parentId: q4.id, now: NOW });
  initDoc(q5.ws);

  const { nodes, edges } = problemFlow();
  assert.equal(nodes.length, 5, '五个问题各一张卡');

  const ids = new Set(nodes.map((node) => node.id));
  const decomposes = edges.filter((edge) => (edge.data as PdcEdgeData).kind === 'decomposes');
  assert.ok(decomposes.length >= 4, `decomposesTo 边应 ≥ 4 条，实际 ${decomposes.length}`);
  for (const edge of decomposes) {
    assert.ok(ids.has(edge.source), `边的 source 必须是真实节点 id：${edge.source}`);
    assert.ok(ids.has(edge.target), `边的 target 必须是真实节点 id：${edge.target}`);
  }
  assert.equal(new Set(edges.map((edge) => edge.id)).size, edges.length, '边 id 唯一');
});

test('拖动一次只进一条撤销记录（onNodeDragStop 的 beginDrag/dragTo/endDrag 三连）', () => {
  const { childId } = setup();
  assert.equal(getHistoryState().stack.length, 0);

  beginDrag(childId);
  dragTo({ x: 120, y: 64 });
  endDrag();

  assert.equal(getHistoryState().stack.length, 1, '一次拖动一条记录');
  assert.equal(getHistoryState().stack[0]?.label, '移动节点');
  const moved = getDocState().ws.nodes.find((node) => node.id === childId);
  assert.deepEqual(moved?.pos, { x: 120, y: 64 });

  undo();
  assert.equal(getHistoryState().stack.length, 0);
});

test('双击新建：屏幕坐标 → 流坐标（视口逆变换 + 取整）', () => {
  const rect = { left: 264, top: 64 };
  // 缩放 1、平移 (48,48)：屏幕 (312,112) 刚好落在世界原点
  assert.deepEqual(flowPointFromClient({ x: 312, y: 112 }, rect, { x: 48, y: 48, zoom: 1 }), {
    x: 0,
    y: 0,
  });
  // 缩放 2、平移 (100,-20)：世界 = (屏幕 - 画板左/上 - 平移) / 缩放
  assert.deepEqual(flowPointFromClient({ x: 500, y: 200 }, rect, { x: 100, y: -20, zoom: 2 }), {
    x: Math.round((500 - 264 - 100) / 2),
    y: Math.round((200 - 64 + 20) / 2),
  });
  // 落点取整，不要小数坐标
  assert.deepEqual(flowPointFromClient({ x: 264.6, y: 64.4 }, rect, { x: 0, y: 0, zoom: 1 }), {
    x: 1,
    y: 0,
  });
});

test('松手吸附：落点取 8px 网格整数倍（拖动中不吸附，跟手）', () => {
  assert.deepEqual(snapPoint({ x: 13, y: 4 }), { x: 16, y: 8 });
  assert.deepEqual(snapPoint({ x: 3, y: 20 }), { x: 0, y: 24 });
  assert.deepEqual(snapPoint({ x: 40, y: 8 }), { x: 40, y: 8 }, '已在网格上就原样落点');
});

test('toSolveFlow：空解域不产节点也不产边', () => {
  setup();
  const doc = getDocState();
  const { nodes, edges } = toSolveFlow({
    ws: doc.ws,
    index: doc.index,
    selectedId: null,
    selectedEdgeKey: null,
    connectSourceId: null,
  });
  assert.equal(nodes.length, 0);
  assert.equal(edges.length, 0);
});
