import test from 'node:test';
import assert from 'node:assert/strict';

import { createDraw, createSlot, normalizeQuota, takeOf, validateDraw } from '../site/src/domain/draw.js';
import { createPool, indexPools } from '../site/src/domain/pool.js';
import { createGroup } from '../site/src/domain/group.js';

const pools = indexPools([createPool({ id: 'p1' }), createPool({ id: 'p2' })]);

test('槽位默认：名额不限、作用域本场、一次抽一个、不放回、按权重', () => {
  const slot = createSlot({ key: 'only', poolId: 'p1' });
  assert.equal(slot.quota, Infinity);
  assert.equal(slot.scope, 'draw');
  assert.equal(slot.count, 1);
  assert.equal(slot.replacement, 'without');
  assert.equal(slot.weighted, true);
});

test('名额归一：0 与空是不限，负数也是不限', () => {
  assert.equal(normalizeQuota(0), Infinity);
  assert.equal(normalizeQuota(''), Infinity);
  assert.equal(normalizeQuota(-3), Infinity);
  assert.equal(normalizeQuota(5), 5);
});

test('实际抽取数取「一次抽几个、剩余名额、候选条数」的最小值', () => {
  const slot = createSlot({ key: 'only', count: 5 });
  assert.equal(takeOf(slot, 3, 100), 3);
  assert.equal(takeOf(slot, 10, 4), 4);
  assert.equal(takeOf(slot, 0, 10), 0);
  assert.equal(takeOf({ ...slot, replacement: 'with' }, 3, 0), 3);
});

test('校验：缺池、槽数不符、组不存在都拦下', () => {
  assert.deepEqual(validateDraw(createDraw({ id: 'd', slots: [{ key: 'a', poolId: 'p1' }] }), pools), []);

  const missing = validateDraw(createDraw({ id: 'd', slots: [{ key: 'a', poolId: 'nope' }] }), pools);
  assert.ok(missing.some((message) => message.includes('不存在')));

  const empty = validateDraw(createDraw({ id: 'd', slots: [{ key: 'a', poolId: '' }] }), pools);
  assert.ok(empty.some((message) => message.includes('还没选池')));

  const tooMany = validateDraw(createDraw({
    id: 'd',
    slots: [{ key: 'a', poolId: 'p1' }, { key: 'b', poolId: 'p2' }],
    form: { type: 'grid' },
  }), pools);
  assert.ok(tooMany.some((message) => message.includes('最多支持')));

  const badGroup = validateDraw(createDraw({
    id: 'd', groupId: 'nope', slots: [{ key: 'a', poolId: 'p1' }],
  }), pools, [createGroup({ id: 'g1' })]);
  assert.ok(badGroup.some((message) => message.includes('组不存在')));
});

test('作用域只接三个值，认不出时按本场', () => {
  assert.equal(createSlot({ key: 'a', scope: 'group' }).scope, 'group');
  assert.equal(createSlot({ key: 'a', scope: 'nope' }).scope, 'draw');
});

test('抽奖保留组的归属，可空', () => {
  const draw = createDraw({ id: 'd', slots: [{ key: 'a', poolId: 'p1' }] });
  assert.equal(draw.groupId, null);
  assert.equal(createDraw({ id: 'd2', groupId: 'g1' }).groupId, 'g1');
});
