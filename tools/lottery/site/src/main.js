/**
 * 抽奖台主页。
 *
 * 左边是两类对象（抽奖 / 池）的列表，右边是选中项的详情。
 * 抽奖页是独立入口 `draw.html`，这里只负责管理：导入导出的 xlsx、
 * 开始 / 继续 / 重新抽、抽法与形态的配置。
 *
 * 「池」是一堆条目：名字 + 数量 + 权重（图片占位）。池上的 `kind` 只在**创建与
 * 编辑**时决定问哪几个字段（人问部门工号、奖品问等级）；抽法、槽、绑定、引擎
 * 一律不看它 —— 名单池绑到奖项槽上也照样能抽。
 */

import { undoPick } from './engine.js';
import {
  MAX_BATCH,
  addLotteryPool,
  addPool,
  createLottery,
  defaultSlots,
  isUniqueWinner,
  lotteryById,
  lotteryStatus,
  lotterySummary,
  patchLotteryPools,
  poolById,
  poolOfSlot,
  removeLottery,
  removeLotteryPool,
  removePool,
  replaceLotteryData,
  resetLottery,
  runState,
  setLotteryBinding,
  setUniqueWinner,
  slotsOfPool,
  uniqueName,
  updateLottery,
  updatePool,
  writeRunState,
} from './data.js';
import { cleanEntries, KINDS, KIND_LABELS, KIND_NAMES, capacityOf, kindOf, nextEntryId } from './pools.js';
import { PROTOCOLS, batchSlotOf, protocolInfo, slotOf, spinSlot } from './protocols.js';
import { loadApp, saveApp, flushApp } from './store.js';
import { STAGES, createStage, stageFields, stageLabel, stagesFor } from './stages/index.js';
import { h, el, clear, clockTime } from './dom.js';
import { THEMES, applyTheme, loadTheme, saveTheme } from './theme.js';
import {
  buildLotteryWorkbook,
  buildPoolWorkbook,
  buildResultWorkbook,
  downloadBytes,
  readLotteryWorkbook,
} from './workbook.js';

const appEl = document.getElementById('app');
const fileEl = document.getElementById('file');
const modalEl = document.getElementById('modal');

let app = loadApp();

applyTheme(loadTheme());
const theme = { id: loadTheme() };

const ui = {
  view: ['lotteries', 'pools'].includes(app.lastView) ? app.lastView : 'lotteries',
  lotteryId: app.lastLotteryId ?? app.lotteries[0]?.id ?? null,
  poolId: app.lastPoolId ?? app.pools[0]?.id ?? null,
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
  /** 抽奖详情里正在编辑的那个池。 */
  editPoolId: null,
  resultsTab: 'anchor',
  /** 结果明细里勾掉的条目，键是 `resultId:poolId:entryId`。 */
  resultsPicked: new Set(),
  /** 结果明细的编辑态：只有这时才能多选与撤销。 */
  resultsEditing: false,
};

/* ---------- 视图数据 ---------- */

const VIEW_LABELS = { lotteries: '抽奖', pools: '池' };

function viewItems() {
  return ui.view === 'pools' ? app.pools : app.lotteries;
}

function itemName(item) {
  return ui.view === 'lotteries' ? item.title : item.name;
}

function currentLottery() {
  return lotteryById(app, ui.lotteryId);
}

function currentPool() {
  return poolById(app, ui.poolId);
}

function remember() {
  app = {
    ...app,
    lastView: ui.view,
    lastLotteryId: ui.lotteryId,
    lastPoolId: ui.poolId,
  };
  saveApp(app);
}

/* ---------- 渲染入口 ---------- */

function render() {
  if (ui.view === 'lotteries' && ui.lotteryId === null && app.lotteries.length > 0) {
    ui.lotteryId = app.lotteries[0].id;
  }
  if (ui.view === 'pools' && ui.poolId === null && app.pools.length > 0) {
    ui.poolId = app.pools[0].id;
  }
  destroyPreview();
  clear(appEl);
  appEl.append(renderShell());
  paintDialog();
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
      ['lotteries', 'pools'].map((view) =>
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
  return ui.view === 'pools' ? item.id === ui.poolId : item.id === ui.lotteryId;
}

function select(item) {
  if (ui.view === 'pools') {
    ui.poolId = item.id;
  } else {
    ui.lotteryId = item.id;
  }
}

/* ---------- 主区 ---------- */

function renderMain() {
  if (ui.view === 'pools') {
    return { content: renderPoolPage() };
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
        onClick: (event) => onChange(option.value, event.currentTarget),
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
      onClick: (event) => onChange(!checked, event.currentTarget),
    }),
  );
}

/** 不重绘时把开关的样子改到位，和 toggle() 建出来的一致。 */
function paintToggle(button, checked) {
  button.classList.toggle('on', checked);
  button.textContent = checked ? '开' : '关';
  button.setAttribute('aria-pressed', checked ? 'true' : 'false');
}

/** 一条细进度。 */
function bar(ratio) {
  return h('span', { class: 'bar' }, h('i', { style: `width:${Math.max(0, Math.min(1, ratio)) * 100}%` }));
}

/**
 * 空态：一句标题、一句说明，外加几个入口。
 *
 * 主行动是实心按钮，其余是描边按钮；没有行动时只留文字。
 */
function emptyState(title, text, actions = []) {
  return h(
    'div',
    { class: 'empty' },
    h('div', { class: 'empty-art' }, docIcon()),
    h('h2', { class: 'empty-title', text: title }),
    text ? h('p', { class: 'empty-text', text }) : null,
    actions.length === 0
      ? null
      : h(
          'div',
          { class: 'empty-actions' },
          actions.map((action) =>
            h('button', {
              class: `btn ${action.primary ? 'primary' : 'plain'}`,
              type: 'button',
              text: action.label,
              onClick: action.onClick,
            }),
          ),
        ),
  );
}

/* ---------- 格子 ---------- */

/**
 * 一格一格的条目。
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

/**
 * 一格一条：条目自己有说明（部门 / 工号 / 等级）就写说明，没有就写名额进度。
 *
 * 不看池的种类 —— 同一个池里混着带说明和不带说明的条目也照样显示。
 */
