/**
 * 抽奖详情页：名字、组、形式、槽位、开始、记录。
 *
 * 配置只在这一页改，开奖页一个旋钮都没有。名额一律显示成「已出 X / 共 Y」——
 * 写「每轮几个」会让人以为还能再抽 Y 轮，而名额是整场累计的。
 */

import { el, button, section, fieldRow, actions, select, numberInput, textInput, checkbox } from './dom.js';
import {
  FORM_SPECS, SCOPES, SCOPE_LABELS, SCOPE_NOTES, createSlot, validateDraw,
} from '../domain/draw.js';
import { indexPools } from '../domain/pool.js';
import { scopedUsage } from '../domain/ledger.js';
import { candidatesOf, oddsOf } from '../domain/rule.js';
import { scopeOf } from '../domain/engine.js';
import { progressOf } from '../domain/session.js';
import { recordsSection } from './logView.js';

const FORM_LABELS = { wheel: '大转盘（一个池一个盘）', grid: '九宫格（单池）', slot: '老虎机（单池三连）' };
const FORM_NOTES = {
  wheel: '每个池一个盘。多一些池就多一个盘，四个以上会缩小。',
  grid: '八个格子绕一圈，单池。',
  slot: '三列同一个才算中奖，中奖率由槽位规则给。',
};
const MODE_LABELS = { independent: '同时抽', 'a-then-b': '先定槽 1 再抽槽 2', 'b-then-a': '先定槽 2 再抽槽 1' };

export function drawPage({ store, draw, groups, refresh, onStart, onUndo }) {
  const state = store.state;
  const pools = state.pools;
  const poolMap = indexPools(pools);
  const ledger = { rounds: state.rounds };
  const spec = FORM_SPECS[draw.form.type] ?? FORM_SPECS.wheel;
  const errors = validateDraw(draw, poolMap, groups);

  const head = el('div', 'detail-head');
  head.append(textInput(draw.name, (name) => patch(store, draw, () => ({ name }), refresh), 'detail-title'));
  head.append(el('p', 'detail-sub', summaryOf(draw, pools, groups)));

  const body = el('div', 'detail-body');

  const errorList = el('ul', 'errors');
  for (const message of errors) errorList.append(el('li', undefined, message));

  body.append(section(
    '开始',
    errors.length > 0 ? '配置还有没配好的地方，先补齐再开。' : '开奖层会盖住整屏，投到大屏上给所有人看。',
    errors.length > 0 ? errorList : null,
    actions(button('开始抽奖', () => onStart(draw), 'primary')),
  ));

  body.append(section('归属', '同一个组的抽奖共享一片去重范围，跨场也不会重复中奖。', fieldRow(
    '组',
    groupPicker(store, draw, groups, refresh),
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
      '同时抽是各盘一起转；依次抽是前一个停稳了后一个才转，次序本身就是规格的一部分。',
      fieldRow('顺序', select(
        spec.modes.map((mode) => ({ value: mode, label: MODE_LABELS[mode] ?? mode })),
        draw.mode,
        (mode) => patch(store, draw, () => ({ mode }), refresh),
      )),
    ));
  }

  const slotsSection = section('槽位', '一个槽位就是一个池。名额与作用域按槽位配，互不干扰。');
  draw.slots.forEach((slot, index) => {
    slotsSection.append(el('p', 'subhead', `槽 ${index + 1}`));
    slotsSection.append(slotRows({ store, draw, slot, pools, poolMap, ledger, spec, refresh }));
  });
  slotsSection.append(actions(
    draw.slots.length < Math.min(spec.maxSlots, 6)
      ? button('再加一个池', () => patch(store, draw, (d) => addSlot(d, pools), refresh), 'quiet')
      : null,
  ));
  body.append(slotsSection);

  body.append(recordsSection({ store, draw, onUndo }));

  const detail = el('div', 'detail');
  detail.append(head, body);
  return detail;
}

function groupPicker(store, draw, groups, refresh) {
  const wrap = el('div', 'inline');
  wrap.append(select(
    [{ value: '', label: '不分组' }, ...groups.map((group) => ({ value: group.id, label: group.name || '未命名组' }))],
    draw.groupId ?? '',
    (groupId) => patch(store, draw, () => ({ groupId: groupId || null }), refresh),
  ));
  wrap.append(button('新建组', () => {
    const name = window.prompt('新组名字', `组 ${store.state.groups.length + 1}`);
    if (name === null) return;
    const group = { id: `g-${Math.random().toString(36).slice(2, 8)}`, name: name.trim() || '未命名组' };
    store.update((state) => ({ ...state, groups: [...state.groups, group] }));
    patch(store, draw, () => ({ groupId: group.id }), refresh);
  }, 'quiet'));
  return wrap;
}

