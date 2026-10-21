/**
 * 结果账本。
 *
 * 已中次数与剩余库存都从这里派生，不另存计数——一处写入，不会双写漂移。
 * 只有 settle 过的轮次才进账本；动画中途关掉页面不产生任何账。
 */

export function createLedger() {
  return { rounds: [] };
}

export function has(ledger, roundId) {
  return ledger.rounds.some((round) => round.id === roundId);
}

/**
 * 入账。按 round.id 幂等：重复 settle 同一轮只生效一次，返回 applied 说明这次有没有写。
 */
export function apply(ledger, round) {
  if (has(ledger, round.id)) return { ledger, applied: false };
  const settled = { ...round, status: 'settled' };
  return { ledger: { rounds: [...ledger.rounds, settled] }, applied: true };
}

/** 撤销一轮：整条移除，派生的次数与库存随之回滚。 */
export function undo(ledger, roundId) {
  const removed = ledger.rounds.find((round) => round.id === roundId) ?? null;
  if (!removed) return { ledger, removed: null };
  return { ledger: { rounds: ledger.rounds.filter((round) => round.id !== roundId) }, removed };
}

/** 每个条目已被抽中的次数。 */
export function usageOf(ledger) {
  const usage = new Map();
  for (const round of ledger.rounds) {
    for (const pick of round.picks ?? []) {
      usage.set(pick.entryId, (usage.get(pick.entryId) ?? 0) + 1);
    }
  }
  return usage;
}

/** 某个池内的已中次数，用来算剩余候选。 */
export function usageIn(ledger, poolId) {
  const usage = new Map();
  for (const round of ledger.rounds) {
    for (const pick of round.picks ?? []) {
      if (pick.poolId !== poolId) continue;
      usage.set(pick.entryId, (usage.get(pick.entryId) ?? 0) + 1);
    }
  }
  return usage;
}
