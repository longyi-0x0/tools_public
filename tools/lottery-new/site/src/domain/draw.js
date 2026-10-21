/**
 * 抽奖定义与形式规格。
 *
 * 抽奖只认"池"，不认人与奖：slots 列出这次用哪几个池，form 决定怎么演，
 * rule 决定每个池怎么抽。形式在 FORM_SPECS 里声明自己能吃几个池、一次
 * 展示多少条目，装配时按它校验。
 */

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

/**
 * 每个槽位的抽取规则。count 一次抽几个；replacement 为 'with' 时一轮内可重复；
 * pickLimit 是规则级上限，与条目自身 stock 取小；hitRate 只有老虎机三连玩法用。
 */
export function createRule({
  count = 1,
  replacement = 'without',
  weighted = true,
  pickLimit = Infinity,
  hitRate = 1,
  tags = [],
} = {}) {
  return { count, replacement, weighted, pickLimit, hitRate, tags: [...tags] };
}

export function createDraw({
  id,
  name = '',
  slots = [],
  form = { type: 'wheel', options: {} },
  mode = 'independent',
  rule = {},
} = {}) {
  return {
    id: id ?? makeDrawId(),
    name,
    slots: slots.map((slot) => ({ key: slot.key, poolId: slot.poolId })),
    form: { type: form.type, options: { ...form.options } },
    mode,
    rule,
  };
}

function makeDrawId() {
  return `d-${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
}

/**
 * 校验抽奖与池、形式是否对得上，返回错误列表，空数组表示可用。
 * 缺池不静默变空：这里拦下，界面上直接说哪个槽位缺池。
 */
export function validateDraw(draw, pools = {}) {
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
    if (!pools[slot?.poolId]) errors.push(`槽位 ${slot?.key ?? '?'} 引用的池不存在`);
  }

  if (slots.length > 1 && !spec.modes.includes(draw.mode)) {
    errors.push(`${spec.type} 不支持抽取顺序 ${draw.mode}`);
  }

  for (const key of Object.keys(draw.rule ?? {})) {
    if (!keys.has(key)) errors.push(`规则指向了不存在的槽位：${key}`);
  }

  return errors;
}
