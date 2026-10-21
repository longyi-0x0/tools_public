/**
 * 抽取引擎：候选加规则加随机源，一次算出结果。
 *
 * 结果在这里定完，之后的事只有表演与入账。形式拿到的永远是一份只读快照，
 * 动画中途刷新、重复点击都不改变这里的输出。
 */

import { createRandom, hashSeed, sampleDistinct } from '../random.js';
import { formSpecOf } from './draw.js';
import { candidatesOf, takeFrom } from './rule.js';
import { createLedger, usageOf } from './ledger.js';
import { buildSample } from './sample.js';

/**
 * 槽位的计算顺序。a-then-b 按声明顺序，b-then-a 反序；两个槽位指向同一池时
 * 这个顺序决定后者能不能看到前者已抽走的条目。
 */
export function slotOrder(draw) {
  const slots = [...(draw.slots ?? [])];
  if (slots.length > 1 && draw.mode === 'b-then-a') slots.reverse();
  return slots;
}

/** 老虎机的列数。 */
function columnsOf(draw, spec) {
  const asked = draw.form?.options?.columns ?? spec.capacity;
  return Math.max(2, Math.min(spec.capacity, Math.floor(asked) || spec.capacity));
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(1, n));
}

/**
 * 定一轮结果。
 *
 * 返回 status 为 performing 的轮次：结果已定、尚未入账。入账在 settle 里做，
 * 只有那一步会动账本。
 */
export function decide({ draw, pools = {}, ledger = createLedger(), seed, now = Date.now() }) {
  const spec = formSpecOf(draw.form?.type);
  if (!spec) throw new Error(`未知形式：${draw.form?.type}`);

  const resolvedSeed = seed ?? `${draw.id}:${now}`;
  const rand = createRandom(resolvedSeed);
  const usage = usageOf(ledger);

  const picks = [];
  const sample = {};
  let win = true;

  for (const slot of slotOrder(draw)) {
    const pool = pools[slot.poolId];
    const rule = draw.rule?.[slot.key] ?? {};
    if (!pool) {
      sample[slot.key] = [];
      continue;
    }

    const candidates = candidatesOf(pool, usage, rule);
    const isSlots = spec.type === 'slot';

    if (isSlots) {
      const columns = columnsOf(draw, spec);
      // 未中奖要凑出不全相同的索引，至少得有两个候选；凑不出就只能中。
      const canLose = candidates.length >= 2 && columns >= 2;
      win = canLose ? rand() < clamp01(rule.hitRate ?? 1) : true;

      if (win) {
        const drawn = takeFrom(candidates, 1, rand, rule);
        for (const entry of drawn) {
          picks.push({ slotKey: slot.key, poolId: pool.id, entryId: entry.id });
          usage.set(entry.id, (usage.get(entry.id) ?? 0) + 1);
        }
        sample[slot.key] = buildSample({ entries: candidates, include: drawn, capacity: columns, rand });
      } else {
        sample[slot.key] = sampleDistinct(candidates, rand, columns);
      }
      continue;
    }

    const count = Math.max(1, Math.floor(rule.count ?? 1));
    const drawn = takeFrom(candidates, count, rand, rule);
    for (const entry of drawn) {
      picks.push({ slotKey: slot.key, poolId: pool.id, entryId: entry.id });
      usage.set(entry.id, (usage.get(entry.id) ?? 0) + 1);
    }
    sample[slot.key] = buildSample({ entries: candidates, include: drawn, capacity: spec.capacity, rand });
  }

  return {
    id: `r-${hashSeed(`${resolvedSeed}:${now}`).toString(36)}`,
    drawId: draw.id,
    seed: resolvedSeed,
    form: spec.type,
    mode: draw.mode,
    slots: (draw.slots ?? []).map((slot) => ({ key: slot.key, poolId: slot.poolId })),
    win,
    picks,
    sample: toIdMap(sample),
    status: 'performing',
    at: now,
  };
}

/** 样本只留 id：形式层用它与池对出条目，快照里不夹带池对象。 */
function toIdMap(sample) {
  return Object.fromEntries(
    Object.entries(sample).map(([slotKey, entries]) => [slotKey, entries.map((entry) => entry.id)]),
  );
}
