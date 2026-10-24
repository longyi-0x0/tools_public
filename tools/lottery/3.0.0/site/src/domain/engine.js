/**
 * 抽取引擎：候选加规则加随机源，一次算出结果。
 *
 * 这里只做两件事：装配（算每个槽此刻能抽谁）与抽取（按权重命中）。装配与抽取
 * 写在同一段循环里，是因为后一个槽必须看得见前一个槽本轮的命中——同一轮里
 * stock = 1 的条目撞不进两个槽位（R-18）。
 *
 * 抽取本身是纯函数 `resolve`：decide 喂它实时池，复算喂它轮次快照，两边同一段代码，
 * 所以「同输入必同结果」不是靠自觉，是靠只有一份实现（R-07）。
 */

import { createRandom, hashSeed, sampleDistinct } from '../random.js';
import { formSpecOf, SCOPES } from './draw.js';
import { limitOf, takeFrom } from './rule.js';
import { createLedger, scopedUsage, slotUsed } from './ledger.js';
import { buildSample } from './sample.js';

/** 快照上限：超过这个条数就只存摘要，复算降级并明说。 */
export const SNAPSHOT_LIMIT = 2000;

/**
 * 槽位的计算顺序。a-then-b 按声明顺序，b-then-a 反序；两个槽位指向同一池时
 * 这个顺序决定后者能不能看到前者已抽走的条目。次序因此是规格的一部分。
 */
export function slotOrder(draw) {
  const slots = [...(draw.slots ?? [])];
  if (slots.length > 1 && draw.mode === 'b-then-a') slots.reverse();
  return slots;
}

/** 作用域解析：没有组时 group 退化为 draw，不报错（R-14）。 */
export function scopeOf(slot, draw) {
  if (slot?.scope === 'group' && !draw?.groupId) return 'draw';
  return SCOPES.includes(slot?.scope) ? slot.scope : 'draw';
}

/** 槽位还剩几个名额。名额是整场累计，不按轮重置（R-03）。 */
export function remainOf(ledger, drawId, slot) {
  const quota = slot?.quota ?? Infinity;
  return Number.isFinite(quota) ? Math.max(0, quota - slotUsed(ledger, drawId, slot.key)) : Infinity;
}

/** 盘面容量：转盘与九宫格是固定格数，老虎机跟着列数走。 */
function capacityOf(draw, spec) {
  if (spec.type !== 'slot') return spec.capacity;
  const asked = draw.form?.options?.columns ?? spec.capacity;
  return Math.max(2, Math.min(spec.capacity, Math.floor(asked) || spec.capacity));
}

/**
 * 从候选里定出这一轮的结果。纯函数：只要 slots（含本轮的 takeLimit）、seed、
 * 候选来源与作用域用量一致，输出就逐项相等。
 *
 * - `entriesOf(slot)` 给该槽的池成员（实时池或轮次快照）
 * - `usageOf(slot)` 给该槽作用域内的基础用量（不含本轮）
 */
export function resolve({ slots = [], seed, form, entriesOf, usageOf }) {
  const spec = formSpecOf(form);
  if (!spec) throw new Error(`未知形式：${form}`);

  const rand = createRandom(seed);
  const rolling = new Map();
  const picks = [];
  const sample = {};
  const boards = {};
  let win = true;

  for (const slot of slots) {
    const entries = entriesOf(slot) ?? [];
    const base = usageOf(slot) ?? new Map();
    const tags = slot.tags ?? [];

    const candidates = entries.filter((entry) => {
      if (tags.length > 0 && !tags.some((tag) => entry.tags?.includes(tag))) return false;
      const used = (base.get(entry.id) ?? 0) + (rolling.get(entry.id) ?? 0);
      return used < limitOf(entry);
    });

    const capacity = slot.capacity ?? spec.capacity;

    // 主持人自己定的那一位：不由随机决定，但一样要校验还有没有剩余份数，
    // 也一样入账——奖品被抽走就是被抽走了。
    if (slot.manual) {
      const chosen = slot.manualPick ? entries.find((entry) => entry.id === slot.manualPick) : null;
      const allowed = chosen && candidates.some((entry) => entry.id === chosen.id);
      if (allowed) {
        picks.push({ slotKey: slot.key, poolId: slot.poolId, entryId: chosen.id });
        rolling.set(chosen.id, (rolling.get(chosen.id) ?? 0) + 1);
        sample[slot.key] = buildSample({
          entries: candidates, include: [chosen], capacity, rand,
        }).map((entry) => entry.id);
      } else {
        sample[slot.key] = sampleDistinct(candidates, rand, capacity).map((entry) => entry.id);
      }
      boards[slot.key] = {
        poolId: slot.poolId,
        capacity,
        entries: candidates.map((entry) => ({ id: entry.id, weight: entry.weight, stock: entry.stock })),
      };
      continue;
    }
    const room = Math.max(0, slot.takeLimit ?? 1);
    const take = slot.replacement === 'with' ? room : Math.min(room, candidates.length);

    if (spec.type === 'slot') {
      // 未中奖要凑出不全相同的索引，至少两个候选；凑不出就只能中。
      const canLose = candidates.length >= 2 && capacity >= 2;
      win = canLose ? rand() < (slot.hitRate ?? 1) : true;
      if (win && candidates.length > 0) {
        const drawn = takeFrom(candidates, Math.max(1, take), rand, slot);
        for (const entry of drawn) {
          picks.push({ slotKey: slot.key, poolId: slot.poolId, entryId: entry.id });
          rolling.set(entry.id, (rolling.get(entry.id) ?? 0) + 1);
        }
        sample[slot.key] = buildSample({ entries: candidates, include: drawn, capacity, rand })
          .map((entry) => entry.id);
      } else {
        sample[slot.key] = sampleDistinct(candidates, rand, capacity).map((entry) => entry.id);
      }
    } else if (take > 0) {
      const drawn = takeFrom(candidates, take, rand, slot);
      for (const entry of drawn) {
        picks.push({ slotKey: slot.key, poolId: slot.poolId, entryId: entry.id });
        rolling.set(entry.id, (rolling.get(entry.id) ?? 0) + 1);
      }
      sample[slot.key] = buildSample({ entries: candidates, include: drawn, capacity, rand })
        .map((entry) => entry.id);
    } else {
      sample[slot.key] = [];
    }

    boards[slot.key] = {
      poolId: slot.poolId,
      capacity,
      entries: candidates.map((entry) => ({ id: entry.id, weight: entry.weight, stock: entry.stock })),
    };
  }

  return { win, picks, sample, boards };
}

