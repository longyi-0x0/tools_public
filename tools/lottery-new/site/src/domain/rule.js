/**
 * 抽取规则：把池筛成候选集。
 *
 * usage 是账本派生的已中次数（Map<entryId, count>），规则与条目 stock 取小
 * 作为上限，所以"中过的人不再中""奖品发完为止"都不需要另外存计数。
 */

import { pickWeighted } from '../random.js';

/** 上限：规则级 pickLimit 与条目自身 stock 取小。 */
export function limitOf(entry, rule = {}) {
  const stock = Number.isFinite(entry.stock) ? entry.stock : 1;
  const pick = Number.isFinite(rule.pickLimit) ? rule.pickLimit : Infinity;
  return Math.max(0, Math.min(stock, pick));
}

/** 该条目还能不能被抽中。 */
export function availableOf(entry, usage, rule = {}) {
  return (usage.get(entry.id) ?? 0) < limitOf(entry, rule);
}

/**
 * 候选集：先按 tags 过滤，再按剩余额度过滤。
 * 候选为空表示这个池抽不动了，界面上要说清楚而不是静默抽空气。
 */
export function candidatesOf(pool, usage = new Map(), rule = {}) {
  const tags = rule.tags ?? [];
  return (pool?.entries ?? []).filter((entry) => {
    if (tags.length > 0 && !tags.some((tag) => entry.tags.includes(tag))) return false;
    return availableOf(entry, usage, rule);
  });
}

/**
 * 按规则抽 count 个。replacement 为 'with' 时同一轮内可重复命中，
 * 否则抽中即移出候选。
 */
export function takeFrom(candidates, count, rand, rule = {}) {
  const rest = [...candidates];
  const out = [];
  const replacement = rule.replacement === 'with';
  const weightOf = rule.weighted === false ? () => 1 : undefined;

  for (let i = 0; i < count && rest.length > 0; i += 1) {
    const picked = pickWeighted(rest, rand, weightOf);
    if (!picked) break;
    out.push(picked);
    if (!replacement) rest.splice(rest.indexOf(picked), 1);
  }
  return out;
}
