/**
 * 复算。
 *
 * 拿轮次自己的快照与种子重跑一遍，逐项比对。它对得上，说明这一轮的结果
 * 确实只由「当时那份候选 + 那个种子」决定，没有夹带现在的池或现在的账。
 *
 * 快照分两档：`full` 能复算，`digest` 只留了摘要——大池每轮存全量会把本机存储撑爆，
 * 所以这是显式降级，界面上要说「这一轮撤不了」，不能假装验过。
 */

import { resolve } from './engine.js';

/** 逐项比对两串命中，返回第一个不一样的位置起的所有差异。 */
export function diffPicks(expected = [], actual = []) {
  const diffs = [];
  const length = Math.max(expected.length, actual.length);
  for (let i = 0; i < length; i += 1) {
    const left = expected[i] ?? null;
    const right = actual[i] ?? null;
    if (!left || !right || left.slotKey !== right.slotKey || left.entryId !== right.entryId) {
      diffs.push({ index: i, expected: left, actual: right });
    }
  }
  return diffs;
}

/**
 * 复算一轮。成功时 diffs 为空；快照不可用时不跑，直接给原因。
 */
export function recompute(round) {
  if (!round) return { ok: false, reason: '没有这一轮', diffs: [], picks: [] };
  if (round.snapshot?.mode !== 'full') {
    return {
      ok: false,
      reason: round.snapshot?.mode === 'digest'
        ? '这一轮的候选太多，只存了摘要，无法复算'
        : '这一轮没有候选快照，无法复算',
      diffs: [],
      picks: round.picks ?? [],
    };
  }

  const boards = round.snapshot.boards;
  const result = resolve({
    slots: round.slots ?? [],
    seed: round.seed,
    form: round.form,
    entriesOf: (slot) => boards[slot.key]?.entries ?? [],
    usageOf: () => new Map(),
  });

  const diffs = diffPicks(round.picks ?? [], result.picks);
  return { ok: diffs.length === 0, reason: diffs.length === 0 ? null : '复算结果与原轮不一致', diffs, picks: result.picks };
}
