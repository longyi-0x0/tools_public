/**
 * IMP10 回归：节点上的可见端口 + 从端口连线。
 *
 * ① 几何：左右挨着走左右端口（水平直线）、上下叠着走上下端口（竖直直线），锚点严格贴在卡片边上；
 * ② 语义：下→上 = 分解、问题域其余组合 = 依赖、解域 = 关系、自环拒、跨类型拒（此处即判断顺序）；
 * ③/④ 命令：下→上建 decomposesTo、其余建 dependsOn，方向 = 起点 → 终点；
 * ⑤ 拒绝：已有上级的分解 / 自环 / 跨类型各给一句提示，边不增、撤销栈不变；
 * ⑥ 解域任意端口建 entityRelation，label 留空、屏幕显示「关系」；
 * ⑦ 一次连线只产生一条撤销记录（undo 一次即回到连线前）；
 * ⑧ 线的端点跟着所选端口走：sourceHandle/targetHandle 落到所选端口，左右连时 X 不同、Y 相等。
 *
 * 全纯函数 + 命令 + 映射层，不起 DOM、不装浏览器。
 * 运行：`npm test`（或 `node src/ui/flow/ports.test.ts`）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { PortId, Workspace } from '../../domain/types.ts';
import { addEntity, addQuestion, createWorkspace } from '../../domain/factory.ts';
import { getDocState, getHistoryState, initDoc } from '../../store/docStore.ts';
import { CONNECT_TIPS, connectPorts, setEdgePorts, undo } from '../../store/commands.ts';
import { buildIndex } from '../../domain/normalize.ts';
import { toJson } from '../../domain/export/json.ts';
import { fromJson } from '../../domain/export/fromJson.ts';
import { edgeKey } from '../../domain/schema.ts';
import { getUiState } from '../../store/uiStore.ts';
import * as portsModule from './ports.ts';
import {
  edgeAnchors,
  inferConnection,
  portAnchor,
  portsBetween,
  resolveEdgePorts,
  type PortRect,
} from './ports.ts';
import { toProblemFlow, toSolveFlow, type PdcEdgeData } from './toFlow.ts';

const NOW = '2026-11-17T00:00:00.000Z';

interface Setup {
  a: string;
  b: string;
  c: string;
  e1: string;
  e2: string;
}

/** a（核心问题）/ b（并列问题）/ c（已有上级的子问题）+ 两个实体。 */
function setup(): Setup {
  const base = createWorkspace(NOW);
  const a = addQuestion(base, { title: '核心问题', now: NOW });
  const b = addQuestion(a.ws, { title: '并列问题', now: NOW });
  const c = addQuestion(b.ws, { title: '已有上级的子问题', parentId: b.id, now: NOW });
  const e1 = addEntity(c.ws, { title: '学生', now: NOW });
  const e2 = addEntity(e1.ws, { title: '课程', now: NOW });
  initDoc(e2.ws as Workspace);
  return { a: a.id, b: b.id, c: c.id, e1: e1.id, e2: e2.id };
}

test('① 端口几何：左右连走左右端口（X 不同、Y 相等），上下连走上下端口（X 相等）', () => {
  const left: PortRect = { x: 0, y: 0, w: 180, h: 80 };
  const right: PortRect = { x: 300, y: 0, w: 180, h: 80 };
  const side = portsBetween(left, right);
  assert.deepEqual(side, { source: 'right', target: 'left' }, '左右挨着 → 右端口出、左端口进');
  const horizontal = edgeAnchors(left, right, side);
  assert.equal(horizontal.source.x, 180, '起点贴左卡右沿');
  assert.equal(horizontal.target.x, 300, '终点贴右卡左沿');
  assert.notEqual(horizontal.source.x, horizontal.target.x, '左右连：两端 X 不同');
  assert.equal(horizontal.source.y, horizontal.target.y, '左右连：两端 Y 相等（水平直线）');

  const below: PortRect = { x: 0, y: 220, w: 180, h: 80 };
  const vertical = portsBetween(left, below);
  assert.deepEqual(vertical, { source: 'bottom', target: 'top' }, '上下叠着 → 下端口出、上端口进');
  const straight = edgeAnchors(left, below, vertical);
  assert.equal(straight.source.x, straight.target.x, '上下连：两端 X 相等（竖直直线）');
  assert.ok(straight.target.y > straight.source.y, '上下连：终点在起点下方');
});

