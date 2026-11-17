/**
 * IMP6 自测（node:test，无 DOM）：问题域五类元素 actor / scene / concept / rule / event。
 * - 每类走真实入口 `createElementLink`（＝关联区「＋ → 输入 → 回车」提交后的那一次命令）：
 *   节点与边同时存在、方向恒为 question → 元素、撤销栈只 +1；
 * - 删问题：元素节点保留、五条关联边没了，一条撤销记录；
 * - 删元素：边没了、节点没了，一条撤销记录，可撤销回来；
 * - C5 联动：`constrainedByRule` 指向不存在的规则命中「引用了不存在的规则」，建出规则后不再命中；
 * - 字段白名单：01 §4.2 之外的字段名写不进去。
 * 运行：`npm test`（或 `node src/store/elements.test.ts`）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { addQuestion, createWorkspace } from '../domain/factory.ts';
import { getDocState, getHistoryState, initDoc } from './docStore.ts';
import {
  beginDraft,
  createElementLink,
  deleteElement,
  deleteQuestion,
  redo,
  setElementList,
  setElementText,
  submitDraft,
  undo,
} from './commands.ts';
import { getUiState, setUi } from './uiStore.ts';
import { ELEMENT_EDGE, PROBLEM_ELEMENT_TYPES } from '../domain/elementFields.ts';
import type { Edge, Workspace } from '../domain/types.ts';

const NOW = '2026-11-17T00:00:00.000Z';

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

/** 真实入口：段头 `+` / N 起草稿，提交后落库（与 history.test.ts 同一套）。 */
function newQuestion(title: string, parentId: string | null = null): string {
  beginDraft(parentId);
  submitDraft(title);
  const nodes = getDocState().ws.nodes;
  const created = nodes[nodes.length - 1];
  assert.ok(created, '草稿提交后应有新节点');
  return created.id;
}

function stackDepth(): number {
  return getHistoryState().stack.length;
}

function elementNodesOfType(type: string): { id: string; title: string }[] {
  return getDocState()
    .ws.nodes.filter((node) => node.type === type)
    .map((node) => ({ id: node.id, title: node.title }));
}

test('五类元素：＋ → 输入 → 回车后节点与边同时存在、方向 question → 元素、撤销栈只 +1', () => {
  for (const type of PROBLEM_ELEMENT_TYPES) {
    reset();
    const questionId = newQuestion('如何正确处理选课？');
    const before = stackDepth();

    const elementId = createElementLink(questionId, type, `${type}-名字`);
    assert.ok(elementId, `${type}：应建出节点`);

    const ws = getDocState().ws;
    const node = ws.nodes.find((entry) => entry.id === elementId);
    assert.ok(node, `${type}：节点要在文档里`);
    assert.equal(node.type, type, `${type}：节点类型要对`);
    assert.equal(node.title, `${type}-名字`, `${type}：标题要是刚输入的那个`);

    const edges = ws.edges.filter((edge) => edge.type === ELEMENT_EDGE[type]);
    assert.equal(edges.length, 1, `${type}：只建一条 ${ELEMENT_EDGE[type]} 边`);
    assert.deepEqual(edges[0], {
      type: ELEMENT_EDGE[type],
      source: questionId,
      target: elementId,
    });
    assert.equal(stackDepth(), before + 1, `${type}：建节点 + 建边 = 一条撤销记录`);
    assert.equal(getUiState().selectedId, elementId, `${type}：建完就地选中它`);

    // 反证方向没写反
    assert.equal(edges[0]?.source, questionId);
    assert.equal(edges[0]?.target, elementId);
  }
});

test('空标题丢弃：不建节点、不建边、不进撤销栈', () => {
  reset();
  const questionId = newQuestion('如何正确处理选课？');
  const before = stackDepth();
  assert.equal(createElementLink(questionId, 'actor', '   '), null);
  assert.equal(stackDepth(), before);
  assert.equal(elementNodesOfType('actor').length, 0);
});

test('删问题：五类元素节点保留、关联边全删，只 +1 条撤销记录，撤销后边回来', () => {
  reset();
  const questionId = newQuestion('如何正确处理选课？');
  const created = PROBLEM_ELEMENT_TYPES.map((type) =>
    createElementLink(questionId, type, `${type}名`),
  ).filter((id): id is string => id !== null);
  assert.equal(created.length, 5);
  const before = stackDepth();

  deleteQuestion(questionId);
  const ws = getDocState().ws;
  assert.equal(stackDepth(), before + 1, '删问题算一步');
  assert.equal(ws.nodes.filter((node) => node.type === 'question').length, 0);
  for (const id of created) {
    assert.ok(ws.nodes.some((node) => node.id === id), '元素节点要保留（可能被别的问题引用）');
  }
  const elementEdgeTypes = new Set(PROBLEM_ELEMENT_TYPES.map((type) => ELEMENT_EDGE[type]));
  assert.equal(
    ws.edges.filter((edge) => elementEdgeTypes.has(edge.type)).length,
    0,
    '五条关联边随问题一起删',
  );

  undo();
  assert.equal(
    getDocState().ws.edges.filter((edge) => elementEdgeTypes.has(edge.type)).length,
    5,
    '撤销一步：问题与五条边一起回来',
  );
  assert.equal(getDocState().ws.nodes.filter((node) => node.type === 'question').length, 1);
});

