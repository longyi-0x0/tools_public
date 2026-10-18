/**
 * 抽奖台主页。
 *
 * 左边是三类对象（抽奖 / 名单 / 奖品）的列表，右边是选中项的详情。
 * 抽奖页是独立入口 `draw.html`，这里只负责管理：导入导出的 xlsx、
 * 开始 / 继续 / 重新抽、形式与形态的配置。
 */

import { MODE, undoWinner } from './engine.js';
import {
  addPrizeSet,
  addRoster,
  cleanPeople,
  cleanPrizes,
  createLottery,
  lotteryById,
  lotteryStatus,
  lotterySummary,
  patchLotteryPools,
  removeLottery,
  removePrizeSet,
  removeRoster,
  replaceLotteryData,
  resetLottery,
  runState,
  uniqueName,
  updateLottery,
  updatePrizeSet,
  updateRoster,
  writeRunState,
} from './data.js';
import { loadApp, saveApp, flushApp } from './store.js';
import { STAGES, createStage, stageFields, stageInfo, stageLabel, stageMode } from './stages/index.js';
import { h, el, clear, clockTime } from './dom.js';
import { THEMES, applyTheme, loadTheme, saveTheme } from './theme.js';
import {
  buildLotteryWorkbook,
  buildPrizeSetWorkbook,
  buildRosterWorkbook,
  buildResultWorkbook,
  downloadBytes,
  readLotteryWorkbook,
} from './workbook.js';

const appEl = document.getElementById('app');
const fileEl = document.getElementById('file');

let app = loadApp();

applyTheme(loadTheme());
const theme = { id: loadTheme() };

const ui = {
  view: ['lotteries', 'rosters', 'prizes'].includes(app.lastView) ? app.lastView : 'lotteries',
  lotteryId: app.lastLotteryId ?? app.lotteries[0]?.id ?? null,
  rosterId: app.rosters[0]?.id ?? null,
  prizeSetId: app.prizeSets[0]?.id ?? null,
  /** 弹窗：`{ kind, ... }`，见 renderDialog。 */
  dialog: null,
  /** 新建抽奖的草稿。 */
  draft: null,
  /** 等文件选择器回来的目标。 */
  importTarget: null,
  /** 读完待确认的一份 xlsx。 */
  pending: null,
  /** 形态弹窗里的预览实例。 */
  preview: null,
  poolsTab: 'people',
  resultsTab: 'prize',
  /** 结果明细里勾掉的人，键是 `resultId:personId`。 */
  resultsPicked: new Set(),
  /** 结果明细的编辑态：只有这时才能多选与撤销。 */
  resultsEditing: false,
};

/* ---------- 视图数据 ---------- */

const VIEW_LABELS = { lotteries: '抽奖', rosters: '名单', prizes: '奖品' };

function viewItems() {
  if (ui.view === 'rosters') {
    return app.rosters;
  }
  if (ui.view === 'prizes') {
    return app.prizeSets;
  }
  return app.lotteries;
}

function itemName(item) {
  return ui.view === 'lotteries' ? item.title : item.name;
}

function currentLottery() {
  return lotteryById(app, ui.lotteryId);
}

function currentRoster() {
  return app.rosters.find((item) => item.id === ui.rosterId) ?? null;
}

function currentPrizeSet() {
  return app.prizeSets.find((item) => item.id === ui.prizeSetId) ?? null;
}

function remember() {
  app = { ...app, lastView: ui.view, lastLotteryId: ui.lotteryId };
  saveApp(app);
}

/* ---------- 渲染入口 ---------- */

function render() {
  if (ui.view === 'lotteries' && ui.lotteryId === null && app.lotteries.length > 0) {
    ui.lotteryId = app.lotteries[0].id;
  }
  if (ui.view === 'rosters' && ui.rosterId === null && app.rosters.length > 0) {
    ui.rosterId = app.rosters[0].id;
  }
  if (ui.view === 'prizes' && ui.prizeSetId === null && app.prizeSets.length > 0) {
    ui.prizeSetId = app.prizeSets[0].id;
  }
  destroyPreview();
  clear(appEl);
  appEl.append(renderShell());
  if (ui.dialog !== null) {
    appEl.append(renderDialog());
  }
  syncExpanders();
  if (ui.dialog?.kind === 'stage' || ui.dialog?.kind === 'new') {
    mountPreview();
  }
  remember();
}

function commit(next) {
  app = next;
  saveApp(app);
  render();
}

function renderShell() {
  const page = renderMain();
  return h(
    'div',
    { class: 'shell' },
    renderSidebar(),
    h(
      'main',
      { class: 'main' },
      h(
        'div',
        { class: 'workbench' },
        h('div', { class: 'scroller', id: 'scroller' }, page.content),
        page.rail ?? null,
      ),
    ),
  );
}

/**
 * 格子超过两行时折起来，按钮在下方。
 * 渲染完量一次高度，窄屏与宽屏都不必算列数。
 */
function syncExpanders() {
  for (const grid of document.querySelectorAll('[data-expander]')) {
    const more = document.getElementById(grid.dataset.expander);
    if (more === null) {
      continue;
    }
    const expanded = grid.classList.contains('expanded');
    more.hidden = !expanded && grid.scrollHeight <= grid.clientHeight + 1;
  }
}

/* ---------- 侧栏 ---------- */

function renderSidebar() {
  const items = viewItems();
  return h(
    'aside',
    { class: 'sidebar' },
    h(
      'header',
      { class: 'side-head' },
      h('h1', { class: 'side-title', text: VIEW_LABELS[ui.view] }),
      h('div', { class: 'side-tools' },
        h('button', {
          class: 'icon-button add',
          type: 'button',
          'aria-label': `新建${VIEW_LABELS[ui.view]}`,
          onClick: onAdd,
        }, plusIcon()),
      ),
    ),
    items.length === 0
      ? h('p', { class: 'side-empty', text: `还没有${VIEW_LABELS[ui.view]}` })
      : h(
          'ol',
          { class: 'side-list' },
          items.map((item) =>
            h(
              'li',
              {},
              h('button', {
                class: `side-item${isCurrent(item) ? ' active' : ''}`,
                type: 'button',
                text: itemName(item),
                onClick: () => {
                  select(item);
                  render();
                },
              }),
            ),
          ),
        ),
    h(
      'nav',
      { class: 'tabbar' },
      ['lotteries', 'rosters', 'prizes'].map((view) =>
        h('button', {
          class: `tab${ui.view === view ? ' active' : ''}`,
          type: 'button',
          text: VIEW_LABELS[view],
          onClick: () => {
            ui.view = view;
            ui.dialog = null;
            render();
          },
        }),
      ),
      h('button', {
        class: 'tab tab-settings',
        type: 'button',
        'aria-label': '设置',
        title: '设置',
        onClick: () => {
          ui.dialog = { kind: 'prefs' };
          render();
        },
      }, gearIcon()),
    ),
  );
}

function onAdd() {
  ui.dialog = { kind: 'addMenu' };
  render();
}

function isCurrent(item) {
  if (ui.view === 'rosters') {
    return item.id === ui.rosterId;
  }
  if (ui.view === 'prizes') {
    return item.id === ui.prizeSetId;
  }
  return item.id === ui.lotteryId;
}

function select(item) {
  if (ui.view === 'rosters') {
    ui.rosterId = item.id;
  } else if (ui.view === 'prizes') {
    ui.prizeSetId = item.id;
  } else {
    ui.lotteryId = item.id;
  }
}

/* ---------- 主区 ---------- */

function renderMain() {
  if (ui.view === 'rosters') {
    return { content: renderRosterPage() };
  }
  if (ui.view === 'prizes') {
    return { content: renderPrizeSetPage() };
  }
  return renderLotteryPage();
}

/* ---------- 详情页的零件 ---------- */

