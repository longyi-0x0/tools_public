import test from 'node:test';
import assert from 'node:assert/strict';

import { createPool, indexPools } from '../site/src/domain/pool.js';
import { createDraw } from '../site/src/domain/draw.js';
import { decide, slotOrder, scopeOf, remainOf } from '../site/src/domain/engine.js';
import { createLedger, apply, usageOf } from '../site/src/domain/ledger.js';

function poolsOf(defs) {
  return indexPools(defs.map((def) => createPool(def)));
}

const many = (n = 10) => Array.from({ length: n }, (_, i) => ({ id: `e${i}`, stock: 1 }));

test('单池抽一个，命中必在展示样本里', () => {
  const pools = poolsOf([{ id: 'p1', entries: many() }]);
  const draw = createDraw({ id: 'd1', slots: [{ key: 'only', poolId: 'p1' }] });

  for (let i = 0; i < 20; i += 1) {
    const round = decide({ draw, pools, ledger: createLedger(), seed: `s${i}` });
    assert.equal(round.picks.length, 1);
    assert.ok(round.sample.only.includes(round.picks[0].entryId));
  }
});

test('同一个 seed 必得同一组结果', () => {
  const pools = poolsOf([{ id: 'p1', entries: many(30) }]);
  const draw = createDraw({ id: 'd1', slots: [{ key: 'only', poolId: 'p1' }] });

  const a = decide({ draw, pools, ledger: createLedger(), seed: 'fixed', now: 1 });
  const b = decide({ draw, pools, ledger: createLedger(), seed: 'fixed', now: 1 });
  assert.deepEqual(a.picks, b.picks);
  assert.deepEqual(a.sample, b.sample);
  assert.equal(a.id, b.id);
});

test('不放回：一轮抽三个互不相同的条目', () => {
  const pools = poolsOf([{ id: 'p1', entries: many() }]);
  const draw = createDraw({ id: 'd1', slots: [{ key: 'only', poolId: 'p1', count: 3 }] });

  const round = decide({ draw, pools, ledger: createLedger(), seed: 's' });
  assert.equal(round.picks.length, 3);
  assert.equal(new Set(round.picks.map((p) => p.entryId)).size, 3);
});

test('库存抽干后不再出结果，样本随之为空', () => {
  const pools = poolsOf([{ id: 'p1', entries: [{ id: 'a', stock: 1 }, { id: 'b', stock: 1 }] }]);
  const draw = createDraw({ id: 'd1', slots: [{ key: 'only', poolId: 'p1' }] });

  let ledger = createLedger();
  for (let i = 0; i < 2; i += 1) {
    ledger = apply(ledger, decide({ draw, pools, ledger, seed: `s${i}` })).ledger;
  }

  const third = decide({ draw, pools, ledger, seed: 's3' });
  assert.equal(third.picks.length, 0);
  assert.deepEqual(third.sample.only, []);
  assert.equal(usageOf(ledger).size, 2);
});

test('两个池同时抽：各出各的结果', () => {
  const pools = poolsOf([
    { id: 'people', entries: many(4) },
    { id: 'prize', entries: many(4) },
  ]);
  const draw = createDraw({
    id: 'd1',
    slots: [{ key: 'who', poolId: 'people' }, { key: 'what', poolId: 'prize' }],
    mode: 'independent',
  });

  const round = decide({ draw, pools, ledger: createLedger(), seed: 's' });
  assert.equal(round.picks.length, 2);
  assert.equal(round.picks.find((p) => p.slotKey === 'who').poolId, 'people');
  assert.equal(round.picks.find((p) => p.slotKey === 'what').poolId, 'prize');
});

test('同一池两个槽位按顺序抽：后者不会重复前者', () => {
  const pools = poolsOf([{ id: 'p1', entries: many(8) }]);
  const draw = createDraw({
    id: 'd1',
    slots: [{ key: 'first', poolId: 'p1' }, { key: 'second', poolId: 'p1' }],
    mode: 'a-then-b',
  });

  for (let i = 0; i < 20; i += 1) {
    const round = decide({ draw, pools, ledger: createLedger(), seed: `s${i}` });
    assert.equal(round.picks.length, 2);
    assert.notEqual(round.picks[0].entryId, round.picks[1].entryId);
  }
});

test('b-then-a 反的是槽位计算顺序', () => {
  const draw = createDraw({
    id: 'd1',
    slots: [{ key: 'first', poolId: 'p1' }, { key: 'second', poolId: 'p2' }],
    mode: 'b-then-a',
  });
  assert.deepEqual(slotOrder(draw).map((s) => s.key), ['second', 'first']);
});

test('名额是整场累计：开三轮，三轮加起来就是名额', () => {
  const pools = poolsOf([{ id: 'p1', entries: many(12) }]);
  const draw = createDraw({
    id: 'd1',
    slots: [{ key: 'only', poolId: 'p1', quota: 3, count: 2 }],
  });

  let ledger = createLedger();
  const first = decide({ draw, pools, ledger, seed: 's1' });
  assert.equal(first.picks.length, 2);
  ledger = apply(ledger, first).ledger;

  const second = decide({ draw, pools, ledger, seed: 's2' });
  assert.equal(second.picks.length, 1, '只剩一个名额就只能出 1 个');
  ledger = apply(ledger, second).ledger;

  const third = decide({ draw, pools, ledger, seed: 's3' });
  assert.equal(third.picks.length, 0);
  assert.deepEqual(third.sample.only, []);
  assert.equal(remainOf(ledger, 'd1', draw.slots[0]), 0);
});