test('删元素：节点与它的关联边一起没，一条撤销记录；撤销后节点与边都回来', () => {
  reset();
  const questionId = newQuestion('如何正确处理选课？');
  const ruleId = createElementLink(questionId, 'rule', '不得超容量');
  assert.ok(ruleId);
  const before = stackDepth();

  deleteElement(ruleId);
  let ws = getDocState().ws;
  assert.equal(stackDepth(), before + 1, '删元素算一步');
  assert.equal(ws.nodes.some((node) => node.id === ruleId), false, '节点删掉');
  assert.equal(ws.edges.filter((edge) => edge.type === 'constrainedByRule').length, 0, '边删掉');
  assert.equal(getUiState().selectedId, null, '删掉选中的元素后选中清空');

  undo();
  ws = getDocState().ws;
  assert.ok(ws.nodes.some((node) => node.id === ruleId), '撤销后节点回来');
  assert.deepEqual(
    ws.edges.filter((edge) => edge.type === 'constrainedByRule'),
    [{ type: 'constrainedByRule', source: questionId, target: ruleId }],
    '撤销后边回来',
  );

  redo();
  assert.equal(getDocState().ws.nodes.some((node) => node.id === ruleId), false, '重做又删掉');
});

test('C5 联动：规则不存在时命中「引用了不存在的规则」，建出规则后不再命中', () => {
  // 悬空引用（导入的 JSON / 历史文档里可能出现）：边指向 r1，但没有任何 rule 节点。
  const base = createWorkspace(NOW);
  const created = addQuestion(base, { title: '如何正确处理选课？', parentId: null, now: NOW });
  const dangling: Edge = { type: 'constrainedByRule', source: created.id, target: 'r1' };
  const ws: Workspace = { ...created.ws, edges: [dangling] };

  reset();
  initDoc(ws);
  const hitBefore = getDocState().checks.findings.filter(
    (finding) => finding.code === 'C5' && finding.message === '引用了不存在的规则',
  );
  assert.equal(hitBefore.length, 1, '规则不存在时 C5 命中一次');
  assert.deepEqual(hitBefore[0]?.edgeKeys, ['constrainedByRule|' + created.id + '>r1']);

  // 真实入口建出规则：id 由 newId 给到 r1，悬空引用立刻变成有效引用。
  const ruleId = createElementLink(created.id, 'rule', '不得超容量');
  assert.equal(ruleId, 'r1', '第一条规则的 id 是 r1（newId：r 前缀从 1 开始）');
  const ws2 = getDocState().ws;
  assert.ok(
    ws2.nodes.some((node) => node.id === 'r1' && node.type === 'rule'),
    '规则节点已存在',
  );
  assert.ok(
    ws2.edges.filter((edge) => edge.type === 'constrainedByRule' && edge.target === 'r1').length > 0,
    'constrainedByRule 的 target 现在指向真实规则',
  );
  const hitAfter = getDocState().checks.findings.filter(
    (finding) => finding.code === 'C5' && finding.message === '引用了不存在的规则',
  );
  assert.equal(hitAfter.length, 0, '规则建出后 C5 不再因缺规则命中');
});

test('元素字段：只认 01 §4.2 的字段名，自创字段写不进去', () => {
  reset();
  const questionId = newQuestion('如何正确处理选课？');
  const ruleId = createElementLink(questionId, 'rule', '不得超容量');
  assert.ok(ruleId);

  const before = stackDepth();
  setElementText(ruleId, 'statement', '单个学生已选学分不得超过 30');
  assert.equal(stackDepth(), before + 1);
  let node = getDocState().ws.nodes.find((entry) => entry.id === ruleId);
  assert.equal(
    node && node.type === 'rule' ? node.data.statement : undefined,
    '单个学生已选学分不得超过 30',
  );

  // 01 §4.2 里 rule 没有「是否必守」这个字段：写不进去，也不多一条撤销记录
  setElementText(ruleId, 'mustFollow', '必须');
  node = getDocState().ws.nodes.find((entry) => entry.id === ruleId);
  assert.equal(
    node && 'mustFollow' in (node.data as Record<string, unknown>),
    false,
    '不属于 01 §4.2 的字段不许落库',
  );
  assert.equal(stackDepth(), before + 1, '被拒的写入不产生撤销记录');

  const conceptId = createElementLink(questionId, 'concept', '容量');
  assert.ok(conceptId);
  setElementList(conceptId, 'aliases', '名额\n上限');
  const concept = getDocState().ws.nodes.find((entry) => entry.id === conceptId);
  assert.deepEqual(concept && concept.type === 'concept' ? concept.data.aliases : undefined, [
    '名额',
    '上限',
  ]);
});
