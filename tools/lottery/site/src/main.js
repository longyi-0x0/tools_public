/**
 * 抽奖台的界面：准备、活动、舞台、结果四面，外加顶栏上的模型与形态开关。
 *
 * 状态改完一律先落本机再画界面；舞台是独立的一层，不和列表一起重画。
 */

import {
  MODE,
  MODE_LABELS,
  STAGE,
  STAGE_LABELS,
  addPerson,
  addPrize,
  availablePrizes,
  drawByPerson,
  drawByPrize,
  eligiblePeople,
  hasWon,
  nextPerson,
  prizeDrawn,
  prizeRemaining,
  readiness,
  removePerson,
  removePrize,
  replacePools,
  resetProgress,
  undoLast,
  updatePerson,
  updatePrize,
} from './engine.js';
import { clear, clockTime, h } from './dom.js';
import { createStage } from './stages/index.js';
import { flushState, loadState, saveState } from './store.js';
import {
  buildResultWorkbook,
  buildTemplateWorkbook,
  downloadBytes,
  readLotteryWorkbook,
} from './workbook.js';

const appEl = document.getElementById('app');
const stageEl = document.getElementById('stage');
const fileEl = document.getElementById('file');

let state = loadState();

const ui = {
  view: state.prizes.length > 0 || state.people.length > 0 ? 'event' : 'prepare',
  selectedPrizeId: null,
  batch: 1,
  pending: null,
  peopleQuery: '',
  personPickId: null,
  stageOpen: false,
  spinning: false,
  stage: null,
};

ui.selectedPrizeId = availablePrizes(state)[0]?.id ?? state.prizes[0]?.id ?? null;

/* ---------- 本地状态 ---------- */

function commit(next) {
  state = next;
  saveState(state);
  if (ui.stageOpen) {
    updateStageChrome();
    return;
  }
  render();
}

function toast(message) {
  const existing = document.querySelector('.toast');
  if (existing !== null) {
    existing.remove();
  }
  const node = h('div', { class: 'toast', text: message });
  document.body.append(node);
  window.setTimeout(() => node.classList.add('leaving'), 2600);
  window.setTimeout(() => node.remove(), 3200);
}

/* ---------- 顶栏 ---------- */

function renderChrome() {
  const tabs = [
    ['prepare', '准备'],
    ['event', '活动'],
    ['results', '结果'],
  ];
  const topbar = h(
    'header',
    { class: 'topbar' },
    h(
      'div',
      { class: 'brand' },
      h('span', { class: 'brand-mark', text: '抽奖台' }),
      h('span', {
        class: `brand-title${state.title ? '' : ' empty'}`,
        text: state.title,
      }),
    ),
    h(
      'nav',
      { class: 'tabs' },
      tabs.map(([id, label]) =>
        h('button', {
          class: `tab${ui.view === id ? ' active' : ''}`,
          type: 'button',
          text: label,
          onClick: () => {
            ui.view = id;
            render();
          },
        }),
      ),
      h('button', {
        class: 'tab tab-stage',
        type: 'button',
        text: '舞台',
        onClick: openStage,
      }),
    ),
    h(
      'div',
      { class: 'switches' },
      h(
        'div',
        { class: 'seg', role: 'group', 'aria-label': '抽奖模型' },
        [MODE.PRIZE, MODE.PERSON].map((mode) =>
          h('button', {
            class: `seg-item${state.mode === mode ? ' active' : ''}`,
            type: 'button',
            text: MODE_LABELS[mode],
            onClick: () => {
              if (state.mode === mode) {
                return;
              }
              commit({ ...state, mode });
            },
          }),
        ),
      ),
      h(
        'label',
        { class: 'stage-pick' },
        h('span', { text: '形态' }),
        h(
          'select',
          {
            onChange: (event) => {
              const stage = event.currentTarget.value;
              commit({ ...state, stage });
              if (ui.stageOpen) {
                renderStageBody();
              }
            },
          },
          Object.values(STAGE).map((stage) =>
            h('option', {
              value: stage,
              text: STAGE_LABELS[stage],
              selected: state.stage === stage,
            }),
          ),
        ),
      ),
    ),
  );
  return topbar;
}