test('② 语义映射五种情形：下→上=分解、其余=依赖、解域=关系、自环拒、跨类型拒', () => {
  const problem = {
    domain: 'problem' as const,
    self: false,
    sourceType: 'question' as const,
    targetType: 'question' as const,
  };
  assert.deepEqual(inferConnection({ ...problem, sourcePort: 'bottom', targetPort: 'top' }), {
    kind: 'decomposesTo',
  });

  const others: Array<[PortId, PortId]> = [
    ['top', 'bottom'],
    ['right', 'left'],
    ['left', 'right'],
    ['bottom', 'bottom'],
    ['top', 'top'],
  ];
  for (const [sourcePort, targetPort] of others) {
    assert.deepEqual(
      inferConnection({ ...problem, sourcePort, targetPort }),
      { kind: 'dependsOn' },
      `${sourcePort} → ${targetPort} 应落成依赖`,
    );
  }

  assert.deepEqual(
    inferConnection({
      domain: 'solve',
      self: false,
      sourceType: 'entity',
      targetType: 'entity',
      sourcePort: 'top',
      targetPort: 'bottom',
    }),
    { kind: 'entityRelation' },
    '解域任意端口 → 关系',
  );

  assert.deepEqual(
    inferConnection({ ...problem, self: true, sourcePort: 'bottom', targetPort: 'top' }),
    { rejected: 'self' },
  );
  assert.deepEqual(
    inferConnection({ ...problem, targetType: 'entity', sourcePort: 'bottom', targetPort: 'top' }),
    { rejected: 'cross-type' },
  );
  // 判断顺序：自环先于跨类型（自环 + 类型不对时仍报自环）
  assert.deepEqual(
    inferConnection({
      ...problem,
      self: true,
      sourceType: 'entity',
      sourcePort: 'bottom',
      targetPort: 'top',
    }),
    { rejected: 'self' },
  );
});

test('③ 命令：下→上松手建 decomposesTo，方向 = 起点 → 终点，撤销栈 +1', () => {
  const { a, b } = setup();
  assert.equal(
    connectPorts({ domain: 'problem', source: b, target: a, sourcePort: 'bottom', targetPort: 'top' }),
    'created-decomposes',
  );
  const decomposes = getDocState().ws.edges.filter((edge) => edge.type === 'decomposesTo');
  assert.equal(decomposes.length, 2, 'setup 里 1 条（b→c）+ 新连的 1 条');
  assert.ok(
    decomposes.some((edge) => edge.source === b && edge.target === a),
    'source = 起点（下端口）的问题，target = 终点（上端口）的问题',
  );
  assert.equal(getHistoryState().stack.length, 1, '一次连线一条撤销记录');
  assert.equal(getHistoryState().stack[0]?.label, '建立分解');
});

test('④ 命令：其余端口组合建 dependsOn，方向 = 起点 → 终点', () => {
  const { a, b } = setup();
  assert.equal(
    connectPorts({ domain: 'problem', source: a, target: b, sourcePort: 'right', targetPort: 'left' }),
    'created-depends',
  );
  const depends = getDocState().ws.edges.filter((edge) => edge.type === 'dependsOn');
  assert.equal(depends.length, 1);
  assert.equal(depends[0].source, a, 'source = 起点');
  assert.equal(depends[0].target, b, 'target = 终点');
  assert.equal(getHistoryState().stack.length, 1);
  assert.equal(getHistoryState().stack[0]?.label, '建立依赖');
});

test('⑤ 已有上级的分解被拒：提示原文，边不增、撤销栈不变', () => {
  const { a, c } = setup();
  assert.equal(
    connectPorts({ domain: 'problem', source: a, target: c, sourcePort: 'bottom', targetPort: 'top' }),
    'parent-exists',
  );
  assert.equal(getUiState().connectTip, '这个子问题已经有上一级了，删掉旧的那条再连');
  assert.equal(CONNECT_TIPS.parentExists, '这个子问题已经有上一级了，删掉旧的那条再连');
  assert.equal(
    getDocState().ws.edges.filter((edge) => edge.type === 'decomposesTo').length,
    1,
    '被拒不留新边',
  );
  assert.equal(getHistoryState().stack.length, 0, '被拒不动撤销栈');
});

