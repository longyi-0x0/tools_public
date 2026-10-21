/**
 * 抽奖引擎：按抽法从池里取条目，产出一份中性的开奖记录。
 *
 * 所有函数都是纯的 —— 收一份状态，回一份新状态。
 *
 * 一次开奖填若干「槽」：`source: 'fixed'` 的槽由人先定（先选奖项 / 先指定上台的人），
 * `source: 'draw'` 的槽由引擎按「剩余名额 × 权重」抽。名额与消耗不另存计数器，
 * 一律从 `results` 推：撤销就是把一条记录丢掉，名额自然跟着回去，不会两边对不上。
 *
 * 状态里的池是抽奖自己的副本。哪个池填哪个槽，由 `state.slots` 说了算
 * （`{ person: 'k1', prize: 'k2' }`），槽本身不认识池的类型 —— 引擎里也没有任何
 * 「这个池是人还是奖品」的判断，能抽与否只看名额。
 */

import { capacityOf, cleanText, nextEntryId } from './pools.js';
import { protocolInfo, slotOf } from './protocols.js';

export const DEFAULT_PROTOCOL = 'prize-person';

/** 抽奖失败的原因；界面按 `code` 决定怎么说，不靠解析文案。 */
export class DrawError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DrawError';
    this.code = code;
  }
}

const RESULT_PREFIX = 'r';

/** 空状态。池、抽法、绑定由数据层填。 */
export function createState(overrides = {}) {
  return {
    title: '',
    protocol: DEFAULT_PROTOCOL,
    pools: [],
    /** 槽 → 池 id：`{ person: 'k1', prize: 'k2' }`。没有这个键就是「没选池」。 */
    slots: {},
    results: [],
    /** 作废过的条目，记 `池/条目`：抽中了但人不在，之后不再被抽到。 */
    excluded: [],
    ...overrides,
  };
}

/** 作废记录的键。作废一格，不是作废一个人 —— 同名条目在别的池里不受影响。 */
export function voidKey(poolId, entryId) {
  return `${poolId}/${entryId}`;
}

/** 下一个可用的 id：同前缀里最大的编号 + 1。 */
export function nextId(items, prefix) {
  let max = 0;
  for (const item of items) {
    const matched = new RegExp(`^${prefix}(\\d+)$`).exec(String(item.id ?? ''));
    if (matched !== null) {
      max = Math.max(max, Number(matched[1]));
    }
  }
  return `${prefix}${max + 1}`;
}

/* ---------- 池 ---------- */

export function poolById(state, poolId) {
  return (state.pools ?? []).find((pool) => pool.id === poolId) ?? null;
}

/**
 * 某个槽用哪个池 —— 运行时唯一的查找入口。
 *
 * 只看 `state.slots`：值是空、或指向一个已经不在的池，都算「没选池」，不猜。
 * 槽不认识池的类型，所以这里也没有任何按类型兜底的余地。
 */
export function poolForSlot(state, slot) {
  if (slot === null || slot === undefined) {
    return null;
  }
  const bound = cleanText(state.slots?.[slot.key]);
  return bound === '' ? null : poolById(state, bound);
}

/** 给界面用：按槽的 key 取池。 */
export function slotPool(state, key) {
  return poolForSlot(state, slotOf(state.protocol, key));
}

export function entryIn(pool, entryId) {
  return pool?.entries.find((entry) => entry.id === entryId) ?? null;
}

/* ---------- 名额 ---------- */

/** 这一条已经被抽中几次。 */
export function drawnCount(state, poolId, entryId) {
  let drawn = 0;
  for (const result of state.results) {
    for (const pick of result.picks) {
      if (pick.poolId === poolId && pick.entryId === entryId) {
        drawn += 1;
      }
    }
  }
  return drawn;
}

/** 这一条还剩几个名额；`capacity` 为 null（不限）时是 Infinity。 */
export function remaining(state, poolId, entryId) {
  const entry = entryIn(poolById(state, poolId), entryId);
  if (entry === null) {
    return 0;
  }
  return Math.max(0, capacityOf(entry) - drawnCount(state, poolId, entryId));
}

/** 抽中这一条时的权重：剩余名额 × 单位权重。 */
export function entryWeight(state, poolId, entry) {
  const unit = Number(entry?.weight);
  const perUnit = Number.isFinite(unit) && unit > 0 ? unit : 1;
  return remaining(state, poolId, entry.id) * perUnit;
}

/** 池里还能被抽的条目：名额没用完，且这一格没被作废。 */
export function eligible(state, pool) {
  if (pool === null || pool === undefined) {
    return [];
  }
  const excluded = new Set(state.excluded ?? []);
  return pool.entries.filter(
    (entry) => !excluded.has(voidKey(pool.id, entry.id)) && remaining(state, pool.id, entry.id) > 0,
  );
}