/** 一节：小标题 + 内容，用细线分隔，不画卡片。 */
function section(title, ...children) {
  return h(
    'section',
    { class: 'section' },
    h('h2', { class: 'section-title', text: title }),
    ...children.filter(Boolean),
  );
}

/** 一行：左标签，右值；可点的时候整行可点。 */
function row(label, value, { onClick, sub, chevron, danger, valueClass = '' } = {}) {
  const tag = onClick ? 'button' : 'div';
  return h(
    tag,
    {
      class: `row${onClick ? ' tappable' : ''}${danger ? ' danger' : ''}`,
      type: onClick ? 'button' : undefined,
      onClick,
    },
    h(
      'span',
      { class: 'row-main' },
      h('span', { class: 'row-label', text: label }),
      sub ? h('span', { class: 'row-sub', text: sub }) : null,
    ),
    value !== undefined ? h('span', { class: `row-value ${valueClass}`, text: String(value) }) : null,
    chevron ? h('span', { class: 'row-chevron' }, chevronIcon()) : null,
  );
}

/** 一组单选：朴素文字，选中的那条深一点并带下划线。 */
function choices(options, value, onChange) {
  return h(
    'div',
    { class: 'choices' },
    options.map((option) =>
      h('button', {
        class: `choice${String(option.value) === String(value) ? ' active' : ''}`,
        type: 'button',
        text: option.label,
        onClick: () => onChange(option.value),
      }),
    ),
  );
}

/** 开关：一行文字 + 开 / 关两个字，和设置里的其它行同一套排法。 */
function toggle(label, checked, onChange) {
  return h(
    'div',
    { class: 'field' },
    h('span', { class: 'field-label', text: label }),
    h('button', {
      class: `toggle${checked ? ' on' : ''}`,
      type: 'button',
      text: checked ? '开' : '关',
      'aria-pressed': checked ? 'true' : 'false',
      onClick: () => onChange(!checked),
    }),
  );
}

/** 一条细进度。 */
function bar(ratio) {
  return h('span', { class: 'bar' }, h('i', { style: `width:${Math.max(0, Math.min(1, ratio)) * 100}%` }));
}

/* ---------- 格子 ---------- */

/**
 * 一格一格的名单 / 奖项。
 *
 * 折到两行：格子高度固定，两行之外先藏起来，按钮量完再决定露不露。
 */
function tileGrid({ id, items, render, height = 78, empty = '还没有内容' }) {
  if (items.length === 0) {
    return h('p', { class: 'note', text: empty });
  }
  const grid = h(
    'div',
    {
      class: 'tile-grid',
      'data-expander': id,
      style: `--tile-h:${height}px`,
    },
    items.map(render),
  );
  const more = h(
    'button',
    {
      class: 'text-btn grid-more',
      type: 'button',
      id,
      hidden: true,
      onClick: () => {
        const expanded = grid.classList.toggle('expanded');
        more.textContent = expanded ? '收起' : `展开全部 ${items.length} 项`;
        syncExpanders();
      },
    },
    `展开全部 ${items.length} 项`,
  );
  return h('div', { class: 'grid-block' }, grid, more);
}

function personTile(person, won) {
  return h(
    'div',
    { class: `tile person-tile${won ? ' won' : ''}` },
    h('span', { class: 'tile-name', text: person.name }),
    h('span', { class: 'tile-meta', text: person.dept || person.employeeId || '—' }),
    won ? h('span', { class: 'tile-tag', text: '已中奖' }) : null,
  );
}

function prizeTile(prize, drawn) {
  const ratio = prize.count <= 0 ? 0 : Math.min(1, drawn / prize.count);
  const done = drawn >= prize.count;
  return h(
    'div',
    { class: `tile prize-tile${done ? ' done' : ''}` },
    h('span', { class: 'tile-name', text: prize.name }),
    h('span', { class: 'tile-meta', text: `${drawn} / ${prize.count}` }),
    h('span', { class: 'tile-bar' }, h('i', { style: `width:${ratio * 100}%` })),
  );
}

/* ---------- 抽奖详情 ---------- */

function renderLotteryPage() {
  const item = currentLottery();
  if (item === null) {
    return {
      content: emptyState('还没有抽奖', '导入一份含「奖品」「名单」两表的 xlsx，或用现成的名单与奖品新建一场。', [
        { label: '导入 xlsx', primary: true, onClick: () => pickFile('lottery') },
        { label: '新建', onClick: () => openNewDialog() },
      ]),
    };
  }

  const summary = lotterySummary(item);
  const status = lotteryStatus(item);
  const won = new Set(
    item.results.flatMap((result) => result.winners.map((winner) => winner.personId)),
  );

  const content = h(
    'article',
    { class: 'detail' },
    h(
      'header',
      { class: 'detail-head' },
      h('input', {
        class: 'detail-title',
        type: 'text',
        value: item.title,
        'aria-label': '抽奖名称',
        onInput: (event) => {
          const value = event.currentTarget.value;
          app = updateLottery(app, item.id, { title: value });
          saveApp(app);
        },
      }),
      h('p', {
        class: 'detail-sub',
        text: `${summary.handed} / ${summary.total} 已抽出 · ${summary.people} 人 · ${summary.prizes} 个奖项`,
      }),
      h(
        'div',
        { class: 'head-actions' },
        h('button', {
          class: 'btn plain small',
          type: 'button',
          text: '设置',
          onClick: () => {
            ui.dialog = { kind: 'settings', lotteryId: item.id };
            render();
          },
        }),
        h('button', {
          class: 'btn primary small',
          type: 'button',
          text: status === 'done' ? '查看结果' : status === 'running' ? '继续抽奖' : '开始抽奖',
          onClick: () => {
            if (status === 'done') {
              openResults();
              return;
            }
            openDraw();
          },
        }),
      ),
    ),
    h(
      'div',
      { class: 'detail-body' },
      summary.handed > 0 ? renderResultsSection(item) : null,
      h(
        'section',
        { class: 'section' },
        h(
          'div',
          { class: 'section-head' },
          h('h2', { class: 'section-title', text: `奖项 ${summary.prizes}` }),
          h('button', {
            class: 'text-btn',
            type: 'button',
            text: '编辑',
            onClick: () => openPools(item, 'prizes'),
          }),
        ),
        tileGrid({
          id: 'prizes-more',
          height: 96,
          empty: '还没有奖项',
          items: item.prizes,
          render: (prize) =>
            prizeTile(
              prize,
              item.results
                .filter((result) => result.prizeId === prize.id)
                .reduce((sum, result) => sum + result.winners.length, 0),
            ),
        }),
      ),
      h(
        'section',
        { class: 'section' },
        h(
          'div',
          { class: 'section-head' },
          h('h2', { class: 'section-title', text: `参与人 ${summary.people}` }),
          h('button', {
            class: 'text-btn',
            type: 'button',
            text: '编辑',
            onClick: () => openPools(item, 'people'),
          }),
        ),
        tileGrid({
          id: 'people-more',
          empty: '还没有人',
          items: item.people,
          render: (person) => personTile(person, won.has(person.id)),
        }),
      ),
    ),
  );

  return { content, rail: renderRail(item, summary, status) };
}

function renderResultsSection(item) {
  const rows = item.results.flatMap((result) =>
    result.winners.map((winner) => ({ result, winner })),
  );
  const latest = rows.slice().reverse();

  return h(
    'section',
    { class: 'section' },
    h(
      'div',
      { class: 'section-head' },
      h('h2', { class: 'section-title', text: `结果 ${rows.length}` }),
      h('button', { class: 'text-btn', type: 'button', text: '明细', onClick: openResults }),
    ),
    tileGrid({
      id: 'results-more',
      height: 92,
      empty: '还没开抽',
      items: latest,
      render: ({ result, winner }) =>
        h(
          'div',
          { class: 'tile result-tile' },
          h('span', { class: 'tile-name', text: winner.name }),
          h('span', { class: 'tile-meta', text: result.prizeName }),
          h('span', { class: 'tile-time', text: clockTime(result.at) }),
        ),
    }),
  );
}

