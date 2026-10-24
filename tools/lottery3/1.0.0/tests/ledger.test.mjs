import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createLedger, apply, undo, discard, topSettled, usageOf, usageIn,
  scopedUsage, slotUsed, claimsOf, has, settledRounds,
} from '../site/src/domain/ledger.js';

function round(id, picks, extra = {}) {
  return { id, status: 'performing', win: true, picks, sample: {}, seed: 'x', drawId: 'd1', groupId: null, ...extra };
}

const pick = (slotKey, entryId, poolId = 'p1') => ({ slotKey, poolId, entryId });

test('已中次数从账本派生', () => {
  let ledger = createLedger();
  ledger = apply(ledger, round('r1', [pick('a', 'e1')])).ledger;
  ledger = apply(ledger, round('r2', [pick('a', 'e1')])).ledger;
  ledger = apply(ledger, round('r3', [pick('a', 'e2', 'p2')])).ledger;

  assert.equal(usageOf(ledger).get('e1'), 2);
  assert.equal(usageIn(ledger, 'p1').get('e1'), 2);
  assert.equal(usageIn(ledger, 'p2').get('e1'), undefined);
});

test('同一轮重复入账只生效一次', () => {
  const first = apply(createLedger(), round('r1', [pick('a', 'e1')]));
  assert.equal(first.applied, true);

  const second = apply(first.ledger, round('r1', [pick('a', 'e1')]));
  assert.equal(second.applied, false);
  assert.equal(second.reason, 'settled');
  assert.equal(usageOf(second.ledger).get('e1'), 1);
  assert.ok(has(second.ledger, 'r1'));
});

test('入账的轮次状态是 settled', () => {
  const { ledger } = apply(createLedger(), round('r1', []));
  assert.equal(ledger.rounds[0].status, 'settled');
  assert.equal(ledger.rounds[0].picks.length, 0);
});

test('撤销不删记录：状态记 undone，命中留档，用量回滚', () => {
  let ledger = createLedger();
  ledger = apply(ledger, round('r1', [pick('a', 'e1')])).ledger;
  const { ledger: after, round: undone } = undo(ledger, 'r1');

  assert.equal(after.rounds.length, 1);
  assert.equal(after.rounds[0].status, 'undone');
  assert.deepEqual(after.rounds[0].picks, [pick('a', 'e1')]);
  assert.equal(undone.status, 'undone');
  assert.equal(usageOf(after).get('e1'), undefined);
  assert.equal(settledRounds(after).length, 0);
});

test('撤销过的轮次不能再结算', () => {
  let ledger = createLedger();
  ledger = apply(ledger, round('r1', [pick('a', 'e1')])).ledger;
  ledger = undo(ledger, 'r1').ledger;

  const again = apply(ledger, round('r1', [pick('a', 'e1')]));
  assert.equal(again.applied, false);
  assert.equal(again.reason, 'undone');
});

test('只能撤栈顶那轮，跳着撤被拒绝', () => {
  let ledger = createLedger();
  ledger = apply(ledger, round('r1', [pick('a', 'e1')])).ledger;
  ledger = apply(ledger, round('r2', [pick('a', 'e2')])).ledger;

  assert.equal(topSettled(ledger).id, 'r2');

  const rejected = undo(ledger, 'r1');
  assert.equal(rejected.reason, 'not-top');
  assert.equal(rejected.ledger, ledger);

  const ok = undo(ledger, 'r2');
  assert.equal(ok.reason, null);
  assert.equal(topSettled(ok.ledger).id, 'r1');
});

test('撤销不存在的轮次不改动账本', () => {
  const ledger = createLedger();
  const result = undo(ledger, 'nope');
  assert.equal(result.reason, 'missing');
  assert.equal(result.ledger, ledger);
});

test('未结算的轮次可以丢弃，不产生占额', () => {
  let ledger = apply(createLedger(), round('r1', [pick('a', 'e1')])).ledger;
  const pending = round('r2', [pick('a', 'e2')]);
  ledger = { rounds: [...ledger.rounds, pending] };

  const dropped = discard(ledger, 'r2');
  assert.equal(dropped.reason, null);
  assert.equal(dropped.ledger.rounds[1].status, 'discarded');
  assert.equal(usageOf(dropped.ledger).size, 1);
  assert.equal(discard(dropped.ledger, 'r1').reason, 'settled');
});

test('作用域决定用量算到哪一层', () => {
  let ledger = createLedger();
  ledger = apply(ledger, round('r1', [pick('a', 'e1')], { drawId: 'd1', groupId: 'g1' })).ledger;
  ledger = apply(ledger, round('r2', [pick('a', 'e2')], { drawId: 'd2', groupId: 'g2' })).ledger;

  assert.equal(scopedUsage(ledger, { scope: 'draw', drawId: 'd1' }).get('e1'), 1);
  assert.equal(scopedUsage(ledger, { scope: 'draw', drawId: 'd1' }).get('e2'), undefined);

  assert.equal(scopedUsage(ledger, { scope: 'group', drawId: 'd2', groupId: 'g1' }).get('e1'), 1);
  assert.equal(scopedUsage(ledger, { scope: 'group', drawId: 'd2', groupId: 'g1' }).get('e2'), undefined);
  assert.equal(scopedUsage(ledger, { scope: 'group', drawId: 'd2', groupId: 'g2' }).get('e2'), 1);

  assert.equal(scopedUsage(ledger, { scope: 'always' }).get('e1'), 1);
  assert.equal(scopedUsage(ledger, { scope: 'always' }).get('e2'), 1);
});

test('没有组的抽奖，组作用域按本场算', () => {
  let ledger = createLedger();
  ledger = apply(ledger, round('r1', [pick('a', 'e1')], { drawId: 'd1', groupId: null })).ledger;
  ledger = apply(ledger, round('r2', [pick('a', 'e2')], { drawId: 'd2', groupId: null })).ledger;

  const usage = scopedUsage(ledger, { scope: 'group', drawId: 'd2', groupId: null });
  assert.equal(usage.get('e1'), undefined);
  assert.equal(usage.get('e2'), 1);
});

test('槽位已出几个奖按抽奖累计，跨轮不重置', () => {
  let ledger = createLedger();
  ledger = apply(ledger, round('r1', [pick('a', 'e1'), pick('a', 'e2')])).ledger;
  ledger = apply(ledger, round('r2', [pick('a', 'e3'), pick('b', 'e4')])).ledger;

  assert.equal(slotUsed(ledger, 'd1', 'a'), 3);
  assert.equal(slotUsed(ledger, 'd1', 'b'), 1);
  assert.equal(slotUsed(ledger, 'd2', 'a'), 0);
});

test('占额是 (轮次, 槽位, 条目) 三元组', () => {
  const claims = claimsOf({ id: 'r1', picks: [pick('a', 'e1'), pick('b', 'e2')] });
  assert.deepEqual(claims, [
    { roundId: 'r1', slotKey: 'a', entryId: 'e1' },
    { roundId: 'r1', slotKey: 'b', entryId: 'e2' },
  ]);
});
