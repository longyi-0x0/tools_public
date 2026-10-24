import test from 'node:test';
import assert from 'node:assert/strict';

import { createPool, indexPools } from '../site/src/domain/pool.js';
import { createDraw, validateDraw } from '../site/src/domain/draw.js';
import { createSession, settle, undoRound, discardRound, viewOf, progressOf } from '../site/src/domain/session.js';
import { createLedger, apply, usageOf } from '../site/src/domain/ledger.js';

const pools = indexPools([
  createPool({ id: 'p1', entries: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }),
]);

function drawOf(extra = {}) {
  return createDraw({ id: 'd1', slots: [{ key: 'only', poolId: 'p1' }], ...extra });
}

test('开一轮后状态是 performing，尚未入账', () => {
  const session = createSession({ draw: drawOf(), pools, ledger: createLedger(), seed: 's' });
  assert.equal(session.status, 'performing');
  assert.equal(session.round.status, 'performing');
  assert.equal(usageOf(createLedger()).size, 0);
});

test('视图是只读快照，含展示条目与命中标记', () => {
  const session = createSession({ draw: drawOf(), pools, ledger: createLedger(), seed: 's' });
  const slot = session.view.only;

  assert.equal(slot.poolId, 'p1');
  assert.ok(slot.entries.length > 0);
  assert.deepEqual(slot.hitIds, [session.round.picks[0].entryId]);
  assert.ok(slot.entries.some((entry) => entry.id === slot.hitIds[0]));

  slot.entries.length = 0;
  assert.ok(session.round.sample.only.length > 0);
  assert.equal(session.round.picks.length, 1);
});

test('入账写一次，重复 settle 不重复计数', () => {
  const session = createSession({ draw: drawOf(), pools, ledger: createLedger(), seed: 's' });

  const first = settle(session, createLedger());
  assert.equal(first.applied, true);
  assert.equal(usageOf(first.ledger).get(session.round.picks[0].entryId), 1);
  assert.equal(first.session.status, 'settled');

  const second = settle(session, first.ledger);
  assert.equal(second.applied, false);
  assert.equal(usageOf(second.ledger).get(session.round.picks[0].entryId), 1);
});

test('撤销留档：账回滚，轮次还在', () => {
  const session = createSession({ draw: drawOf(), pools, ledger: createLedger(), seed: 's' });
  const { ledger } = settle(session, createLedger());

  const { ledger: back, round } = undoRound(ledger, session.round.id);
  assert.equal(round.status, 'undone');
  assert.equal(back.rounds.length, 1);
  assert.equal(back.rounds[0].status, 'undone');
  assert.equal(usageOf(back).size, 0);
});

test('丢弃未结算的一轮不产生任何账', () => {
  const session = createSession({ draw: drawOf(), pools, ledger: createLedger(), seed: 's' });
  const ledger = { rounds: [session.round] };
  const dropped = discardRound(ledger, session.round.id);
  assert.equal(dropped.ledger.rounds[0].status, 'discarded');
  assert.equal(usageOf(dropped.ledger).size, 0);
});

test('未中奖的一轮不产生任何账', () => {
  const draw = createDraw({
    id: 'd1',
    slots: [{ key: 'only', poolId: 'p1', hitRate: 0 }],
    form: { type: 'slot', options: { columns: 3 } },
  });
  const session = createSession({ draw, pools, ledger: createLedger(), seed: 's' });
  assert.equal(session.round.win, false);

  const { ledger } = settle(session, createLedger());
  assert.equal(usageOf(ledger).size, 0);
  assert.deepEqual(session.view.only.hitIds, []);
});

test('校验拦下缺池与池数不符', () => {
  assert.deepEqual(validateDraw(drawOf(), pools), []);

  const missing = validateDraw(
    createDraw({ id: 'd2', slots: [{ key: 'only', poolId: 'nope' }] }),
    pools,
  );
  assert.ok(missing.some((message) => message.includes('不存在')));

  const tooMany = validateDraw(
    createDraw({
      id: 'd3',
      slots: [{ key: 'a', poolId: 'p1' }, { key: 'b', poolId: 'p1' }],
      form: { type: 'grid' },
    }),
    pools,
  );
  assert.ok(tooMany.some((message) => message.includes('最多支持')));
});

test('视图在没有命中的槽位上是空盘面', () => {
  const round = { slots: [{ key: 'only', poolId: 'p1' }], sample: { only: [] }, picks: [], win: false };
  const view = viewOf(round, pools);
  assert.deepEqual(view.only.entries, []);
  assert.deepEqual(view.only.hitIds, []);
});

test('视图在条目被删后显示占位，不丢这一格', () => {
  const session = createSession({ draw: drawOf(), pools, ledger: createLedger(), seed: 's' });
  const hit = session.round.picks[0].entryId;
  const view = viewOf(session.round, { p1: { id: 'p1', entries: [] } });
  const kept = view.only.entries.find((entry) => entry.id === hit);
  assert.equal(kept.label, '（已删除）');
});

test('名额进度：已出、共几个、还剩几个', () => {
  const draw = drawOf({ slots: [{ key: 'only', poolId: 'p1', quota: 3 }] });
  const session = createSession({ draw, pools, ledger: createLedger(), seed: 's' });
  const ledger = apply(createLedger(), session.round).ledger;

  const [progress] = progressOf(ledger, draw);
  assert.equal(progress.used, 1);
  assert.equal(progress.quota, 3);
  assert.equal(progress.remain, 2);
});
