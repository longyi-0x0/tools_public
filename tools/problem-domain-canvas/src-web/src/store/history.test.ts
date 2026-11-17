/**
 * 撤销 / 重做（UI 契约）自测（node:test，无 DOM）：
 * - 建问题 → 建子问题 → undo 两次问题树回到空；redo 一次回来一个
 * - 撤销后选中被清除，详情栏回到「工作区概览」（detailSection 复位到 props）
 * 走真实入口（树的 ＋ / N → beginDraft + submitDraft），不直调内部 createQuestion。
 * 运行：`npm test`（或 `node src/store/history.test.ts`）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspace } from '../domain/factory.ts';
import { getDocState, getHistoryState, initDoc } from './docStore.ts';
import { beginDraft, canRedo, canUndo, redo, submitDraft, undo } from './commands.ts';
import { getUiState, setUi } from './uiStore.ts';

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

function questionTitles(): string[] {
  return getDocState()
    .ws.nodes.filter((node) => node.type === 'question')
    .map((node) => node.title);
}

/** 真实入口：段头 `+` / N 起草稿，提交后落库。 */
function newQuestion(title: string, parentId: string | null = null): string {
  beginDraft(parentId);
  submitDraft(title);
  const nodes = getDocState().ws.nodes;
  const created = nodes[nodes.length - 1];
  assert.ok(created, '草稿提交后应有新节点');
  return created.id;
}

function twoQuestions(): { rootId: string; childId: string } {
  reset();
  const rootId = newQuestion('如何正确处理选课？');
  const childId = newQuestion('选课资格如何判定？', rootId);
  assert.equal(questionTitles().length, 2);
  assert.equal(getHistoryState().stack.length, 2);
  return { rootId, childId };
}

test('建问题 → 建子问题 → undo 两次：问题树回到空', () => {
  twoQuestions();
  undo();
  assert.equal(questionTitles().length, 1);
  undo();
  assert.deepEqual(questionTitles(), []);
  assert.equal(canUndo(), false);
  assert.equal(getHistoryState().stack.length, 0);
});

test('redo 一次：撤销掉的最后一步回来一个（核心问题）', () => {
  const { rootId } = twoQuestions();
  undo();
  undo();
  assert.deepEqual(questionTitles(), []);
  assert.equal(canRedo(), true);

  redo();
  assert.equal(questionTitles().length, 1);
  assert.equal(getDocState().ws.nodes[0]?.id, rootId);
});

test('撤销后选中被清除：详情栏回到工作区概览', () => {
  reset();
  const rootId = newQuestion('如何正确处理选课？');
  assert.equal(getUiState().selectedId, rootId);
  setUi({ detailSection: 'checks' });

  undo();
  assert.equal(getUiState().selectedId, null);
  assert.equal(getUiState().selection.problem, null);
  assert.equal(getUiState().detailSection, 'props');
  assert.equal(canRedo(), true);
  assert.equal(canUndo(), false);
});