/* ---------- 四面 ---------- */

function render() {
  clear(appEl);
  appEl.append(renderChrome(), h('main', { class: 'view' }, renderView()));
  document.body.classList.toggle('stage-on', ui.stageOpen);
}

function renderView() {
  if (ui.view === 'prepare') {
    return renderPrepare();
  }
  if (ui.view === 'results') {
    return renderResults();
  }
  return renderEvent();
}

/* ---------- 准备 ---------- */

function renderPrepare() {
  const drop = h(
    'div',
    {
      class: 'drop',
      tabindex: '0',
      role: 'button',
      onClick: () => fileEl.click(),
      onKeydown: (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          fileEl.click();
        }
      },
      onDragover: (event) => {
        event.preventDefault();
        drop.classList.add('over');
      },
      onDragleave: () => drop.classList.remove('over'),
      onDrop: (event) => {
        event.preventDefault();
        drop.classList.remove('over');
        const file = event.dataTransfer?.files?.[0];
        if (file !== undefined) {
          handleFile(file);
        }
      },
    },
    h('span', { class: 'drop-main', text: '拖一份 .xlsx 进来' }),
    h('span', { class: 'drop-sub', text: '或点这里选择文件 · 解析只在本机进行' }),
  );

  const total = state.prizes.reduce((sum, prize) => sum + prize.count, 0);

  return h(
    'section',
    { class: 'prepare' },
    h(
      'div',
      { class: 'prepare-hero' },
      h('p', { class: 'kicker', text: 'xlsx 进，号码出' }),
      h('h1', { class: 'prepare-title', text: '把名单交给舞台' }),
      h('p', {
        class: 'lede',
        text:
          '一张「奖品」表写清奖项与名额，一张「名单」表写清来的人。两套抽法共用这一份数据：' +
          '可以点名抽奖，也可以让每个人自己抽一次。',
      }),
      drop,
      h(
        'div',
        { class: 'prepare-actions' },
        h('button', {
          class: 'ghost',
          type: 'button',
          text: '下载模板',
          onClick: async () => {
            const bytes = await buildTemplateWorkbook();
            downloadBytes('抽奖模板.xlsx', bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          },
        }),
        state.prizes.length > 0
          ? h('span', {
              class: 'prepare-existing',
              text: `本机已有一场：${state.prizes.length} 个奖项、${total} 个名额、${state.people.length} 人`,
            })
          : null,
      ),
    ),
    ui.pending === null ? null : renderImportReport(),
    renderFormatTable(),
  );
}

function renderFormatTable() {
  const sheet = (name, columns, note) =>
    h(
      'div',
      { class: 'format-sheet' },
      h('div', { class: 'format-head' }, h('span', { class: 'format-name', text: name }), note ? h('span', { class: 'format-note', text: note }) : null),
      h(
        'div',
        { class: 'format-columns' },
        columns.map((column, index) =>
          h(
            'div',
            { class: `format-column${column.optional ? ' optional' : ''}` },
            h('span', { class: 'format-column-name', text: column.name }),
            h('span', { class: 'format-column-rule', text: column.rule }),
            index === columns.length - 1 ? null : h('span', { class: 'format-column-sep', text: '·' }),
          ),
        ),
      ),
    );

  return h(
    'div',
    { class: 'format' },
    h('h2', { class: 'section-title', text: '表的样子' }),
    sheet(
      '奖品',
      [
        { name: '奖品名称', rule: '必填' },
        { name: '数量', rule: '名额，缺省 1' },
        { name: '权重', rule: '人抽奖品时用，缺省 1', optional: true },
        { name: '等级', rule: '只在界面上标一下', optional: true },
      ],
      '表名带「奖」就按奖品表读',
    ),
    sheet(
      '名单',
      [
        { name: '姓名', rule: '必填' },
        { name: '部门', rule: '选填' },
        { name: '工号', rule: '选填，导出结果时带上', optional: true },
      ],
      '表名带「名单 / 人员 / 参与人」就按名单表读',
    ),
    h('p', {
      class: 'format-foot',
      text: '列的顺序随意，认的是表头里的字；表名认不出来时靠表头判断。只支持 .xlsx，读不了的旧格式请另存一次。',
    }),
  );
}

