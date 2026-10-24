/**
 * 抽奖定义与形式规格。
 *
 * 抽奖只认池，不认人与奖：槽位列出这次用哪几个池，形式决定怎么演，
 * 槽位自己的规则决定怎么抽。规则内联在槽位上，不另开一张 key 表——
 * 一一对应的东西分成两处存，迟早有一处悬空。
 */

import { makeId } from './ids.js';

/** 形式规格。capacity 是一次最多展示的条目数（转盘扇区、九宫格格数、老虎机列数）。 */
export const FORM_SPECS = {
  wheel: {
    type: 'wheel',
    minSlots: 1,
    maxSlots: Infinity,
    capacity: 12,
    modes: ['independent', 'a-then-b', 'b-then-a'],
  },
  grid: { type: 'grid', minSlots: 1, maxSlots: 1, capacity: 8, modes: [] },
  slot: { type: 'slot', minSlots: 1, maxSlots: 1, capacity: 3, modes: [] },
};

export function formSpecOf(type) {
  return FORM_SPECS[type] ?? null;
}

/** 作用域：本场 / 同组 / 全部。「中过就不能再中」管到哪一层。 */
export const SCOPES = ['draw', 'group', 'always'];

export const SCOPE_LABELS = { draw: '本场', group: '同组', always: '全部' };

export const SCOPE_NOTES = {
  draw: '本场已经中过的不再进入候选',
  group: '同组所有抽奖里中过的不再进入候选；没有组时按本场算',
  always: '任何抽奖里中过的都不再进入候选',
};

/**
 * 槽位：一个出奖位。
 *
 * `quota` 是整场名额（跨所有轮次累计，不是每轮重置），`scope` 是去重范围；
 * 其余字段是抽取参数。`take` 不在这里——它是某一轮实际抽几个，落在轮次快照里。
 *
 * `label` 是出奖位的名字（「三等奖」「中奖人」），界面上永远显示它而不是 key；
 * `manual` 为真时这一位不由引擎抽，由主持人在台上选定（先定奖项再抽人），
 * 引擎只校验被选中的条目还有剩余份数。
 */
export function createSlot({
  key,
  label = '',
  poolId = '',
  quota = Infinity,
  scope = 'draw',
  count = 1,
  replacement = 'without',
  weighted = true,
  hitRate = 1,
  tags = [],
  manual = false,
} = {}) {
  return {
    key,
    label: String(label ?? '').trim(),
    poolId,
    quota: normalizeQuota(quota),
    scope: SCOPES.includes(scope) ? scope : 'draw',
    count: Math.max(1, Math.floor(Number(count)) || 1),
    replacement: replacement === 'with' ? 'with' : 'without',
    weighted: weighted !== false,
    hitRate: clamp01(hitRate),
    tags: [...tags],
    manual: manual === true,
  };
}

/** 名额归一：0 与空表示不限。 */
export function normalizeQuota(value) {
  if (value === Infinity || value === null || value === '' || value === undefined) return Infinity;
  const count = Math.floor(Number(value));
  return Number.isFinite(count) && count > 0 ? count : Infinity;
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(1, n));
}

/**
 * 一个抽奖 = 活动里的一个环节。
 *
 * `order` 决定环节在演出里的先后顺序；留空表示「按数组里的位置」，这样老数据
 * 不用回填编号。`closed` 是主持人手动封箱：临时决定这个环节就抽到这儿，
 * 进度本身仍从账本派生，这里只记一个停手的标记。
 */
export function createDraw({
  id,
  name = '',
  groupId = null,
  slots = [],
  form = { type: 'wheel', options: {} },
  mode = 'independent',
  order = null,
  closed = false,
} = {}) {
  return {
    id: id ?? makeId('d'),
    name,
    groupId,
    slots: slots.map((slot) => createSlot(slot)),
    form: { type: form.type, options: { ...form.options } },
    mode,
    order: Number.isFinite(order) ? order : null,
    closed: closed === true,
  };
}

/** 环节的排序权重：没编号就用它在数组里的位置。 */
export function orderOf(draw, index = 0) {
  return Number.isFinite(draw?.order) ? draw.order : index;
}

/** 按 order 排好序的环节列表，演出态靠它找「下一个环节」。 */
export function sortedDraws(draws = []) {
  return draws
    .map((draw, index) => ({ draw, weight: orderOf(draw, index) }))
    .sort((a, b) => a.weight - b.weight)
    .map((item) => item.draw);
}

/**
 * 槽位在本轮的实际抽取数：一次抽几个、剩余名额、候选多少，三者取小。
 * `with`（放回）不受候选条数限制，所以那一项只在 `without` 时参与。
 */
export function takeOf(slot, remain, candidateCount) {
  const count = Math.max(0, Math.min(slot.count, remain));
  if (slot.replacement === 'with') return count;
  return Math.min(count, candidateCount);
}

/**
 * 校验抽奖与池、形式、组是否对得上，返回错误列表，空数组表示可用。
 * 缺池不静默变空：这里拦下，界面上直接说哪个槽位缺池（R-11）。
 */
export function validateDraw(draw, pools = {}, groups = []) {
  const errors = [];
  const spec = formSpecOf(draw.form?.type);
  if (!spec) {
    errors.push(`未知形式：${draw.form?.type}`);
    return errors;
  }

  const slots = draw.slots ?? [];
  if (slots.length < spec.minSlots) errors.push(`${spec.type} 至少需要 ${spec.minSlots} 个池`);
  if (slots.length > spec.maxSlots) errors.push(`${spec.type} 最多支持 ${spec.maxSlots} 个池`);

  const keys = new Set();
  for (const slot of slots) {
    if (!slot?.key) errors.push('槽位缺少 key');
    else if (keys.has(slot.key)) errors.push(`槽位 key 重复：${slot.key}`);
    else keys.add(slot.key);
    if (!slot?.poolId) errors.push(`槽位 ${slot?.key ?? '?'} 还没选池`);
    else if (!pools[slot.poolId]) errors.push(`槽位 ${slot?.key ?? '?'} 引用的池不存在`);
    if (slot?.scope === 'group' && !draw.groupId) {
      // 不是错误：没有组时按本场算（R-14）。这里只提示一句。
    }
  }

  if (slots.length > 1 && !spec.modes.includes(draw.mode)) {
    errors.push(`${spec.type} 不支持抽取顺序 ${draw.mode}`);
  }

  if (draw.groupId && !groups.some((group) => group.id === draw.groupId)) {
    errors.push('归属的组不存在');
  }

  return errors;
}
