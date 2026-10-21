/**
 * 池与条目。
 *
 * 池不区分人员与奖品：两者是同一结构，差别只在新建时模板给的默认值
 * （人 stock 为 1，奖品可以多于 1）。引擎里没有按池类型分支的代码。
 *
 * stock 是条目自身的份数，剩余份数不存，从账本派生（见 ledger.js）。
 */

import { makeId } from './ids.js';

/** 条目。weight 参与加权抽取，非正数表示不参与。 */
export function createEntry({ id, label = '', weight = 1, stock = 1, tags = [], meta = {} } = {}) {
  return {
    id: id ?? makeId('e'),
    label,
    weight: Number.isFinite(weight) ? weight : 1,
    stock: Number.isFinite(stock) ? stock : 1,
    tags: [...tags],
    meta: { ...meta },
  };
}

/** 池。entries 的顺序即录入顺序，抽取不看顺序。 */
export function createPool({ id, name = '', entries = [] } = {}) {
  return { id: id ?? makeId('p'), name, entries: entries.map((entry) => createEntry(entry)) };
}

/** 把池数组折成 { [poolId]: Pool }，抽取时按 id 取用。 */
export function indexPools(pools = []) {
  return Object.fromEntries(pools.map((pool) => [pool.id, pool]));
}

export function entryOf(pools, poolId, entryId) {
  return pools?.[poolId]?.entries.find((entry) => entry.id === entryId) ?? null;
}
