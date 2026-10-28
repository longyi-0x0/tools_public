/**
 * 形态登记处：主干只认这个数组，不认具体形态。
 *
 * 一个形态就是一个对象，默认导出：
 *
 * ```js
 * export default {
 *   id: 'my-stage',
 *   label: '我的形态',
 *   version: 1,
 *   capabilities: { spin: 1, slots: 2, winners: 'many', labels: 24 },
 *   styles,
 *   config: [ ... ],
 *   create(host, config, api) { return { begin, reveal, reset, update, destroy }; },
 * };
 * ```
 *
 * `capabilities` 是形态唯一该说的领域相关的话 —— 「我能画什么」，不是「我是什么抽法」：
 *
 * - `spin`    能同时驱动几个池转动。0 表示不用转、直接揭晓。
 * - `slots`   揭晓时能同时显示几个槽。
 * - `winners` 一个槽能显示几个条目：`1` 或 `'many'`。
 * - `labels`  一圈最多铺几个标签，只是展示上限，不参与匹配。
 *
 * 抽法在 `protocols.js` 里声明 `requires`，`compatible()` 拿两边比 ——
 * 加一个形态只填 capabilities，加一个抽法只填 requires，谁都不用改对方。
 */

import wheel from './wheel.js';
import grid from './grid.js';
import slot from './slot.js';

const REQUIRED = ['id', 'label', 'capabilities', 'create'];

/** 缺字段的形态不进数组：宁可少一个形态，也不要整页崩掉。 */
function usable(stage) {
  if (stage === null || typeof stage !== 'object') {
    return false;
  }
  const missing = REQUIRED.filter((key) => stage[key] === undefined || stage[key] === null);
  if (missing.length > 0) {
    if (typeof console !== 'undefined') {
      console.warn(`[lottery] 形态「${stage.id ?? '?'}」缺少 ${missing.join(' / ')}，已跳过`);
    }
    return false;
  }
  return typeof stage.create === 'function';
}

/** 展示顺序就是这里的顺序。第一项也是认不出旧 id 时的兜底。 */
export const STAGES = [wheel, grid, slot].filter(usable);

export const DEFAULT_STAGE = STAGES[0]?.id ?? '';

export const STAGE_IDS = STAGES.map((stage) => stage.id);

const BY_ID = new Map(STAGES.map((stage) => [stage.id, stage]));

/** 认不出的 id 一律退回第一种形态，界面不会因为旧数据而空着。 */
export function stageInfo(id) {
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT_STAGE) ?? null;
}

export function isStageId(id) {
  return BY_ID.has(id);
}

export function stageLabel(id) {
  return stageInfo(id)?.label ?? '未命名形态';
}

/** 形态声明的能力，缺项补齐成最保守的一份；认不出的 id 也走这一份。 */
export function capabilitiesOf(id) {
  const raw = BY_ID.get(id)?.capabilities ?? {};
  return {
    spin: Math.max(0, Number(raw.spin) || 0),
    slots: Math.max(1, Number(raw.slots) || 1),
    winners: raw.winners === 'many' ? 'many' : 1,
    labels: Math.max(1, Number(raw.labels) || 1),
  };
}

/** 形态能不能承接这个抽法。 */
export function compatible(stage, protocol) {
  const capability = stage?.capabilities ?? {};
  const need = protocol?.requires ?? {};
  const spin = Math.max(0, Number(capability.spin) || 0);
  const slots = Math.max(1, Number(capability.slots) || 1);
  const winners = capability.winners === 'many' ? 'many' : 1;
  return (
    spin >= (Number(need.spin) || 0) &&
    slots >= (Number(need.slots) || 1) &&
    (winners === 'many' || (need.winners ?? 1) === 1)
  );
}

/** 这个抽法下能选的形态。 */
export function stagesFor(protocol) {
  return STAGES.filter((stage) => compatible(stage, protocol));
}

/** 这个抽法下第一个能用的形态；一个都没有时返回兜底形态。 */
export function defaultStageFor(protocol) {
  return stagesFor(protocol)[0]?.id ?? DEFAULT_STAGE;
}

/** 这一形态有哪些配置项。 */
export function stageFields(id) {
  return stageInfo(id)?.config ?? [];
}

/** 这一形态的默认配置。 */
export function stageDefaults(id) {
  const defaults = {};
  for (const field of stageFields(id)) {
    defaults[field.key] = field.value;
  }
  return defaults;
}

/** 这一形态一次抽几个；不声明 `batch` 的形态固定 1。 */
export function stageBatch(id, config) {
  if (!stageFields(id).some((field) => field.key === 'batch')) {
    return 1;
  }
  return normalizeConfig(id, config).batch ?? 1;
}

function cleanValue(field, value) {
  if (value === undefined || value === null) {
    return field.value;
  }
  if (field.type === 'switch') {
    return value === true || value === 'true' || value === 1 || value === '1';
  }
  if (field.type === 'select') {
    const hit = field.options?.find((option) => String(option.value) === String(value));
    return hit === undefined ? field.value : hit.value;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return field.value;
  }
  return Math.min(field.max, Math.max(field.min, numeric));
}

/** 把任意来源的配置收成这一形态认的那一份。 */
export function normalizeConfig(id, raw) {
  const source = raw !== null && typeof raw === 'object' ? raw : {};
  const config = {};
  for (const field of stageFields(id)) {
    config[field.key] = cleanValue(field, source[field.key]);
  }
  return config;
}

/** 每种形态各存一份配置：切回原形态时还是原来的样子。 */
export function normalizeStageConfig(raw) {
  const source = raw !== null && typeof raw === 'object' ? raw : {};
  const config = {};
  for (const stage of STAGES) {
    config[stage.id] = normalizeConfig(stage.id, source[stage.id]);
  }
  return config;
}

/**
 * 每个形态自己的样式。模块加载时一次性挂上，切形态不会先闪一下没样式；
 * 文件很小，多挂几个链接也无所谓。
 */
function loadStyles() {
  for (const stage of STAGES) {
    if (!stage.styles || document.querySelector(`link[data-stage="${stage.id}"]`) !== null) {
      continue;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = stage.styles;
    link.dataset.stage = stage.id;
    document.head.append(link);
  }
}

// 只在浏览器里挂样式；node 跑单测时没有 document。
if (typeof document !== 'undefined') {
  loadStyles();
}

export function createStage(id, host, config, api = {}) {
  const stage = stageInfo(id);
  if (stage === null) {
    return null;
  }
  return stage.create(host, normalizeConfig(id, config), api);
}