/** 按权重抽一个；`taken` 记着这一抽里已经用掉的名额。抽不出时返回 null。 */
function pickWeighted(state, pool, taken, random) {
  const weights = [];
  let total = 0;
  for (const entry of pool.entries) {
    const left = remaining(state, pool.id, entry.id) - (taken.get(entry.id) ?? 0);
    if (left <= 0) {
      weights.push(0);
      continue;
    }
    const unit = Number(entry.weight);
    const weight = left * (Number.isFinite(unit) && unit > 0 ? unit : 1);
    weights.push(weight);
    total += weight;
  }
  if (total <= 0) {
    return null;
  }
  let point = unitRandom(random) * total;
  for (let index = 0; index < pool.entries.length; index += 1) {
    if (weights[index] <= 0) {
      continue;
    }
    point -= weights[index];
    if (point < 0) {
      return pool.entries[index];
    }
  }
  return pool.entries.find((_, index) => weights[index] > 0) ?? null;
}

/** 把 `random()` 收到 `[0, 1)`，避免 1 落在边界外。 */
function unitRandom(random) {
  const value = Number(random());
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(0.999999999, Math.max(0, value));
}

function toPick(slot, pool, entry) {
  return {
    slot: slot.key,
    poolId: pool.id,
    entryId: entry.id,
    name: entry.name,
    meta: entry.meta ?? {},
  };
}

function appendResult(state, result) {
  return { ...state, results: [...state.results, result] };
}

/**
 * 抽一次：按抽法把每个槽填上，产出一条结果。
 *
 * `fixed` 是主持人先定下的槽（`{ prize: 'a2' }` 这种），`batch` 只作用于
 * `take: 'batch'` 的槽。名额不够或池子空了就按能抽多少抽多少，一个都抽不出才报错。
 */
export function drawOnce(state, { fixed = {}, batch = 1, random = Math.random } = {}) {
  const protocol = protocolInfo(state.protocol);
  const picks = [];
  const taken = new Map();

  for (const slot of protocol.slots) {
    const pool = poolForSlot(state, slot);
    if (pool === null) {
      const bound = cleanText(state.slots?.[slot.key]);
      throw bound === ''
        ? new DrawError('slot-unbound', `这场抽奖还没有给「${slot.label}」选池`)
        : new DrawError('pool-missing', `「${slot.label}」指定的池已经不在了`);
    }

    if (slot.source === 'fixed') {
      const wanted = cleanText(fixed[slot.key]);
      const entry =
        (wanted === '' ? null : entryIn(pool, wanted)) ?? eligible(state, pool)[0] ?? null;
      if (entry === null) {
        throw new DrawError('pool-empty', `「${pool.name}」里已经没有可抽的${slot.label}了`);
      }
      if (remaining(state, pool.id, entry.id) <= 0) {
        throw new DrawError('entry-emptied', `「${entry.name}」的名额已经抽完了`);
      }
      picks.push(toPick(slot, pool, entry));
      continue;
    }

    const limit = slot.take === 'batch' ? Math.max(1, Math.floor(Number(batch) || 1)) : 1;
    let added = 0;
    for (let index = 0; index < limit; index += 1) {
      const entry = pickWeighted(state, pool, taken, random);
      if (entry === null) {
        break;
      }
      taken.set(entry.id, (taken.get(entry.id) ?? 0) + 1);
      picks.push(toPick(slot, pool, entry));
      added += 1;
    }
    if (added === 0) {
      throw new DrawError('pool-empty', `「${pool.name}」里已经没有可抽的${slot.label}了`);
    }
  }

  const result = {
    id: nextId(state.results, RESULT_PREFIX),
    at: Date.now(),
    protocol: protocol.id,
    picks,
  };
  return { state: appendResult(state, result), result, picks };
}

/* ---------- 撤销与作废 ---------- */

function stripPick(results, resultId, poolId, entryId) {
  const result = results.find((item) => item.id === resultId);
  if (result === undefined) {
    throw new DrawError('result-missing', '找不到这次开奖');
  }
  const picks = result.picks.filter(
    (pick) => !(pick.poolId === poolId && pick.entryId === entryId),
  );
  if (picks.length === result.picks.length) {
    throw new DrawError('pick-missing', '这次开奖里没有这一项');
  }
  return {
    results:
      picks.length === 0
        ? results.filter((item) => item.id !== resultId)
        : results.map((item) => (item.id === resultId ? { ...item, picks } : item)),
  };
}

/**
 * 作废某次开奖里的一个条目：这一格不算中奖，之后不再被抽到，名额还给池。
 *
 * 与撤销不同 —— 撤销是「这次开错了」，作废是「这个人不在场 / 这个奖发不出来」。
 * 作废的是「某池里的某条」，与池是什么种类无关。
 */
export function voidPick(state, resultId, poolId, entryId) {
  const { results } = stripPick(state.results, resultId, poolId, entryId);
  const key = voidKey(poolId, entryId);
  const excluded = (state.excluded ?? []).includes(key)
    ? state.excluded
    : [...(state.excluded ?? []), key];
  return { ...state, results, excluded };
}

/** 撤销某次开奖里的一个条目：只去掉这一条，条目回到池里。 */
export function undoPick(state, resultId, poolId, entryId) {
  return { ...state, results: stripPick(state.results, resultId, poolId, entryId).results };
}