function renderRail(item, summary, status, { footer = true } = {}) {
  const primary = status === 'done' ? '查看结果' : status === 'running' ? '继续抽奖' : '开始抽奖';

  return h(
    'aside',
    { class: 'rail' },
    h(
      'section',
      { class: 'rail-section' },
      h('h2', { class: 'rail-title', text: '形态' }),
      h(
        'button',
        {
          class: 'stage-current',
          type: 'button',
          onClick: () => openStageDialog(item),
        },
        h('span', { class: 'row-main' },
          h('span', { class: 'stage-name', text: stageLabel(item.stage) }),
        ),
        h('span', { class: 'row-chevron' }, chevronIcon()),
      ),
    ),
    h(
      'section',
      { class: 'rail-section' },
      h('h2', { class: 'rail-title', text: '设置' }),
      toggle('不重复中奖', item.uniqueWinner, (checked) =>
        commit(updateLottery(app, item.id, { uniqueWinner: checked })),
      ),
      ...stageFields(item.stage).map((field) =>
        renderConfigField(item, field, item.stageConfig[item.stage]?.[field.key] ?? field.value),
      ),
    ),
    h(
      'section',
      { class: 'rail-section' },
      h('h2', { class: 'rail-title', text: '操作' }),
      h(
        'div',
        { class: 'rail-actions' },
        h('button', { class: 'btn plain small', type: 'button', text: '导入', onClick: () => pickFile('lottery-replace') }),
        h('button', {
          class: 'btn plain small',
          type: 'button',
          text: '导出',
          onClick: async () => {
            downloadBytes(`${safeName(item.title)}.xlsx`, await buildLotteryWorkbook(item));
          },
        }),
        h('button', { class: 'btn plain small', type: 'button', text: '重新抽奖', onClick: () => confirmReset(item) }),
        h('button', {
          class: 'btn plain small danger',
          type: 'button',
          text: '删除抽奖',
          onClick: () =>
            confirmSheet({
              title: `删除「${item.title}」？`,
              message: '不能撤销。',
              confirmLabel: '删除',
              danger: true,
              onConfirm: () => {
                app = removeLottery(app, item.id);
                ui.lotteryId = app.lotteries[0]?.id ?? null;
                commit(app);
              },
            }),
        }),
      ),
    ),
    footer
      ? h(
          'div',
          { class: 'rail-foot' },
          item.results.length > 0
            ? h('button', {
                class: 'btn plain small',
                type: 'button',
                text: '撤销上一次',
                onClick: undoLastResult,
              })
            : null,
          h('button', {
            class: 'btn primary',
            type: 'button',
            text: primary,
            onClick: () => {
              if (status === 'done') {
                openResults();
                return;
              }
              openDraw();
            },
          }),
        )
      : null,
  );
}

function undoLastResult() {
  const item = currentLottery();
  if (item === null || item.results.length === 0) {
    return;
  }
  const last = item.results[item.results.length - 1];
  commit({
    ...app,
    lotteries: app.lotteries.map((entry) =>
      entry.id === item.id ? { ...entry, results: entry.results.slice(0, -1) } : entry,
    ),
  });
  toast(`已撤销 ${last.prizeName} 的最后一抽`);
}

function statusText(_item, status, summary) {
  if (status === 'done') {
    return `已抽完，共 ${summary.handed} 人中奖`;
  }
  if (status === 'running') {
    return `还剩 ${Math.max(0, summary.total - summary.handed)} 个名额`;
  }
  return summary.people === 0 ? '还没有参与人' : '还没开始';
}

function renderConfigField(item, field, value) {
  if (field.type === 'select') {
    return h(
      'div',
      { class: 'field' },
      h('span', { class: 'field-label', text: field.label }),
      h(
        'select',
        {
          class: 'field-select',
          onChange: (event) => {
            const picked = field.options.find((option) => String(option.value) === event.currentTarget.value);
            writeStageConfig(item, field.key, picked?.value ?? field.value, field.stageId ?? item.stage);
          },
        },
        field.options.map((option) =>
          h('option', {
            value: String(option.value),
            text: option.label,
            selected: String(option.value) === String(value),
          }),
        ),
      ),
    );
  }
  return h(
    'div',
    { class: 'field' },
    h('span', { class: 'field-label', text: field.label }),
    h('input', {
      class: 'field-range',
      type: 'range',
      min: String(field.min),
      max: String(field.max),
      step: String(field.step),
      value: String(value),
      'aria-label': field.label,
      onInput: (event) => writeStageConfig(item, field.key, Number(event.currentTarget.value), field.stageId ?? item.stage),
    }),
    h('span', { class: 'field-value', text: String(value) }),
  );
}

function writeStageConfig(item, key, value, stageId = item.stage) {
  commit(
    updateLottery(app, item.id, {
      stageConfig: { [stageId]: { [key]: value } },
    }),
  );
}

/* ---------- 名单详情 ---------- */

function renderRosterPage() {
  const item = currentRoster();
  if (item === null) {
    return emptyState('还没有名单', '导入一份含「姓名」列的 xlsx。', [
      { label: '导入 xlsx', primary: true, onClick: () => pickFile('roster') },
    ]);
  }

  return h(
    'article',
    { class: 'detail' },
    h(
      'header',
      { class: 'detail-head' },
      h('input', {
        class: 'detail-title',
        type: 'text',
        value: item.name,
        'aria-label': '名单名称',
        onInput: (event) => {
          app = updateRoster(app, item.id, { name: event.currentTarget.value });
          saveApp(app);
        },
      }),
      h('p', { class: 'detail-sub', text: `${item.people.length} 人` }),
    ),
    h(
      'div',
      { class: 'detail-body' },
      section(
        '参与人',
        h(
          'div',
          { class: 'edit-list' },
          item.people.length === 0
            ? h('p', { class: 'note', text: '还没有人' })
            : item.people.map((person) =>
                h(
                  'div',
                  { class: 'edit-row' },
                  h('input', {
                    class: 'edit-input',
                    type: 'text',
                    value: person.name,
                    'aria-label': '姓名',
                    onInput: (event) =>
                      writeRosterPeople(item, item.people.map((p) =>
                        p.id === person.id ? { ...p, name: event.currentTarget.value } : p,
                      )),
                  }),
                  h('input', {
                    class: 'edit-input muted',
                    type: 'text',
                    value: person.dept ?? '',
                    placeholder: '部门',
                    'aria-label': '部门',
                    onInput: (event) =>
                      writeRosterPeople(item, item.people.map((p) =>
                        p.id === person.id ? { ...p, dept: event.currentTarget.value } : p,
                      )),
                  }),
                  h('input', {
                    class: 'edit-input muted narrow',
                    type: 'text',
                    value: person.employeeId ?? '',
                    placeholder: '工号',
                    'aria-label': '工号',
                    onInput: (event) =>
                      writeRosterPeople(item, item.people.map((p) =>
                        p.id === person.id ? { ...p, employeeId: event.currentTarget.value } : p,
                      )),
                  }),
                  h('button', {
                    class: 'edit-remove',
                    type: 'button',
                    text: '×',
                    'aria-label': '删除这个人',
                    onClick: () =>
                      writeRosterPeople(item, item.people.filter((p) => p.id !== person.id)),
                  }),
                ),
              ),
        ),
        h(
          'div',
          { class: 'links' },
          h('button', { class: 'text-btn', type: 'button', text: '导入', onClick: () => pickFile('roster-replace') }),
          h('button', { class: 'text-btn', type: 'button', text: '追加', onClick: () => pickFile('roster-append') }),
          h('button', {
            class: 'text-btn',
            type: 'button',
            text: '导出',
            onClick: async () => {
              downloadBytes(`${safeName(item.name)}.xlsx`, await buildRosterWorkbook(item));
            },
          }),
          h('button', {
            class: 'text-btn',
            type: 'button',
            text: '加一人',
            onClick: () =>
              writeRosterPeople(item, [
                ...item.people,
                { id: `p${Date.now()}`, name: '新参与人', dept: '', employeeId: '' },
              ]),
          }),
        ),
      ),
      h(
        'div',
        { class: 'section section-plain' },
        h('button', {
          class: 'text-btn danger',
          type: 'button',
          text: '删除这份名单',
          onClick: () =>
            confirmSheet({
              title: `删除「${item.name}」？`,
              message: '不能撤销。',
              confirmLabel: '删除',
              danger: true,
              onConfirm: () => {
                app = removeRoster(app, item.id);
                ui.rosterId = app.rosters[0]?.id ?? null;
                commit(app);
              },
            }),
        }),
      ),
    ),
  );
}