test('⑥ 自环 / 跨类型被拒：各一句提示，边不增、撤销栈不变', () => {
  const { a, e1 } = setup();
  assert.equal(
    connectPorts({ domain: 'problem', source: a, target: a, sourcePort: 'bottom', targetPort: 'top' }),
    'self',
  );
  assert.equal(getUiState().connectTip, '不能连自己：起点和终点得是两个节点');
  assert.equal(CONNECT_TIPS.self, '不能连自己：起点和终点得是两个节点');

  assert.equal(
    connectPorts({ domain: 'problem', source: a, target: e1, sourcePort: 'bottom', targetPort: 'top' }),
    'cross-type',
    '问题域里问题连实体 = 跨类型',
  );
  assert.equal(getUiState().connectTip, '只能连同类节点：问题连问题、实体连实体，跨域的那条线不建');
  assert.equal(CONNECT_TIPS.crossType, '只能连同类节点：问题连问题、实体连实体，跨域的那条线不建');

  assert.equal(
    connectPorts({ domain: 'solve', source: e1, target: a, sourcePort: 'left', targetPort: 'right' }),
    'cross-type',
    '解域里实体连问题同样被拒',
  );
  assert.equal(getDocState().ws.edges.length, 1, '只剩 setup 里那条分解线');
  assert.equal(getHistoryState().stack.length, 0, '被拒不动撤销栈');
});

test('⑦ 解域任意端口建 entityRelation：label 留空、屏幕上显示「关系」', () => {
  const { e1, e2 } = setup();
  assert.equal(
    connectPorts({ domain: 'solve', source: e1, target: e2, sourcePort: 'top', targetPort: 'bottom' }),
    'created-relation',
  );
  const edge = getDocState().ws.edges.find((entry) => entry.type === 'entityRelation');
  assert.ok(edge, '关系边已落库');
  assert.equal(edge.label ?? '', '', '默认 label 留空');
  assert.equal(getHistoryState().stack.length, 1);
  assert.equal(getHistoryState().stack[0]?.label, '新建关系');

  const doc = getDocState();
  const solve = toSolveFlow({
    ws: doc.ws,
    index: doc.index,
    selectedId: null,
    selectedEdgeKey: null,
    connectSourceId: null,
  });
  const flowEdge = solve.edges.find((entry) => (entry.data as PdcEdgeData).kind === 'relation');
  assert.ok(flowEdge, '关系边进了解域映射');
  assert.equal((flowEdge.data as PdcEdgeData).label, '关系', 'label 为空时屏幕显示「关系」');
  assert.equal(flowEdge.sourceHandle, 'top', '起点贴在所选的上端口');
  assert.equal(flowEdge.targetHandle, 'bottom', '终点贴在所选的下端口');
});

test('⑧ 一次连线只产生一条撤销记录：undo 一次即回到连线前', () => {
  const { a, b } = setup();
  connectPorts({ domain: 'problem', source: a, target: b, sourcePort: 'right', targetPort: 'left' });
  assert.equal(getHistoryState().stack.length, 1);
  undo();
  assert.equal(
    getDocState().ws.edges.filter((edge) => edge.type === 'dependsOn').length,
    0,
    '一次 undo 把这条线整条撤掉（不是半条）',
  );
  assert.equal(getHistoryState().stack.length, 0);
});

