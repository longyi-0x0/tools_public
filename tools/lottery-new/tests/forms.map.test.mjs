import test from 'node:test';
import assert from 'node:assert/strict';

import { createPool, indexPools } from '../site/src/domain/pool.js';
import { createDraw } from '../site/src/domain/draw.js';
import { decide } from '../site/src/domain/engine.js';
import { viewOf } from '../site/src/domain/session.js';
import { createLedger, apply } from '../site/src/domain/ledger.js';
import { planOf } from '../site/src/forms/registry.js';

function roundOf(draw, pools, seed = 's') {
  const round = decide({ draw, pools, ledger: createLedger(), seed });
  return { round, view: viewOf(round, pools) };
}

const many = Array.from({ length: 40 }, (_, i) => ({ id: `e${i}`, label: `名字${i}` }));

test('转盘：一个池一个盘，停位指向命中的那条', () => {
  const pools = indexPools([createPool({ id: 'p1', entries: many }), createPool({ id: 'p2', entries: many })]);
  const draw = createDraw({
    id: 'd1',
    slots: [{ key: 'who', poolId: 'p1' }, { key: 'what', poolId: 'p2' }],
    form: { type: 'wheel' },
    mode: 'independent',
  });

  const { round, view } = roundOf(draw, pools);
  const plan = planOf(round, view);

  assert.equal(plan.boards.length, 2);
  for (const pick of round.picks) {
    const board = plan.boards.find((b) => b.slotKey === pick.slotKey);
    const index = board.spins[0];
    assert.equal(board.entries[index].id, pick.entryId);
  }
});

test('转盘：一次抽几个就转几次', () => {
  const pools = indexPools([createPool({ id: 'p1', entries: many })]);
  const draw = createDraw({
    id: 'd1',
    slots: [{ key: 'only', poolId: 'p1' }],
    form: { type: 'wheel' },
    rule: { only: { count: 3 } },
  });

  const { round, view } = roundOf(draw, pools);
  const plan = planOf(round, view);
  assert.equal(plan.boards[0].spins.length, 3);
  assert.equal(new Set(plan.boards[0].spins).size, 3);
});

test('转盘：抽取顺序决定是同时转还是依次转', () => {
  const pools = indexPools([createPool({ id: 'p1', entries: many }), createPool({ id: 'p2', entries: many })]);
  const slots = [{ key: 'a', poolId: 'p1' }, { key: 'b', poolId: 'p2' }];

  const together = roundOf(createDraw({ id: 'd1', slots, form: { type: 'wheel' }, mode: 'independent' }), pools);
  assert.equal(planOf(together.round, together.view).sequential, false);

  const oneByOne = roundOf(createDraw({ id: 'd1', slots, form: { type: 'wheel' }, mode: 'a-then-b' }), pools);
  assert.equal(planOf(oneByOne.round, oneByOne.view).sequential, true);
});

test('九宫格：停位指向命中的那格', () => {
  const pools = indexPools([createPool({ id: 'p1', entries: many })]);
  const draw = createDraw({ id: 'd1', slots: [{ key: 'only', poolId: 'p1' }], form: { type: 'grid' } });

  const { round, view } = roundOf(draw, pools);
  const plan = planOf(round, view);
  assert.equal(plan.boards.length, 1);
  assert.equal(plan.boards[0].entries[plan.boards[0].spins[0]].id, round.picks[0].entryId);
});

test('老虎机：中奖时三列同一个索引', () => {
  const pools = indexPools([createPool({ id: 'p1', entries: many })]);
  const draw = createDraw({
    id: 'd1',
    slots: [{ key: 'only', poolId: 'p1' }],
    form: { type: 'slot', options: { columns: 3 } },
    rule: { only: { hitRate: 1 } },
  });

  const { round, view } = roundOf(draw, pools);
  const plan = planOf(round, view);
  const stop = plan.boards[0].spins[0];

  assert.equal(stop.length, 3);
  assert.equal(new Set(stop).size, 1);
  assert.equal(plan.boards[0].entries[stop[0]].id, round.picks[0].entryId);
});

test('老虎机：未中奖时各列互不相同', () => {
  const pools = indexPools([createPool({ id: 'p1', entries: many })]);
  const draw = createDraw({
    id: 'd1',
    slots: [{ key: 'only', poolId: 'p1' }],
    form: { type: 'slot', options: { columns: 3 } },
    rule: { only: { hitRate: 0 } },
  });

  const { round, view } = roundOf(draw, pools);
  const plan = planOf(round, view);

  assert.equal(round.win, false);
  assert.equal(new Set(plan.boards[0].spins[0]).size, 3);
});

test('池已抽干时没有盘可装', () => {
  const pools = indexPools([createPool({ id: 'p1', entries: [{ id: 'e0' }, { id: 'e1' }] })]);
  const draw = createDraw({ id: 'd1', slots: [{ key: 'only', poolId: 'p1' }], form: { type: 'wheel' } });

  let ledger = createLedger();
  for (let i = 0; i < 2; i += 1) {
    ledger = apply(ledger, decide({ draw, pools, ledger, seed: `s${i}` })).ledger;
  }

  const empty = decide({ draw, pools, ledger, seed: 's2' });
  const plan = planOf(empty, viewOf(empty, pools));

  assert.equal(plan.boards.length, 1);
  assert.deepEqual(plan.boards[0].entries, []);
  assert.deepEqual(plan.boards[0].spins, []);
});