function renderImportReport() {
  const { prizes, people, problems } = ui.pending;
  const total = prizes.reduce((sum, prize) => sum + prize.count, 0);
  return h(
    'div',
    { class: 'report' },
    h('h2', { class: 'section-title', text: '读到的内容' }),
    h(
      'div',
      { class: 'report-summary' },
      h('div', { class: 'report-stat' }, h('b', { text: String(prizes.length) }), h('span', { text: '个奖项' })),
      h('div', { class: 'report-stat' }, h('b', { text: String(total) }), h('span', { text: '个名额' })),
      h('div', { class: 'report-stat' }, h('b', { text: String(people.length) }), h('span', { text: '位参与人' })),
    ),
    problems.length === 0
      ? h('p', { class: 'report-ok', text: '没有发现问题。' })
      : h(
          'ul',
          { class: 'report-problems' },
          problems.map((problem) =>
            h(
              'li',
              {},
              h('span', { class: 'problem-where', text: problem.row > 0 ? `${problem.sheet} 第 ${problem.row} 行` : problem.sheet }),
              h('span', { class: 'problem-what', text: problem.message }),
            ),
          ),
        ),
    h(
      'div',
      { class: 'report-actions' },
      h('button', {
        class: 'primary',
        type: 'button',
        text: '用这份数据',
        onClick: applyImport,
      }),
      h('button', {
        class: 'ghost',
        type: 'button',
        text: '换一份',
        onClick: () => {
          ui.pending = null;
          render();
        },
      }),
    ),
  );
}

async function handleFile(file) {
  if (!/\.xlsx$/i.test(file.name)) {
    toast('只支持 .xlsx；.xls 或 .csv 请先在表格软件里另存一份');
    return;
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await readLotteryWorkbook(bytes);
    ui.pending = { ...result, fileName: file.name };
    render();
  } catch (error) {
    toast(error instanceof Error ? error.message : '这份文件读不了');
  }
}

function applyImport() {
  const pending = ui.pending;
  if (pending === null) {
    return;
  }
  const title = state.title || pending.fileName.replace(/\.xlsx$/i, '');
  state = { ...replacePools(state, pending), title };
  saveState(state);
  ui.selectedPrizeId = availablePrizes(state)[0]?.id ?? null;
  ui.pending = null;
  ui.view = 'event';
  render();
  toast(`已入池：${state.prizes.length} 个奖项、${state.people.length} 人`);
}

/* ---------- 活动 ---------- */

function renderEvent() {
  return h(
    'section',
    { class: 'event' },
    renderEventHead(),
    h(
      'div',
      { class: 'event-grid' },
      renderPrizePanel(),
      renderPeoplePanel(),
    ),
    renderEventFoot(),
  );
}

function renderEventHead() {
  return h(
    'div',
    { class: 'event-head' },
    h(
      'label',
      { class: 'title-field' },
      h('span', { class: 'field-label', text: '活动名称' }),
      h('input', {
        class: 'title-input',
        type: 'text',
        value: state.title,
        placeholder: '给这场抽奖起个名字',
        onInput: (event) => {
          state = { ...state, title: event.currentTarget.value };
          saveState(state);
          const brand = document.querySelector('.brand-title');
          if (brand !== null) {
            brand.textContent = state.title;
            brand.classList.toggle('empty', state.title === '');
          }
        },
      }),
    ),
    h(
      'label',
      { class: 'check' },
      h('input', {
        type: 'checkbox',
        checked: state.uniqueWinner,
        onChange: (event) => {
          commit({ ...state, uniqueWinner: event.currentTarget.checked });
        },
      }),
      h('span', { text: '已中奖的人不再进池' }),
    ),
  );
}