test('⑨ 线的端点跟着所选端口走：左右连时 X 不同、Y 相等', () => {
  const { a, b } = setup();
  assert.equal(
    connectPorts({ domain: 'problem', source: a, target: b, sourcePort: 'right', targetPort: 'left' }),
    'created-depends',
  );
  const doc = getDocState();
  const flow = toProblemFlow({
    ws: doc.ws,
    index: doc.index,
    checksByNode: doc.checks.byNode,
    selectedId: null,
  });
  const flowEdge = flow.edges.find((edge) => edge.source === a && edge.target === b);
  assert.ok(flowEdge, '新连线进问题域映射');
  assert.equal(flowEdge.sourceHandle, 'right', '映射层写进用户选的起点端口');
  assert.equal(flowEdge.targetHandle, 'left', '映射层写进用户选的终点端口');

  // 端点几何：两个左右相邻的卡片，右端口 / 左端口 → X 不同、Y 相等（水平直线）
  const sourceRect: PortRect = { x: 0, y: 0, w: 180, h: 80 };
  const targetRect: PortRect = { x: 300, y: 0, w: 180, h: 80 };
  const ports = { source: 'right' as PortId, target: 'left' as PortId };
  const anchors = edgeAnchors(sourceRect, targetRect, ports);
  assert.notEqual(anchors.source.x, anchors.target.x);
  assert.ok(anchors.target.x > anchors.source.x, '终点在起点右侧');
  assert.equal(anchors.source.y, anchors.target.y, 'Y 相等 = 水平直线');
  // 换端口方向 → 端点跟着换（下端口在底边中点，与右端口的 X 不同）
  const bottomPorts = { source: 'bottom' as PortId, target: 'top' as PortId };
  const vertical = edgeAnchors(sourceRect, targetRect, bottomPorts);
  assert.notDeepEqual(vertical, anchors, '换端口 → 端点跟着换');
  assert.equal(vertical.source.x, 90, '下端口在卡片底边中点（X = 卡片中点，与右端口不同）');
  assert.equal(vertical.source.y, 80, '下端口贴在底边');
  assert.equal(vertical.target.y, 0, '上端口贴在顶边');
  assert.equal(portAnchor(sourceRect, 'right').x, 180, '锚点贴卡片右沿');
});

/* ---------- IMP11：用户选的端口进文档 ---------- */

test('⑩ 从端口连线：两个端口写进文档的 Edge；左树菜单建的边留空', () => {
  const { a, b } = setup();
  assert.equal(
    connectPorts({ domain: 'problem', source: a, target: b, sourcePort: 'right', targetPort: 'left' }),
    'created-depends',
  );
  const linked = getDocState().ws.edges.find((edge) => edge.type === 'dependsOn');
  assert.ok(linked, '依赖边已落库');
  assert.equal(linked.sourcePort, 'right', '起点端口写进边');
  assert.equal(linked.targetPort, 'left', '终点端口写进边');

  // 左树菜单建的分解边（setup 里 b → c）不写端口，交给几何推导，行为不变。
  const fromMenu = getDocState().ws.edges.find((edge) => edge.type === 'decomposesTo');
  assert.ok(fromMenu, '菜单建的分解边还在');
  assert.equal(fromMenu.sourcePort, undefined, '菜单边不写起点端口');
  assert.equal(fromMenu.targetPort, undefined, '菜单边不写终点端口');
});

test('⑪ JSON 往返后端口字段仍在（导出 → 导入 → 再导出逐字节一致）', () => {
  const { a, b } = setup();
  connectPorts({ domain: 'problem', source: a, target: b, sourcePort: 'right', targetPort: 'left' });
  const json = toJson(getDocState().ws).text;
  assert.match(json, /"sourcePort": "right"/, '导出的 JSON 里有起点端口');
  assert.match(json, /"targetPort": "left"/, '导出的 JSON 里有终点端口');

  const imported = fromJson(json);
  assert.equal(imported.ok, true, '导出的 JSON 能再导入');
  if (!imported.ok) return;
  const edge = imported.ws.edges.find((entry) => entry.type === 'dependsOn');
  assert.ok(edge, '依赖边往返后还在');
  assert.equal(edge.sourcePort, 'right', '导入后起点端口还在');
  assert.equal(edge.targetPort, 'left', '导入后终点端口还在');
  assert.equal(toJson(imported.ws).text, json, '再导出的字节与首次一致');
});