function entryTile(pool, entry, { drawn = 0, won = false } = {}) {
  const capacity = capacityOf(entry);
  const done = capacity !== Infinity && drawn >= capacity;
  const ratio = capacity === Infinity ? 1 : Math.min(1, drawn / capacity);
  const note = [entry.meta?.dept, entry.meta?.employeeId, entry.meta?.level]
    .filter((value) => typeof value === 'string' && value !== '')
    .join(' · ');
  const progress = capacity === Infinity ? `${drawn} · 不限量` : `${drawn} / ${capacity}`;
  return h(
    'div',
    { class: `tile entry-tile${done ? ' done' : ''}${won ? ' won' : ''}` },
    h('span', { class: 'tile-name', text: entry.name }),
    h('span', { class: 'tile-meta', text: note !== '' ? note : progress }),
    h('span', { class: 'tile-bar' }, h('i', { style: `width:${ratio * 100}%` })),
  );
}

/** 某一类条目在这份抽奖里的数量与进度。 */
function poolProgress(lottery, pool) {
  const drawn = new Map();
  for (const result of lottery.results) {
    for (const pick of result.picks) {
      if (pick.poolId !== pool.id) {
        continue;
      }
      drawn.set(pick.entryId, (drawn.get(pick.entryId) ?? 0) + 1);
    }
  }
  return drawn;
}

/**
 * 这一场里的两个角色，都从抽法来：
 * 锚（`source: 'fixed'`，主持人先定的那个）与焦点（`protocol.focus`，抽出来的那个）。
 *
 * 界面只认这两个角色，不认「人」「奖」这些词 —— 池是什么种类跟怎么用无关。
 */
function rolesOf(item) {
  const protocol = protocolInfo(item.protocol);
  return {
    anchor: protocol.slots.find((slot) => slot.source === 'fixed') ?? null,
    focus: slotOf(item.protocol, protocol.focus) ?? protocol.slots[0] ?? null,
  };
}

/* ---------- 抽奖详情 ---------- */

function renderLotteryPage() {
  const item = currentLottery();
  if (item === null) {
    return {
      content: emptyState('还没有抽奖', '导入一份 xlsx，或用现成的池新建一场。抽奖用哪个池，随时可以在右侧「绑定」里改。', [
        { label: '导入 xlsx', primary: true, onClick: () => pickFile('lottery') },
        { label: '新建', onClick: () => openNewDialog() },
      ]),
    };
  }

  const summary = lotterySummary(item);
  const status = lotteryStatus(item);
  const focusKey = rolesOf(item).focus?.key;
  const won = new Set(
    item.results.flatMap((result) =>
      result.picks.filter((pick) => pick.slot === focusKey).map((pick) => pick.entryId),
    ),
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
        text: `${protocolInfo(item.protocol).label} · 已抽出 ${summary.handed} / ${summary.total}${summary.unlimited ? ' · 含不限量' : ''}`,
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
      item.pools.map((pool) => renderPoolSection(item, pool, won)),
    ),
  );

  return { content, rail: renderRail(item, summary, status) };
}

/**
 * 池一节：池名 + 它在这场里填哪个槽。
 *
 * 这里不写「名单 / 奖品」—— 抽奖进行中只认绑定，池是什么种类是编辑素材时的事。
 * 徽标是这一层唯一看得见绑定的地方：抽法一换，谁是盘面、谁是大字都变了。
 */
function renderPoolSection(item, pool, won) {
  const drawn = poolProgress(item, pool);
  const roles = slotsOfPool(item, pool.id).map(
    (key) => slotOf(item.protocol, key)?.label ?? key,
  );
  const bound = roles.length > 0;
  return h(
    'section',
    { class: 'section' },
    h(
      'div',
      { class: 'section-head' },
      h(
        'h2',
        { class: 'section-title pool-title' },
        h('span', { class: 'pool-name', text: pool.name }),
        h('span', { class: bound ? 'pool-tag' : 'pool-tag muted', text: bound ? roles.join(' / ') : '未参与' }),
      ),
      h('button', {
        class: 'text-btn',
        type: 'button',
        text: '编辑',
        onClick: () => openPools(item, pool.id),
      }),
    ),
    tileGrid({
      id: `pool-more-${pool.id}`,
      height: 96,
      empty: '还没有条目',
      items: pool.entries,
      render: (entry) =>
        entryTile(pool, entry, { drawn: drawn.get(entry.id) ?? 0, won: won.has(entry.id) }),
    }),
  );
}

function renderResultsSection(item) {
  const rows = resultRowsOf(item);
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
      render: (row) =>
        h(
          'div',
          { class: 'tile result-tile' },
          h('span', { class: 'tile-name', text: row.pick.name }),
          h('span', { class: 'tile-meta', text: row.anchor?.name ?? '' }),
          h('span', { class: 'tile-time', text: clockTime(row.result.at) }),
        ),
    }),
  );
}

/**
 * 「绑定」一节：每个槽一个下拉，列全部池，**不按 kind 过滤**。
 *
 * 这是这场抽奖唯一能改「用哪个池」的地方，创建之后也一直能改。
 */
function renderBindingSection(item) {
  const slots = protocolInfo(item.protocol).slots;
  return h(
    'section',
    { class: 'rail-section' },
    h('h2', { class: 'rail-title', text: '绑定' }),
    ...slots.map((slot) => {
      const value = item.slots?.[slot.key] ?? '';
      return h(
        'div',
        { class: 'field' },
        h(
          'span',
          { class: 'field-label' },
          h('span', { text: slot.label }),
          slot.hint ? h('span', { class: 'field-hint', text: slot.hint }) : null,
        ),
        h(
          'select',
          {
            class: 'field-select',
            'aria-label': slot.label,
            onChange: (event) =>
              commit(setLotteryBinding(app, item.id, slot.key, event.currentTarget.value || null)),
          },
          h('option', { value: '', text: '未绑定', selected: value === '' }),
          item.pools.map((pool) =>
            h('option', {
              value: pool.id,
              text: `${pool.name} · ${pool.entries.length} 条`,
              selected: pool.id === value,
            }),
          ),
        ),
      );
    }),
    h('p', {
      class: 'rail-note',
      text: '槽不挑池的类型——名单也能拿来抽奖品。没被任何槽选中的池不参与这一场。',
    }),
    h('button', {
      class: 'text-btn',
      type: 'button',
      text: '加一个池',
      onClick: () => openPoolSource(item),
    }),
  );
}

/** 一次抽几个：只在抽法有 `take: 'batch'` 的槽时出现。 */
function batchField(item, slot) {
  const value = item.batchSize ?? item.batch;
  return h(
    'div',
    { class: 'field' },
    h(
      'span',
      { class: 'field-label' },
      h('span', { text: '一次抽' }),
      h('span', { class: 'field-hint', text: slot.label }),
    ),
    h('input', {
      class: 'field-input',
      type: 'number',
      min: '1',
      max: String(MAX_BATCH),
      step: '1',
      value: String(value),
      'aria-label': '一次抽几个',
      // 打字时只存不重绘：每敲一个字就重建侧栏会把焦点弄丢
      onInput: (event) => {
        app = updateLottery(app, item.id, { batchSize: event.currentTarget.value });
        saveApp(app);
      },
      onBlur: () => commit(app),
    }),
  );
}

