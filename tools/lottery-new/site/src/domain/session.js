/**
 * 抽奖会话：一次"开始"到"入账"的过程。
 *
 * 状态固定为 performing → settled 两档：decide 出来就是 performing（结果已定、
 * 未入账），settle 之后才是 settled。撤销把整轮从账本里摘掉，回到原点。
 */

import { decide } from './engine.js';
import { apply, undo } from './ledger.js';

/**
 * 开一轮。结果在这一步定完，view 是交给形式的只读快照：
 * { [slotKey]: { entries: Entry[], hitIds: string[] } }
 */
export function createSession({ draw, pools = {}, ledger, seed, now = Date.now() }) {
  const round = decide({ draw, pools, ledger, seed, now });
  return { draw, round, view: viewOf(round, pools), status: round.status };
}

/**
 * 把已定的结果对成条目快照：{ [slotKey]: { poolId, entries, hitIds } }。
 * entries 是这个盘要展示的条目，hitIds 标出其中哪几个是命中。
 */
export function viewOf(round, pools = {}) {
  const view = {};
  for (const slot of round.slots ?? []) {
    const ids = round.sample?.[slot.key] ?? [];
    const entries = ids
      .map((id) => pools?.[slot.poolId]?.entries.find((entry) => entry.id === id) ?? null)
      .filter(Boolean);
    view[slot.key] = {
      poolId: slot.poolId,
      entries,
      hitIds: round.win
        ? round.picks.filter((pick) => pick.slotKey === slot.key).map((pick) => pick.entryId)
        : [],
    };
  }
  return view;
}

/**
 * 入账。幂等：同一轮重复调用只有第一次写账本，applied 说明这次写没写。
 */
export function settle(session, ledger) {
  const result = apply(ledger, session.round);
  return {
    ledger: result.ledger,
    session: { ...session, round: { ...session.round, status: 'settled' }, status: 'settled' },
    applied: result.applied,
  };
}

/** 撤销一轮，库存与已中次数随账本回滚。 */
export function undoRound(ledger, roundId) {
  return undo(ledger, roundId);
}