function writeRosterPeople(item, people) {
  commit(updateRoster(app, item.id, { people: cleanPeople(people) }));
}

/* ---------- 奖品详情 ---------- */

function renderPrizeSetPage() {
  const item = currentPrizeSet();
  if (item === null) {
    return emptyState('还没有奖品', '导入一份含「奖品名称」「数量」两列的 xlsx。', [
      { label: '导入 xlsx', primary: true, onClick: () => pickFile('prize') },
    ]);
  }

  const total = item.prizes.reduce((sum, prize) => sum + prize.count, 0);

  return h(
    'article',
    { class: 'detail' },
    h(
      'header',
      { class: 'detail-head' },
      h('input', {
        class: 'detail-title',
        type: 'text',
        value: item.name,
        'aria-label': '奖品名称',
        onInput: (event) => {
          app = updatePrizeSet(app, item.id, { name: event.currentTarget.value });
          saveApp(app);
        },
      }),
      h('p', { class: 'detail-sub', text: `${item.prizes.length} 项 · ${total} 个名额` }),
    ),
    h(
      'div',
      { class: 'detail-body' },
      section(
        '奖项',
        h(
          'div',
          { class: 'edit-list' },
          item.prizes.length === 0
            ? h('p', { class: 'note', text: '还没有奖品' })
            : item.prizes.map((prize) =>
                h(
                  'div',
                  { class: 'edit-row' },
                  h('input', {
                    class: 'edit-input',
                    type: 'text',
                    value: prize.name,
                    'aria-label': '奖品名称',
                    onInput: (event) =>
                      writePrizeSetPrizes(item, item.prizes.map((p) =>
                        p.id === prize.id ? { ...p, name: event.currentTarget.value } : p,
                      )),
                  }),
                  h('input', {
                    class: 'edit-input number',
                    type: 'number',
                    min: '1',
                    value: String(prize.count),
                    'aria-label': '名额',
                    onChange: (event) =>
                      writePrizeSetPrizes(item, item.prizes.map((p) =>
                        p.id === prize.id
                          ? { ...p, count: Math.max(1, Math.floor(Number(event.currentTarget.value) || 1)) }
                          : p,
                      )),
                  }),
                  h('button', {
                    class: 'edit-remove',
                    type: 'button',
                    text: '×',
                    'aria-label': '删除奖品',
                    onClick: () =>
                      writePrizeSetPrizes(item, item.prizes.filter((p) => p.id !== prize.id)),
                  }),
                ),
              ),
        ),
        h(
          'div',
          { class: 'links' },
          h('button', { class: 'text-btn', type: 'button', text: '导入', onClick: () => pickFile('prize-replace') }),
          h('button', { class: 'text-btn', type: 'button', text: '追加', onClick: () => pickFile('prize-append') }),
          h('button', {
            class: 'text-btn',
            type: 'button',
            text: '导出',
            onClick: async () => {
              downloadBytes(`${safeName(item.name)}.xlsx`, await buildPrizeSetWorkbook(item));
            },
          }),
          h('button', {
            class: 'text-btn',
            type: 'button',
            text: '加一项',
            onClick: () =>
              writePrizeSetPrizes(item, [
                ...item.prizes,
                { id: `a${Date.now()}`, name: '新奖品', count: 1, weight: 1, level: '' },
              ]),
          }),
        ),
      ),
      h(
        'div',
        { class: 'section section-plain' },
        h('button', {
          class: 'text-btn danger',
          type: 'button',
          text: '删除这套奖品',
          onClick: () =>
            confirmSheet({
              title: `删除「${item.name}」？`,
              message: '不能撤销。',
              confirmLabel: '删除',
              danger: true,
              onConfirm: () => {
                app = removePrizeSet(app, item.id);
                ui.prizeSetId = app.prizeSets[0]?.id ?? null;
                commit(app);
              },
            }),
        }),
      ),
    ),
  );
}

function writePrizeSetPrizes(item, prizes) {
  commit(updatePrizeSet(app, item.id, { prizes: cleanPrizes(prizes) }));
}

/* ---------- 弹窗 ---------- */

function closeDialog() {
  ui.dialog = null;
  ui.pending = null;
  ui.resultsEditing = false;
  ui.resultsPicked = new Set();
  render();
}

function renderDialog() {
  const dialog = ui.dialog;
  if (dialog === null) {
    return h('div');
  }
  if (dialog.kind === 'addMenu') {
    return renderAddMenu();
  }
  if (dialog.kind === 'new') {
    return renderNewSheet();
  }
  if (dialog.kind === 'preview') {
    return renderPreviewSheet();
  }
  if (dialog.kind === 'confirm') {
    return renderConfirmSheet();
  }
  if (dialog.kind === 'pools') {
    return renderPoolsSheet();
  }
  if (dialog.kind === 'results') {
    return renderResultsSheet();
  }
  if (dialog.kind === 'settings') {
    return renderSettingsSheet();
  }
  if (dialog.kind === 'stage') {
    return renderStageSheet();
  }
  if (dialog.kind === 'prefs') {
    return renderPrefsSheet();
  }
  return h('div');
}

function sheet({ title, sub, children, footer, wide = false }) {
  return h(
    'div',
    {
      class: 'scrim',
      onClick: (event) => {
        if (event.target === event.currentTarget) {
          closeDialog();
        }
      },
    },
    h(
      'section',
      { class: `sheet${wide ? ' wide' : ''}`, role: 'dialog', 'aria-label': title },
      h(
        'header',
        { class: 'sheet-head' },
        h('h2', { class: 'sheet-title', text: title }),
        sub ? h('span', { class: 'sheet-sub', text: sub }) : null,
        h('button', { class: 'sheet-close', type: 'button', 'aria-label': '关闭', onClick: closeDialog }, '×'),
      ),
      h('div', { class: 'sheet-body' }, children),
      footer ? h('footer', { class: 'sheet-foot' }, footer) : null,
    ),
  );
}

function renderAddMenu() {
  const label = VIEW_LABELS[ui.view];
  const importTarget = ui.view === 'lotteries' ? 'lottery' : ui.view === 'rosters' ? 'roster' : 'prize';
  return h(
    'div',
    {
      class: 'scrim',
      onClick: (event) => {
        if (event.target === event.currentTarget) {
          closeDialog();
        }
      },
    },
    h(
      'section',
      { class: 'action-sheet', role: 'dialog', 'aria-label': `新建${label}` },
      h('p', { class: 'action-title', text: label }),
      h(
        'div',
        { class: 'action-group' },
        h('button', {
          class: 'action-item',
          type: 'button',
          text: '从 xlsx 导入',
          onClick: () => pickFile(importTarget),
        }),
        h('button', {
          class: 'action-item',
          type: 'button',
          text: '新建',
          onClick: () => {
            if (ui.view === 'lotteries') {
              openNewDialog();
              return;
            }
            ui.dialog = null;
            if (ui.view === 'rosters') {
              const [next, created] = addRoster(app, { name: '新名单', people: [] });
              ui.rosterId = created.id;
              commit(next);
              return;
            }
            const [next, created] = addPrizeSet(app, { name: '新奖品', prizes: [] });
            ui.prizeSetId = created.id;
            commit(next);
          },
        }),
      ),
      h(
        'div',
        { class: 'action-group' },
        h('button', { class: 'action-item cancel', type: 'button', text: '取消', onClick: closeDialog }),
      ),
    ),
  );
}