function renderRail(item, summary, status, { footer = true } = {}) {
  const primary = status === 'done' ? '查看结果' : status === 'running' ? '继续抽奖' : '开始抽奖';
  const focusSlot = slotOf(item.protocol, protocolInfo(item.protocol).focus);
  const focusPool = focusSlot === null ? null : poolOfSlot(item, focusSlot.key);
  const batchSlot = batchSlotOf(item.protocol);

  return h(
    'aside',
    { class: 'rail' },
    h(
      'section',
      { class: 'rail-section' },
      h('h2', { class: 'rail-title', text: '抽法' }),
      choices(
        PROTOCOLS.map((protocol) => ({ value: protocol.id, label: protocol.label })),
        item.protocol,
        (value) => commit(updateLottery(app, item.id, { protocol: value })),
      ),
      h('p', { class: 'rail-note', text: protocolInfo(item.protocol).hint }),
    ),
    renderBindingSection(item),
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
      focusPool === null
        ? null
        : toggle(
            `每个${focusSlot?.label ?? '条目'}只出现一次`,
            isUniqueWinner(item),
            (checked) => commit(setUniqueWinner(app, item.id, checked)),
          ),
      batchSlot === null ? null : batchField(item, batchSlot),
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

/** 撤销最后一次开奖：走引擎，记录与名额一起回退。 */
function undoLastResult() {
  const item = currentLottery();
  if (item === null || item.results.length === 0) {
    return;
  }
  const run = runState(item);
  const next = { ...run, results: run.results.slice(0, -1) };
  const removed = run.results[run.results.length - 1];
  commit(writeRunState(app, item.id, next));
  const head = removed === undefined ? undefined : focusPick(removed, item.protocol);
  toast(head ? `已撤销 ${head.name} 的最后一抽` : '已撤销最后一抽');
}

function statusText(item, status, summary) {
  const focus = slotOf(item.protocol, protocolInfo(item.protocol).focus);
  const label = focus?.label ?? '条目';
  if (status === 'done') {
    return `已抽完，共 ${summary.handed} 个${label}`;
  }
  if (status === 'running') {
    return `还剩 ${Math.max(0, summary.total - summary.handed)} 个名额`;
  }
  const first = summary.slots.find((slot) => slot.source === 'draw') ?? summary.slots[0];
  if (first === undefined || first.poolId !== null) {
    return '还没开始';
  }
  return `还没有给「${first.label}」选池`;
}

function renderConfigField(item, field, value) {
  // 开关型配置（音效这类）：以前落到下面的滑杆分支，会显示成一根写着 false 的滑杆
  if (field.type === 'switch') {
    return toggle(field.label, value !== false, (checked) =>
      writeStageConfig(item, field.key, checked, field.stageId ?? item.stage),
    );
  }
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
  const valueEl = h('span', { class: 'field-value', text: String(value) });
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
      // 拖动时只存不重绘，否则每次 input 都会把手柄连同焦点一起换掉
      onInput: (event) => {
        const next = Number(event.currentTarget.value);
        valueEl.textContent = String(next);
        writeStageConfig(item, field.key, next, field.stageId ?? item.stage, { rerender: false });
      },
    }),
    valueEl,
  );
}

function writeStageConfig(item, key, value, stageId = item.stage, { rerender = true } = {}) {
  const next = updateLottery(app, item.id, {
    stageConfig: { [stageId]: { [key]: value } },
  });
  if (rerender) {
    commit(next);
    return;
  }
  app = next;
  saveApp(app);
}

/* ---------- 池详情 ---------- */

function renderPoolPage() {
  const item = currentPool();
  if (item === null) {
    return emptyState('还没有池', '导入一份含「姓名」或「奖品名称」列的 xlsx，或新建一个空池。', [
      { label: '导入 xlsx', primary: true, onClick: () => pickFile('pool') },
      { label: '新建', onClick: openPoolKindDialog },
    ]);
  }

  const total = item.entries.reduce((sum, entry) => {
    const capacity = capacityOf(entry);
    return sum + (capacity === Infinity ? 0 : capacity);
  }, 0);

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
        'aria-label': '池名称',
        onInput: (event) => {
          app = updatePool(app, item.id, { name: event.currentTarget.value });
          saveApp(app);
        },
      }),
      h('p', {
        class: 'detail-sub',
        text:
          item.kind === 'people'
            ? `${KIND_LABELS[item.kind]} · ${item.entries.length} 条`
            : `${KIND_LABELS[item.kind]} · ${item.entries.length} 条 · ${total} 个名额`,
      }),
    ),
    h(
      'div',
      { class: 'detail-body' },
      section(
        KIND_NAMES[item.kind],
        h(
          'div',
          { class: 'edit-list' },
          item.entries.length === 0
            ? h('p', { class: 'note', text: `还没有${KIND_NAMES[item.kind]}` })
            : item.entries.map((entry) => entryEditRow(item, entry)),
        ),
        h(
          'div',
          { class: 'links' },
          h('button', { class: 'text-btn', type: 'button', text: '导入', onClick: () => pickFile('pool-replace') }),
          h('button', { class: 'text-btn', type: 'button', text: '追加', onClick: () => pickFile('pool-append') }),
          h('button', {
            class: 'text-btn',
            type: 'button',
            text: '导出',
            onClick: async () => {
              downloadBytes(`${safeName(item.name)}.xlsx`, await buildPoolWorkbook(item));
            },
          }),
          h('button', {
            class: 'text-btn',
            type: 'button',
            text: '加一条',
            onClick: () => writePoolEntries(item, [...item.entries, draftEntry(item)]),
          }),
        ),
      ),
      h(
        'div',
        { class: 'section section-plain' },
        h('button', {
          class: 'text-btn danger',
          type: 'button',
          text: '删除这个池',
          onClick: () =>
            confirmSheet({
              title: `删除「${item.name}」？`,
              message: '不能撤销。已经复制进抽奖的那几份不受影响。',
              confirmLabel: '删除',
              danger: true,
              onConfirm: () => {
                app = removePool(app, item.id);
                ui.poolId = app.pools[0]?.id ?? null;
                commit(app);
              },
            }),
        }),
      ),
    ),
  );
}

