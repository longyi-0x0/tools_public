/**
 * 环节详情页：配一个环节，然后上台。
 *
 * 三段：开抽区（主持人看的）、出奖位卡片（策划者配的）、本环节记录。
 * 一年只配一次的东西全部折进「高级」，日常上台只用得到最上面那一块。
 * 名额一律说「已抽 X / 共 Y」——说「每轮几个」会让人以为还能再抽 Y 轮。
 */

import {
  el, button, section, fieldRow, actions, select, numberInput, textInput, checkbox,
  card, progressBar, collapsible, toggle,
} from './dom.js';
import { FORM_SPECS, createSlot } from '../domain/draw.js';
import { indexPools } from '../domain/pool.js';
import { drawStatsOf } from '../domain/progress.js';
import { createGroup } from '../domain/group.js';
import {
  slotTitleOf, poolKindLabel, formLabelOf, formNoteOf, scopeOptions, scopeNoteOf,
  progressTextOf,
} from './labels.js';
import { recordsSection } from './logView.js';
import { nameOf } from './naming.js';

export function drawPage({ store, draw, refresh, onStart, onRehearse, onUndo }) {
  const state = store.state;
  const pools = state.pools;
  const poolMap = indexPools(pools);
  const ledger = { rounds: state.rounds };
  const spec = FORM_SPECS[draw.form.type] ?? FORM_SPECS.wheel;
  const stat = drawStatsOf({ ledger, draw, pools: poolMap });
  const missing = (draw.slots ?? []).filter((slot) => !poolMap[slot.poolId]);

  const head = el('div', 'detail-head');
  head.append(textInput(draw.name, (name) => patch(store, draw, () => ({ name }), refresh), 'detail-title'));
  head.append(el('p', 'detail-sub', summaryOf(draw, poolMap)));
  head.append(activityPicker(store, draw, refresh));

  const body = el('div', 'detail-body');

  /* ① 开抽区 */
  const go = section(
    '上台开奖',
    missing.length > 0
      ? `还有 ${missing.length} 个出奖位没选清单，先在下面选好。`
      : stat.done
        ? '这一环节抽完了，或者你已经手动收尾。'
        : '上台后配置锁住，主持人只有开始、下一轮、下一环节三个动作。',
  );
  go.append(progressBar(stat.used, stat.quota));
  go.append(el('p', 'go-progress', progressTextOf(stat)));
  go.append(actions(
    button('上台开奖', () => onStart(draw), missing.length > 0 ? '' : 'primary'),
    button('彩排一遍', () => onRehearse(draw), 'quiet'),
  ));
  if (missing.length > 0) {
    for (const slot of missing) {
      go.append(el('p', 'warn', `「${slotTitleOf(slot, 0)}」还没选清单`));
    }
  }
  const startBtn = go.querySelector('.button.primary');
  if (startBtn && missing.length > 0) {
    startBtn.disabled = true;
    startBtn.title = '先把出奖位的清单选好';
  }
  body.append(go);

  /* ② 出奖位卡片 */
  const slotSection = section('出奖位', '一个出奖位就是一个「抽什么」。多个出奖位时按顺序依次演。');
  draw.slots.forEach((slot, index) => {
    slotSection.append(slotCard({
      store, draw, slot, index, pools, poolMap, ledger, refresh,
    }));
  });
  if (draw.slots.length < Math.min(spec.maxSlots, 4)) {
    slotSection.append(actions(button('＋ 加一个出奖位', () => patch(store, draw, (d) => ({
      slots: [...d.slots, createSlot({ key: `slot${d.slots.length + 1}`, poolId: pools[0]?.id ?? '' })],
    }), refresh), 'quiet')));
  }
  body.append(slotSection);

  /* 外观 */
  const look = section('外观', formNoteOf(draw.form.type));
  look.append(fieldRow('表演形式', select(
    Object.keys(FORM_SPECS).map((type) => ({ value: type, label: formLabelOf(type) })),
    draw.form.type,
    (type) => patch(store, draw, (d) => withForm(d, type), refresh),
  )));
  body.append(look);

  /* ③ 记录 */
  body.append(recordsSection({
    store,
    rounds: state.rounds.filter((round) => round.drawId === draw.id),
    onUndo,
  }));

  body.append(section(
    '删除这个环节',
    '中奖记录会跟着留着，撤销与复算照常。',
    actions(button('删除这个环节', () => {
      if (!window.confirm('删除这个环节？中奖记录保留，但不再属于任何环节。')) return;
      store.update((s) => ({
        ...s,
        draws: s.draws.filter((item) => item.id !== draw.id),
        currentDrawId: s.currentDrawId === draw.id ? null : s.currentDrawId,
      }));
      refresh();
    }, 'danger')),
  ));

  const detail = el('div', 'detail');
  detail.append(head, body);
  return detail;
}

/* ---------- 出奖位卡片 ---------- */

