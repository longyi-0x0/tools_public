/**
 * IMP9 回归：`dependsOn` 的界面入口（问题行 `⋯` →「建立依赖…」→ 点另一个问题）。
 * ① 建依赖后 edges 里有 dependsOn、方向对（source=起点 / target=点中的问题），撤销栈 +1；
 * ② 自环 / 重复边被拒且栈不变；
 * ③ Esc 取消不留边（Esc 落点是 commands 的 cancelDepends，Tree / 画布的 Esc 键处理器逐字调它）；
 * ④ 目标只能选 question 类型（实体等非问题节点被拒）；
 * ⑤ 画布映射里 dependsOn 边 style 为 6/4 虚线（沿用 toFlow.test 的既有口径）。
 * 不起 DOM、不装浏览器：命令 + 映射层全是纯函数。
 * 运行：`npm test`（或 `node src/store/depends.test.ts`）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Workspace } from '../domain/types.ts';
import { addEntity, addQuestion, createWorkspace } from '../domain/factory.ts';
import { getDocState, getHistoryState, initDoc } from '../store/docStore.ts';
import {
  DEPEND_TIPS,
  cancelDepends,
  pickDependsTarget,
  startDepends,
} from '../store/commands.ts';
import { getUiState } from '../store/uiStore.ts';
import { toProblemFlow, type PdcEdgeData } from '../ui/flow/toFlow.ts';
import { QUESTION_ROW_MENU } from '../ui/treeMenus.ts';

const NOW = '2026-11-17T00:00:00.000Z';

/** 三问（链式拆解）+ 一个实体：实体用来验「目标只能选问题」。 */
function setup(): { a: string; b: string; c: string; entityId: string } {
  const base = createWorkspace(NOW);
  const a = addQuestion(base, { title: '选课资格怎么判？', now: NOW });
  const b = addQuestion(a.ws, { title: '学分门槛多少？', parentId: a.id, now: NOW });
  const c = addQuestion(b.ws, { title: '补考算不算？', parentId: b.id, now: NOW });
  const entity = addEntity(c.ws, { title: '学生', now: NOW });
  initDoc(entity.ws as Workspace);
  return { a: a.id, b: b.id, c: c.id, entityId: entity.id };
}

function dependsEdges() {
  return getDocState().ws.edges.filter((edge) => edge.type === 'dependsOn');
}

test('① 建依赖：edges 有 dependsOn（source=起点 / target=点中的问题），撤销栈 +1', () => {
  const { a, c } = setup();
  assert.equal(getHistoryState().stack.length, 0);

  startDepends(a);
  assert.equal(getUiState().dependsSourceId, a, '进入选目标模式，起点 = 菜单所在问题');
  assert.equal(pickDependsTarget(c), 'created');

  const edges = dependsEdges();
  assert.equal(edges.length, 1, '只多一条依赖边');
  assert.equal(edges[0].source, a, 'source = 起点问题');
  assert.equal(edges[0].target, c, 'target = 点中的问题');

  assert.equal(getHistoryState().stack.length, 1, '一次建边 = 一条撤销记录');
  assert.equal(getHistoryState().stack[0]?.label, '建立依赖');
  assert.equal(getUiState().dependsSourceId, null, '建完退出选目标模式');
});

test('② 自环 / 重复边被拒：栈不变、边不增，各自给一句提示', () => {
  const { a, c } = setup();

  startDepends(a);
  assert.equal(pickDependsTarget(a), 'self');
  assert.equal(getUiState().dependsTip, DEPEND_TIPS.self);
  assert.equal(dependsEdges().length, 0, '自环不留边');
  assert.equal(getHistoryState().stack.length, 0, '被拒不动撤销栈');
  assert.equal(getUiState().dependsSourceId, a, '被拒后仍停在选目标模式');

  assert.equal(pickDependsTarget(c), 'created');
  assert.equal(getHistoryState().stack.length, 1);

  startDepends(a);
  assert.equal(pickDependsTarget(c), 'duplicate');
  assert.equal(getUiState().dependsTip, DEPEND_TIPS.duplicate);
  assert.equal(dependsEdges().length, 1, '同向边不重复建');
  assert.equal(getHistoryState().stack.length, 1, '重复边不动撤销栈');
  cancelDepends();
});

test('③ Esc 取消：不留边、不动撤销栈、退出模式', () => {
  const { a, c } = setup();
  startDepends(a);
  assert.notEqual(getUiState().dependsSourceId, null);
  cancelDepends();
  assert.equal(getUiState().dependsSourceId, null, '退出选目标模式');
  assert.equal(getUiState().dependsTip, null);
  assert.equal(dependsEdges().length, 0, '取消不留边');
  assert.equal(getHistoryState().stack.length, 0, '取消不动撤销栈');
  assert.equal(getDocState().ws.edges.some((edge) => edge.source === a && edge.target === c), false);
});

test('④ 目标只能选 question：实体被拒，提示且栈不变；菜单项位置在标准四项里', () => {
  const { a, entityId } = setup();
  startDepends(a);
  assert.equal(pickDependsTarget(entityId), 'not-question');
  assert.equal(getUiState().dependsTip, DEPEND_TIPS.notQuestion);
  assert.equal(dependsEdges().length, 0, '非问题节点不建边');
  assert.equal(getHistoryState().stack.length, 0);
  cancelDepends();

  assert.deepEqual(
    QUESTION_ROW_MENU.map((item) => item.label),
    ['新建子问题', '建立依赖…', '重命名', '删除（子问题保留）'],
    '「建立依赖…」在「新建子问题」之后、「重命名」之前',
  );
  const dependsItem = QUESTION_ROW_MENU.find((item) => item.key === 'depends');
  assert.ok(dependsItem);
  dependsItem.run(a);
  assert.equal(getUiState().dependsSourceId, a, '菜单项动作 = startDepends(该问题)');
  cancelDepends();
});

test('⑤ 画布映射：新建的 dependsOn 边是 6/4 虚线，与分解线（实线）区分', () => {
  const { a, c } = setup();
  startDepends(a);
  assert.equal(pickDependsTarget(c), 'created');

  const doc = getDocState();
  const { edges } = toProblemFlow({
    ws: doc.ws,
    index: doc.index,
    checksByNode: doc.checks.byNode,
    selectedId: null,
  });
  const depends = edges.find((edge) => (edge.data as PdcEdgeData).kind === 'depends');
  const decomposes = edges.find((edge) => (edge.data as PdcEdgeData).kind === 'decomposes');
  assert.ok(depends, '新建的依赖立刻进画布映射');
  assert.equal(depends.source, a);
  assert.equal(depends.target, c);
  assert.equal(depends.style?.strokeDasharray, '6 4', 'dependsOn 虚线');
  assert.ok(decomposes, '链式拆解线仍在');
  assert.equal(decomposes.style?.strokeDasharray, undefined, 'decomposesTo 实线');
});
