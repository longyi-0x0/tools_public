/**
 * 新建向导：一场活动从零到能上台，四步走完。
 *
 * 每一步都有默认值——选不出场景就按「从名单抽人」，给不出名单就先建空的。
 * 向导结束时产出的是「能直接开抽」的东西，不是一个等着配的半成品。
 */

import { el, button, textInput } from './dom.js';
import { createGroup } from '../domain/group.js';
import { createPool, createEntry, mergeEntries } from '../domain/pool.js';
import { createDraw, createSlot, sortedDraws } from '../domain/draw.js';
import { scenarioOf, SCENARIOS, formLabelOf, formNoteOf, poolKindLabel } from './labels.js';
import { readXlsx } from '../xlsx.js';

const HEADER_WORDS = ['姓名', '名字', '名称', '奖品', '奖项', '条目', '参与人'];

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
    return wrap;
  }

  function poolField(index, kind, labelText) {
    const slot = draft.pools[index];
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

  async function absorb(file) {
    if (pendingImport < 0) return;
    try {
      const rows = await readXlsx(await file.arrayBuffer());
      const lines = rows
        .map((row) => (Array.isArray(row) ? row : [row]))
        .map((row) => row.map((cell) => String(cell ?? '').trim()))
        .filter((row) => row.length > 0 && row[0]);
      const start = lines.length > 0 && HEADER_WORDS.some((word) => lines[0][0].includes(word)) ? 1 : 0;
      const text = lines.slice(start).map(([label, stock, extKey]) => (
        [label, stock ?? '', extKey ?? ''].join(',')
      )).join('\n');
      const slot = draft.pools[pendingImport];
      slot.text = slot.text ? `${slot.text}\n${text}` : text;
      render();
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

    const slots = scenario.manual
      ? [
        createSlot({ key: 'slot1', label: scenario.manual.label, poolId: prizePool.id, manual: true, count: 1 }),
        createSlot({ key: 'slot2', label: scenario.slot.label, poolId: peoplePool.id, scope: scenario.slot.scope }),
      ]
      : [
        createSlot({ key: 'slot1', label: scenario.slot.label, poolId: peoplePool.id, scope: scenario.slot.scope }),
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