/** 一条可编辑的条目：人写姓名/部门/工号，奖品与条目写名称/名额。 */
function entryEditRow(pool, entry, { drawn = 0, rerender = false } = {}) {
  const write = (patch, options) =>
    writePoolEntries(
      pool,
      pool.entries.map((item) => (item.id === entry.id ? { ...item, ...patch } : item)),
      options,
    );

  if (pool.kind === 'people') {
    return h(
      'div',
      { class: 'edit-row' },
      h('input', {
        class: 'edit-input',
        type: 'text',
        value: entry.name,
        'aria-label': '姓名',
        onInput: (event) => write({ name: event.currentTarget.value }, { rerender }),
      }),
      h('input', {
        class: 'edit-input muted',
        type: 'text',
        value: entry.meta?.dept ?? '',
        placeholder: '部门',
        'aria-label': '部门',
        onInput: (event) =>
          write({ meta: { ...entry.meta, dept: event.currentTarget.value } }, { rerender }),
      }),
      h('input', {
        class: 'edit-input muted narrow',
        type: 'text',
        value: entry.meta?.employeeId ?? '',
        placeholder: '工号',
        'aria-label': '工号',
        onInput: (event) =>
          write({ meta: { ...entry.meta, employeeId: event.currentTarget.value } }, { rerender }),
      }),
      h('button', {
        class: 'edit-remove',
        type: 'button',
        text: '×',
        'aria-label': '删除这一条',
        onClick: () => writePoolEntries(pool, pool.entries.filter((item) => item.id !== entry.id)),
      }),
    );
  }

  const capacity = capacityOf(entry);
  return h(
    'div',
    { class: 'edit-row' },
    h('input', {
      class: 'edit-input',
      type: 'text',
      value: entry.name,
      'aria-label': '名称',
      onInput: (event) => write({ name: event.currentTarget.value }, { rerender }),
    }),
    h('span', { class: 'edit-progress', text: `${drawn} / ${capacity === Infinity ? '∞' : capacity}` }),
    h('input', {
      class: 'edit-input number',
      type: 'number',
      min: String(Math.max(1, drawn)),
      value: String(capacity === Infinity ? 0 : capacity),
      'aria-label': '名额',
      onChange: (event) => {
        const raw = Math.floor(Number(event.currentTarget.value));
        const next = raw <= 0 ? null : Math.max(drawn, raw);
        write({ capacity: next });
      },
    }),
    h('button', {
      class: 'edit-remove',
      type: 'button',
      text: '×',
      'aria-label': '删除这一条',
      onClick: () => writePoolEntries(pool, pool.entries.filter((item) => item.id !== entry.id)),
    }),
  );
}

function draftEntry(pool) {
  const kind = kindOf(pool.kind);
  return {
    id: nextEntryId(pool),
    name: kind === 'people' ? '新参与人' : kind === 'prizes' ? '新奖品' : '新条目',
    weight: 1,
    capacity: 1,
    meta: {},
  };
}

/**
 * 存池里的条目。
 *
 * 输入框传 `rerender: false`：整页重绘会把输入框连同焦点一起换掉。
 * 行数变了（名字被清空，整行会消失）时仍然重绘。
 */
function writePoolEntries(pool, entries, { rerender = true } = {}) {
  const next = updatePool(app, pool.id, { entries: cleanEntries(entries, pool.kind) });
  const after = next.pools.find((item) => item.id === pool.id)?.entries.length ?? 0;
  saveRows(next, rerender, after === entries.length);
}

function saveRows(next, rerender, rowsSame) {
  if (rerender || !rowsSame) {
    commit(next);
    return;
  }
  app = next;
  saveApp(app);
}

