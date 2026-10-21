import test from 'node:test';
import assert from 'node:assert/strict';

import { createPool, indexPools } from '../site/src/domain/pool.js';
import { createDraw } from '../site/src/domain/draw.js';
import { decide, slotOrder } from '../site/src/domain/engine.js';
import { createLedger, apply, usageOf } from '../site/src/domain/ledger.js';

function poolsOf(defs) {
  return indexPools(defs.map((def) => createPool(def)));
}

test('单池抽一个，命中必在展示样本里', () => {
  const pools = poolsOf([{ id: 'p1', entries: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }] }]);
  const draw = createDraw({ id: 'd1', slots: [{ key: 'only', poolId: 'p1' }], form: { type: 'wheel' } });

  for (let i = 0; i < 20; i += 1) {
    const round = decide({ draw, pools, ledger: createLedger(), seed: `s${i}` });
    assert.equal(round.picks.length, 1);
    assert.ok(round.sample.only.includes(round.picks[0].entryId));
  }
});

test('同一个 seed 必得同一组结果', () => {
  const pools = poolsOf([{ id: 'p1', entries: Array.from({ length: 30 }, (_, i) => ({ id: `e${i}` })) }]);
  const draw = createDraw({ id: 'd1', slots: [{ key: 'only', poolId: 'p1' }], form: { type: 'wheel' } });

  const a = decide({ draw, pools, ledger: createLedger(), seed: 'fixed', now: 1 });
  const b = decide({ draw, pools, ledger: createLedger(), seed: 'fixed', now: 1 });
  assert.deepEqual(a.picks, b.picks);
  assert.deepEqual(a.sample, b.sample);
  assert.equal(a.id, b.id);
});

test('不放回：一轮抽三个互不相同的条目', () => {
  const pools = poolsOf([{ id: 'p1', entries: Array.from({ length: 10 }, (_, i) => ({ id: `e${i}` })) }]);
  const draw = createDraw({
    id: 'd1',
    slots: [{ key: 'only', poolId: 'p1' }],
    form: { type: 'wheel' },
    rule: { only: { count: 3, replacement: 'without' } },
  });

  const round = decide({ draw, pools, ledger: createLedger(), seed: 's' });
  assert.equal(round.picks.length, 3);
  assert.equal(new Set(round.picks.map((p) => p.entryId)).size, 3);
});

test('库存抽干后不再出结果，样本随之为空', () => {
  const pools = poolsOf([
    { id: 'p1', entries: [{ id: 'a', stock: 1 }, { id: 'b', stock: 1 }] },
  ]);
  const draw = createDraw({ id: 'd1', slots: [{ key: 'only', poolId: 'p1' }], form: { type: 'wheel' } });

  let ledger = createLedger();
  for (let i = 0; i < 2; i += 1) {
    const round = decide({ draw, pools, ledger, seed: `s${i}` });
    assert.equal(round.picks.length, 1);
    ledger = apply(ledger, round).ledger;
  }

  const third = decide({ draw, pools, ledger, seed: 's3' });
  assert.equal(third.picks.length, 0);
  assert.deepEqual(third.sample.only, []);
  assert.equal(usageOf(ledger).size, 2);
});

test('两个池同时抽：各出各的结果', () => {
  const pools = poolsOf([
    { id: 'people', entries: [{ id: 'u1' }, { id: 'u2' }] },
    { id: 'prize', entries: [{ id: 'g1' }, { id: 'g2' }] },
  ]);
  const draw = createDraw({
    id: 'd1',
    slots: [{ key: 'who', poolId: 'people' }, { key: 'what', poolId: 'prize' }],
    form: { type: 'wheel' },
    mode: 'independent',
  });

  const round = decide({ draw, pools, ledger: createLedger(), seed: 's' });
  assert.equal(round.picks.length, 2);
  assert.equal(round.picks.find((p) => p.slotKey === 'who').poolId, 'people');
  assert.equal(round.picks.find((p) => p.slotKey === 'what').poolId, 'prize');
});

test('同一池两个槽位按顺序抽：后者不会重复前者', () => {
  const pools = poolsOf([{ id: 'p1', entries: Array.from({ length: 8 }, (_, i) => ({ id: `e${i}` })) }]);
  const draw = createDraw({
    id: 'd1',
    slots: [{ key: 'first', poolId: 'p1' }, { key: 'second', poolId: 'p1' }],
    form: { type: 'wheel' },
    mode: 'a-then-b',
    rule: { first: { count: 1 }, second: { count: 1 } },
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
    form: { type: 'wheel' },
    mode: 'b-then-a',
  });
  assert.deepEqual(slotOrder(draw).map((s) => s.key), ['second', 'first']);
});

test('老虎机必中：出一个结果，三列同一个', () => {
  const pools = poolsOf([{ id: 'p1', entries: Array.from({ length: 10 }, (_, i) => ({ id: `e${i}` })) }]);
  const draw = createDraw({
    id: 'd1',
    slots: [{ key: 'only', poolId: 'p1' }],
    form: { type: 'slot', options: { columns: 3 } },
    rule: { only: { hitRate: 1 } },
  });

  const round = decide({ draw, pools, ledger: createLedger(), seed: 's' });
  assert.equal(round.win, true);
  assert.equal(round.picks.length, 1);
  assert.equal(round.sample.only.length, 3);
  assert.ok(round.sample.only.includes(round.picks[0].entryId));
});

test('老虎机必不中：没有结果，各列互不相同', () => {
  const pools = poolsOf([{ id: 'p1', entries: Array.from({ length: 10 }, (_, i) => ({ id: `e${i}` })) }]);
  const draw = createDraw({
    id: 'd1',
    slots: [{ key: 'only', poolId: 'p1' }],
    form: { type: 'slot', options: { columns: 3 } },
    rule: { only: { hitRate: 0 } },
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
    slots: [{ key: 'only', poolId: 'p1' }],
    form: { type: 'slot' },
    rule: { only: { hitRate: 0 } },
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
    form: { type: 'wheel' },
  });

  const round = decide({ draw, pools, ledger: createLedger(), seed: 's' });
  assert.equal(round.picks.length, 1);
  assert.deepEqual(round.sample.what, []);
});

test('未知形式直接抛错', () => {
  const draw = createDraw({ id: 'd1', slots: [{ key: 'a', poolId: 'p1' }], form: { type: 'nope' } });
  assert.throws(() => decide({ draw, pools: {}, ledger: createLedger(), seed: 's' }), /未知形式/);
});