/** 撤掉最后一次开奖；没有记录时原样返回。 */
export function undoLast(state) {
  if (state.results.length === 0) {
    return state;
  }
  return { ...state, results: state.results.slice(0, -1) };
}

/** 清空开奖记录，池留着。 */
export function resetProgress(state) {
  return { ...state, results: [], excluded: [] };
}

/* ---------- 改池 ---------- */

/** 改一个条目的字段；`capacity` 不会低于已经抽出去的数量。 */
export function updateEntry(state, poolId, entryId, patch) {
  return {
    ...state,
    pools: state.pools.map((pool) => {
      if (pool.id !== poolId) {
        return pool;
      }
      return {
        ...pool,
        entries: pool.entries.map((entry) => {
          if (entry.id !== entryId) {
            return entry;
          }
          const next = { ...entry, ...patch };
          if (patch.name !== undefined) {
            next.name = cleanText(patch.name) || entry.name;
          }
          if (patch.image !== undefined) {
            next.image = cleanText(patch.image);
          }
          if (patch.capacity !== undefined) {
            const drawn = drawnCount(state, poolId, entryId);
            if (patch.capacity === null) {
              next.capacity = null;
            } else {
              const count = Math.floor(Number(patch.capacity));
              next.capacity = Number.isFinite(count) && count > 0 ? Math.max(drawn, count) : Math.max(drawn, 1);
            }
          }
          return next;
        }),
      };
    }),
  };
}

/** 删一个条目。已经抽出过结果的条目不许删，免得记录指向不存在的东西。 */
export function removeEntry(state, poolId, entryId) {
  if (drawnCount(state, poolId, entryId) > 0) {
    throw new DrawError('entry-drawn', '这一条已经抽出过结果，先撤销或清空记录再删');
  }
  return {
    ...state,
    pools: state.pools.map((pool) =>
      pool.id === poolId ? { ...pool, entries: pool.entries.filter((entry) => entry.id !== entryId) } : pool,
    ),
  };
}

/** 加一个条目，返回 `[新状态, 新条目]`。 */
export function addEntry(state, poolId, fields = {}) {
  const pool = poolById(state, poolId);
  const entry = {
    id: nextEntryId(pool),
    name: cleanText(fields.name, '新条目'),
    weight: Number(fields.weight) > 0 ? Number(fields.weight) : 1,
    capacity: fields.capacity === undefined ? 1 : fields.capacity,
    image: cleanText(fields.image),
    meta: fields.meta ?? {},
  };
  const next = {
    ...state,
    pools: state.pools.map((item) =>
      item.id === poolId ? { ...item, entries: [...item.entries, entry] } : item,
    ),
  };
  return [next, entry];
}

/* ---------- 判定 ---------- */

/** 每个槽都有得抽才算能抽。 */
export function canDraw(state) {
  const protocol = protocolInfo(state.protocol);
  return protocol.slots.every((slot) => eligible(state, poolForSlot(state, slot)).length > 0);
}

/** 抽一次会填的那几个槽，界面拿它决定按钮可按与否。 */
export function readiness(state) {
  const protocol = protocolInfo(state.protocol);
  return {
    canDraw: canDraw(state),
    slots: protocol.slots.map((slot) => {
      const pool = poolForSlot(state, slot);
      return {
        key: slot.key,
        label: slot.label,
        source: slot.source,
        bound: cleanText(state.slots?.[slot.key]),
        poolId: pool?.id ?? null,
        poolName: pool?.name ?? '',
        entries: eligible(state, pool).length,
        total: pool?.entries.length ?? 0,
      };
    }),
    handedOut: state.results.reduce((sum, result) => sum + result.picks.length, 0),
  };
}

/** 这一抽里某个槽的结果。 */
export function picksOf(result, slotKey) {
  return result.picks.filter((pick) => pick.slot === slotKey);
}

/** 揭晓大字要写的那一条：抽法说 focus 是哪个槽，就取那个槽的第一条。 */
export function focusPick(result, protocolId) {
  const protocol = protocolInfo(protocolId);
  return result.picks.find((pick) => pick.slot === protocol.focus) ?? result.picks[0] ?? null;
}

/** 把一条 pick 还原成形态要的那几个字段（名字 + 附注），不区分池的种类。 */
export function asEntry(pick) {
  return {
    id: pick.entryId,
    name: pick.name,
    dept: pick.meta?.dept ?? '',
    employeeId: pick.meta?.employeeId ?? '',
    level: pick.meta?.level ?? '',
  };
}

/**
 * 某个 fixed 槽当前指着的条目。
 *
 * `selectedId` 是主持人在大屏上点的那一条；没点或点的那条抽不动时，落回池里
 * 第一条还能抽的。
 */
export function fixedEntry(state, slotKey, selectedId = null) {
  const slot = slotOf(state.protocol, slotKey);
  if (slot === null) {
    return null;
  }
  const pool = poolForSlot(state, slot);
  const wanted = cleanText(selectedId);
  if (wanted !== '') {
    const hit = entryIn(pool, wanted);
    if (hit !== null && remaining(state, pool.id, hit.id) > 0) {
      return hit;
    }
  }
  return eligible(state, pool)[0] ?? null;
}