function createEmptyPool(kind) {
  const [next, created] = addPool(app, { name: `新${KIND_NAMES[kind]}`, kind, entries: [] });
  ui.poolId = created.id;
  ui.view = 'pools';
  commit(next);
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
    return null;
  }
  if (dialog.kind === 'addMenu') {
    return renderAddMenu();
  }
  if (dialog.kind === 'poolKind') {
    return renderPoolKindSheet();
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
  if (dialog.kind === 'poolSource') {
    return renderPoolSourceSheet();
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
  return null;
}

/**
 * 把 `ui.dialog` 画进那一个 `<dialog>` 里。
 *
 * 外壳只开一次：重绘只换里面的内容，入场动画不会重播，焦点也留在弹窗里。
 */
function paintDialog() {
  const content = ui.dialog === null ? null : renderDialog();
  if (content === null) {
    if (modalEl.open) {
      modalEl.close();
    }
    clear(modalEl);
    return;
  }

  const opened = modalEl.open;
  clear(modalEl);
  modalEl.append(content);

  const title = modalEl.querySelector('.sheet-title, .action-title');
  if (title !== null) {
    title.id = 'modal-title';
    modalEl.setAttribute('aria-labelledby', 'modal-title');
    modalEl.removeAttribute('aria-label');
  }

  if (!opened) {
    modalEl.showModal();
    modalEl.classList.add('opening');
    window.setTimeout(() => modalEl.classList.remove('opening'), 240);
  }
}

/**
 * 一张弹窗。
 *
 * 返回的是弹窗内容本身，外层的 `<dialog>` 由 paintDialog 复用：
 * 每次交互都重建外壳的话，入场动画会跟着重播，看起来就像闪了一下。
 */
function sheet({ title, sub, children, footer, wide = false }) {
  return h(
    'section',
    { class: `sheet${wide ? ' wide' : ''}` },
    h(
      'header',
      { class: 'sheet-head' },
      h('h2', { class: 'sheet-title', text: title }),
      sub ? h('span', { class: 'sheet-sub', text: sub }) : null,
      h('button', { class: 'sheet-close', type: 'button', 'aria-label': '关闭', onClick: closeDialog }, '×'),
    ),
    h('div', { class: 'sheet-body' }, children),
    footer ? h('footer', { class: 'sheet-foot' }, footer) : null,
  );
}

function renderAddMenu() {
  const label = VIEW_LABELS[ui.view];
  const isPools = ui.view === 'pools';
  return h(
    'section',
    { class: 'action-sheet' },
    h('p', { class: 'action-title', text: label }),
    h(
      'div',
      { class: 'action-group' },
      h('button', {
        class: 'action-item',
        type: 'button',
        text: '从 xlsx 导入',
        onClick: () => pickFile(isPools ? 'pool' : 'lottery'),
      }),
      h('button', {
        class: 'action-item',
        type: 'button',
        text: '新建',
        onClick: () => {
          if (!isPools) {
            openNewDialog();
            return;
          }
          openPoolKindDialog();
        },
      }),
    ),
    h(
      'div',
      { class: 'action-group' },
      h('button', { class: 'action-item cancel', type: 'button', text: '取消', onClick: closeDialog }),
    ),
  );
}

/**
 * 新建池：先问是哪种。
 *
 * 不预设「名单」—— 池的类型只是它默认长哪几列（姓名 / 数量 / 只有一个名称），
 * 跟它在这场里填哪个槽没有关系，没有哪一种更「默认」。
 */
function openPoolKindDialog() {
  ui.dialog = { kind: 'poolKind' };
  render();
}

const POOL_KIND_HINTS = {
  people: '姓名 / 部门 / 工号',
  prizes: '奖品名称 / 数量 / 权重',
  items: '只有一个名称，人和奖都能装',
};

function renderPoolKindSheet() {
  return h(
    'section',
    { class: 'action-sheet' },
    h('p', { class: 'action-title', text: '新建池' }),
    h(
      'div',
      { class: 'action-group' },
      KINDS.map((kind) =>
        h('button', {
          class: 'action-item',
          type: 'button',
          text: `${KIND_NAMES[kind]} · ${POOL_KIND_HINTS[kind]}`,
          onClick: () => {
            ui.dialog = null;
            createEmptyPool(kind);
          },
        }),
      ),
    ),
    h(
      'div',
      { class: 'action-group' },
      h('button', { class: 'action-item cancel', type: 'button', text: '取消', onClick: closeDialog }),
    ),
  );
}

function renderPreviewSheet() {
  const pending = ui.pending;
  if (pending === null) {
    return null;
  }
  const { parsed, base, target } = pending;
  const duplicate = duplicateOf(target, base);
  const protocol = protocolInfo(parsed.meta.protocol);
  const bySlot = (key) => {
    const id = parsed.meta.slots?.[key];
    return id ? parsed.pools.find((pool) => pool.id === id) ?? null : null;
  };
  const boundCount = protocol.slots.filter((slot) => bySlot(slot.key) !== null).length;
  const total = parsed.pools.reduce(
    (sum, pool) =>
      sum +
      pool.entries.reduce((inner, entry) => {
        const capacity = capacityOf(entry);
        return inner + (capacity === Infinity ? 0 : capacity);
      }, 0),
    0,
  );

  return sheet({
    title: '导入',
    sub: pending.file,
    children: [
      h(
        'div',
        { class: 'facts' },
        fact('池', `${parsed.pools.length} 个`),
        fact('条目', `${parsed.pools.reduce((sum, pool) => sum + pool.entries.length, 0)} 条`),
        fact('名额', `${total} 个`),
        fact('绑定', `${boundCount} / ${protocol.slots.length}`),
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
    return null;
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
    return null;
  }
  const stageId = ui.dialog.stage ?? item.stage;
  /** 只列这个抽法下能用的形态：能力协商的结果就是这张表。 */
  const usable = stagesFor(protocolInfo(item.protocol));

  return sheet({
    title: '形态',
    sub: `${item.title} · ${protocolInfo(item.protocol).label}`,
    wide: true,
    children: [
      h('div', { class: 'stage-preview', id: 'stage-preview' }),
      h(
        'div',
        { class: 'stage-tabs' },
        ...usable.map((entry) =>
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
      h('p', {
        class: 'sheet-note',
        text: `这个抽法下能用 ${usable.length} 种形态；换抽法时配不上的会自动换掉。`,
      }),
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
 * 弹窗里的预览：用这张抽奖自己的池跑一遍形态，能一直动。
 * 关弹窗、换形态、页面重渲染时都要销毁，否则动画会留在后台。
 */
function mountPreview() {
  const host = document.getElementById('stage-preview');
  if (host === null) {
    return;
  }

  let stageId;
  let protocolId;
  let pools;
  let slots;
  let config;
  let batch = 1;
  if (ui.dialog?.kind === 'new') {
    const draft = ui.draft;
    if (draft === null) {
      return;
    }
    stageId = draft.stage;
    protocolId = draft.protocol;
    pools = draftPools(draft);
    slots = draft.slots;
    batch = draft.batchSize ?? 1;
    config = {};
  } else if (ui.dialog?.kind === 'stage') {
    const item = lotteryById(app, ui.dialog.lotteryId);
    if (item === null) {
      return;
    }
    stageId = ui.dialog.stage;
    protocolId = item.protocol;
    pools = item.pools;
    slots = item.slots;
    batch = item.batch;
    config = item.stageConfig[stageId] ?? {};
  } else {
    return;
  }

  ui.preview = createStage(stageId, host, config, {});
  ui.preview?.update(previewView(pools, slots, batch, protocolId));
}

/**
 * 预览用的一份快照：结构与抽奖页交给形态的那份一致。
 *
 * 全按抽法取：锚槽、焦点槽、盘面槽，池一律按**绑定**找。池里没东西时给一份
 * 中性的示意盘面，不拿「一等奖 / 张三」当默认值。
 */
function previewView(pools, slots = {}, batch = 1, protocolId = undefined) {
  const protocol = protocolInfo(protocolId);
  const anchorSlot = protocol.slots.find((slot) => slot.source === 'fixed') ?? protocol.slots[0];
  const focusSlot = slotOf(protocol.id, protocol.focus) ?? protocol.slots[0];
  const spin = spinSlot(protocol.id);
  const poolOf = (key) => (pools ?? []).find((pool) => pool.id === slots?.[key]) ?? null;

  const anchorEntries = poolOf(anchorSlot.key)?.entries ?? [];
  const focusEntries = poolOf(focusSlot.key)?.entries ?? [];
  const spinEntries = poolOf(spin.key)?.entries ?? [];
  const sampleLabels = ['一号', '二号', '三号', '四号', '五号', '六号', '七号', '八号'];

  const focusLeft = focusEntries.reduce((sum, entry) => {
    const capacity = capacityOf(entry);
    return sum + (capacity === Infinity ? 1 : capacity);
  }, 0);

  return {
    title: '预览',
    focus: focusSlot.key,
    anchor: anchorSlot.key,
    anchorLabel: anchorSlot.label,
    anchorName: anchorEntries[0]?.name ?? '—',
    anchorNote:
      anchorEntries.length > 0 ? `${anchorEntries.length} 条可选` : `还没有${anchorSlot.label}`,
    focusLabel: focusSlot.label,
    focusLeft,
    focusCount: focusEntries.length,
    spinning: false,
    revealed: false,
    allDrawn: false,
    canDraw: true,
    handed: 0,
    batch: Math.max(1, Math.min(MAX_BATCH, Number(batch) || 1)),
    labels: spinEntries.length > 0 ? spinEntries.map((entry) => entry.name) : sampleLabels,
    weights: (spinEntries.length > 0 ? spinEntries : sampleLabels).map((entry) => entry.weight ?? 1),
    fixed: [],
  };
}

function destroyPreview() {
  if (ui.preview !== null && ui.preview !== undefined) {
    ui.preview.destroy();
    ui.preview = null;
  }
}

/* ---------- 新建抽奖 ---------- */

function openNewDialog() {
  const protocol = PROTOCOLS[0].id;
  ui.draft = {
    title: '',
    protocol,
    stage: STAGES[0]?.id ?? '',
    uniqueWinner: true,
    slots: defaultSlots(app.pools, protocol),
    batchSize: null,
  };
  ui.dialog = { kind: 'new' };
  render();
}

/** 草稿里绑到的池（去重、按抽法的槽顺序）；一个都没绑就是空的一场。 */
function draftPools(draft) {
  const used = new Map();
  for (const slot of protocolInfo(draft.protocol).slots) {
    const chosen = app.pools.find((pool) => pool.id === draft.slots[slot.key]);
    if (chosen !== undefined && !used.has(chosen.id)) {
      used.set(chosen.id, chosen);
    }
  }
  return [...used.values()];
}

function renderNewSheet() {
  const draft = ui.draft;
  if (draft === null) {
    return null;
  }
  /** 打字时只改草稿：整页重绘会把输入框连同焦点一起换掉，弹窗动画也会重播。 */
  const patch = (next) => {
    Object.assign(ui.draft, next);
  };
  /** 换池或换抽法只影响左边预览，重挂一次就够了。 */
  const refreshPreview = () => {
    destroyPreview();
    mountPreview();
  };
  const protocol = protocolInfo(draft.protocol);
  const stageOptions = stagesFor(protocol);

  /** 还有槽没选池就建不了 —— 建出来也抽不动，不如在这里拦住。 */
  const missingSlot = () =>
    protocolInfo(draft.protocol).slots.some((slot) => (draft.slots[slot.key] ?? '') === '');
  /** 下拉一改就同步按钮，不整页重绘（预览会闪、输入框会丢焦点）。 */
  const syncCreate = () => {
    const button = document.querySelector('#modal .form-actions .btn.primary');
    if (button !== null) {
      button.disabled = missingSlot();
    }
  };

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
            h('span', { class: 'field-label', text: '抽法' }),
            choices(
              PROTOCOLS.map((item) => ({ value: item.id, label: item.label })),
              draft.protocol,
              (value) => {
                patch({ protocol: value });
                const nextStage = stagesFor(protocolInfo(value))[0]?.id;
                if (nextStage !== undefined) {
                  patch({ stage: nextStage });
                }
                // 槽的键集合可能跟着抽法变；已有的绑定留着，缺的按下标配
                const kept = {};
                for (const slot of protocolInfo(value).slots) {
                  if (draft.slots[slot.key] !== undefined) {
                    kept[slot.key] = draft.slots[slot.key];
                  }
                }
                draft.slots = { ...defaultSlots(app.pools, value), ...kept };
                render();
              },
            ),
          ),
          h(
            'div',
            { class: 'field' },
            h('span', { class: 'field-label', text: '形态' }),
            choices(
              stageOptions.map((stage) => ({ value: stage.id, label: stage.label })),
              draft.stage,
              (value, button) => {
                patch({ stage: value });
                for (const node of button.parentElement.children) {
                  node.classList.toggle('active', node === button);
                }
                refreshPreview();
              },
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
              onInput: (event) => patch({ title: event.currentTarget.value }),
            }),
          ),
          ...protocol.slots.map((slot) => {
            const value = draft.slots[slot.key] ?? '';
            return h(
              'div',
              { class: 'field' },
              h(
                'span',
                { class: 'field-label' },
                h('span', { text: slot.label }),
                slot.hint ? h('span', { class: 'field-hint', text: slot.hint }) : null,
              ),
              h(
                'select',
                {
                  class: 'field-select',
                  'aria-label': slot.label,
                  onChange: (event) => {
                    draft.slots[slot.key] = event.currentTarget.value;
                    syncCreate();
                    refreshPreview();
                  },
                },
                h('option', { value: '', text: '未绑定', selected: value === '' }),
                app.pools.map((pool) =>
                  h('option', {
                    value: pool.id,
                    text: `${pool.name} · ${pool.entries.length} 条`,
                    selected: pool.id === value,
                  }),
                ),
              ),
            );
          }),
          batchSlotOf(protocol.id) === null
            ? null
            : h(
                'div',
                { class: 'field' },
                h(
                  'span',
                  { class: 'field-label' },
                  h('span', { text: '一次抽' }),
                  h('span', { class: 'field-hint', text: batchSlotOf(protocol.id).label }),
                ),
                h('input', {
                  class: 'field-input',
                  type: 'number',
                  min: '1',
                  max: String(MAX_BATCH),
                  step: '1',
                  value: String(draft.batchSize ?? 1),
                  'aria-label': '一次抽几个',
                  onInput: (event) => {
                    draft.batchSize = event.currentTarget.value === '' ? null : Number(event.currentTarget.value);
                  },
                }),
              ),
          toggle(`每个${slotOf(draft.protocol, protocolInfo(draft.protocol).focus)?.label ?? '条目'}只出现一次`, draft.uniqueWinner, (checked, button) => {
            patch({ uniqueWinner: checked });
            paintToggle(button, checked);
          }),
          h(
            'div',
            { class: 'form-actions' },
            h('button', { class: 'btn plain', type: 'button', text: '取消', onClick: closeDialog }),
            h('button', {
              class: 'btn primary',
              type: 'button',
              text: '创建',
              disabled: protocol.slots.some((slot) => (draft.slots[slot.key] ?? '') === ''),
              onClick: () => {
                const [next, created] = createLottery(app, {
                  title: draft.title,
                  protocol: draft.protocol,
                  stage: draft.stage,
                  stageConfig: {},
                  uniqueWinner: draft.uniqueWinner,
                  slots: draft.slots,
                  batchSize: draft.batchSize,
                  pools: draftPools(draft),
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

/* ---------- 抽奖里的池 ---------- */

function openPools(item, poolId) {
  ui.editPoolId = poolId ?? item.pools[0]?.id ?? null;
  ui.dialog = { kind: 'pools', lotteryId: item.id };
  render();
}

function renderPoolsSheet() {
  const item = lotteryById(app, ui.dialog.lotteryId);
  if (item === null) {
    return null;
  }
  const poolId = item.pools.some((pool) => pool.id === ui.editPoolId)
    ? ui.editPoolId
    : item.pools[0]?.id ?? null;
  const pool = item.pools.find((entry) => entry.id === poolId) ?? null;
  const slots = protocolInfo(item.protocol).slots;
  const boundTo = pool === null ? [] : slotsOfPool(item, pool.id);

  return sheet({
    title: '池',
    sub: item.title,
    wide: true,
    children: [
      item.pools.length <= 1
        ? null
        : choices(
            item.pools.map((entry) => {
              const roles = slotsOfPool(item, entry.id).map(
                (key) => slotOf(item.protocol, key)?.label ?? key,
              );
              return {
                value: entry.id,
                label: `${entry.name} · ${roles.length > 0 ? roles.join('/') : '未参与'}`,
              };
            }),
            poolId,
            (value) => {
              ui.editPoolId = value;
              render();
            },
          ),
      pool === null
        ? h('p', { class: 'note', text: '这场抽奖还没有池' })
        : h(
            'div',
            { class: 'field' },
            h(
              'span',
              { class: 'field-label' },
              h('span', { text: '用于' }),
              h('span', { class: 'field-hint', text: '一个池可以同时填两个槽' }),
            ),
            h(
              'div',
              { class: 'choices' },
              ...slots.map((slot) => {
                const on = boundTo.includes(slot.key);
                return h('button', {
                  class: `choice${on ? ' active' : ''}`,
                  type: 'button',
                  'aria-pressed': on ? 'true' : 'false',
                  text: slot.label,
                  onClick: () =>
                    commit(setLotteryBinding(app, item.id, slot.key, on ? null : pool.id)),
                });
              }),
              boundTo.length === 0 ? h('span', { class: 'note', text: '未参与' }) : null,
            ),
          ),
      pool === null
        ? null
        : h(
            'div',
            { class: 'edit-list' },
            pool.entries.map((entry) =>
              entryEditRow(pool, entry, {
                drawn: poolProgress(item, pool).get(entry.id) ?? 0,
              }),
            ),
          ),
    ],
    footer: [
      h('button', {
        class: 'btn plain small',
        type: 'button',
        text: '加池',
        onClick: () => openPoolSource(item),
      }),
      pool === null
        ? null
        : h('button', {
            class: 'btn plain small',
            type: 'button',
            text: '移除这个池',
            onClick: () => {
              const [next, error] = removeLotteryPool(app, item.id, pool.id);
              if (error !== null) {
                toast(error);
                return;
              }
              ui.editPoolId = null;
              commit(next);
            },
          }),
      h('span', { class: 'foot-spacer' }),
      h('button', {
        class: 'btn plain small',
        type: 'button',
        text: '加一条',
        onClick: () => {
          if (pool === null) {
            return;
          }
          writeLotteryEntries(item, pool, [...pool.entries, draftEntry(pool)]);
        },
      }),
      h('button', { class: 'btn primary', type: 'button', text: '完成', onClick: closeDialog }),
    ],
  });
}

/** 加池：从素材池复制一份，或者建一个空池。 */
function openPoolSource(item) {
  ui.dialog = { kind: 'poolSource', lotteryId: item.id };
  render();
}

function renderPoolSourceSheet() {
  const item = lotteryById(app, ui.dialog.lotteryId);
  if (item === null) {
    return null;
  }
  const inside = new Set(item.pools.map((pool) => pool.id));

  return sheet({
    title: '加池',
    sub: item.title,
    children: [
      h('p', { class: 'sheet-note', text: '复制一份素材池进来，或者直接建一个空的。改副本不影响素材。' }),
      app.pools.length === 0
        ? h('p', { class: 'note', text: '「池」里还没有素材池' })
        : h(
            'div',
            { class: 'action-group' },
            app.pools.map((pool) =>
              h('button', {
                class: 'action-item',
                type: 'button',
                disabled: inside.has(pool.id),
                text: `${pool.name} · ${pool.entries.length} 条${inside.has(pool.id) ? '（已在）' : ''}`,
                onClick: () => {
                  const [next, added] = addLotteryPool(app, item.id, { sourceId: pool.id });
                  ui.editPoolId = added?.id ?? null;
                  ui.dialog = { kind: 'pools', lotteryId: item.id };
                  commit(next);
                },
              }),
            ),
          ),
      h(
        'div',
        { class: 'action-group' },
        KINDS.map((kind) =>
          h('button', {
            class: 'action-item',
            type: 'button',
            text: `新建空${KIND_NAMES[kind]}`,
            onClick: () => {
              const [next, added] = addLotteryPool(app, item.id, { kind });
              ui.editPoolId = added?.id ?? null;
              ui.dialog = { kind: 'pools', lotteryId: item.id };
              commit(next);
            },
          }),
        ),
      ),
    ],
    footer: [h('button', { class: 'btn plain', type: 'button', text: '取消', onClick: closeDialog })],
  });
}

function writeLotteryEntries(item, pool, entries, { rerender = true } = {}) {
  const next = patchLotteryPools(app, item.id, pool.id, entries);
  const after =
    next.lotteries
      .find((lottery) => lottery.id === item.id)
      ?.pools.find((entry) => entry.id === pool.id)?.entries.length ?? 0;
  saveRows(next, rerender, after === entries.length);
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

function resultRowsOf(item) {
  const { anchor, focus } = rolesOf(item);
  const rows = [];
  let order = 1;
  for (const result of item.results) {
    const anchorPick =
      anchor === null ? null : result.picks.find((pick) => pick.slot === anchor.key) ?? null;
    const heads =
      focus === null ? [] : result.picks.filter((pick) => pick.slot === focus.key);
    for (const pick of heads.length > 0 ? heads : [anchorPick]) {
      if (pick !== null && pick !== undefined) {
        rows.push({ order: order++, result, pick, anchor: anchorPick });
      }
    }
  }
  return rows;
}

function renderResultsSheet() {
  const item = lotteryById(app, ui.dialog.lotteryId);
  if (item === null) {
    return null;
  }
  const rows = resultRowsOf(item);
  const picked = ui.resultsPicked;
  const editing = ui.resultsEditing;
  const allPicked = rows.length > 0 && rows.every((row) => picked.has(rowKey(row)));

  return sheet({
    title: '开奖结果',
    sub: `${item.title} · ${rows.length} 条`,
    wide: true,
    children: [
      h(
        'div',
        { class: 'result-tools' },
        choices(
          [
            { value: 'anchor', label: `按${rolesOf(item).anchor?.label ?? '分组'}` },
            { value: 'time', label: '按时间' },
          ],
          ui.resultsTab,
          (value) => {
            ui.resultsTab = value;
            render();
          },
        ),
      ),
      ui.resultsTab === 'anchor'
        ? resultsByAnchor(item, rows)
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
  return `${row.result.id}:${row.pick.poolId}:${row.pick.entryId}`;
}

/** 撤销选中的中奖记录：只去掉记录，这些条目回到池子。 */
function undoPicked() {
  const item = lotteryById(app, ui.dialog?.lotteryId);
  if (item === null || ui.resultsPicked.size === 0) {
    return;
  }
  let state = runState(item);
  const targets = [...ui.resultsPicked].reverse();
  let done = 0;
  for (const key of targets) {
    const [resultId, poolId, entryId] = [
      key.slice(0, key.indexOf(':')),
      key.slice(key.indexOf(':') + 1, key.lastIndexOf(':')),
      key.slice(key.lastIndexOf(':') + 1),
    ];
    const stillThere = state.results.some(
      (result) => result.id === resultId && result.picks.some((pick) => pick.poolId === poolId && pick.entryId === entryId),
    );
    if (!stillThere) {
      continue;
    }
    state = undoPick(state, resultId, poolId, entryId);
    done += 1;
  }
  ui.resultsPicked = new Set();
  ui.resultsEditing = false;
  app = writeRunState(app, item.id, state);
  saveApp(app);
  render();
  toast(`已撤销 ${done} 条记录`);
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
    h('span', { class: 'tile-name', text: row.pick.name }),
    h('span', { class: 'tile-meta', text: row.anchor?.name ?? '' }),
    h('span', { class: 'tile-time', text: [row.pick.meta?.dept, clockTime(row.result.at)].filter(Boolean).join(' · ') }),
  );
}

function resultsByAnchor(item, rows) {
  const anchor = rolesOf(item).anchor;
  const pool = anchor === null ? null : poolOfSlot(item, anchor.key);
  const groups = (pool?.entries ?? [])
    .map((entry) => ({ entry, rows: rows.filter((row) => row.anchor?.entryId === entry.id) }))
    .filter((group) => group.rows.length > 0);
  const loose = rows.filter((row) => row.anchor === null || row.anchor === undefined);
  if (loose.length > 0) {
    groups.push({ entry: { id: 'none', name: '未分组' }, rows: loose });
  }

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
          h('h3', { class: 'group-title', text: group.entry.name }),
          h('span', { class: 'group-count', text: `${group.rows.length} 条` }),
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
  if (target === 'pool') {
    return app.pools.find((item) => item.name === base) ?? null;
  }
  return null;
}

function uniqueNameFor(target, base) {
  if (target === 'lottery') {
    return uniqueName(app.lotteries, base, (item) => item.title);
  }
  return uniqueName(app.pools, base);
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
    const slots = parsed.meta.slots ?? defaultSlots(parsed.pools, parsed.meta.protocol);
    const [next, created] = createLottery(app, {
      title: name,
      protocol: parsed.meta.protocol,
      stage: parsed.meta.stage,
      stageConfig: parsed.meta.stageConfig,
      uniqueWinner: parsed.meta.uniqueWinner,
      pools: parsed.pools,
      slots,
      batchSize: parsed.meta.batchSize,
      results: parsed.results,
    });
    ui.lotteryId = created.id;
    ui.view = 'lotteries';
    commit(next);
    toast(`已导入 ${parsed.pools.length} 个池`);
    return;
  }

  const first = parsed.pools[0];
  if (first === undefined) {
    toast('这份文件里没有可用的池');
    return;
  }
  const [next, created] = addPool(app, { name, kind: first.kind, entries: first.entries });
  ui.poolId = created.id;
  ui.view = 'pools';
  commit(next);
  toast(`已导入 ${first.entries.length} 条`);
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
        protocol: parsed.meta.protocol,
        stage: parsed.meta.stage,
        stageConfig: parsed.meta.stageConfig,
        pools: parsed.pools,
        slots: parsed.meta.slots ?? defaultSlots(parsed.pools, parsed.meta.protocol),
        batchSize: parsed.meta.batchSize,
        results: parsed.results,
      });
    } else {
      const first = parsed.pools[0];
      app = updatePool(app, existing.id, { entries: first?.entries ?? [] });
      ui.poolId = existing.id;
      ui.view = 'pools';
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
      protocol: parsed.meta.protocol,
      stage: parsed.meta.stage,
      stageConfig: parsed.meta.stageConfig,
      pools: parsed.pools,
      slots: parsed.meta.slots ?? defaultSlots(parsed.pools, parsed.meta.protocol),
      batchSize: parsed.meta.batchSize,
      results: parsed.results,
    });
  } else if (target === 'pool-replace') {
    const pool = currentPool();
    const first = parsed.pools.find((item) => item.kind === pool?.kind) ?? parsed.pools[0];
    if (pool !== null && first !== undefined) {
      app = updatePool(app, pool.id, { entries: first.entries });
      ui.poolId = pool.id;
    }
  } else if (target === 'pool-append') {
    const pool = currentPool();
    const first = parsed.pools.find((item) => item.kind === pool?.kind) ?? parsed.pools[0];
    if (pool !== null && first !== undefined) {
      app = updatePool(app, pool.id, { entries: [...pool.entries, ...first.entries] });
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
  for (const slot of protocolInfo(item.protocol).slots) {
    const pool = poolOfSlot(item, slot.key);
    if (pool === null) {
      toast(`「${slot.label}」还没有选池`);
      return;
    }
    if (pool.entries.length === 0) {
      toast(`「${pool.name}」里还没有条目`);
      return;
    }
  }
  window.location.href = `./draw.html?id=${encodeURIComponent(item.id)}`;
}

function confirmReset(item) {
  confirmSheet({
    title: '重新抽奖？',
    message: '会清空开奖记录，池、条目与名额保留。',
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
  // 弹窗在顶层：提示也挂进 <dialog> 里，不然会被盖住
  (modalEl.open ? modalEl : document.body).append(node);
  window.setTimeout(() => node.classList.add('leaving'), 2200);
  window.setTimeout(() => node.remove(), 2800);
}

/* ---------- 事件 ---------- */

// 点弹窗外的空白处关掉；Esc 由浏览器的 cancel 事件给出
modalEl.addEventListener('click', (event) => {
  if (event.target === modalEl) {
    closeDialog();
  }
});

modalEl.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeDialog();
});

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
    if (parsed.pools.length === 0) {
      toast('这份文件里没有可用的池（需要一张含「姓名」或「奖品名称」列的表）');
      return;
    }
    const existing =
      target === 'lottery-replace' ? currentLottery() : currentPool();
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
