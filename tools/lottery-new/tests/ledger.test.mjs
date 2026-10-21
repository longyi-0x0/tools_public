import test from 'node:test';
import assert from 'node:assert/strict';

import { createLedger, apply, undo, usageOf, usageIn, has } from '../site/src/domain/ledger.js';

function round(id, picks) {
  return { id, status: 'performing', win: true, picks, sample: {}, seed: 'x' };
}

test('已中次数从账本派生', () => {
  let ledger = createLedger();
  ledger = apply(ledger, round('r1', [{ slotKey: 'a', poolId: 'p1', entryId: 'e1' }])).ledger;
  ledger = apply(ledger, round('r2', [{ slotKey: 'a', poolId: 'p1', entryId: 'e1' }])).ledger;
  ledger = apply(ledger, round('r3', [{ slotKey: 'a', poolId: 'p2', entryId: 'e2' }])).ledger;

  assert.equal(usageOf(ledger).get('e1'), 2);
  assert.equal(usageOf(ledger).get('e2'), 1);
  assert.equal(usageIn(ledger, 'p1').get('e1'), 2);
  assert.equal(usageIn(ledger, 'p2').get('e1'), undefined);
});

test('同一轮重复入账只生效一次', () => {
  let ledger = createLedger();
  const r = round('r1', [{ slotKey: 'a', poolId: 'p1', entryId: 'e1' }]);

  const first = apply(ledger, r);
  assert.equal(first.applied, true);

  const second = apply(first.ledger, r);
  assert.equal(second.applied, false);
  assert.equal(second.ledger, first.ledger);
  assert.equal(usageOf(second.ledger).get('e1'), 1);
  assert.ok(has(second.ledger, 'r1'));
});

test('入账的轮次状态是 settled', () => {
  const { ledger } = apply(createLedger(), round('r1', []));
  assert.equal(ledger.rounds[0].status, 'settled');
});

test('撤销把整轮摘掉，次数随之回滚', () => {
  let ledger = createLedger();
  ledger = apply(ledger, round('r1', [{ slotKey: 'a', poolId: 'p1', entryId: 'e1' }])).ledger;
  const { ledger: back, removed } = undo(ledger, 'r1');

  assert.ok(removed);
  assert.equal(back.rounds.length, 0);
  assert.equal(usageOf(back).get('e1'), undefined);
});

test('撤销不存在的轮次不改动账本', () => {
  const ledger = createLedger();
  const result = undo(ledger, 'nope');
  assert.equal(result.removed, null);
  assert.equal(result.ledger, ledger);
});
