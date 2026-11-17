/**
 * 选中（FIX6）回归（node:test，无 DOM）：用户报「点节点后看不出它被选中」。
 *
 * 契约：`uiStore.selectedId` 是唯一真相（A 方案），画布节点外观读 toFlow 从它派生的 `data.selected`；
 * 库（@xyflow/react）内部那份选中只作输入，从不反向当真相。四条：
 * ① 点画布节点（onNodeClick → pickNode）→ ui.selectedId = 该 id，映射层只有它 data.selected=true；
 * ② 点空白（onPaneClick → pickNode(null)）→ selectedId 清空，所有节点 data.selected=false；
 * ③ 点左树行（Tree.tsx 行 onClick 走 select(id)）→ 画布同一 id 的节点 data.selected=true；
 * ④ 撤销掉被选中的节点 → 选中被清（commands 的 pruneSelectionAfterHistory），画布上也没了它。
 * 运行：`npm test`（或 `node src/ui/flow/selection.test.ts`）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Workspace } from '../../domain/types.ts';
import { addQuestion, createWorkspace } from '../../domain/factory.ts';
import { getDocState, initDoc } from '../../store/docStore.ts';
import { beginDraft, select, submitDraft, undo } from '../../store/commands.ts';
import { getUiState, setUi } from '../../store/uiStore.ts';
import { toProblemFlow, type QuestionNodeData } from './toFlow.ts';
import { syncNodes } from './nodeSync.ts';
import { pickFromLibrary, pickNode } from './selection.ts';

const NOW = '2026-11-17T00:00:00.000Z';

/** 每个用例从干净的 ui + 文档开始（store 是模块级单例，测试之间会互相串）。 */
function reset(): void {
  initDoc(createWorkspace(NOW));
  setUi({
    domain: 'problem',
    selectedId: null,
    selection: { problem: null, solve: null },
    selectedEdgeKey: null,
    detailSection: 'props',
    drag: null,
    draft: null,
    renamingId: null,
    menuFor: null,
    connect: null,
    solveDraft: false,
  });
}

/** 根 → 子 → 孙三张问题卡（和画布一样从文档 + 索引映射出来）。 */
function setup(): { rootId: string; childId: string; grandId: string } {
  let ws: Workspace = createWorkspace(NOW);
  const root = addQuestion(ws, { title: '如何正确处理选课？', now: NOW });
  const child = addQuestion(root.ws, { title: '选课资格如何判定？', parentId: root.id, now: NOW });
  const grand = addQuestion(child.ws, { title: '学分门槛多少？', parentId: child.id, now: NOW });
  ws = grand.ws;
  initDoc(ws);
  return { rootId: root.id, childId: child.id, grandId: grand.id };
}

/** 画布此刻会渲染的节点（ProblemCanvas 的 useMemo 里调的就是这个）。 */
function problemNodes() {
  const doc = getDocState();
  return toProblemFlow({
    ws: doc.ws,
    index: doc.index,
    checksByNode: doc.checks.byNode,
    selectedId: getUiState().selectedId,
  }).nodes;
}

/** 哪些节点的 data.selected 为 true（应恒为 0 或 1 个）。 */
function selectedDataIds(): string[] {
  return problemNodes()
    .filter((node) => (node.data as unknown as QuestionNodeData).selected === true)
    .map((node) => node.id);
}

/** 真实入口：段头 `+` / N 起草稿，提交后落库（与 history.test.ts 同一套）。 */
function newQuestion(title: string, parentId: string | null = null): string {
  beginDraft(parentId);
  submitDraft(title);
  const nodes = getDocState().ws.nodes;
  const created = nodes[nodes.length - 1];
  assert.ok(created, '草稿提交后应有新节点');
  return created.id;
}