function renderPreviewSheet() {
  const pending = ui.pending;
  if (pending === null) {
    return h('div');
  }
  const { parsed, base, target } = pending;
  const duplicate = duplicateOf(target, base);
  const people = parsed.people.length;
  const prizes = parsed.prizes.length;
  const total = parsed.prizes.reduce((sum, prize) => sum + prize.count, 0);

  return sheet({
    title: '导入',
    sub: pending.file,
    children: [
      h(
        'div',
        { class: 'facts' },
        fact('参与人', `${people} 人`),
        fact('奖项', `${prizes} 项`),
        fact('名额', `${total} 个`),
        fact('开奖记录', `${parsed.results.length} 条`),
      ),
      parsed.problems.length > 0
        ? h(
            'ul',
            { class: 'problems' },
            parsed.problems.map((problem) =>
              h('li', { text: `${problem.sheet}${problem.row > 0 ? ` 第 ${problem.row} 行` : ''}：${problem.message}` }),
            ),
          )
        : null,
      duplicate
        ? h('p', {
            class: 'sheet-note warn',
            text: `已有同名「${itemName(duplicate)}」，要覆盖它还是另存一份？`,
          })
        : null,
    ],
    footer: duplicate
      ? [
          h('button', { class: 'btn plain', type: 'button', text: '取消', onClick: closeDialog }),
          h('button', { class: 'btn plain', type: 'button', text: '保留两者', onClick: () => applyImport(uniqueNameFor(target, base)) }),
          h('button', { class: 'btn primary', type: 'button', text: '覆盖', onClick: () => overwriteImport(duplicate) }),
        ]
      : [
          h('button', { class: 'btn plain', type: 'button', text: '取消', onClick: closeDialog }),
          h('button', { class: 'btn primary', type: 'button', text: '创建', onClick: () => applyImport(base) }),
        ],
  });
}

function fact(label, value) {
  return h('div', { class: 'fact' },
    h('span', { class: 'fact-value', text: value }),
    h('span', { class: 'fact-label', text: label }),
  );
}

function renderConfirmSheet() {
  const dialog = ui.dialog;
  return sheet({
    title: dialog.title,
    children: [h('p', { class: 'sheet-note', text: dialog.message })],
    footer: [
      h('button', { class: 'btn plain', type: 'button', text: '取消', onClick: closeDialog }),
      h('button', {
        class: `btn ${dialog.danger ? 'danger-solid' : 'primary'}`,
        type: 'button',
        text: dialog.confirmLabel,
        onClick: () => {
          const run = dialog.onConfirm;
          ui.dialog = null;
          run();
        },
      }),
    ],
  });
}

function confirmSheet(options) {
  ui.dialog = { kind: 'confirm', ...options };
  render();
}

function renderSettingsSheet() {
  const item = lotteryById(app, ui.dialog.lotteryId);
  if (item === null) {
    return h('div');
  }
  const rail = renderRail(item, lotterySummary(item), lotteryStatus(item), { footer: false });
  return sheet({
    title: '设置',
    sub: item.title,
    children: [rail],
    footer: [h('button', { class: 'btn plain', type: 'button', text: '完成', onClick: closeDialog })],
  });
}

/* ---------- 设置 ---------- */

function renderPrefsSheet() {
  return sheet({
    title: '设置',
    children: [
      h('h2', { class: 'rail-title', text: '主题' }),
      h(
        'div',
        { class: 'theme-list' },
        THEMES.map((entry) =>
          h(
            'button',
            {
              class: `theme-item${theme.id === entry.id ? ' active' : ''}`,
              type: 'button',
              'aria-pressed': theme.id === entry.id ? 'true' : 'false',
              onClick: () => {
                theme.id = applyTheme(entry.id);
                saveTheme(theme.id);
                render();
              },
            },
            h(
              'span',
              { class: 'theme-swatch' },
              h('i', { style: `background:${entry.swatch[0]}` }),
              h('i', { style: `background:${entry.swatch[1]}` }),
            ),
            h(
              'span',
              { class: 'row-main' },
              h('span', { class: 'row-label', text: entry.label }),
              h('span', { class: 'row-sub', text: entry.hint }),
            ),
            theme.id === entry.id ? h('span', { class: 'theme-check', text: '✓' }) : null,
          ),
        ),
      ),
    ],
    footer: [h('button', { class: 'btn primary', type: 'button', text: '完成', onClick: closeDialog })],
  });
}

/* ---------- 形态 ---------- */

function openStageDialog(item) {
  ui.dialog = { kind: 'stage', lotteryId: item.id, stage: item.stage };
  render();
}

function renderStageSheet() {
  const item = lotteryById(app, ui.dialog.lotteryId);
  if (item === null) {
    return h('div');
  }
  const stageId = ui.dialog.stage ?? item.stage;
  const stage = stageInfo(stageId);

  return sheet({
    title: '形态',
    sub: item.title,
    wide: true,
    children: [
      h('div', { class: 'stage-preview', id: 'stage-preview' }),
      h(
        'div',
        { class: 'stage-tabs' },
        ...STAGES.map((entry) =>
          h(
            'button',
            {
              class: `stage-tab${entry.id === stageId ? ' active' : ''}`,
              type: 'button',
              onClick: () => {
                if (item.stage === entry.id) {
                  return;
                }
                app = updateLottery(app, item.id, { stage: entry.id });
                saveApp(app);
                if (ui.dialog.stage !== entry.id) {
                  ui.dialog = { ...ui.dialog, stage: entry.id };
                }
                render();
              },
            },
            h('span', { class: 'stage-tab-name', text: entry.label }),
          ),
        ),
      ),
    ],
    footer: [
      h('button', {
        class: 'btn primary',
        type: 'button',
        text: '完成',
        onClick: closeDialog,
      }),
    ],
  });
}

/**
 * 弹窗里的预览：用这张抽奖自己的名单跑一遍形态，能一直动。
 * 关弹窗、换形态、页面重渲染时都要销毁，否则动画会留在后台。
 */
function mountPreview() {
  const host = document.getElementById('stage-preview');
  if (host === null) {
    return;
  }

  let stageId;
  let prizes;
  let people;
  let config;
  if (ui.dialog?.kind === 'new') {
    const draft = ui.draft;
    if (draft === null) {
      return;
    }
    stageId = draft.stage;
    prizes = app.prizeSets.find((item) => item.id === draft.prizeSetId)?.prizes ?? [];
    people = app.rosters.find((item) => item.id === draft.rosterId)?.people ?? [];
    config = {};
  } else if (ui.dialog?.kind === 'stage') {
    const item = lotteryById(app, ui.dialog.lotteryId);
    if (item === null) {
      return;
    }
    stageId = ui.dialog.stage;
    prizes = item.prizes;
    people = item.people;
    config = item.stageConfig[stageId] ?? {};
  } else {
    return;
  }

  const labels = (stageMode(stageId) === MODE.PERSON ? prizes.map((prize) => prize.name) : people.map((person) => person.name));
  const pool = labels.length > 0 ? labels : ['张三', '李四', '王五', '赵六', '钱七', '孙八'];

  // 直接铺在预览框里：形态自己按宿主尺寸排版，和抽奖页里一样
  ui.preview = createStage(stageId, host, config);
  ui.preview.begin({ labels: pool });
}

function destroyPreview() {
  if (ui.preview !== null && ui.preview !== undefined) {
    ui.preview.destroy();
    ui.preview = null;
  }
}

/* ---------- 新建抽奖 ---------- */