function slotRows({ store, draw, slot, pools, poolMap, ledger, spec, refresh }) {
  const wrap = el('div');

  wrap.append(fieldRow('用哪个池', select(
    pools.map((pool) => ({ value: pool.id, label: `${pool.name}（${pool.entries.length} 条）` })),
    slot.poolId,
    (poolId) => patch(store, draw, (d) => ({
      slots: d.slots.map((item) => (item.key === slot.key ? { ...item, poolId } : item)),
    }), refresh),
  )));

  const progress = progressOf(ledger, draw).find((item) => item.key === slot.key);
  const quotaText = Number.isFinite(slot.quota)
    ? `已出 ${progress.used} / 共 ${slot.quota}，剩 ${progress.remain}`
    : `已出 ${progress.used}，名额不限`;

  wrap.append(fieldRow('名额', numberInput(
    Number.isFinite(slot.quota) ? slot.quota : 0,
    (quota) => patchSlot(store, draw, slot.key, { quota: quota > 0 ? quota : Infinity }, refresh),
    { min: 0 },
  ), quotaText));
  wrap.append(el('p', 'hint-line', '名额是整个抽奖的总数，分几轮抽都是这么多；写 0 表示不限。'));

  wrap.append(fieldRow('作用域', select(
    SCOPES.map((scope) => ({ value: scope, label: SCOPE_LABELS[scope] })),
    slot.scope,
    (scope) => patchSlot(store, draw, slot.key, { scope }, refresh),
  ), SCOPE_NOTES[slot.scope] ?? ''));

  if (spec.type === 'slot') {
    wrap.append(fieldRow('中奖率', numberInput(slot.hitRate, (hitRate) => patchSlot(
      store, draw, slot.key, { hitRate }, refresh,
    ), { min: 0, max: 1, step: 0.05 }), '0 到 1'));
  } else {
    wrap.append(fieldRow('一次抽几个', numberInput(slot.count, (count) => patchSlot(
      store, draw, slot.key, { count }, refresh,
    ), { min: 1 }), '转盘转几次'));
  }

  wrap.append(fieldRow('抽中后', select(
    [{ value: 'without', label: '不放回（同一轮不重复）' }, { value: 'with', label: '放回（同一轮可重复）' }],
    slot.replacement,
    (replacement) => patchSlot(store, draw, slot.key, { replacement }, refresh),
  )));

  wrap.append(fieldRow('按权重抽', checkbox('取消就是等概率', slot.weighted !== false, (weighted) => patchSlot(
    store, draw, slot.key, { weighted }, refresh,
  ))));

  wrap.append(el('p', 'hint-line', candidatesText({ ledger, draw, slot, poolMap })));

  if (draw.slots.length > 1) {
    wrap.append(actions(button('删掉这个槽', () => patch(store, draw, (d) => ({
      slots: d.slots.filter((item) => item.key !== slot.key),
    }), refresh), 'quiet')));
  }

  return wrap;
}

/** 候选与折合概率：光填权重看不出 3 和 1 的差别，这里翻成人话。 */
function candidatesText({ ledger, draw, slot, poolMap }) {
  const pool = poolMap[slot.poolId];
  if (!pool || pool.entries.length === 0) return '这个池还没有条目。';

  const usage = scopedUsage(ledger, { scope: scopeOf(slot, draw), drawId: draw.id, groupId: draw.groupId });
  const candidates = candidatesOf(pool, usage, slot);
  if (candidates.length === 0) return '当前没有候选：这个槽抽不动了。';

  const odds = oddsOf(candidates, slot);
  const values = [...odds.values()].sort((a, b) => a - b);
  const low = Math.round((values[0] ?? 0) * 1000) / 10;
  const high = Math.round((values[values.length - 1] ?? 0) * 1000) / 10;
  const range = candidates.length === 1 ? `${high}%` : `${low}% – ${high}%`;
  return `候选 ${candidates.length} 条 · 折合概率 ${range}（随候选变化）`;
}

function summaryOf(draw, pools, groups) {
  const names = draw.slots.map((slot) => pools.find((pool) => pool.id === slot.poolId)?.name ?? '缺池');
  const group = groups.find((item) => item.id === draw.groupId)?.name;
  const parts = [FORM_LABELS[draw.form.type]?.split('（')[0] ?? draw.form.type, names.join(' + ')];
  if (group) parts.push(`组：${group}`);
  return parts.join(' · ');
}

function withForm(draw, type) {
  const spec = FORM_SPECS[type];
  return {
    form: { type, options: { ...draw.form.options } },
    slots: draw.slots.slice(0, spec.maxSlots),
  };
}

function addSlot(draw, pools) {
  const key = `slot${draw.slots.length + 1}`;
  return { slots: [...draw.slots, createSlot({ key, poolId: pools[0]?.id ?? '' })] };
}

function patch(store, draw, patcher, refresh) {
  store.update((state) => ({
    ...state,
    draws: state.draws.map((item) => (item.id === draw.id ? { ...item, ...patcher(item) } : item)),
  }));
  refresh();
}

function patchSlot(store, draw, slotKey, patch, refresh) {
  patch(store, draw, (d) => ({
    slots: d.slots.map((slot) => (slot.key === slotKey ? createSlot({ ...slot, ...patch }) : slot)),
  }), refresh);
}