function renderPrizePanel() {
  const total = state.prizes.reduce((sum, prize) => sum + prize.count, 0);
  return h(
    'section',
    { class: 'panel panel-prizes' },
    h(
      'header',
      { class: 'panel-head' },
      h('h2', { class: 'panel-title', text: '奖项' }),
      h('span', { class: 'panel-count', text: `${state.prizes.length} 项 · ${total} 个名额` }),
      h('button', {
        class: 'ghost small',
        type: 'button',
        text: '加奖项',
        onClick: () => {
          const [next, prize] = addPrize(state, { name: `奖项 ${state.prizes.length + 1}` });
          state = next;
          saveState(state);
          ui.selectedPrizeId = prize.id;
          render();
        },
      }),
    ),
    state.prizes.length === 0
      ? h('p', { class: 'empty', text: '还没有奖项。先导入一份表，或手动加一个。' })
      : h(
          'div',
          { class: 'list-block' },
          h(
            'div',
            { class: 'list-caption prize-caption' },
            h('span', {}),
            h('span', { text: '奖品' }),
            h('span', { text: '进度' }),
            h('span', { text: '已抽' }),
            h('span', { text: '名额' }),
            h('span', {}),
          ),
          h(
            'ol',
            { class: 'prize-list' },
            state.prizes.map((prize) => renderPrizeRow(prize)),
          ),
        ),
  );
}

function renderPrizeRow(prize) {
  const drawn = prizeDrawn(state, prize.id);
  const remaining = Math.max(0, prize.count - drawn);
  const ratio = prize.count === 0 ? 0 : Math.min(1, drawn / prize.count);

  const tally = h('span', { class: 'prize-tally', text: `${drawn}/${prize.count}` });
  const bar = h('i', { style: `width:${ratio * 100}%` });
  const selected = ui.selectedPrizeId === prize.id;

  return h(
    'li',
    { class: `prize-row${selected ? ' selected' : ''}${remaining === 0 ? ' done' : ''}` },
    h('button', {
      class: 'prize-select',
      type: 'button',
      title: '设为要抽的奖项',
      'aria-label': '设为要抽的奖项',
      text: remaining === 0 ? '满' : '抽',
      onClick: () => {
        ui.selectedPrizeId = prize.id;
        render();
      },
    }),
    h('input', {
      class: 'prize-name',
      type: 'text',
      value: prize.name,
      'aria-label': '奖品名称',
      onInput: (event) => {
        state = updatePrize(state, prize.id, { name: event.currentTarget.value });
        saveState(state);
      },
    }),
    h('div', { class: 'prize-progress' }, bar),
    tally,
    h('input', {
      class: 'prize-count',
      type: 'number',
      min: String(drawn),
      value: String(prize.count),
      'aria-label': '名额',
      onChange: (event) => {
        state = updatePrize(state, prize.id, { count: Number(event.currentTarget.value) });
        saveState(state);
        render();
      },
    }),
    h('button', {
      class: 'icon-button',
      type: 'button',
      text: '×',
      'aria-label': '删除奖项',
      onClick: () => {
        try {
          state = removePrize(state, prize.id);
          if (ui.selectedPrizeId === prize.id) {
            ui.selectedPrizeId = availablePrizes(state)[0]?.id ?? null;
          }
          saveState(state);
          render();
        } catch (error) {
          toast(error.message);
        }
      },
    }),
  );
}

