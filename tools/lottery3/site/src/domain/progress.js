/**
 * 进度派生。
 *
 * 已抽几个、还剩几个、还能抽的候选有多少、这个环节是不是抽完了——全从账本与当前
 * 清单算，不另存计数。界面上任何一处进度都应当调这里，免得两处算法不一致。
 */

import { progressOf } from './session.js';
import { scopedUsage } from './ledger.js';
import { scopeOf } from './engine.js';
import { candidatesOf } from './rule.js';

/** 单个出奖位的进度：已出几个、共几个、还剩几个、此刻还能抽的候选多少。 */
export function slotStatsOf({ ledger, draw, slot, pools = {} }) {
  const found = progressOf(ledger, draw).find((item) => item.key === slot.key);
  const base = found ?? { used: 0, quota: Infinity, remain: Infinity };
  const usage = scopedUsage(ledger, {
    scope: scopeOf(slot, draw),
    drawId: draw.id,
    groupId: draw.groupId,
  });
  const pool = pools[slot.poolId];
  const candidates = pool ? candidatesOf(pool, usage, slot).length : 0;
  return { ...base, candidates };
}

/**
 * 整个环节的进度。多个出奖位时名额取合计；其中任意一个不限量，合计就是不限量——
 * 说「共 8 个」而实际有一项不限，是骗人。
 */
export function drawStatsOf({ ledger, draw, pools = {} }) {
  const slots = draw?.slots ?? [];
  const stats = slots.map((slot) => slotStatsOf({ ledger, draw, slot, pools }));
  const used = stats.reduce((sum, item) => sum + item.used, 0);
  const allFinite = stats.length > 0 && stats.every((item) => Number.isFinite(item.quota));
  const quota = allFinite ? stats.reduce((sum, item) => sum + item.quota, 0) : Infinity;
  const remain = Number.isFinite(quota) ? Math.max(0, quota - used) : Infinity;
  const candidates = stats.reduce((min, item) => Math.min(min, item.candidates), Infinity);
  const exhausted = stats.length > 0 && stats.every((item) => item.candidates === 0 || item.remain === 0);

  return {
    used,
    quota,
    remain,
    candidates: Number.isFinite(candidates) ? candidates : 0,
    done: draw?.closed === true || exhausted || (Number.isFinite(quota) && used >= quota),
    closed: draw?.closed === true,
    empty: stats.length === 0,
  };
}
