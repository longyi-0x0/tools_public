/**
 * 抽奖会话：一次「开始」到「入账」的过程。
 *
 * 状态是领域里那条链的一段：decide 出来是 decided，交表演记 performing，
 * 入账变 settled；撤销与丢弃是终态，记录不删。
 */

import { decide } from './engine.js';
import { apply, undo, discard, slotUsed } from './ledger.js';

/**
 * 开一轮。结果在这一步定完，view 是交给形式的只读快照：
 * { [slotKey]: { poolId, entries, hitIds } }
 *
 * `manual` 是主持人在台上自己定的那几位，作为输入进来，不参与随机。
 */
export function createSession({ draw, pools = {}, ledger, seed, now = Date.now(), manual = {} }) {
  const round = { ...decide({ draw, pools, ledger, seed, now, manual }), status: 'performing' };
  return { draw, round, view: viewOf(round, pools), status: 'performing' };
}

/**
 * 把已定的结果对成条目快照。优先用当前池里的条目（有名字），条目被删了就用
 * 轮次快照里的 id 兜底显示「（已删除）」——历史记录不会因为池被改动就断掉。
 */
export function viewOf(round, pools = {}) {
  const view = {};
  const hits = new Map();
  for (const pick of round.picks ?? []) {
    if (!hits.has(pick.slotKey)) hits.set(pick.slotKey, []);
    hits.get(pick.slotKey).push(pick.entryId);
  }

  for (const slot of round.slots ?? []) {
    const ids = round.sample?.[slot.key] ?? [];
    const frozen = round.snapshot?.boards?.[slot.key]?.entries ?? [];
    const entries = ids.map((id) => {
      const live = pools?.[slot.poolId]?.entries.find((entry) => entry.id === id);
      if (live) return live;
      const kept = frozen.find((entry) => entry.id === id);
      return kept
        ? { id, label: '（已删除）', weight: kept.weight, stock: kept.stock, tags: [] }
        : { id, label: '（已删除）', weight: 1, stock: 1, tags: [] };
    });
    view[slot.key] = {
      poolId: slot.poolId,
      entries,
      hitIds: round.win ? (hits.get(slot.key) ?? []) : [],
    };
  }
  return view;
}

/** 入账。幂等：同一轮重复调用只有第一次写账本。 */
export function settle(session, ledger) {
  const result = apply(ledger, session.round);
  return {
    ledger: result.ledger,
    session: { ...session, round: { ...session.round, status: 'settled' }, status: 'settled' },
    applied: result.applied,
    reason: result.reason ?? null,
  };
}

/** 撤销一轮：只能撤最近一次结算的那轮，撤完占额回滚、轮次留档。 */
export function undoRound(ledger, roundId) {
  return undo(ledger, roundId);
}

/** 丢弃一轮未结算的结果：不产生占额。 */
export function discardRound(ledger, roundId) {
  return discard(ledger, roundId);
}

/** 每个槽位的名额进度：已出几个、共几个、还剩几个。 */
export function progressOf(ledger, draw) {
  return (draw.slots ?? []).map((slot) => {
    const used = slotUsed(ledger, draw.id, slot.key);
    const quota = slot.quota ?? Infinity;
    return {
      key: slot.key,
      used,
      quota,
      remain: Number.isFinite(quota) ? Math.max(0, quota - used) : Infinity,
    };
  });
}