function renderPeoplePanel() {
  const query = ui.peopleQuery.trim();
  const matched = query === ''
    ? state.people
    : state.people.filter(
        (person) =>
          person.name.includes(query) ||
          (person.dept ?? '').includes(query) ||
          (person.employeeId ?? '').includes(query),
      );
  const shown = matched.slice(0, 300);

  return h(
    'section',
    { class: 'panel panel-people' },
    h(
      'header',
      { class: 'panel-head' },
      h('h2', { class: 'panel-title', text: '名单' }),
      h('span', { class: 'panel-count', text: `${state.people.length} 人` }),
      h('input', {
        class: 'people-search',
        type: 'search',
        placeholder: '找人',
        value: ui.peopleQuery,
        onInput: (event) => {
          ui.peopleQuery = event.currentTarget.value;
          render();
          const input = document.querySelector('.people-search');
          if (input !== null) {
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
          }
        },
      }),
      h('button', {
        class: 'ghost small',
        type: 'button',
        text: '加一人',
        onClick: () => {
          const [next] = addPerson(state, { name: `参与人 ${state.people.length + 1}` });
          state = next;
          saveState(state);
          render();
        },
      }),
    ),
    state.people.length === 0
      ? h('p', { class: 'empty', text: '还没有名单。导入一份表，或手动加一个人。' })
      : h(
          'div',
          { class: 'list-block' },
          h(
            'div',
            { class: 'list-caption person-caption' },
            h('span', {}),
            h('span', { text: '姓名' }),
            h('span', { text: '部门' }),
            h('span', {}),
            h('span', {}),
          ),
          h(
            'ol',
            { class: 'people-list' },
            shown.map((person, index) => renderPersonRow(person, index)),
          ),
        ),
    matched.length > shown.length
      ? h('p', { class: 'list-foot', text: `还有 ${matched.length - shown.length} 人，用上面的搜索缩小范围` })
      : null,
  );
}

function renderPersonRow(person, index) {
  const won = hasWon(state, person.id);
  const result = state.results.find((item) => item.winners.some((winner) => winner.personId === person.id));
  return h(
    'li',
    { class: `person-row${won ? ' won' : ''}` },
    h('span', { class: 'person-index', text: String(index + 1).padStart(3, '0') }),
    h('input', {
      class: 'person-name',
      type: 'text',
      value: person.name,
      'aria-label': '姓名',
      onInput: (event) => {
        state = updatePerson(state, person.id, { name: event.currentTarget.value });
        saveState(state);
      },
    }),
    h('input', {
      class: 'person-dept',
      type: 'text',
      value: person.dept ?? '',
      placeholder: '部门',
      'aria-label': '部门',
      onInput: (event) => {
        state = updatePerson(state, person.id, { dept: event.currentTarget.value });
        saveState(state);
      },
    }),
    won ? h('span', { class: 'person-won', text: result?.prizeName ?? '已中奖' }) : null,
    h('button', {
      class: 'icon-button',
      type: 'button',
      text: '×',
      'aria-label': '删除这个人',
      onClick: () => {
        try {
          state = removePerson(state, person.id);
          saveState(state);
          render();
        } catch (error) {
          toast(error.message);
        }
      },
    }),
  );
}

function renderEventFoot() {
  const info = readiness(state);
  return h(
    'footer',
    { class: 'event-foot' },
    h(
      'div',
      { class: 'foot-text' },
      h('span', { text: `${info.totalPrizeCount} 个名额，已抽出 ${info.handedOut} 个` }),
      info.prizes === 0 && state.prizes.length > 0
        ? h('span', { class: 'foot-warn', text: '所有奖项都抽完了' })
        : null,
      info.people === 0 && state.people.length > 0 && state.uniqueWinner
        ? h('span', { class: 'foot-warn', text: '名单里的人都中过了' })
        : null,
    ),
    h('button', {
      class: 'primary',
      type: 'button',
      text: '拉开舞台',
      onClick: openStage,
    }),
  );
}

/* ---------- 结果 ---------- */