/**
 * 定一轮结果。返回 status 为 decided 的轮次：结果已定、尚未入账，
 * 交表演后由会话层记成 performing，入账在 settle 里做。
 */
/**
 * `manual` 是主持人在台上自己定的那几位：{ [slotKey]: entryId }。
 * 它作为输入进来，不参与随机——抽谁仍由引擎定，快照照常可复算。
 */
export function decide({ draw, pools = {}, ledger = createLedger(), seed, now = Date.now(), manual = {} }) {
  const spec = formSpecOf(draw.form?.type);
  if (!spec) throw new Error(`未知形式：${draw.form?.type}`);

  const resolvedSeed = seed ?? `${draw.id}:${now}`;
  const slots = slotOrder(draw).map((slot) => {
    const scope = scopeOf(slot, draw);
    const remain = remainOf(ledger, draw.id, slot);
    return {
      ...slot,
      scope,
      capacity: capacityOf(draw, spec),
      takeLimit: Math.max(0, Math.min(slot.count, remain)),
      manual: slot.manual === true,
      manualPick: manual[slot.key] ?? null,
    };
  });

  const usageCache = new Map();
  const result = resolve({
    slots,
    seed: resolvedSeed,
    form: spec.type,
    entriesOf: (slot) => pools[slot.poolId]?.entries ?? [],
    usageOf: (slot) => {
      if (!usageCache.has(slot.scope)) {
        usageCache.set(slot.scope, scopedUsage(ledger, {
          scope: slot.scope,
          drawId: draw.id,
          groupId: draw.groupId,
        }));
      }
      return usageCache.get(slot.scope);
    },
  });

  return {
    id: `r-${hashSeed(`${resolvedSeed}:${now}`).toString(36)}`,
    drawId: draw.id,
    groupId: draw.groupId ?? null,
    seed: resolvedSeed,
    at: now,
    form: spec.type,
    mode: draw.mode,
    win: result.win,
    // 名字冻在轮次上：事后把环节或出奖位改名，历史记录里还是当时的叫法。
    drawName: draw.name ?? '',
    slots: slots.map((slot) => ({
      key: slot.key,
      label: slot.label ?? '',
      poolId: slot.poolId,
      quota: slot.quota,
      scope: slot.scope,
      capacity: slot.capacity,
      count: slot.count,
      replacement: slot.replacement,
      weighted: slot.weighted,
      hitRate: slot.hitRate,
      tags: slot.tags ?? [],
      takeLimit: slot.takeLimit,
      manual: slot.manual === true,
      manualPick: slot.manualPick ?? null,
    })),
    snapshot: snapshotOf(result.boards),
    picks: result.picks,
    sample: result.sample,
    status: 'decided',
  };
}

/**
 * 候选快照。开轮那一刻的池成员与库存权重冻在这里，之后改池不动这一轮（R-17）。
 * 池太大时不硬存：只留一份摘要，复算时明说「没有完整快照」，不假装能复算。
 */
function snapshotOf(boards) {
  const digest = hashSeed(JSON.stringify(boards)).toString(36);
  const total = Object.values(boards).reduce((sum, board) => sum + board.entries.length, 0);
  if (total > SNAPSHOT_LIMIT) return { mode: 'digest', digest };
  return { mode: 'full', digest, boards };
}
