import test from 'node:test';
import assert from 'node:assert/strict';

import { createPool, indexPools } from '../site/src/domain/pool.js';
import { createDraw } from '../site/src/domain/draw.js';
import { decide } from '../site/src/domain/engine.js';
import { recompute } from '../site/src/domain/recompute.js';

const pools = indexPools([createPool({
  id: 'p1',
  entries: Array.from({ length: 12 }, (_, i) => ({ id: `e${i}`, stock: 1, weight: i + 1 })),
})]);

const draw = createDraw({ id: 'd1', slots: [{ key: 'only', poolId: 'p1', count: 3 }] });

test('复算与原轮逐项相等', () => {
  const round = decide({ draw, pools, ledger: { rounds: [] }, seed: 'fixed', now: 7 });
  const result = recompute(round);
  assert.equal(result.ok, true);
  assert.deepEqual(result.diffs, []);
  assert.deepEqual(result.picks, round.picks);
});

test('开完奖再改池，复算结果不变', () => {
  const round = decide({ draw, pools, ledger: { rounds: [] }, seed: 'fixed', now: 7 });

  pools.p1.entries.push({ id: 'late', label: '后来的人', stock: 1, weight: 99 });
  pools.p1.entries[0].weight = 1000;

  const result = recompute(round);
  assert.equal(result.ok, true, '池变了也按当时快照复算');
  assert.deepEqual(result.picks, round.picks);
});

test('改掉命中记录后复算能发现差异', () => {
  const round = decide({ draw, pools, ledger: { rounds: [] }, seed: 'fixed', now: 7 });
  const tampered = {
    ...round,
    picks: round.picks.map((pick, index) => (index === 0 ? { ...pick, entryId: 'someone-else' } : pick)),
  };

  const result = recompute(tampered);
  assert.equal(result.ok, false);
  assert.ok(result.diffs.length > 0);
  assert.equal(result.diffs[0].expected.entryId, 'someone-else');
  assert.equal(result.diffs[0].actual.entryId, round.picks[0].entryId);
});

test('只存摘要的轮次不假装能复算', () => {
  const round = decide({ draw, pools, ledger: { rounds: [] }, seed: 'fixed', now: 7 });
  const result = recompute({ ...round, snapshot: { mode: 'digest', digest: 'x' } });
  assert.equal(result.ok, false);
  assert.match(result.reason, /摘要/);
});

test('没有快照的老轮次给出明确原因', () => {
  const round = decide({ draw, pools, ledger: { rounds: [] }, seed: 'fixed', now: 7 });
  const result = recompute({ ...round, snapshot: undefined });
  assert.equal(result.ok, false);
  assert.match(result.reason, /没有候选快照/);
});