function renderResults() {
  const rows = [];
  let order = 1;
  for (const result of state.results) {
    for (const winner of result.winners) {
      rows.push({ order: order++, result, winner });
    }
  }

  return h(
    'section',
    { class: 'results' },
    h(
      'header',
      { class: 'results-head' },
      h('h2', { class: 'panel-title', text: '开奖记录' }),
      h('span', { class: 'panel-count', text: `${rows.length} 人` }),
      h(
        'div',
        { class: 'results-actions' },
        h('button', {
          class: 'ghost',
          type: 'button',
          text: '撤销上一次',
          disabled: state.results.length === 0,
          onClick: () => {
            commit(undoLast(state));
            toast('已撤销最后一次开奖');
          },
        }),
        h('button', {
          class: 'ghost',
          type: 'button',
          text: '导出 xlsx',
          disabled: rows.length === 0,
          onClick: async () => {
            const bytes = await buildResultWorkbook(state);
            const stamp = new Date().toISOString().slice(0, 10);
            downloadBytes(`${state.title || '抽奖'}结果-${stamp}.xlsx`, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          },
        }),
        h('button', {
          class: 'ghost danger',
          type: 'button',
          text: '清空记录',
          disabled: state.results.length === 0,
          onClick: () => {
            if (!window.confirm('清空所有开奖记录？奖项和名单会留着。')) {
              return;
            }
            commit(resetProgress(state));
          },
        }),
      ),
    ),
    rows.length === 0
      ? h(
          'div',
          { class: 'results-empty' },
          h('p', { text: '还没有开奖记录。' }),
          h('button', { class: 'primary', type: 'button', text: '去舞台', onClick: openStage }),
        )
      : h(
          'table',
          { class: 'result-table' },
          h(
            'thead',
            {},
            h(
              'tr',
              {},
              ['#', '奖项', '姓名', '部门', '工号', '时间'].map((label) =>
                h('th', { text: label }),
              ),
            ),
          ),
          h(
            'tbody',
            {},
            rows
              .slice()
              .reverse()
              .map((row) =>
                h(
                  'tr',
                  {},
                  h('td', { class: 'num', text: String(row.order) }),
                  h('td', { text: row.result.prizeName }),
                  h('td', { class: 'strong', text: row.winner.name }),
                  h('td', { class: 'dim', text: row.winner.dept ?? '' }),
                  h('td', { class: 'dim num', text: row.winner.employeeId ?? '' }),
                  h('td', { class: 'dim num', text: clockTime(row.result.at) }),
                ),
              ),
          ),
        ),
    renderPrizeSummary(),
  );
}

function renderPrizeSummary() {
  if (state.prizes.length === 0) {
    return null;
  }
  return h(
    'div',
    { class: 'summary' },
    h('h3', { class: 'section-title', text: '奖项进度' }),
    h(
      'ul',
      { class: 'summary-list' },
      state.prizes.map((prize) => {
        const drawn = prizeDrawn(state, prize.id);
        const ratio = prize.count === 0 ? 0 : Math.min(1, drawn / prize.count);
        return h(
          'li',
          { class: 'summary-row' },
          h('span', { class: 'summary-name', text: prize.name }),
          h('div', { class: 'prize-progress' }, h('i', { style: `width:${ratio * 100}%` })),
          h('span', { class: 'summary-tally', text: `${drawn}/${prize.count}` }),
        );
      }),
    ),
  );
}

/* ---------- 舞台 ---------- */

function currentPrize() {
  const prize = state.prizes.find((item) => item.id === ui.selectedPrizeId);
  if (prize !== undefined && prizeRemaining(state, prize.id) > 0) {
    return prize;
  }
  return availablePrizes(state)[0] ?? null;
}

/** 人抽奖品时台上这一位：手动选过就用选的，否则按名单顺序取第一个没中过的。 */
function pickedPerson() {
  if (ui.personPickId !== null) {
    const picked = state.people.find((person) => person.id === ui.personPickId);
    if (picked !== undefined && !(state.uniqueWinner && hasWon(state, picked.id))) {
      return picked;
    }
  }
  return nextPerson(state);
}

function openStage() {
  if (ui.stageOpen) {
    return;
  }
  if (state.people.length === 0) {
    toast('还没有名单，舞台没法开');
    ui.view = 'prepare';
    render();
    return;
  }
  ui.stageOpen = true;
  ui.spinning = false;
  stageEl.hidden = false;
  document.body.classList.add('stage-on');
  renderStageBody();
  updateStageChrome();
}

function renderStageBody() {
  clear(stageEl);
  const body = h('div', { class: 'stage-body' });
  stageEl.append(
    h(
      'div',
      { class: 'stage-shell' },
      h('div', { class: 'stage-spot' }),
      h(
        'header',
        { class: 'stage-top' },
        h(
          'div',
          { class: 'stage-chips', id: 'stage-chips' },
        ),
        h(
          'div',
          { class: 'stage-tools' },
          h(
            'div',
            { class: 'seg stage-seg', role: 'group', 'aria-label': '抽奖模型' },
            [MODE.PRIZE, MODE.PERSON].map((mode) =>
              h('button', {
                class: `seg-item${state.mode === mode ? ' active' : ''}`,
                type: 'button',
                text: MODE_LABELS[mode],
                onClick: () => {
                  if (ui.spinning || state.mode === mode) {
                    return;
                  }
                  commit({ ...state, mode });
                  ui.stage?.reset();
                  updateStageChrome();
                },
              }),
            ),
          ),
          h(
            'select',
            {
              class: 'stage-shape',
              'aria-label': '舞台形态',
              onChange: (event) => {
                if (ui.spinning) {
                  event.currentTarget.value = state.stage;
                  return;
                }
                commit({ ...state, stage: event.currentTarget.value });
                renderStageBody();
              },
            },
            Object.values(STAGE).map((stage) =>
              h('option', { value: stage, text: STAGE_LABELS[stage], selected: state.stage === stage }),
            ),
          ),
          h('button', {
            class: 'stage-tool',
            type: 'button',
            text: '全屏',
            onClick: async () => {
              try {
                if (document.fullscreenElement === null) {
                  await (stageEl.requestFullscreen?.() ?? Promise.reject(new Error('no fullscreen')));
                } else {
                  await document.exitFullscreen?.();
                }
              } catch {
                // 工具箱的 iframe 没给全屏权限；舞台本来就铺满视口，说明一句就够
                toast('嵌在工具箱里时不让全屏，舞台已经铺满这一屏');
              }
            },
          }),
          h('button', {
            class: 'stage-tool',
            type: 'button',
            text: '退出',
            onClick: closeStage,
          }),
        ),
      ),
      body,
      h(
        'footer',
        { class: 'stage-foot' },
        h('div', { class: 'stage-status', id: 'stage-status' }),
        h(
          'div',
          { class: 'stage-batch', id: 'stage-batch' },
        ),
        h('button', {
          class: 'stage-action',
          type: 'button',
          id: 'stage-action',
          text: '开抽',
          onClick: toggleDraw,
        }),
        h('div', { class: 'stage-hint', text: '空格 开始 / 停止 · Esc 退出' }),
      ),
    ),
  );
  if (ui.stage !== null) {
    ui.stage.destroy();
  }
  ui.stage = createStage(state.stage, body);
  updateStageChrome();
}

function updateStageChrome() {
  const chips = document.getElementById('stage-chips');
  if (chips === null) {
    return;
  }
  clear(chips);
  if (state.mode === MODE.PRIZE) {
    for (const prize of state.prizes) {
      const remaining = prizeRemaining(state, prize.id);
      const selected = currentPrize()?.id === prize.id;
      chips.append(
        h('button', {
          class: `chip${selected ? ' active' : ''}${remaining === 0 ? ' done' : ''}`,
          type: 'button',
          disabled: remaining === 0,
          onClick: () => {
            if (ui.spinning) {
              return;
            }
            ui.selectedPrizeId = prize.id;
            updateStageChrome();
            if (ui.stage !== null) {
              ui.stage.reset();
            }
          },
        }, h('span', { class: 'chip-name', text: prize.name }), h('span', { class: 'chip-tally', text: `${prizeDrawn(state, prize.id)}/${prize.count}` })),
      );
    }
  } else {
    const person = pickedPerson();
    chips.append(
      h('div', { class: 'chip chip-person' },
        h('span', { class: 'chip-name', text: person?.name ?? '名单已抽空' }),
        h('span', { class: 'chip-tally', text: person?.dept ?? '' }),
      ),
      eligiblePeople(state).length > 1
        ? h(
            'select',
            {
              class: 'stage-person',
              'aria-label': '换一个人',
              onChange: (event) => {
                if (ui.spinning) {
                  return;
                }
                ui.personPickId = event.currentTarget.value || null;
                updateStageChrome();
                ui.stage?.reset();
              },
            },
            eligiblePeople(state)
              .slice(0, 500)
              .map((item) =>
                h('option', {
                  value: item.id,
                  text: `${item.name}${item.dept ? ` · ${item.dept}` : ''}`,
                  selected: person?.id === item.id,
                }),
              ),
          )
        : null,
    );
  }

  const status = document.getElementById('stage-status');
  if (status !== null) {
    status.textContent = stageStatusText();
  }

  const batch = document.getElementById('stage-batch');
  if (batch !== null) {
    clear(batch);
    if (state.mode === MODE.PRIZE) {
      for (const size of [1, 2, 3, 5, 10]) {
        batch.append(
          h('button', {
            class: `batch-item${ui.batch === size ? ' active' : ''}`,
            type: 'button',
            text: String(size),
            onClick: () => {
              if (ui.spinning) {
                return;
              }
              ui.batch = size;
              updateStageChrome();
            },
          }),
        );
      }
    }
  }

  const action = document.getElementById('stage-action');
  if (action !== null) {
    const prize = state.mode === MODE.PRIZE ? currentPrize() : null;
    const canDraw = state.mode === MODE.PRIZE ? prize !== null : availablePrizes(state).length > 0;
    action.textContent = ui.spinning ? '停' : state.mode === MODE.PRIZE ? '开抽' : '抽一次';
    action.classList.toggle('running', ui.spinning);
    action.disabled = !ui.spinning && (!canDraw || eligiblePeople(state).length === 0);
  }
}

function stageStatusText() {
  if (state.mode === MODE.PRIZE) {
    const prize = currentPrize();
    if (prize === null) {
      return '所有奖项都抽完了';
    }
    const remaining = prizeRemaining(state, prize.id);
    return `${prize.name} · 还剩 ${remaining} 个名额 · 每次抽 ${Math.min(ui.batch, remaining)} 人`;
  }
  const person = pickedPerson();
  if (person === null) {
    return '名单里的人都抽过了';
  }
  return `这一位：${person.name}${person.dept ? ` · ${person.dept}` : ''}`;
}

function toggleDraw() {
  if (ui.spinning) {
    stopDraw();
  } else {
    startDraw();
  }
}

function startDraw() {
  if (state.people.length === 0) {
    toast('还没有可抽的人');
    return;
  }
  if (state.mode === MODE.PRIZE && currentPrize() === null) {
    toast('所有奖项都抽完了');
    return;
  }
  const labels = eligiblePeople(state).map((person) => person.name);
  ui.stage.begin({ labels });
  ui.spinning = true;
  updateStageChrome();
}

function stopDraw() {
  let outcome;
  try {
    outcome = state.mode === MODE.PRIZE
      ? drawByPrize(state, currentPrize().id, ui.batch)
      : drawByPerson(state, ui.personPickId ?? undefined);
  } catch (error) {
    ui.spinning = false;
    updateStageChrome();
    toast(error.message);
    return;
  }
  state = outcome.state;
  saveState(state);
  ui.spinning = false;
  ui.personPickId = null;
  if (state.mode === MODE.PRIZE && prizeRemaining(state, outcome.prize.id) === 0) {
    ui.selectedPrizeId = availablePrizes(state)[0]?.id ?? null;
  }
  ui.stage.reveal({ winners: outcome.winners, prizeName: outcome.prize.name });
  updateStageChrome();
}

function closeStage() {
  if (ui.stage !== null) {
    ui.stage.destroy();
    ui.stage = null;
  }
  ui.stageOpen = false;
  ui.spinning = false;
  stageEl.hidden = true;
  clear(stageEl);
  document.body.classList.remove('stage-on');
  if (document.fullscreenElement !== null) {
    document.exitFullscreen?.();
  }
  render();
}

/* ---------- 事件 ---------- */

fileEl.addEventListener('change', (event) => {
  const file = event.currentTarget.files?.[0];
  event.currentTarget.value = '';
  if (file !== undefined) {
    handleFile(file);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && ui.stageOpen) {
    closeStage();
    return;
  }
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '');
  if (event.code === 'Space' && ui.stageOpen && !typing) {
    event.preventDefault();
    toggleDraw();
  }
});

window.addEventListener('pagehide', () => flushState(state));
window.addEventListener('beforeunload', () => flushState(state));

render();
