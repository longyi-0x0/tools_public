import test from 'node:test';
import assert from 'node:assert/strict';

import { createPool } from '../site/src/domain/pool.js';
import { candidatesOf, takeFrom, limitOf } from '../site/src/domain/rule.js';
import { createRandom } from '../site/src/random.js';

function poolOf(entries) {
  return createPool({ id: 'p1', name: '池', entries });
}

test('候选集默认包含全部条目', () => {
  const pool = poolOf([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  const candidates = candidatesOf(pool, new Map());
  assert.deepEqual(candidates.map((e) => e.id), ['a', 'b', 'c']);
});

test('已中次数达到条目 stock 后不再成为候选', () => {
  const pool = poolOf([{ id: 'a', stock: 1 }, { id: 'b', stock: 2 }]);
  const usage = new Map([['a', 1], ['b', 1]]);
  const candidates = candidatesOf(pool, usage);
  assert.deepEqual(candidates.map((e) => e.id), ['b']);
});

test('规则级 pickLimit 与条目 stock 取小', () => {
  assert.equal(limitOf({ id: 'a', stock: 5 }, { pickLimit: 2 }), 2);
  assert.equal(limitOf({ id: 'a', stock: 1 }, { pickLimit: 99 }), 1);
  assert.equal(limitOf({ id: 'a', stock: 3 }, {}), 3);
});

test('tags 过滤只留带标签的条目', () => {
  const pool = poolOf([{ id: 'a', tags: ['vip'] }, { id: 'b' }, { id: 'c', tags: ['vip'] }]);
  const candidates = candidatesOf(pool, new Map(), { tags: ['vip'] });
  assert.deepEqual(candidates.map((e) => e.id), ['a', 'c']);
});

test('不放回：一轮内抽中的不重复，候选不足时少抽', () => {
  const rand = createRandom('seed-1');
  const candidates = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  const two = takeFrom(candidates, 2, rand, { replacement: 'without' });
  assert.equal(two.length, 2);
  assert.equal(new Set(two.map((e) => e.id)).size, 2);

  const five = takeFrom(candidates, 5, rand, { replacement: 'without' });
  assert.equal(five.length, 3);
});

test('放回：同一条目可在一轮内被抽中多次', () => {
  const rand = createRandom('seed-2');
  const candidates = [{ id: 'a' }];
  const drawn = takeFrom(candidates, 3, rand, { replacement: 'with' });
  assert.equal(drawn.length, 3);
  assert.deepEqual(drawn.map((e) => e.id), ['a', 'a', 'a']);
});

test('权重为零的条目不参与抽取', () => {
  const rand = createRandom('seed-3');
  const candidates = [{ id: 'zero', weight: 0 }, { id: 'one', weight: 1 }];
  const drawn = takeFrom(candidates, 5, rand, { replacement: 'with' });
  assert.deepEqual([...new Set(drawn.map((e) => e.id))], ['one']);
});
