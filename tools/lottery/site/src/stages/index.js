/**
 * 形态登记处。
 *
 * 一个形态就是一个文件，默认导出 `{ id, label, mode, styles, config, create }`：
 *
 * ```js
 * export default {
 *   id: 'my-stage',
 *   label: '我的形态',
 *   mode: 'prize-person',      // 这个形态怎么抽：奖品抽人 / 人抽奖品
 *   styles: new URL('./my-stage.css', import.meta.url).href,
 *   config: [
 *     { key: 'rows', label: '行数', type: 'range', min: 12, max: 40, step: 2, value: 26 },
 *   ],
 *   create(host, config, api) {
 *     // 整屏都归这个形态：场景、列表、按钮都自己画
 *     // 返回 { begin, reveal, reset, update, destroy }
 *   },
 * };
 * ```
 *
 * `config` 是这一形态自己的旋钮：主页按它渲染控件，抽奖页把整份配置交给
 * `create`。加一项配置只改这里，不用在两处各写一遍。
 *
 * 形态之间不共用视觉：接口一样，画面、列表位置、按钮形状各写各的。
 */

import cards from './cards.js';
import cage from './cage.js';
import sticks from './sticks.js';
import wall from './wall.js';
import wheel from './wheel.js';

/** 展示顺序就是这里的顺序。第一项也是认不出旧 id 时的兜底。 */
export const STAGES = [wall, cards, cage, sticks, wheel];

export const DEFAULT_STAGE = STAGES[0].id;

export const STAGE_IDS = STAGES.map((stage) => stage.id);

const BY_ID = new Map(STAGES.map((stage) => [stage.id, stage]));

/** 认不出的 id 一律退回第一种形态，界面不会因为旧数据而空着。 */
export function stageInfo(id) {
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT_STAGE);
}

export function stageLabel(id) {
  return stageInfo(id).label;
}

/** 这一形态怎么抽。抽法由形态决定，不再单独设。 */
export function stageMode(id) {
  return stageInfo(id).mode;
}

/** 这一形态一次抽几个；不带 batch 的形态（如人抽奖品）固定 1。 */
export function stageBatch(id, config) {
  const fields = stageFields(id);
  if (!fields.some((field) => field.key === 'batch')) {
    return 1;
  }
  return normalizeConfig(id, config).batch ?? 1;
}

/** 合法的形态 id（数据层校验用）。 */
export function isStageId(id) {
  return BY_ID.has(id);
}

/** 这一形态有哪些配置项。 */
export function stageFields(id) {
  return stageInfo(id).config ?? [];
}

/** 这一形态的默认配置。 */
export function stageDefaults(id) {
  const defaults = {};
  for (const field of stageFields(id)) {
    defaults[field.key] = field.value;
  }
  return defaults;
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
  return stageInfo(id).create(host, normalizeConfig(id, config), api);
}
