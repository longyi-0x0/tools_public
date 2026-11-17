/**
 * 持久化自测（node:test，注入内存 Storage，无 DOM）：键名、300ms 节流后 flush、reload 后数据还在、坏数据回落。
 * 运行：`npm test`（= node src/domain/doc.test.ts && node src/store/persistence.test.ts）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { addQuestion, createWorkspace, removeNode } from '../domain/factory.ts';
import { stableStringify } from '../domain/serialize.ts';
import { createWorkspacePersister, loadWorkspace } from './persistence.ts';
import { STORAGE_KEYS, createMemoryStorage } from './storage.ts';

const NOW = '2026-11-17T00:00:00.000Z';

test('落盘键固定为 workspace:v2，flush 后 reload 数据还在', () => {
  const storage = createMemoryStorage();
  const root = addQuestion(createWorkspace(NOW), { title: '如何正确处理选课？', now: NOW });
  const child = addQuestion(root.ws, {
    title: '选课资格如何判定？',
    parentId: root.id,
    now: NOW,
  });

  let saved = false;
  let readOnly = false;
  const persister = createWorkspacePersister({
    storage,
    read: () => stableStringify(child.ws),
    onSaved: () => {
      saved = true;
    },
    onReadOnly: () => {
      readOnly = true;
    },
  });
  persister.schedule();
  persister.flush();

  const text = storage.getItem(STORAGE_KEYS.workspace);
  assert.ok(text);
  assert.ok(text.includes('选课资格如何判定？'));
  assert.equal(saved, true);
  assert.equal(readOnly, false);

  const reloaded = loadWorkspace(storage);
  assert.equal(reloaded.source, 'storage');
  assert.equal(reloaded.ws.nodes.length, 2);
  assert.equal(reloaded.ws.coreQuestionId, root.id);
  assert.deepEqual(reloaded.ws.edges, child.ws.edges);
  assert.deepEqual(
    reloaded.ws.nodes.map((node) => node.title),
    ['如何正确处理选课？', '选课资格如何判定？'],
  );
});

test('删父问题后落盘再读回：子问题在、边不在、核心问题为空', () => {
  const storage = createMemoryStorage();
  const root = addQuestion(createWorkspace(NOW), { title: '如何正确处理选课？', now: NOW });
  const child = addQuestion(root.ws, { title: '容量检查', parentId: root.id, now: NOW });
  const removed = removeNode(child.ws, root.id, NOW);

  const persister = createWorkspacePersister({
    storage,
    read: () => stableStringify(removed.ws),
  });
  persister.flush();

  const reloaded = loadWorkspace(storage);
  assert.equal(reloaded.ws.nodes.length, 1);
  assert.equal(reloaded.ws.nodes[0]?.id, child.id);
  assert.deepEqual(reloaded.ws.edges, []);
  assert.equal(reloaded.ws.coreQuestionId, null);
});

test('主键坏掉回落 backup，backup 也坏则回落空工作区（并给 warnings）', () => {
  const good = addQuestion(createWorkspace(NOW), { title: '备份里的问题', now: NOW }).ws;

  const withBackup = createMemoryStorage({
    [STORAGE_KEYS.workspace]: '{坏掉的 JSON',
    [STORAGE_KEYS.backup]: stableStringify(good),
  });
  const fromBackup = loadWorkspace(withBackup);
  assert.equal(fromBackup.source, 'backup');
  assert.equal(fromBackup.ws.nodes.length, 1);
  assert.ok(fromBackup.warnings.length > 0);

  const broken = createMemoryStorage({
    [STORAGE_KEYS.workspace]: '{坏掉的 JSON',
    [STORAGE_KEYS.backup]: '也是坏的',
  });
  const empty = loadWorkspace(broken);
  assert.equal(empty.source, 'empty');
  assert.equal(empty.ws.nodes.length, 0);
  assert.equal(empty.ws.coreQuestionId, null);
});

test('版本高于当前 schemaVersion 时拒绝载入，不动现有文档', () => {
  const storage = createMemoryStorage({
    [STORAGE_KEYS.workspace]: JSON.stringify({
      schemaVersion: 99,
      name: '未来版本',
      goal: '',
      coreQuestionId: null,
      nodes: [],
      edges: [],
    }),
  });
  const loaded = loadWorkspace(storage);
  assert.equal(loaded.source, 'empty');
  assert.ok(loaded.warnings.some((warning) => warning.includes('v99')));
});
