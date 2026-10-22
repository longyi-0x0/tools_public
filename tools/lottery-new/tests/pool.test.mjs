import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEntry, createPool, normalizeStock, mergeEntries, poolSummary, indexPools,
} from '../site/src/domain/pool.js';

test('导入的条目 id 取外部主键，同一份名单导两次是更新不是新建', () => {
  const first = mergeEntries([], [
    { source: 'hr', extKey: 'E001', label: '张三', stock: 1 },
    { source: 'hr', extKey: 'E002', label: '李四', stock: 1 },
  ]);
  assert.deepEqual(first.entries.map((entry) => entry.id), ['hr/E001', 'hr/E002']);
  assert.equal(first.rejected.length, 0);

  const second = mergeEntries(first.entries, [
    { source: 'hr', extKey: 'E001', label: '张三（改）', stock: 2 },
  ]);
  assert.equal(second.entries.length, 2);
  assert.equal(second.entries[0].label, '张三（改）');
  assert.equal(second.entries[0].stock, 2);
});

test('缺主键的行被退回，不自造 id', () => {
  const { entries, rejected } = mergeEntries([], [
    { source: 'hr', extKey: '', label: '无工号' },
    { source: 'hr', extKey: 'E001', label: '有工号' },
  ]);
  assert.equal(entries.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].label, '无工号');
});

test('同一个外部主键出现在两个池里是同一个条目', () => {
  const a = mergeEntries([], [{ source: 'hr', extKey: 'E001', label: '张三' }]).entries;
  const b = mergeEntries([], [{ source: 'hr', extKey: 'E001', label: '张三' }]).entries;
  assert.equal(a[0].id, b[0].id);
});

test('库存归一：null 与不限都当无穷，非法值回到 1', () => {
  assert.equal(normalizeStock(null), Infinity);
  assert.equal(normalizeStock('不限'), Infinity);
  assert.equal(normalizeStock(3), 3);
  assert.equal(normalizeStock(0), 1);
  assert.equal(normalizeStock(-2), 1);
  assert.equal(normalizeStock('x'), 1);
});

test('手工新建的条目发随机号，权重非正归零', () => {
  const entry = createEntry({ label: '手填', weight: 0 });
  assert.match(entry.id, /^e-/);
  assert.equal(entry.weight, 0);
});

test('池摘要算份数合计，不限量单独标出', () => {
  const pool = createPool({ name: '奖', entries: [{ label: 'A', stock: 2 }, { label: 'B', stock: null }] });
  const summary = poolSummary(pool);
  assert.equal(summary.entries, 2);
  assert.equal(summary.stock, 2);
  assert.equal(summary.unlimited, true);
});

test('池数组按 id 折成索引', () => {
  const pools = indexPools([createPool({ id: 'p1' }), createPool({ id: 'p2' })]);
  assert.deepEqual(Object.keys(pools).sort(), ['p1', 'p2']);
});
