/**
 * 抽奖详情页：名字、形式、槽位、开始、记录。
 *
 * 形式在 FORM_SPECS 里声明自己能吃几个池，这里照它显示槽位。槽位就是
 * "这次用哪几个池"，同一个池可以填两次，那时抽取顺序才有意义。
 */

import { el, button, section, fieldRow, actions, select, numberInput, textInput, checkbox } from './dom.js';
import { FORM_SPECS, createRule, validateDraw } from '../domain/draw.js';
import { indexPools } from '../domain/pool.js';
import { recordsSection } from './logView.js';

const FORM_LABELS = { wheel: '大转盘（一个池一个盘）', grid: '九宫格（单池）', slot: '老虎机（单池三连）' };
const FORM_NOTES = {
  wheel: '每个池一个盘。多一些池就多一个盘，四个以上会缩小。',
  grid: '八个格子绕一圈，单池。',
  slot: '三列同一个才算中奖，中奖率由规则给。',
};
const MODE_LABELS = { independent: '同时抽', 'a-then-b': '先定槽 1 再抽槽 2', 'b-then-a': '先定槽 2 再抽槽 1' };

export function drawPage({ store, draw, refresh, onStart, onUndo }) {
  const state = store.state;
  const pools = state.pools;
  const spec = FORM_SPECS[draw.form.type] ?? FORM_SPECS.wheel;
  const errors = validateDraw(draw, indexPools(pools));

  const head = el('div', 'detail-head');
  head.append(textInput(draw.name, (name) => patch(store, draw, () => ({ name }), refresh), 'detail-title'));
  head.append(el('p', 'detail-sub', summaryOf(draw, pools)));

  const body = el('div', 'detail-body');

  body.append(section('开始', null, actions(
    button('开始抽奖', () => onStart(draw), 'primary'),
    errors.length > 0 ? el('span', 'empty', errors.join('；')) : null,
  )));

  body.append(section(
    '形式',
    FORM_NOTES[draw.form.type],
    fieldRow('表演形式', select(
      Object.keys(FORM_SPECS).map((type) => ({ value: type, label: FORM_LABELS[type] })),
      draw.form.type,
      (type) => patch(store, draw, (d) => withForm(d, type), refresh),
    )),
  ));

  if (draw.slots.length > 1) {
    body.append(section(
      '抽取顺序',
      '同时抽是各盘一起转；依次抽是前一个停稳了后一个才转。',
      fieldRow('顺序', select(
        spec.modes.map((mode) => ({ value: mode, label: MODE_LABELS[mode] ?? mode })),
        draw.mode,
        (mode) => patch(store, draw, () => ({ mode }), refresh),
      )),
    ));
  }

  const slotsSection = section('槽位', '一个槽位就是一个池。规则按槽位配，互不干扰。');
  draw.slots.forEach((slot, index) => {
    slotsSection.append(el('p', 'subhead', `槽 ${index + 1}`));
    slotsSection.append(slotRows(store, draw, slot, pools, spec, refresh));
  });
  slotsSection.append(actions(
    draw.slots.length < Math.min(spec.maxSlots, 6)
      ? button('再加一个池', () => patch(store, draw, (d) => addSlot(d, pools), refresh), 'quiet')
      : null,
  ));
  body.append(slotsSection);

  body.append(recordsSection({ store, onUndo }));

  const detail = el('div', 'detail');
  detail.append(head, body);
  return detail;
}

function slotRows(store, draw, slot, pools, spec, refresh) {
  const rule = draw.rule[slot.key] ?? createRule();
  const wrap = el('div');

  wrap.append(fieldRow('用哪个池', select(
    pools.map((pool) => ({ value: pool.id, label: `${pool.name}（${pool.entries.length} 条）` })),
    slot.poolId,
    (poolId) => patch(store, draw, (d) => ({
      slots: d.slots.map((item) => (item.key === slot.key ? { ...item, poolId } : item)),
    }), refresh),
  )));

  if (spec.type === 'slot') {
    wrap.append(fieldRow('中奖率', numberInput(rule.hitRate, (hitRate) => patchRule(store, draw, slot.key, { hitRate }, refresh), { min: 0, max: 1, step: 0.05 }), '0 到 1'));
  } else {
    wrap.append(fieldRow('一次抽几个', numberInput(rule.count, (count) => patchRule(store, draw, slot.key, { count }, refresh), { min: 1 }), '转盘转几次'));
  }

  wrap.append(fieldRow('最多中几次', numberInput(
    Number.isFinite(rule.pickLimit) ? rule.pickLimit : 0,
    (pickLimit) => patchRule(store, draw, slot.key, { pickLimit: pickLimit > 0 ? pickLimit : Infinity }, refresh),
    { min: 0 },
  ), '0 表示不限，另与条目份数取小'));

  wrap.append(fieldRow('抽中后', select(
    [{ value: 'without', label: '不放回（同一轮不重复）' }, { value: 'with', label: '放回（同一轮可重复）' }],
    rule.replacement,
    (replacement) => patchRule(store, draw, slot.key, { replacement }, refresh),
  )));

  wrap.append(fieldRow('按权重抽', checkbox('取消就是等概率', rule.weighted !== false, (weighted) => patchRule(store, draw, slot.key, { weighted }, refresh))));

  if (draw.slots.length > 1) {
    wrap.append(actions(button('删掉这个槽', () => patch(store, draw, (d) => ({
      slots: d.slots.filter((item) => item.key !== slot.key),
      rule: Object.fromEntries(Object.entries(d.rule).filter(([key]) => key !== slot.key)),
    }), refresh), 'quiet')));
  }

  return wrap;
}

function summaryOf(draw, pools) {
  const names = draw.slots.map((slot) => pools.find((pool) => pool.id === slot.poolId)?.name ?? '缺池');
  return `${FORM_LABELS[draw.form.type]?.split('（')[0] ?? draw.form.type} · ${names.join(' + ')}`;
}

function withForm(draw, type) {
  const spec = FORM_SPECS[type];
  const slots = draw.slots.slice(0, spec.maxSlots);
  return {
    form: { type, options: { ...draw.form.options } },
    slots,
    rule: Object.fromEntries(slots.map((slot) => [slot.key, draw.rule[slot.key] ?? createRule()])),
  };
}

function addSlot(draw, pools) {
  const key = `slot${draw.slots.length + 1}`;
  return {
    slots: [...draw.slots, { key, poolId: pools[0]?.id ?? '' }],
    rule: { ...draw.rule, [key]: createRule() },
  };
}

function patch(store, draw, patcher, refresh) {
  store.update((state) => ({
    ...state,
    draws: state.draws.map((item) => (item.id === draw.id ? { ...item, ...patcher(item) } : item)),
  }));
  refresh();
}

function patchRule(store, draw, slotKey, patch, refresh) {
  patch(store, draw, (d) => ({
    rule: { ...d.rule, [slotKey]: { ...(d.rule[slotKey] ?? createRule()), ...patch } },
  }), refresh);
}
