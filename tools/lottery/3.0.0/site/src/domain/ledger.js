/**
 * 结果账本。
 *
 * 只有结算（settle）过的轮次进账，动画中断不产生任何账。已中次数、剩余库存、
 * 槽位还剩几个名额，全部从这里的 picks 派生，不另存计数——一处写入，不会双写漂移。
 *
 * 撤销不删记录：整轮占额作废、状态记成 `undone`，命中原样留着。审计要看到的是
 * 「这轮开过、又被撤了」，删掉就查不到了（R-09）。撤销也只能撤栈顶那一轮（R-15），
 * 一旦允许跳着撤，后面那些轮次建立的用量就全成了悬空结论。
 */

export const ROUND_STATUS_LABEL = {
  decided: '已开出',
  performing: '演出中',
  settled: '已入账',
  undone: '已撤销',
  discarded: '已丢弃',
};

export function createLedger() {
  return { rounds: [] };
}

export function has(ledger, roundId) {
  return ledger.rounds.some((round) => round.id === roundId);
}

export function roundOf(ledger, roundId) {
  return ledger.rounds.find((round) => round.id === roundId) ?? null;
}

/**
 * 入账。按 round.id 幂等：重复 settle 只生效一次。
 * 已撤销的轮次不许再结算——撤销是终态，进了就出不来。
 */
export function apply(ledger, round) {
  const kept = roundOf(ledger, round.id);
  if (kept) {
    return { ledger, applied: false, reason: kept.status === 'undone' ? 'undone' : 'settled' };
  }
  const settled = { ...round, status: 'settled' };
  return { ledger: { rounds: [...ledger.rounds, settled] }, applied: true };
}

/** 最近一次结算的轮次，也就是唯一可撤的那一轮。 */
export function topSettled(ledger) {
  for (let i = ledger.rounds.length - 1; i >= 0; i -= 1) {
    if (ledger.rounds[i].status === 'settled') return ledger.rounds[i];
  }
  return null;
}

/**
 * 撤销一轮：整轮占额作废，状态改 `undone`，命中与快照留档。
 * 不是栈顶、不是已入账、不存在，都不动账本，只回一个原因。
 */
export function undo(ledger, roundId) {
  const target = roundOf(ledger, roundId);
  if (!target) return { ledger, round: null, reason: 'missing' };
  if (target.status !== 'settled') return { ledger, round: target, reason: 'not-settled' };

  const top = topSettled(ledger);
  if (!top || top.id !== target.id) return { ledger, round: target, reason: 'not-top' };

  const rounds = ledger.rounds.map((round) => (
    round.id === target.id ? { ...round, status: 'undone' } : round
  ));
  return { ledger: { rounds }, round: { ...target, status: 'undone' }, reason: null };
}

/** 未结算的轮次可以丢弃：不产生占额，也不留可用记录。 */
export function discard(ledger, roundId) {
  const target = roundOf(ledger, roundId);
  if (!target) return { ledger, round: null, reason: 'missing' };
  if (target.status === 'settled') return { ledger, round: target, reason: 'settled' };
  if (target.status === 'undone' || target.status === 'discarded') {
    return { ledger, round: target, reason: 'terminal' };
  }
  const rounds = ledger.rounds.map((round) => (
    round.id === target.id ? { ...round, status: 'discarded' } : round
  ));
  return { ledger: { rounds }, round: { ...target, status: 'discarded' }, reason: null };
}

export function settledRounds(ledger, drawId = null) {
  return ledger.rounds.filter((round) => (
    round.status === 'settled' && (drawId === null || round.drawId === drawId)
  ));
}

/** 账只从已结算的轮次算：撤销过的轮次命中还在，但不许算回用量（R-19）。 */
export function usageOf(ledger) {
  const usage = new Map();
  for (const round of ledger.rounds) {
    if (round.status !== 'settled') continue;
    for (const pick of round.picks ?? []) {
      usage.set(pick.entryId, (usage.get(pick.entryId) ?? 0) + 1);
    }
  }
  return usage;
}

export function usageIn(ledger, poolId) {
  const usage = new Map();
  for (const round of ledger.rounds) {
    if (round.status !== 'settled') continue;
    for (const pick of round.picks ?? []) {
      if (pick.poolId !== poolId) continue;
      usage.set(pick.entryId, (usage.get(pick.entryId) ?? 0) + 1);
    }
  }
  return usage;
}

/**
 * 作用域内的用量。
 *
 * `draw` 只看本场，`group` 看同组（没有组时退化为本场），`always` 看全部。
 * 组的判据取轮次上冻结的 groupId，不是抽奖现在的归属——开完奖再改组，
 * 旧轮次的口径不变（R-16）。
 */
export function scopedUsage(ledger, { scope = 'draw', drawId = null, groupId = null } = {}) {
  const usage = new Map();
  for (const round of ledger.rounds) {
    if (round.status !== 'settled') continue;
    if (scope === 'draw' && round.drawId !== drawId) continue;
    if (scope === 'group') {
      if (!groupId) {
        if (round.drawId !== drawId) continue;
      } else if (round.groupId !== groupId) continue;
    }
    for (const pick of round.picks ?? []) {
      usage.set(pick.entryId, (usage.get(pick.entryId) ?? 0) + 1);
    }
  }
  return usage;
}

/** 某个槽位在这个抽奖里已经出过几个奖。名额是整场累计，就靠它减（R-03）。 */
export function slotUsed(ledger, drawId, slotKey) {
  let used = 0;
  for (const round of ledger.rounds) {
    if (round.status !== 'settled' || round.drawId !== drawId) continue;
    for (const pick of round.picks ?? []) {
      if (pick.slotKey === slotKey) used += 1;
    }
  }
  return used;
}

/** 占额三元组。账本的真相是它，picks 只是它的存储形状。 */
export function claimsOf(round) {
  return (round?.picks ?? []).map((pick) => ({
    roundId: round.id,
    slotKey: pick.slotKey,
    entryId: pick.entryId,
  }));
}