function openNewDialog() {
  ui.draft = {
    title: '',
    stage: STAGES[0].id,
    uniqueWinner: true,
    rosterId: app.rosters[0]?.id ?? '',
    prizeSetId: app.prizeSets[0]?.id ?? '',
  };
  ui.dialog = { kind: 'new' };
  render();
}

function renderNewSheet() {
  const draft = ui.draft;
  const set = (patch) => {
    ui.draft = { ...ui.draft, ...patch };
    render();
  };

  const roster = app.rosters.find((item) => item.id === draft.rosterId);
  const prizeSet = app.prizeSets.find((item) => item.id === draft.prizeSetId);

  return sheet({
    title: '新建抽奖',
    wide: true,
    children: [
      h(
        'div',
        { class: 'new-layout' },
        h('div', { class: 'stage-preview', id: 'stage-preview' }),
        h(
          'div',
          { class: 'new-form' },
          h(
            'div',
            { class: 'field' },
            h('span', { class: 'field-label', text: '形态' }),
            choices(
              STAGES.map((stage) => ({ value: stage.id, label: stage.label })),
              draft.stage,
              (value) => set({ stage: value }),
            ),
          ),
          h(
            'div',
            { class: 'field' },
            h('span', { class: 'field-label', text: '名称' }),
            h('input', {
              class: 'field-input',
              type: 'text',
              value: draft.title,
              placeholder: '2026 年会',
              'aria-label': '名称',
              onInput: (event) => set({ title: event.currentTarget.value }),
            }),
          ),
          h(
            'div',
            { class: 'field' },
            h('span', { class: 'field-label', text: '名单' }),
            h(
              'select',
              {
                class: 'field-select',
                'aria-label': '名单',
                onChange: (event) => set({ rosterId: event.currentTarget.value }),
              },
              h('option', { value: '', text: '现场名单', selected: draft.rosterId === '' }),
              app.rosters.map((item) =>
                h('option', {
                  value: item.id,
                  text: `${item.name} · ${item.people.length} 人`,
                  selected: item.id === draft.rosterId,
                }),
              ),
            ),
          ),
          h(
            'div',
            { class: 'field' },
            h('span', { class: 'field-label', text: '奖品' }),
            h(
              'select',
              {
                class: 'field-select',
                'aria-label': '奖品',
                onChange: (event) => set({ prizeSetId: event.currentTarget.value }),
              },
              h('option', { value: '', text: '现场奖品', selected: draft.prizeSetId === '' }),
              app.prizeSets.map((item) =>
                h('option', {
                  value: item.id,
                  text: `${item.name} · ${item.prizes.length} 项`,
                  selected: item.id === draft.prizeSetId,
                }),
              ),
            ),
          ),
          toggle('不重复中奖', draft.uniqueWinner, (checked) => set({ uniqueWinner: checked })),
          h(
            'div',
            { class: 'form-actions' },
            h('button', { class: 'btn plain', type: 'button', text: '取消', onClick: closeDialog }),
            h('button', {
              class: 'btn primary',
              type: 'button',
              text: '创建',
              onClick: () => {
                const [next, created] = createLottery(app, {
                  title: draft.title,
                  stage: draft.stage,
                  stageConfig: {},
                  uniqueWinner: draft.uniqueWinner,
                  rosterId: draft.rosterId,
                  prizeSetId: draft.prizeSetId,
                });
                app = next;
                ui.lotteryId = created.id;
                ui.view = 'lotteries';
                ui.draft = null;
                ui.dialog = null;
                commit(app);
              },
            }),
          ),
        ),
      ),
    ],
  });
}

/* ---------- 参与人与奖品 ---------- */

function openPools(item, tab) {
  if (tab === 'people' || tab === 'prizes') {
    ui.poolsTab = tab;
  }
  ui.dialog = { kind: 'pools', lotteryId: item.id };
  render();
}

function renderPoolsSheet() {
  const item = lotteryById(app, ui.dialog.lotteryId);
  if (item === null) {
    return h('div');
  }
  const summary = lotterySummary(item);
  const tab = ui.poolsTab;

  return sheet({
    title: '参与人与奖品',
    sub: item.title,
    wide: true,
    children: [
      choices(
        [
          { value: 'people', label: `参与人 ${summary.people}` },
          { value: 'prizes', label: `奖品 ${summary.prizes}` },
        ],
        tab,
        (value) => {
          ui.poolsTab = value;
          render();
        },
      ),
      tab === 'people'
        ? h(
            'div',
            { class: 'edit-list' },
            item.people.map((person) =>
              h(
                'div',
                { class: 'edit-row' },
                h('input', {
                  class: 'edit-input',
                  type: 'text',
                  value: person.name,
                  'aria-label': '姓名',
                  onInput: (event) =>
                    writeLotteryPeople(item, item.people.map((p) =>
                      p.id === person.id ? { ...p, name: event.currentTarget.value } : p,
                    )),
                }),
                h('input', {
                  class: 'edit-input muted',
                  type: 'text',
                  value: person.dept ?? '',
                  placeholder: '部门',
                  'aria-label': '部门',
                  onInput: (event) =>
                    writeLotteryPeople(item, item.people.map((p) =>
                      p.id === person.id ? { ...p, dept: event.currentTarget.value } : p,
                    )),
                }),
                h('button', {
                  class: 'edit-remove',
                  type: 'button',
                  text: '×',
                  onClick: () =>
                    writeLotteryPeople(item, item.people.filter((p) => p.id !== person.id)),
                }),
              ),
            ),
          )
        : h(
            'div',
            { class: 'edit-list' },
            item.prizes.map((prize) => {
              const drawn = item.results
                .filter((result) => result.prizeId === prize.id)
                .reduce((sum, result) => sum + result.winners.length, 0);
              return h(
                'div',
                { class: 'edit-row' },
                h('input', {
                  class: 'edit-input',
                  type: 'text',
                  value: prize.name,
                  'aria-label': '奖品名称',
                  onInput: (event) =>
                    writeLotteryPrizes(item, item.prizes.map((p) =>
                      p.id === prize.id ? { ...p, name: event.currentTarget.value } : p,
                    )),
                }),
                h('span', { class: 'edit-progress', text: `${drawn} / ${prize.count}` }),
                h('input', {
                  class: 'edit-input number',
                  type: 'number',
                  min: String(Math.max(1, drawn)),
                  value: String(prize.count),
                  'aria-label': '名额',
                  onChange: (event) =>
                    writeLotteryPrizes(item, item.prizes.map((p) =>
                      p.id === prize.id
                        ? { ...p, count: Math.max(drawn, Math.floor(Number(event.currentTarget.value) || 1)) }
                        : p,
                    )),
                }),
                h('button', {
                  class: 'edit-remove',
                  type: 'button',
                  text: '×',
                  onClick: () =>
                    writeLotteryPrizes(item, item.prizes.filter((p) => p.id !== prize.id)),
                }),
              );
            }),
          ),
    ],
    footer: [
      h('button', {
        class: 'btn plain',
        type: 'button',
        text: tab === 'people' ? '加一人' : '加一项',
        onClick: () => {
          if (tab === 'people') {
            writeLotteryPeople(item, [
              ...item.people,
              { id: `p${Date.now()}`, name: '新参与人', dept: '', employeeId: '' },
            ]);
          } else {
            writeLotteryPrizes(item, [
              ...item.prizes,
              { id: `a${Date.now()}`, name: '新奖品', count: 1, weight: 1, level: '' },
            ]);
          }
        },
      }),
      h('button', { class: 'btn primary', type: 'button', text: '完成', onClick: closeDialog }),
    ],
  });
}

function writeLotteryPeople(item, people) {
  commit(patchLotteryPools(app, item.id, { people: cleanPeople(people) }));
}

function writeLotteryPrizes(item, prizes) {
  commit(patchLotteryPools(app, item.id, { prizes: cleanPrizes(prizes) }));
}

/* ---------- 结果 ---------- */