function slotCard({ store, draw, slot, index, pools, poolMap, ledger, refresh }) {
  const kind = poolMap[slot.poolId]?.kind ?? 'generic';
  const node = el('div', 'card slot-card');

  const head = el('div', 'card-head');
  const title = textInput(slot.label, (label) => patchSlot(
    store, draw, slot.key, { label }, refresh,
  ), 'card-title');
  title.placeholder = slotTitleOf(slot, index, kind);
  head.append(title);
  head.append(el('span', 'card-sub', slot.manual ? '主持人在台上选' : '由工具抽'));
  node.append(head);

  node.append(fieldRow('从哪张清单抽', select(
    pools.map((pool) => ({ value: pool.id, label: `${nameOf(pool)}（${pool.entries.length} 项）` })),
    slot.poolId,
    (poolId) => patchSlot(store, draw, slot.key, { poolId }, refresh),
  ), poolMap[slot.poolId] ? poolKindLabel(kind) : '还没选'));

  const unlimited = !Number.isFinite(slot.quota);
  const quotaRow = fieldRow(
    '共抽几个',
    numberInput(unlimited ? 0 : slot.quota, (quota) => patchSlot(
      store, draw, slot.key, { quota: quota > 0 ? quota : Infinity }, refresh,
    ), { min: 0 }),
    '这是整场的总数，分几轮抽都是这么多',
  );
  const quotaInput = quotaRow.querySelector('input');
  quotaInput.disabled = unlimited;
  node.append(quotaRow);
  node.append(fieldRow('不限量', toggle('抽多少个都不停', unlimited, (on) => patchSlot(
    store, draw, slot.key, { quota: on ? Infinity : Math.max(1, Number.isFinite(slot.quota) ? slot.quota : 1) }, refresh,
  ))));

  node.append(fieldRow('一次抽几个', numberInput(slot.count, (count) => patchSlot(
    store, draw, slot.key, { count }, refresh,
  ), { min: 1 }), '转盘一次转出几个'));

  /* 高级：一年只配一次的东西 */
  const advanced = collapsible('高级');
  advanced.append(fieldRow('中过还能不能再中', select(
    scopeOptions(), slot.scope, (scope) => patchSlot(store, draw, slot.key, { scope }, refresh),
  ), scopeNoteOf(slot.scope)));

  advanced.append(fieldRow('机会倍数', checkbox(
    '按份数加权', slot.weighted !== false, (weighted) => patchSlot(
      store, draw, slot.key, { weighted }, refresh,
    ),
  ), '取消就是人人等概率'));

  advanced.append(fieldRow('同一轮里', select(
    [{ value: 'without', label: '不重复' }, { value: 'with', label: '可以重复' }],
    slot.replacement,
    (replacement) => patchSlot(store, draw, slot.key, { replacement }, refresh),
  )));

  if ((FORM_SPECS[draw.form.type] ?? FORM_SPECS.wheel).type === 'slot') {
    advanced.append(fieldRow('中奖概率', numberInput(Math.round(slot.hitRate * 100), (percent) => patchSlot(
      store, draw, slot.key, { hitRate: Math.max(0, Math.min(100, percent)) / 100 }, refresh,
    ), { min: 0, max: 100, step: 5 }), '百分之多少能中'));
  }

  advanced.append(fieldRow('谁来定', toggle(
    '这一位由主持人在台上选', slot.manual === true, (manual) => patchSlot(
      store, draw, slot.key, { manual }, refresh,
    ),
  ), '比如先点一个奖项，再从名单里抽出谁拿'));

  node.append(advanced);

  if (draw.slots.length > 1) {
    node.append(actions(button('删掉这个出奖位', () => patch(store, draw, (d) => ({
      slots: d.slots.filter((item) => item.key !== slot.key),
    }), refresh), 'quiet')));
  }

  return node;
}

/* ---------- 归属与摘要 ---------- */

function activityPicker(store, draw, refresh) {
  const groups = store.state.groups;
  const wrap = el('div', 'inline');
  wrap.append(el('span', 'field-caption', '属于哪场活动'));
  wrap.append(select(
    [{ value: '', label: '不属于任何活动' }, ...groups.map((group) => ({
      value: group.id, label: nameOf(group, '未命名活动'),
    }))],
    draw.groupId ?? '',
    (groupId) => patch(store, draw, () => ({ groupId: groupId || null }), refresh),
  ));
  wrap.append(button('新建活动', () => {
    const name = window.prompt('这场活动叫什么', `活动 ${store.state.groups.length + 1}`);
    if (name === null) return;
    const group = createGroup({ name: name.trim() || '未命名活动' });
    store.update((s) => ({ ...s, groups: [...s.groups, group] }));
    patch(store, draw, () => ({ groupId: group.id }), refresh);
  }, 'quiet'));
  return wrap;
}

function summaryOf(draw, poolMap) {
  const names = draw.slots.map((slot) => nameOf(poolMap[slot.poolId] ?? null, '还没选清单'));
  return [formLabelOf(draw.form.type), names.join(' + ')].join(' · ');
}

function withForm(draw, type) {
  const spec = FORM_SPECS[type];
  return {
    form: { type, options: { ...draw.form.options } },
    slots: draw.slots.slice(0, spec.maxSlots),
  };
}

function patch(store, draw, patcher, refresh) {
  store.update((state) => ({
    ...state,
    draws: state.draws.map((item) => (item.id === draw.id ? { ...item, ...patcher(item) } : item)),
  }));
  refresh();
}

function patchSlot(store, draw, slotKey, patchData, refresh) {
  patch(store, draw, (d) => ({
    slots: d.slots.map((slot) => (slot.key === slotKey ? createSlot({ ...slot, ...patchData }) : slot)),
  }), refresh);
}