test('⑫ 老数据（没有端口字段）照常载入，映射走几何推导', () => {
  const legacy = JSON.stringify({
    schemaVersion: 2,
    name: '老文档',
    goal: '',
    coreQuestionId: 'q1',
    nodes: [
      { id: 'q1', type: 'question', title: '甲', notes: '', data: { status: '未澄清' }, pos: { x: 0, y: 0 } },
      { id: 'q2', type: 'question', title: '乙', notes: '', data: { status: '未澄清' }, pos: { x: 400, y: 0 } },
    ],
    edges: [{ type: 'dependsOn', source: 'q1', target: 'q2' }],
    viewports: { problem: { x: 0, y: 0, zoom: 1 }, solve: { x: 0, y: 0, zoom: 1 } },
    meta: { createdAt: '', updatedAt: '' },
  });
  const imported = fromJson(legacy);
  assert.equal(imported.ok, true, '没有端口字段的老文档照常载入');
  if (!imported.ok) return;
  const ws = imported.ws;
  assert.equal(ws.edges.length, 1);
  const legacyEdge = ws.edges[0];
  assert.equal(legacyEdge.sourcePort, undefined, '载入不补写端口');
  assert.equal(legacyEdge.targetPort, undefined);

  const flow = toProblemFlow({
    ws,
    index: buildIndex(ws),
    checksByNode: new Map(),
    selectedId: null,
  });
  const flowEdge = flow.edges.find((entry) => entry.source === 'q1' && entry.target === 'q2');
  assert.ok(flowEdge, '老数据也进映射');
  const rectOf = (id: string): PortRect => {
    const node = flow.nodes.find((entry) => entry.id === id);
    assert.ok(node, `节点 ${id} 已进映射`);
    const style = (node.style ?? {}) as { width?: number; height?: number };
    return { x: node.position.x, y: node.position.y, w: style.width ?? 0, h: style.height ?? 0 };
  };
  const auto = portsBetween(rectOf('q1'), rectOf('q2'));
  assert.equal(flowEdge.sourceHandle, auto.source, '起点落在几何推导的端口');
  assert.equal(flowEdge.targetHandle, auto.target, '终点落在几何推导的端口');
  assert.deepEqual(resolveEdgePorts({}, rectOf('q1'), rectOf('q2')), auto, '没字段 → 纯几何');
});

test('⑬ 改端口：setEdgePorts 一条撤销记录，映射跟着边上的字段走（不跟几何）', () => {
  const { a, b } = setup();
  connectPorts({ domain: 'problem', source: a, target: b, sourcePort: 'right', targetPort: 'left' });
  const created = getDocState().ws.edges.find((edge) => edge.type === 'dependsOn');
  assert.ok(created, '依赖边已落库');
  const key = edgeKey(created);

  setEdgePorts(key, { sourcePort: 'bottom', targetPort: 'top' });
  assert.equal(getHistoryState().stack.length, 2, '建边 + 改端口 = 两条撤销记录');
  assert.equal(getHistoryState().stack.at(-1)?.label, '改连线端口');

  const after = getDocState();
  const changed = after.ws.edges.find((edge) => edge.type === 'dependsOn');
  assert.equal(changed?.sourcePort, 'bottom');
  assert.equal(changed?.targetPort, 'top');
  // 两卡几何上是左右相邻，但边上的字段优先 → 端点贴下 / 上端口。
  const flow = toProblemFlow({
    ws: after.ws,
    index: after.index,
    checksByNode: after.checks.byNode,
    selectedId: null,
  });
  const flowEdge = flow.edges.find((entry) => entry.source === a && entry.target === b);
  assert.equal(flowEdge?.sourceHandle, 'bottom', '映射跟着边上的起点端口');
  assert.equal(flowEdge?.targetHandle, 'top', '映射跟着边上的终点端口');

  // 选「自动」= 清掉字段，退回几何推导。
  setEdgePorts(key, { sourcePort: null, targetPort: null });
  const cleared = getDocState().ws.edges.find((edge) => edge.type === 'dependsOn');
  assert.equal(cleared?.sourcePort, undefined, '自动 → 字段删掉');
  assert.equal(cleared?.targetPort, undefined);
  assert.equal(getHistoryState().stack.length, 3, '清端口也是一条撤销记录');
});

test('⑭ 端口不再是 UI 内存表：ports 模块没有 rememberEdgePorts / edgePortsOf', () => {
  assert.equal('rememberEdgePorts' in portsModule, false, 'rememberEdgePorts 已删除');
  assert.equal('forgetEdgePorts' in portsModule, false);
  assert.equal('resetEdgePorts' in portsModule, false);
  assert.equal('edgePortsOf' in portsModule, false, '内存表读取已换成 resolveEdgePorts');
  assert.equal(typeof portsModule.resolveEdgePorts, 'function', '端口来源只剩边上的字段 + 几何兜底');
});