test('① 点画布节点：ui.selectedId 变成该 id，且只有它 data.selected=true', () => {
  const { rootId, childId } = setup();
  pickNode(childId); // ProblemCanvas 的 onNodeClick → pickNode(node.id)
  assert.equal(getUiState().selectedId, childId, 'ui.selectedId 就是被点中的节点');
  assert.deepEqual(selectedDataIds(), [childId], '画布上只有它挂选中态');

  for (const node of problemNodes()) {
    const data = node.data as unknown as QuestionNodeData;
    const wanted = node.id === childId;
    assert.equal(data.selected, wanted, `${node.id} 的 data.selected`);
    // 顶层 selected 与 data.selected 同源：回灌给库，避免库把内部选中清掉（FIX6 的抖动根因）
    assert.equal(node.selected, wanted, `${node.id} 的顶层 selected 与 data.selected 同源`);
  }

  // 点击链路的第二种入口：库自己的选中回调（框选/点击都走它）收敛成单选，取最后点中的那个
  pickFromLibrary([{ id: rootId }, { id: childId }]);
  assert.equal(getUiState().selectedId, childId, 'onSelectionChange 只取最后一个写回 ui');
  assert.deepEqual(selectedDataIds(), [childId]);
});

test('② 点空白：selectedId 清空，所有节点 data.selected=false', () => {
  const { childId } = setup();
  pickNode(childId);
  assert.equal(getUiState().selectedId, childId);

  pickNode(null); // ProblemCanvas 的 onPaneClick → pickNode(null)
  assert.equal(getUiState().selectedId, null, '点空白清空选中');
  assert.deepEqual(selectedDataIds(), [], '画布上没有节点挂选中态');
  for (const node of problemNodes()) {
    assert.equal(node.selected, false, `${node.id} 的顶层 selected 也要落回去`);
  }
});

test('③ 点左树行：画布对应节点 data.selected=true', () => {
  const { grandId } = setup();
  select(grandId); // Tree.tsx 问题行 onClick={() => select(id)}
  const nodes = problemNodes();
  const node = nodes.find((entry) => entry.id === grandId);
  assert.ok(node, '左树选中的节点在画布上存在');
  assert.equal((node.data as unknown as QuestionNodeData).selected, true, '左树选中 → 画布高亮同一节点');
  assert.deepEqual(selectedDataIds(), [grandId], '其余节点不跟着亮');
});

test('④ 撤销掉被选中的节点：选中被清，画布上也不再出现它', () => {
  reset();
  const rootId = newQuestion('如何正确处理选课？');
  const childId = newQuestion('选课资格如何判定？', rootId);
  pickNode(childId);
  assert.equal(getUiState().selectedId, childId);

  undo(); // 撤销「新建子问题」：子树整个撤掉
  assert.equal(
    getDocState().ws.nodes.some((node) => node.id === childId),
    false,
    '撤销后被选中的节点已不在文档里',
  );
  assert.equal(getUiState().selectedId, null, '选中随节点消失被清（pruneSelectionAfterHistory）');
  const nodes = problemNodes();
  assert.equal(nodes.some((node) => node.id === childId), false, '画布上也没有它了');
  assert.deepEqual(selectedDataIds(), [], '没有节点残留选中态');
});

/**
 * ⑥ 多选（Shift 框选 / Shift 点击）当前表现：库先选中 A、B 两个，onSelectionChange 只取最后一个写回 ui，
 * 下一回合文档派生的节点把 A 的 selected 落回 false，库再 adopt 就只剩 B —— 收敛成单选。
 * 要做批量操作（一起拖动/一起删）时才需要把 ui 的选中改成集合，那时再换 B 方案。
 */
test('⑥ 多选收敛成单选：库选中 A+B 后，同步回来只剩最后点中的 B', () => {
  const { rootId, childId } = setup();
  // 库里被 Shift 框选出的两个节点（React 状态层看到的模样）
  const libraryNodes = problemNodes().map((node) =>
    node.id === rootId || node.id === childId ? { ...node, selected: true } : node,
  );
  pickFromLibrary([{ id: rootId }, { id: childId }]);
  assert.equal(getUiState().selectedId, childId, 'ui 只记最后一个');

  const derived = problemNodes();
  const synced = syncNodes(libraryNodes, derived);
  assert.ok(synced, '选中变了，节点数组要换新');
  const selectedOf = (id: string) =>
    (synced.find((node) => node.id === id)?.data as unknown as QuestionNodeData).selected;
  assert.equal(selectedOf(rootId), false, 'A 的选中被落回 false，画布只亮 B');
  assert.equal(selectedOf(childId), true, 'B（最后点中的）保持选中');
});