test('组作用域：同组前一场中过的人不进后一场的候选', () => {
  const pools = poolsOf([{ id: 'p1', entries: [{ id: 'a', stock: 1 }, { id: 'b', stock: 1 }] }]);
  const slot = { key: 'only', poolId: 'p1', scope: 'group' };
  const drawA = createDraw({ id: 'dA', groupId: 'g1', slots: [slot] });
  const drawB = createDraw({ id: 'dB', groupId: 'g1', slots: [slot] });

  const first = decide({ draw: drawA, pools, ledger: createLedger(), seed: 's1' });
  const ledger = apply(createLedger(), first).ledger;

  const second = decide({ draw: drawB, pools, ledger, seed: 's2' });
  assert.equal(second.picks.length, 1);
  assert.notEqual(second.picks[0].entryId, first.picks[0].entryId);
});

test('本场作用域：换一场仍可抽到同一个人', () => {
  const pools = poolsOf([{ id: 'p1', entries: [{ id: 'a', stock: 1 }, { id: 'b', stock: 1 }] }]);
  const slot = { key: 'only', poolId: 'p1', scope: 'draw' };
  const drawA = createDraw({ id: 'dA', groupId: 'g1', slots: [slot] });
  const drawB = createDraw({ id: 'dB', groupId: 'g1', slots: [slot] });

  const first = decide({ draw: drawA, pools, ledger: createLedger(), seed: 's1' });
  const ledger = apply(createLedger(), first).ledger;

  const second = decide({ draw: drawB, pools, ledger, seed: 's2' });
  assert.equal(second.picks.length, 1, '本场作用域下另一个人的库存还在');
  // 两场各抽一个，合起来正好把两个人抽完
  assert.equal(new Set([first.picks[0].entryId, second.picks[0].entryId]).size, 2);
});

test('全部作用域：不同组也算同一片用量', () => {
  const pools = poolsOf([{ id: 'p1', entries: [{ id: 'a', stock: 1 }, { id: 'b', stock: 1 }] }]);
  const slot = { key: 'only', poolId: 'p1', scope: 'always' };
  const drawA = createDraw({ id: 'dA', groupId: 'g1', slots: [slot] });
  const drawB = createDraw({ id: 'dB', groupId: 'g2', slots: [slot] });

  const first = decide({ draw: drawA, pools, ledger: createLedger(), seed: 's1' });
  const ledger = apply(createLedger(), first).ledger;

  const second = decide({ draw: drawB, pools, ledger, seed: 's2' });
  assert.equal(second.picks.length, 1);
  assert.notEqual(second.picks[0].entryId, first.picks[0].entryId);
});

test('没有组的抽奖，组作用域按本场算', () => {
  const draw = createDraw({ id: 'd1', slots: [{ key: 'only', poolId: 'p1', scope: 'group' }] });
  assert.equal(scopeOf(draw.slots[0], draw), 'draw');
});

test('老虎机必中：出一个结果，三列同一个', () => {
  const pools = poolsOf([{ id: 'p1', entries: many() }]);
  const draw = createDraw({
    id: 'd1',
    slots: [{ key: 'only', poolId: 'p1', hitRate: 1 }],
    form: { type: 'slot', options: { columns: 3 } },
  });

  const round = decide({ draw, pools, ledger: createLedger(), seed: 's' });
  assert.equal(round.win, true);
  assert.equal(round.picks.length, 1);
  assert.equal(round.sample.only.length, 3);
  assert.ok(round.sample.only.includes(round.picks[0].entryId));
});

test('老虎机必不中：没有结果，各列互不相同', () => {
  const pools = poolsOf([{ id: 'p1', entries: many() }]);
  const draw = createDraw({
    id: 'd1',
    slots: [{ key: 'only', poolId: 'p1', hitRate: 0 }],
    form: { type: 'slot', options: { columns: 3 } },
  });

  const round = decide({ draw, pools, ledger: createLedger(), seed: 's' });
  assert.equal(round.win, false);
  assert.equal(round.picks.length, 0);
  assert.equal(new Set(round.sample.only).size, 3);
});

test('候选不足两个时老虎机凑不出失败态，只能中', () => {
  const pools = poolsOf([{ id: 'p1', entries: [{ id: 'e0' }] }]);
  const draw = createDraw({
    id: 'd1',
    slots: [{ key: 'only', poolId: 'p1', hitRate: 0 }],
    form: { type: 'slot' },
  });

  const round = decide({ draw, pools, ledger: createLedger(), seed: 's' });
  assert.equal(round.win, true);
  assert.equal(round.picks.length, 1);
});

test('槽位引用的池不存在时不抛错，该槽位无结果', () => {
  const pools = poolsOf([{ id: 'p1', entries: [{ id: 'a' }] }]);
  const draw = createDraw({
    id: 'd1',
    slots: [{ key: 'who', poolId: 'p1' }, { key: 'what', poolId: 'missing' }],
  });

  const round = decide({ draw, pools, ledger: createLedger(), seed: 's' });
  assert.equal(round.picks.length, 1);
  assert.deepEqual(round.sample.what, []);
});

test('未知形式直接抛错', () => {
  const draw = createDraw({ id: 'd1', slots: [{ key: 'a', poolId: 'p1' }], form: { type: 'nope' } });
  assert.throws(() => decide({ draw, pools: {}, ledger: createLedger(), seed: 's' }), /未知形式/);
});

test('开轮时定格候选：之后改池不动这一轮', () => {
  const pools = poolsOf([{ id: 'p1', entries: many(6) }]);
  const draw = createDraw({ id: 'd1', slots: [{ key: 'only', poolId: 'p1' }] });
  const round = decide({ draw, pools, ledger: createLedger(), seed: 's' });

  pools.p1.entries.length = 0;
  assert.equal(round.snapshot.mode, 'full');
  assert.equal(round.snapshot.boards.only.entries.length, 6);
  assert.equal(round.picks.length, 1);
});
