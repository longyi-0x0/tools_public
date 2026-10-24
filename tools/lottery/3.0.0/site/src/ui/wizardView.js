/**
 * 新建向导：一场活动从零到能上台，四步走完。
 *
 * 每一步都有默认值——选不出场景就按「从名单抽人」，给不出名单就先建空的。
 * 向导结束时产出的是「能直接开抽」的东西，不是一个等着配的半成品。
 */

import { el, button, textInput, numberInput, checkbox } from './dom.js';
import { createGroup } from '../domain/group.js';
import { createPool, createEntry, mergeEntries } from '../domain/pool.js';
import { createDraw, createSlot, sortedDraws } from '../domain/draw.js';
import {
  scenarioOf, SCENARIOS, formLabelOf, formNoteOf, poolKindLabel,
} from './labels.js';
import { readXlsx } from '../xlsx.js';
import { openImport } from './importDialog.js';

export function createWizard({ host, store, onDone }) {
  let draft = null;
  let step = 0;
  /** 导入时往哪张清单里塞。-1 表示没有待处理的导入。 */
  let pendingImport = -1;

  function open(options = {}) {
    draft = {
      groupId: options.groupId ?? null,
      groupName: '',
      at: '',
      drawName: '三等奖',
      scenario: 'people',
      formType: 'wheel',
      // 名额必须问出来：默认「不限量」等于把「什么时候算抽完」这个决定推给台上的主持人。
      quota: 5,
      unlimited: false,
      count: 1,
      pools: [
        { name: '', kind: 'people', text: '' },
        { name: '', kind: 'prize', text: '' },
      ],
    };
    step = 0;
    host.hidden = false;
    render();
  }

  function close() {
    host.hidden = true;
    draft = null;
  }

  function steps() {
    return [
      { key: 'activity', title: '这是什么活动' },
      { key: 'scenario', title: '怎么抽' },
      { key: 'people', title: '谁参与 / 抽什么' },
      { key: 'look', title: '挑个外观' },
    ];
  }

  function render() {
    if (!draft) return;
    const list = steps();
    const frame = el('div', 'wizard-frame');

    const head = el('div', 'wizard-head');
    head.append(el('p', 'wizard-step', `第 ${step + 1} / ${list.length} 步`));
    head.append(el('h2', 'wizard-title', list[step].title));
    head.append(button('✕', close, 'icon-button'));
    frame.append(head);

    const body = el('div', 'wizard-body');
    if (list[step].key === 'activity') body.append(activityStep());
    if (list[step].key === 'scenario') body.append(scenarioStep());
    if (list[step].key === 'people') body.append(peopleStep());
    if (list[step].key === 'look') body.append(lookStep());
    frame.append(body);

    const bar = el('div', 'wizard-bar');
    bar.append(button('上一步', () => {
      step = Math.max(0, step - 1);
      render();
    }, step === 0 ? 'quiet' : ''));
    const backBtn = bar.querySelector('.button');
    if (step === 0) backBtn.disabled = true;
    bar.append(el('div', 'spacer'));
    bar.append(button(step === list.length - 1 ? '就按这样开始' : '下一步', () => {
      if (step === list.length - 1) finish();
      else {
        step += 1;
        render();
      }
    }, 'primary'));
    frame.append(bar);

    host.replaceChildren(frame);
  }

  /* ---------- 每一步 ---------- */

  function activityStep() {
    const wrap = el('div', 'wizard-fields');
    if (!draft.groupId) {
      wrap.append(field('这场活动叫什么', textInput(
        draft.groupName, (value) => { draft.groupName = value; }, 'wizard-input',
      ), '比如「2026 年会」，之后还能改'));
      wrap.append(field('什么时候（可不填）', textInput(
        draft.at, (value) => { draft.at = value; }, 'wizard-input',
      )));
    } else {
      const group = store.state.groups.find((item) => item.id === draft.groupId);
      wrap.append(el('p', 'wizard-note', `加在「${group?.name || '这场活动'}」下面。`));
    }
    wrap.append(field('第一个环节叫什么', textInput(
      draft.drawName, (value) => { draft.drawName = value; }, 'wizard-input',
    ), '比如「三等奖」。一个环节抽一批，抽完接下一个。'));
    return wrap;
  }

  function scenarioStep() {
    const wrap = el('div', 'wizard-cards');
    for (const item of SCENARIOS) {
      const card = el('div', `wizard-card${draft.scenario === item.key ? ' active' : ''}`);
      card.append(el('h3', 'card-title', item.title));
      card.append(el('p', 'card-sub', item.note));
      card.append(button(draft.scenario === item.key ? '已选这个' : '选这个', () => {
        draft.scenario = item.key;
        render();
      }, draft.scenario === item.key ? 'primary' : 'quiet'));
      wrap.append(card);
    }
    return wrap;
  }

  function peopleStep() {
    const scenario = scenarioOf(draft.scenario);
    const wrap = el('div', 'wizard-fields');
    wrap.append(poolField(0, scenario.kind, scenario.key === 'people' ? '参与的人' : '要抽的东西'));
    if (scenario.manual) {
      wrap.append(poolField(1, scenario.manual.kind, '奖项（主持人在台上挑）'));
    }
    wrap.append(el('p', 'wizard-note', '一行一个，也可以先空着，之后再导入 xlsx。'));
    wrap.append(quotaField());
    return wrap;
  }

  /**
   * 名额。两个数字决定这场怎么收尾：整场一共出几个、一次转出几个。
   * 不限量是个显式开关，不是「留空」——留空会被当成没填，台上就永远抽不完。
   */
  function quotaField() {
    const wrap = el('div', 'wizard-fields');
    const quotaRow = field('这个环节一共抽几个', numberInput(
      draft.quota, (value) => {
        draft.quota = Math.max(1, Math.floor(Number(value)) || 1);
        render();
      }, { min: 1 },
    ), '三等奖抽 30 个就填 30');
    const quotaInput = quotaRow.querySelector('input');
    if (quotaInput) quotaInput.disabled = draft.unlimited;
    wrap.append(quotaRow);

    wrap.append(checkbox('抽多少个都不停（不限量）', draft.unlimited, (on) => {
      draft.unlimited = on;
      render();
    }));

    wrap.append(field('一次抽几个', numberInput(
      draft.count, (value) => {
        draft.count = Math.max(1, Math.floor(Number(value)) || 1);
        render();
      }, { min: 1 },
    ), '一次转出几个名字；30 个分 6 次抽就填 5'));
    return wrap;
  }

  function poolField(index, kind, labelText) {
    const slot = draft.pools[index];
    slot.kind = kind;
    const box = el('div', 'wizard-pool');
    box.append(el('span', 'field-caption', `${labelText}（${poolKindLabel(kind)}）`));
    box.append(textInput(
      slot.name, (value) => { slot.name = value; }, 'wizard-input',
    ));

    const area = document.createElement('textarea');
    area.rows = 6;
    area.className = 'wizard-text';
    area.value = slot.text;
    area.placeholder = kind === 'people' ? '张三\n李四\n王五' : '扫地机器人\n蓝牙耳机\n谢谢参与';
    area.addEventListener('input', () => { slot.text = area.value; });
    box.append(area);

    box.append(button('从 xlsx 导入', () => importInto(index), 'quiet'));
    return box;
  }

  function lookStep() {
    const wrap = el('div', 'wizard-cards');
    for (const type of ['wheel', 'grid', 'slot']) {
      const card = el('div', `wizard-card${draft.formType === type ? ' active' : ''}`);
      card.append(el('h3', 'card-title', formLabelOf(type)));
      card.append(el('p', 'card-sub', formNoteOf(type)));
      card.append(button(draft.formType === type ? '已选这个' : '选这个', () => {
        draft.formType = type;
        render();
      }, draft.formType === type ? 'primary' : 'quiet'));
      wrap.append(card);
    }
    wrap.append(el('p', 'wizard-note', '上台之后还能改，先挑一个顺眼的。'));
    return wrap;
  }

  function field(labelText, control, note) {
    const wrap = el('div', 'field-row');
    wrap.append(el('span', undefined, labelText));
    if (note) wrap.append(el('span', 'hint', note));
    wrap.append(control);
    return wrap;
  }

  /* ---------- 导入 ---------- */

  function importInto(index) {
    const input = document.getElementById('file');
    if (!input) return;
    pendingImport = index;
    input.value = '';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) await absorb(file);
      pendingImport = -1;
    };
    input.click();
  }

  /**
   * 导入走对话框：让人指完列再落进文本框。
   *
   * 向导里的名单就是一段文本，所以确认后拼回文本（`名字,能中几次,工号`），
   * 而不是绕过文本直接建条目——不然文本框里显示的跟实际导入的会对不上。
   */
  async function absorb(file) {
    const index = pendingImport;
    pendingImport = -1;
    if (index < 0) return;

    try {
      const table = await readXlsx(await file.arrayBuffer());
      const rows = table.map((row) => (Array.isArray(row) ? row : [row]).map((cell) => String(cell ?? '').trim()));
      const slot = draft.pools[index];
      openImport({
        rows,
        kind: slot.kind ?? 'people',
        name: slot.name || '这份表',
        onApply: (entries) => {
          const text = entries
            .map((entry) => [entry.label, entry.stock === Infinity ? '' : entry.stock, entry.extKey ?? ''].join(','))
            .join('\n');
          slot.text = slot.text ? `${slot.text}\n${text}` : text;
          render();
        },
      });
    } catch (error) {
      window.alert(`读不出来：${error.message}`);
    }
  }

  /* ---------- 落地 ---------- */

  function finish() {
    const scenario = scenarioOf(draft.scenario);

    let groupId = draft.groupId;
    if (!groupId) {
      const group = createGroup({ name: draft.groupName.trim() || '未命名活动', at: draft.at });
      groupId = group.id;
      store.update((state) => ({ ...state, groups: [...state.groups, group] }));
    }

    const peoplePool = makePool(0, scenario.kind, draft.pools[0].name || (scenario.kind === 'people' ? '全员名单' : '奖品清单'));
    const prizePool = scenario.manual
      ? makePool(1, scenario.manual.kind, draft.pools[1].name || '奖品清单')
      : null;

    const quota = draft.unlimited ? Infinity : (draft.quota > 0 ? draft.quota : Infinity);
    const count = Math.max(1, Math.floor(draft.count) || 1);

    const slots = scenario.manual
      ? [
        createSlot({ key: 'slot1', label: scenario.manual.label, poolId: prizePool.id, manual: true, count: 1 }),
        createSlot({
          key: 'slot2', label: scenario.slot.label, poolId: peoplePool.id,
          scope: scenario.slot.scope, quota, count,
        }),
      ]
      : [
        createSlot({
          key: 'slot1', label: scenario.slot.label, poolId: peoplePool.id,
          scope: scenario.slot.scope, quota, count,
        }),
      ];

    const siblings = sortedDraws(store.state.draws.filter((draw) => draw.groupId === groupId));
    const draw = createDraw({
      name: draft.drawName.trim() || '第一个环节',
      groupId,
      slots,
      form: { type: draft.formType, options: {} },
      order: siblings.length,
    });

    store.update((state) => ({
      ...state,
      pools: [...state.pools, ...[peoplePool, prizePool].filter(Boolean)],
      draws: [...state.draws, draw],
      currentDrawId: draw.id,
    }));

    const result = { groupId, drawId: draw.id };
    close();
    onDone?.(result.groupId, result.drawId);
  }

  function makePool(index, kind, fallbackName) {
    const slot = draft.pools[index];
    const pool = createPool({
      name: slot.name.trim() || fallbackName,
      kind,
      entries: entriesFromText(index, kind),
    });
    return pool;
  }

  function entriesFromText(index, kind) {
    const slot = draft.pools[index];
    const incoming = [];
    for (const line of slot.text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const [label, stock, extKey] = trimmed.split(',').map((part) => part.trim());
      if (!label) continue;
      incoming.push(createEntry({
        label,
        extKey: extKey || label,
        stock: stock === undefined || stock === '' || stock === '不限' ? Infinity : stock,
        weight: 1,
      }));
    }
    if (incoming.length === 0) return [];
    const merged = mergeEntries([], incoming).entries;
    return kind === 'people' ? merged.map((entry) => ({ ...entry, stock: 1 })) : merged;
  }

  return { open, close, isOpen: () => !host.hidden };
}
