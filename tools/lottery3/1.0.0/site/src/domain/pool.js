/**
 * 池与条目。
 *
 * 池只是成员引用：一个条目可以同时属于几个池，删池不删条目。这不是偷懒——
 * 「同组不重复中奖」正建立在「同一个人出现在几个池里、用量合并计算」之上。
 *
 * 条目带四样东西：身份 `id`（导入时取外部主键）、库存 `stock`（最多被抽中几次，
 * Infinity 表示不限）、权重 `weight`（相对机会）、标签 `tags`（规则筛选用）。
 * 剩余库存不存，一律从账本派生（见 ledger.js）。
 */

import { makeId, entryKey } from './ids.js';

/** 库存归一：`null` / `∞` / `不限` 表示不限，其余收成正整数。 */
export function normalizeStock(value) {
  if (value === null || value === Infinity || value === '∞' || value === '不限') return Infinity;
  const count = Math.floor(Number(value));
  return Number.isFinite(count) && count > 0 ? count : 1;
}

function normalizeWeight(value) {
  const weight = Number(value);
  return Number.isFinite(weight) && weight > 0 ? weight : 0;
}

/**
 * 条目。
 *
 * `source + extKey` 同时存在时 id 由它们派生，重复导入即同一个条目；
 * 都没有时发随机号，给手工新建用。
 */
export function createEntry({
  id,
  source = 'manual',
  extKey = '',
  label = '',
  weight = 1,
  stock = 1,
  tags = [],
  meta = {},
} = {}) {
  const key = extKey ? entryKey(source, extKey) : '';
  return {
    id: id ?? (key || makeId('e')),
    source,
    extKey,
    label,
    weight: normalizeWeight(weight),
    stock: normalizeStock(stock),
    tags: [...tags],
    meta: { ...meta },
  };
}

/** 清单的用处：装人（people）、装奖品（prize）、不挑（generic）。只影响界面说法与默认份数。 */
export const POOL_KINDS = ['people', 'prize', 'generic'];

export function createPool({ id, name = '', kind = 'generic', entries = [] } = {}) {
  return {
    id: id ?? makeId('p'),
    name,
    kind: POOL_KINDS.includes(kind) ? kind : 'generic',
    entries: entries.map((entry) => createEntry(entry)),
  };
}

/** 从名字猜用处，只用在迁移老数据时给个说得过去的默认值；猜不出就按通用算。 */
export function guessKind(name = '') {
  if (/奖品|奖项|礼品|奖池/.test(name)) return 'prize';
  if (/名单|人员|员工|同事|参与|同学|客户/.test(name)) return 'people';
  return 'generic';
}

/** 池数组折成 { [poolId]: Pool }，抽取时按 id 取用。 */
export function indexPools(pools = []) {
  return Object.fromEntries(pools.map((pool) => [pool.id, pool]));
}

export function entryOf(pools, poolId, entryId) {
  return pools?.[poolId]?.entries.find((entry) => entry.id === entryId) ?? null;
}

/**
 * 把新导入的条目并进现有池：撞上同一个外部主键就更新标签与库存权重，不新建。
 * 缺主键的行直接退回给调用方——自造 id 会让同一份名单越导越多（R-20）。
 */
export function mergeEntries(existing = [], incoming = []) {
  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  const rejected = [];

  for (const raw of incoming) {
    const extKey = String(raw?.extKey ?? '').trim();
    if (!extKey) {
      rejected.push(raw);
      continue;
    }
    const entry = createEntry({ ...raw, extKey });
    const kept = byId.get(entry.id);
    byId.set(entry.id, kept
      ? { ...kept, label: entry.label || kept.label, stock: entry.stock, weight: entry.weight }
      : entry);
  }

  return { entries: [...byId.values()], rejected };
}

/** 池的条数与份数合计，界面上的一句话摘要。 */
export function poolSummary(pool) {
  const entries = pool?.entries ?? [];
  const unlimited = entries.some((entry) => entry.stock === Infinity);
  const stock = entries.reduce((sum, entry) => sum + (entry.stock === Infinity ? 0 : entry.stock), 0);
  return { entries: entries.length, stock, unlimited };
}