function openResults() {
  const item = currentLottery();
  if (item === null || item.results.length === 0) {
    toast('还没有开奖记录');
    return;
  }
  ui.dialog = { kind: 'results', lotteryId: item.id };
  ui.resultsEditing = false;
  ui.resultsPicked = new Set();
  render();
}

function renderResultsSheet() {
  const item = lotteryById(app, ui.dialog.lotteryId);
  if (item === null) {
    return h('div');
  }
  const rows = [];
  let order = 1;
  for (const result of item.results) {
    for (const winner of result.winners) {
      rows.push({ order: order++, result, winner });
    }
  }

  const picked = ui.resultsPicked;
  const editing = ui.resultsEditing;
  const allPicked = rows.length > 0 && rows.every((row) => picked.has(rowKey(row)));

  return sheet({
    title: '开奖结果',
    sub: `${item.title} · ${rows.length} 人`,
    wide: true,
    children: [
      h(
        'div',
        { class: 'result-tools' },
        choices(
          [
            { value: 'prize', label: '按奖项' },
            { value: 'time', label: '按时间' },
          ],
          ui.resultsTab,
          (value) => {
            ui.resultsTab = value;
            render();
          },
        ),
      ),
      ui.resultsTab === 'prize'
        ? resultsByPrize(item, rows)
        : resultsByTime(rows),
    ],
    footer: editing
      ? [
          h('button', {
            class: 'btn plain small',
            type: 'button',
            text: allPicked ? '取消全选' : '全选',
            onClick: () => {
              ui.resultsPicked = allPicked ? new Set() : new Set(rows.map((row) => rowKey(row)));
              render();
            },
          }),
          h('button', {
            class: 'btn plain small',
            type: 'button',
            text: picked.size > 1 ? `撤销 ${picked.size} 条` : '撤销',
            disabled: picked.size === 0,
            onClick: undoPicked,
          }),
          h('button', {
            class: 'btn plain small',
            type: 'button',
            text: '取消',
            onClick: () => {
              ui.resultsEditing = false;
              ui.resultsPicked = new Set();
              render();
            },
          }),
        ]
      : [
      h('button', {
        class: 'btn plain small',
        type: 'button',
        text: '编辑',
        onClick: () => {
          ui.resultsEditing = true;
          ui.resultsPicked = new Set();
          render();
        },
      }),
      h('span', { class: 'foot-spacer' }),
      h('button', {
        class: 'btn plain',
        type: 'button',
        text: '清空记录',
        onClick: () =>
          confirmSheet({
            title: '清空全部记录？',
            message: '不能撤销。',
            confirmLabel: '清空',
            danger: true,
            onConfirm: () => {
              ui.resultsPicked = new Set();
              commit(resetLottery(app, item.id));
              ui.dialog = null;
              render();
            },
          }),
      }),
      h('button', {
        class: 'btn primary',
        type: 'button',
        text: '导出 xlsx',
        onClick: async () => {
          const bytes = await buildResultWorkbook(item);
          downloadBytes(`${safeName(item.title)}结果-${new Date().toISOString().slice(0, 10)}.xlsx`, bytes);
        },
      }),
    ],
  });
}

function rowKey(row) {
  return `${row.result.id}:${row.winner.personId}`;
}

/** 撤销选中（单选或多选）的中奖记录：只去掉记录，这些人回到池子。 */
function undoPicked() {
  const item = lotteryById(app, ui.dialog?.lotteryId);
  if (item === null || ui.resultsPicked.size === 0) {
    return;
  }
  let state = runState(item);
  const targets = [...ui.resultsPicked].reverse();
  for (const key of targets) {
    const [resultId, personId] = key.split(':');
    const stillThere = state.results.some(
      (result) => result.id === resultId && result.winners.some((winner) => winner.personId === personId),
    );
    if (!stillThere) {
      continue;
    }
    state = undoWinner(state, resultId, personId);
  }
  ui.resultsPicked = new Set();
  ui.resultsEditing = false;
  app = writeRunState(app, item.id, state);
  saveApp(app);
  render();
  toast(`已撤销 ${targets.length} 条记录`);
}

function resultCard(row) {
  const key = rowKey(row);
  const editing = ui.resultsEditing;
  const selected = editing && ui.resultsPicked.has(key);
  const props = {
    class: `tile result-tile${editing ? ' selectable' : ''}${selected ? ' selected' : ''}`,
    type: editing ? 'button' : undefined,
    'aria-pressed': editing ? (selected ? 'true' : 'false') : undefined,
    onClick: editing
      ? () => {
          if (selected) {
            ui.resultsPicked.delete(key);
          } else {
            ui.resultsPicked.add(key);
          }
          render();
        }
      : undefined,
  };
  return h(
    editing ? 'button' : 'div',
    props,
    selected ? h('span', { class: 'tile-check', text: '✓' }) : null,
    h('span', { class: 'tile-name', text: row.winner.name }),
    h('span', { class: 'tile-meta', text: row.result.prizeName }),
    h('span', { class: 'tile-time', text: [row.winner.dept, clockTime(row.result.at)].filter(Boolean).join(' · ') }),
  );
}

function resultsByPrize(item, rows) {
  const groups = item.prizes
    .map((prize) => ({ prize, rows: rows.filter((row) => row.result.prizeId === prize.id) }))
    .filter((group) => group.rows.length > 0);

  return h(
    'div',
    { class: 'groups' },
    groups.map((group) =>
      h(
        'section',
        { class: 'group' },
        h(
          'header',
          { class: 'group-head' },
          h('h3', { class: 'group-title', text: group.prize.name }),
          h('span', { class: 'group-count', text: `${group.rows.length} / ${group.prize.count} 个名额` }),
        ),
        h(
          'div',
          { class: 'tile-grid result-grid' },
          group.rows.map(resultCard),
        ),
      ),
    ),
  );
}

function resultsByTime(rows) {
  return h(
    'div',
    { class: 'tile-grid result-grid' },
    rows
      .slice()
      .reverse()
      .map(resultCard),
  );
}

/* ---------- 导入 / 导出 ---------- */

function pickFile(target) {
  ui.importTarget = target;
  ui.dialog = null;
  fileEl.click();
}

async function handleFile(file, target) {
  if (!/\.xlsx$/i.test(file.name)) {
    toast('只支持 .xlsx；.xls 或 .csv 请先另存一份');
    return;
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const parsed = await readLotteryWorkbook(bytes);
    const fallback = file.name.replace(/\.xlsx$/i, '');
    const base = target === 'lottery' && parsed.meta.title !== '' ? parsed.meta.title : fallback;
    ui.pending = { target, base, file: file.name, parsed };
    ui.dialog = { kind: 'preview' };
    render();
  } catch (error) {
    toast(error instanceof Error ? error.message : '这份文件读不了');
  }
}

function duplicateOf(target, base) {
  if (target === 'lottery') {
    return app.lotteries.find((item) => item.title === base) ?? null;
  }
  if (target === 'roster') {
    return app.rosters.find((item) => item.name === base) ?? null;
  }
  if (target === 'prize') {
    return app.prizeSets.find((item) => item.name === base) ?? null;
  }
  return null;
}

function uniqueNameFor(target, base) {
  if (target === 'lottery') {
    return uniqueName(app.lotteries, base, (item) => item.title);
  }
  if (target === 'roster') {
    return uniqueName(app.rosters, base);
  }
  return uniqueName(app.prizeSets, base);
}

