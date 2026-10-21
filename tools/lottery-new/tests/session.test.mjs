import test from 'node:test';
import assert from 'node:assert/strict';

import { createPool, indexPools } from '../site/src/domain/pool.js';
import { createDraw, validateDraw } from '../site/src/domain/draw.js';
import { createSession, settle, undoRound, viewOf } from '../site/src/domain/session.js';
import { createLedger, usageOf } from '../site/src/domain/ledger.js';

const pools = indexPools([
  createPool({ id: 'p1', entries: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }),
]);

function drawOf() {
  return createDraw({ id: 'd1', slots: [{ key: 'only', poolId: 'p1' }], form: { type: 'wheel' } });
}

test('开一轮后状态是 performing，尚未入账', () => {
  const session = createSession({ draw: drawOf(), pools, ledger: createLedger(), seed: 's' });
  assert.equal(session.status, 'performing');
  assert.equal(usageOf(createLedger()).size, 0);
});

test('视图是只读快照，含展示条目与命中标记', () => {
  const session = createSession({ draw: drawOf(), pools, ledger: createLedger(), seed: 's' });
  const slot = session.view.only;

  assert.equal(slot.poolId, 'p1');
  assert.ok(slot.entries.length > 0);
  assert.deepEqual(slot.hitIds, [session.round.picks[0].entryId]);
  assert.ok(slot.entries.some((entry) => entry.id === slot.hitIds[0]));

  // 形式层拿到的是视图，改它动不了已定的结果：结果存在 round 里，只有 id。
  assert.notEqual(slot.entries, pools.p1.entries);
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

test('撤销把这一轮从账本里摘掉', () => {
  const session = createSession({ draw: drawOf(), pools, ledger: createLedger(), seed: 's' });
  const { ledger } = settle(session, createLedger());

  const { ledger: back, removed } = undoRound(ledger, session.round.id);
  assert.equal(removed.id, session.round.id);
  assert.equal(usageOf(back).size, 0);
});

test('未中奖的一轮不产生任何账', () => {
  const draw = createDraw({
    id: 'd1',
    slots: [{ key: 'only', poolId: 'p1' }],
    form: { type: 'slot', options: { columns: 3 } },
    rule: { only: { hitRate: 0 } },
  });
  const session = createSession({ draw, pools, ledger: createLedger(), seed: 's' });
  assert.equal(session.round.win, false);

  const { ledger } = settle(session, createLedger());
  assert.equal(usageOf(ledger).size, 0);
  assert.deepEqual(session.view.only.hitIds, []);
});

test('校验拦下缺池与池数不符', () => {
  const ok = validateDraw(drawOf(), pools);
  assert.deepEqual(ok, []);

  const missing = validateDraw(
    createDraw({ id: 'd2', slots: [{ key: 'only', poolId: 'nope' }], form: { type: 'wheel' } }),
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

  const badMode = validateDraw(
    createDraw({
      id: 'd4',
      slots: [{ key: 'a', poolId: 'p1' }, { key: 'b', poolId: 'p1' }],
      form: { type: 'slot' },
      mode: 'independent',
    }),
    pools,
  );
  assert.ok(badMode.length > 0);
});

test('视图在没有命中的槽位上是空盘面', () => {
  const round = { slots: [{ key: 'only', poolId: 'p1' }], sample: { only: [] }, picks: [], win: false };
  const view = viewOf(round, pools);
  assert.deepEqual(view.only.entries, []);
  assert.deepEqual(view.only.hitIds, []);
});
