import assert from 'node:assert/strict';
import test from 'node:test';

import {
  capacityOf,
  cleanCapacity,
  cleanEntries,
  cleanEntry,
  cleanPool,
  kindOf,
  nextEntryId,
  poolSummary,
} from '../site/src/pools.js';

test('容量：null 与 Infinity 都是不限，其余收成正整数', () => {
  assert.equal(cleanCapacity(null), null);
  assert.equal(cleanCapacity(Infinity), null);
  assert.equal(cleanCapacity(undefined), 1);
  assert.equal(cleanCapacity(0), 1);
  assert.equal(cleanCapacity(-3), 1);
  assert.equal(cleanCapacity('5'), 5);
  assert.equal(cleanCapacity(2.7), 2);
});

test('读回容量：null 当无尽大', () => {
  assert.equal(capacityOf({ capacity: null }), Infinity);
  assert.equal(capacityOf({ capacity: 3 }), 3);
  assert.equal(capacityOf({}), 1);
});

test('没有名字的条目不进池', () => {
  assert.equal(cleanEntry({ name: '   ' }, 0, 'people'), null);
  assert.deepEqual(cleanEntries([{ name: '张三' }, { name: '' }], 'people').length, 1);
});

test('条目按 kind 收字段', () => {
  const person = cleanEntry({ name: '张三', meta: { dept: '研发', employeeId: 'A1', level: 'x' } }, 0, 'people');
  assert.deepEqual(person.meta, { dept: '研发', employeeId: 'A1' });

  const prize = cleanEntry({ name: '一等奖', meta: { level: '1', dept: 'x' } }, 0, 'prizes');
  assert.deepEqual(prize.meta, { level: '1' });

  const item = cleanEntry({ name: '火锅' }, 0, 'items');
  assert.deepEqual(item.meta, {});
  assert.equal(item.capacity, 1);
  assert.equal(item.weight, 1);
});

test('池：认不出的 kind 落到条目，且不再有角色', () => {
  const pool = cleanPool({ name: '随便', kind: '???', entries: [{ name: 'A' }] }, 0);
  assert.equal(pool.kind, 'items');
  assert.equal('role' in pool, false);
  assert.deepEqual(Object.keys(pool).sort(), ['entries', 'id', 'kind', 'name', 'updatedAt']);
  assert.equal(kindOf('prizes'), 'prizes');
});

test('池摘要：名额总数与不限量标记', () => {
  const pool = cleanPool(
    {
      name: '奖品',
      kind: 'prizes',
      entries: [{ name: 'A', capacity: 2 }, { name: 'B', capacity: null }],
    },
    0,
  );
  const summary = poolSummary(pool);
  assert.equal(summary.entries, 2);
  assert.equal(summary.slots, 2);
  assert.equal(summary.unlimited, true);
});

test('下一个条目 id 接着排', () => {
  const pool = cleanPool(
    { name: '名单', kind: 'people', entries: [{ id: 'p1', name: 'A' }, { id: 'p7', name: 'B' }] },
    0,
  );
  assert.equal(nextEntryId(pool), 'p8');
  assert.equal(nextEntryId({ kind: 'prizes', entries: [] }), 'a1');
  assert.equal(nextEntryId({ kind: 'items', entries: [] }), 'i1');
});

test('条目带 image：有就留着，没有是空串', () => {
  assert.equal(cleanEntry({ name: '甲', image: 'a.png' }, 0, 'people').image, 'a.png');
  assert.equal(cleanEntry({ name: '乙' }, 0, 'people').image, '');
});