function applyImport(name) {
  const pending = ui.pending;
  if (pending === null) {
    return;
  }
  const { target, parsed } = pending;
  ui.pending = null;
  ui.dialog = null;

  if (target === 'lottery') {
    const [next, created] = createLottery(app, {
      title: name,
      mode: parsed.meta.mode,
      stage: parsed.meta.stage,
      stageConfig: parsed.meta.stageConfig,
      batch: parsed.meta.batch,
      uniqueWinner: parsed.meta.uniqueWinner,
      prizes: parsed.prizes,
      people: parsed.people,
      results: parsed.results,
    });
    ui.lotteryId = created.id;
    ui.view = 'lotteries';
    commit(next);
    toast(`已导入 ${parsed.people.length} 人与 ${parsed.prizes.length} 个奖项`);
    return;
  }

  if (target === 'roster') {
    const [next, created] = addRoster(app, {
      name,
      people: parsed.people,
    });
    ui.rosterId = created.id;
    ui.view = 'rosters';
    commit(next);
    toast(`已导入 ${parsed.people.length} 人`);
    return;
  }

  const [next, created] = addPrizeSet(app, {
    name,
    prizes: parsed.prizes,
  });
  ui.prizeSetId = created.id;
  ui.view = 'prizes';
  commit(next);
  toast(`已导入 ${parsed.prizes.length} 项奖品`);
}

function overwriteImport(existing) {
  const pending = ui.pending;
  if (pending === null) {
    return;
  }
  const { target, parsed } = pending;
  const isLottery = target === 'lottery';
  const records = isLottery ? (existing.results?.length ?? 0) : 0;

  const apply = () => {
    ui.pending = null;
    ui.dialog = null;
    if (target === 'lottery') {
      ui.lotteryId = existing.id;
      ui.view = 'lotteries';
      app = replaceLotteryData(app, existing.id, {
        mode: parsed.meta.mode,
        stage: parsed.meta.stage,
        stageConfig: parsed.meta.stageConfig,
        batch: parsed.meta.batch,
        uniqueWinner: parsed.meta.uniqueWinner,
        prizes: parsed.prizes,
        people: parsed.people,
        results: parsed.results,
      });
    } else if (target === 'roster') {
      app = updateRoster(app, existing.id, { people: parsed.people });
      ui.rosterId = existing.id;
      ui.view = 'rosters';
    } else {
      app = updatePrizeSet(app, existing.id, { prizes: parsed.prizes });
      ui.prizeSetId = existing.id;
      ui.view = 'prizes';
    }
    commit(app);
  };

  if (records > 0) {
    confirmSheet({
      title: `覆盖「${existing.title}」？`,
      message: `这会清空已有的 ${records} 条开奖记录。`,
      confirmLabel: '覆盖',
      danger: true,
      onConfirm: apply,
    });
    return;
  }
  apply();
}

function applyReplace(target, existingId, parsed) {
  if (target === 'lottery-replace') {
    app = replaceLotteryData(app, existingId, {
      mode: parsed.meta.mode,
      stage: parsed.meta.stage,
      stageConfig: parsed.meta.stageConfig,
      batch: parsed.meta.batch,
      uniqueWinner: parsed.meta.uniqueWinner,
      prizes: parsed.prizes,
      people: parsed.people,
      results: parsed.results,
    });
  } else if (target === 'roster-replace') {
    const roster = currentRoster();
    app = updateRoster(app, existingId, { people: parsed.people });
    if (roster !== null) {
      ui.rosterId = roster.id;
    }
  } else if (target === 'prize-replace') {
    const set = currentPrizeSet();
    app = updatePrizeSet(app, existingId, { prizes: parsed.prizes });
    if (set !== null) {
      ui.prizeSetId = set.id;
    }
  } else if (target === 'roster-append') {
    const roster = currentRoster();
    if (roster !== null) {
      app = updateRoster(app, roster.id, { people: [...roster.people, ...parsed.people] });
    }
  } else if (target === 'prize-append') {
    const set = currentPrizeSet();
    if (set !== null) {
      app = updatePrizeSet(app, set.id, { prizes: [...set.prizes, ...parsed.prizes] });
    }
  }
  commit(app);
}

function safeName(name) {
  return String(name || '未命名').replace(/[\\/:*?"<>|]/g, '·').slice(0, 60);
}

/* ---------- 抽奖页 ---------- */

function openDraw() {
  const item = currentLottery();
  if (item === null) {
    return;
  }
  if (item.people.length === 0) {
    toast('名单里还没有人');
    return;
  }
  window.location.href = `./draw.html?id=${encodeURIComponent(item.id)}`;
}

function confirmReset(item) {
  confirmSheet({
    title: '重新抽奖？',
    message: '会清空开奖记录，名单、奖品与名额保留。',
    confirmLabel: '重新抽奖',
    danger: true,
    onConfirm: () => {
      commit(resetLottery(app, item.id));
      toast('已清空记录');
    },
  });
}

/* ---------- 图标 ---------- */

function svg(path, size = 18) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('viewBox', '0 0 24 24');
  node.setAttribute('width', String(size));
  node.setAttribute('height', String(size));
  node.setAttribute('fill', 'none');
  node.setAttribute('stroke', 'currentColor');
  node.setAttribute('stroke-width', '1.8');
  node.setAttribute('stroke-linecap', 'round');
  node.setAttribute('stroke-linejoin', 'round');
  node.setAttribute('aria-hidden', 'true');
  node.innerHTML = path;
  return node;
}

function plusIcon() {
  return svg('<path d="M12 5v14M5 12h14"/>');
}

function moreIcon() {
  return svg('<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>');
}

function docIcon() {
  return svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>');
}

function gearIcon() {
  return svg(
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.12.34.4.62.75.75H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z"/>',
    16,
  );
}

function chevronIcon() {
  return svg('<path d="M9 6l6 6-6 6"/>');
}

/* ---------- 轻提示 ---------- */

function toast(message) {
  document.querySelector('.toast')?.remove();
  const node = el('div', 'toast', message);
  document.body.append(node);
  window.setTimeout(() => node.classList.add('leaving'), 2200);
  window.setTimeout(() => node.remove(), 2800);
}

/* ---------- 事件 ---------- */

fileEl.addEventListener('change', (event) => {
  const file = event.currentTarget.files?.[0];
  const target = ui.importTarget;
  event.currentTarget.value = '';
  ui.importTarget = null;
  if (file !== undefined && target !== null) {
    if (target.endsWith('-replace') || target.endsWith('-append')) {
      handleReplaceFile(file, target);
      return;
    }
    handleFile(file, target);
  }
});

async function handleReplaceFile(file, target) {
  if (!/\.xlsx$/i.test(file.name)) {
    toast('只支持 .xlsx；.xls 或 .csv 请先另存一份');
    return;
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const parsed = await readLotteryWorkbook(bytes);
    if (target.startsWith('roster') && parsed.people.length === 0) {
      toast('这份文件里没有名单（需要一张含「姓名」列的表）');
      return;
    }
    if (target.startsWith('prize') && parsed.prizes.length === 0) {
      toast('这份文件里没有奖品（需要一张含「奖品名称」的表）');
      return;
    }
    const existing =
      target === 'lottery-replace'
        ? currentLottery()
        : target.startsWith('roster')
          ? currentRoster()
          : currentPrizeSet();
    if (existing === null) {
      return;
    }
    const apply = () => {
      ui.pending = null;
      ui.dialog = null;
      applyReplace(target, existing.id, parsed);
    };
    const records = target === 'lottery-replace' ? existing.results.length : 0;
    if (records > 0) {
      ui.pending = { target, base: existing.title ?? '', file: file.name, parsed };
      confirmSheet({
        title: '替换并清空记录？',
        message: `这会清空已有的 ${records} 条开奖记录。`,
        confirmLabel: '替换',
        danger: true,
        onConfirm: apply,
      });
      return;
    }
    apply();
  } catch (error) {
    toast(error instanceof Error ? error.message : '这份文件读不了');
  }
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && ui.dialog !== null) {
    closeDialog();
  }
});

window.addEventListener('pageshow', () => {
  const saved = loadApp();
  if (JSON.stringify(saved) !== JSON.stringify(app)) {
    app = saved;
    render();
  }
});

window.addEventListener('pagehide', () => flushApp(app));
window.addEventListener('beforeunload', () => flushApp(app));

/* ---------- 启动 ---------- */

render();
