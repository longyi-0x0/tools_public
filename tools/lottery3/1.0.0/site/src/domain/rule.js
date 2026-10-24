/**
 * 抽取规则：把池筛成候选集。
 *
 * usage 是作用域内派生的已中次数（Map<entryId, count>）。条目库存是唯一条目级上限，
 * 「中过的人不再中」「奖品发完为止」都不需要另存计数；槽位级的名额在装配前单独判。
 */

import { pickWeighted } from '../random.js';

/** 条目还能被抽中几次：库存减去作用域内已中。 */
export function limitOf(entry) {
  return Number.isFinite(entry.stock) ? entry.stock : Infinity;
}

export function availableOf(entry, usage) {
  return (usage.get(entry.id) ?? 0) < limitOf(entry);
}

/**
 * 候选集：先按标签过滤，再按作用域内的用量过滤。
 * 候选为空表示这个池抽不动了，界面上要说清楚，而不是静默抽空气。
 */
export function candidatesOf(pool, usage = new Map(), slot = {}) {
  const tags = slot.tags ?? [];
  return (pool?.entries ?? []).filter((entry) => {
    if (tags.length > 0 && !tags.some((tag) => entry.tags?.includes(tag))) return false;
    return availableOf(entry, usage);
  });
}

/**
 * 按规则抽 count 个。replacement 为 'with' 时同一轮内可重复命中，
 * 否则抽中即移出候选。
 */
export function takeFrom(candidates, count, rand, slot = {}) {
  const rest = [...candidates];
  const out = [];
  const replacement = slot.replacement === 'with';
  const weightOf = slot.weighted === false ? () => 1 : undefined;

  for (let i = 0; i < count && rest.length > 0; i += 1) {
    const picked = pickWeighted(rest, rand, weightOf);
    if (!picked) break;
    out.push(picked);
    if (!replacement) rest.splice(rest.indexOf(picked), 1);
  }
  return out;
}

/** 权重折算成概率，界面上要让人看懂 3 和 1 的差别。 */
export function oddsOf(candidates, slot = {}) {
  const weighted = slot.weighted !== false;
  const total = candidates.reduce((sum, entry) => sum + (weighted ? Math.max(0, entry.weight) : 1), 0);
  return new Map(candidates.map((entry) => {
    const weight = weighted ? Math.max(0, entry.weight) : 1;
    return [entry.id, total > 0 ? weight / total : 0];
  }));
}
