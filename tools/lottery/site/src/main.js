/**
 * 抽奖台。
 *
 * 左右两栏：左边是列表（抽奖 / 名单 / 奖品三种），右边是选中项的详情。
 * 列表上方的加号开新建弹窗；详情底部的按钮开始抽奖。
 * 抽奖页占满整屏，全屏是它内部的开关。
 */

import {
  MODE,
  MODE_LABELS,
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
  undoLast,
  voidWinner,
} from './engine.js';
import {
  activityById,
  activitySummary,
  addPrizeSet,
  addRoster,
  createActivity,
  patchActivityPools,
  removeActivity,
  removePrizeSet,
  removeRoster,
  runState,
  updateActivity,
  updatePrizeSet,
  updateRoster,
  writeRunState,
} from './data.js';
import { clear, clockTime, el, h } from './dom.js';
import { DEFAULT_STAGE, STAGES, createStage, stageLabel } from './stages/index.js';
import { flushApp, loadApp, saveApp } from './store.js';
import {
  buildResultWorkbook,
  buildTemplateWorkbook,
  downloadBytes,
  readLotteryWorkbook,
} from './workbook.js';

const appEl = document.getElementById('app');
const fileEl = document.getElementById('file');
const packageEl = document.getElementById('package');

let app = loadApp();

const ui = {
  /** draw 是全屏抽奖；其余都在抽奖台的左右两栏里。 */
  drawing: app.lastView === 'draw',
  /** lotteries | rosters | prizes */
  mode: ['rosters', 'prizes'].includes(app.lastView) ? app.lastView : 'lotteries',
  activityId: app.lastActivityId ?? app.activities[0]?.id ?? null,
  rosterId: app.rosters[0]?.id ?? null,
  prizeSetId: app.prizeSets[0]?.id ?? null,
  dialog: null,
  draft: null,
  importTarget: null,
  spinning: false,
  revealed: false,
  rehearsal: false,
  stage: null,
  selectedPrizeId: null,
  personPickId: null,
  resultsView: 'prize',
};

/** 抽奖页的引擎状态。 */
let run = null;

/* ---------- 存档 ---------- */

function commit(next) {
  app = next;
  saveApp(app);
  render();
}

function commitRun(next) {
  run = next;
  app = writeRunState(app, ui.activityId, next);
  saveApp(app);
  paintDraw();
}

function remember() {
  app = {
    ...app,
    lastView: ui.drawing ? 'draw' : ui.mode,
    lastActivityId: ui.activityId,
  };
  saveApp(app);
}

function render() {
  clear(appEl);
  if (ui.drawing) {
    appEl.append(renderDraw());
    mountStage();
    paintDraw();
    return;
  }
  destroyStage();
  appEl.append(renderShell());
  remember();
}

/** 把舞台实例挂到 #stage 上。页面结构已经进 DOM，直接挂即可。 */
function mountStage() {
  destroyStage();
  const host = document.getElementById('stage');
  if (host === null || run === null) {
    return;
  }
  ui.stage = createStage(activity()?.stage, host);
}

function destroyStage() {
  if (ui.stage !== null) {
    ui.stage.destroy();
    ui.stage = null;
  }
}

function toast(message) {
  document.querySelector('.toast')?.remove();
  const node = h('div', { class: 'toast', text: message });
  document.body.append(node);
  window.setTimeout(() => node.classList.add('leaving'), 2600);
  window.setTimeout(() => node.remove(), 3200);
}

const activity = () => activityById(app, ui.activityId);
const roster = () => app.rosters.find((item) => item.id === ui.rosterId) ?? null;
const prizeSet = () => app.prizeSets.find((item) => item.id === ui.prizeSetId) ?? null;

/* ---------- 左右两栏 ---------- */

function renderShell() {
  return h(
    'div',
    { class: 'shell' },
    h(
      'aside',
      { class: 'side' },
      h(
        'div',
        { class: 'side-head' },
        h('span', { class: 'side-title', text: modeLabel() }),
        h('button', {
          class: 'side-add',
          type: 'button',
          text: '+',
          'aria-label': `新建${modeLabel()}`,
          onClick: onSideAdd,
        }),
      ),
      renderSideList(),
      h(
        'div',
        { class: 'side-foot' },
        [
          ['lotteries', '抽奖'],
          ['rosters', '名单'],
          ['prizes', '奖品'],
        ].map(([mode, label]) =>
          h('button', {
            class: `side-tab${ui.mode === mode ? ' active' : ''}`,
            type: 'button',
            text: label,
            onClick: () => {
              ui.mode = mode;
              ui.dialog = null;
              render();
            },
          }),
        ),
      ),
    ),
    h('main', { class: 'main' }, renderMainPane()),
    ui.dialog === 'new' ? renderNewDialog() : null,
    ui.dialog === 'results' ? renderResultsDialog() : null,
  );
}

function modeLabel() {
  return ui.mode === 'rosters' ? '名单' : ui.mode === 'prizes' ? '奖品' : '抽奖';
}

function onSideAdd() {
  if (ui.mode === 'lotteries') {
    ui.draft = null;
    ui.dialog = 'new';
    render();
    return;
  }
  if (ui.mode === 'rosters') {
    ui.importTarget = 'roster';
    fileEl.click();
    return;
  }
  ui.importTarget = 'prize';
  fileEl.click();
}

function renderSideList() {
  const items =
    ui.mode === 'rosters' ? app.rosters : ui.mode === 'prizes' ? app.prizeSets : app.activities;

  if (items.length === 0) {
    return h('p', {
      class: 'side-empty',
      text:
        ui.mode === 'rosters'
          ? '还没有名单'
          : ui.mode === 'prizes'
            ? '还没有奖品'
            : '还没有抽奖',
    });
  }

  return h(
    'ol',
    { class: 'side-list' },
    items.map((item) =>
      h(
        'li',
        {},
        h('button', {
          class: `side-item${item.id === currentId() ? ' active' : ''}`,
          type: 'button',
          text: ui.mode === 'lotteries' ? item.title : item.name,
          onClick: () => {
            if (ui.mode === 'rosters') {
              ui.rosterId = item.id;
            } else if (ui.mode === 'prizes') {
              ui.prizeSetId = item.id;
            } else {
              ui.activityId = item.id;
            }
            render();
          },
        }),
      ),
    ),
  );
}

function currentId() {
  if (ui.mode === 'rosters') {
    return ui.rosterId;
  }
  if (ui.mode === 'prizes') {
    return ui.prizeSetId;
  }
  return ui.activityId;
}

function renderMainPane() {
  if (ui.mode === 'rosters') {
    return renderRosterPane();
  }
  if (ui.mode === 'prizes') {
    return renderPrizeSetPane();
  }
  return renderActivityPane();
}

/* ---------- 抽奖详情 ---------- */

function renderActivityPane() {
  const item = activity();
  if (item === null) {
    return h(
      'div',
      { class: 'pane-empty-full' },
      h('p', { class: 'empty-title', text: '还没有选中的抽奖' }),
      h('p', { class: 'empty-sub', text: '点左上角的 + 新建一场；名单与奖品可以在左下角切换过去维护。' }),
      h('button', { class: 'primary', type: 'button', text: '新建抽奖', onClick: onSideAdd }),
    );
  }
  const { total, handed } = activitySummary(item);

  return h(
    'div',
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
          app = updateActivity(app, item.id, { title: value });
          saveApp(app);
        },
      }),
      h('p', {
        class: 'detail-meta',
        text: `${MODE_LABELS[item.mode]} · ${stageLabel(item.stage)} · 每次抽 ${item.batch} 人 · ${handed} / ${total} 已抽出`,
      }),
    ),
    h(
      'div',
      { class: 'detail-body' },
      renderPrizePane(item),
      renderPeoplePane(item),
    ),
    h(
      'footer',
      { class: 'detail-foot' },
      h(
        'div',
        { class: 'settings' },
        h(
          'label',
          { class: 'setting' },
          h('span', { text: '每次' }),
          h(
            'select',
            {
              onChange: (event) => {
                app = updateActivity(app, item.id, { batch: Number(event.currentTarget.value) });
                saveApp(app);
                render();
              },
            },
            [1, 2, 3, 5, 10].map((size) =>
              h('option', { value: String(size), text: `${size} 人`, selected: item.batch === size }),
            ),
          ),
        ),
        h(
          'label',
          { class: 'setting' },
          h('span', { text: '形态' }),
          h(
            'select',
            {
              onChange: (event) => {
                app = updateActivity(app, item.id, { stage: event.currentTarget.value });
                saveApp(app);
                render();
              },
            },
            STAGES.map((stage) =>
              h('option', { value: stage.id, text: stage.label, selected: item.stage === stage.id }),
            ),
          ),
        ),
        h(
          'label',
          { class: 'setting' },
          h('input', {
            type: 'checkbox',
            checked: item.uniqueWinner,
            onChange: (event) => {
              app = updateActivity(app, item.id, { uniqueWinner: event.currentTarget.checked });
              saveApp(app);
              render();
            },
          }),
          h('span', { text: '不重复中奖' }),
        ),
        h('button', {
          class: 'link danger',
          type: 'button',
          text: '删除',
          onClick: () => {
            if (!window.confirm(`删除「${item.title}」？名单与奖品不受影响。`)) {
              return;
            }
            app = removeActivity(app, item.id);
            ui.activityId = app.activities[0]?.id ?? null;
            saveApp(app);
            render();
          },
        }),
      ),
      h(
        'div',
        { class: 'detail-actions' },
        h('button', { class: 'ghost', type: 'button', text: '结果', onClick: () => openResults() }),
        h('button', {
          class: 'ghost',
          type: 'button',
          text: '彩排',
          title: '走一遍流程，结束后可清空',
          onClick: () => openDraw(true),
        }),
        h('button', {
          class: 'primary',
          type: 'button',
          text: handed === 0 ? '开始抽奖' : '继续抽奖',
          onClick: () => openDraw(false),
        }),
      ),
    ),
  );
}

function renderPrizePane(item) {
  const view = { prizes: item.prizes, results: item.results };
  const write = (prizes) => {
    app = patchActivityPools(app, item.id, { prizes });
    saveApp(app);
    render();
  };

  return h(
    'section',
    { class: 'pane' },
    h(
      'header',
      { class: 'pane-head' },
      h('h2', { class: 'pane-title', text: '奖品' }),
      h('span', {
        class: 'pane-count',
        text: `${item.prizes.length} 项 · ${item.prizes.reduce((n, p) => n + p.count, 0)} 个名额`,
      }),
      h('button', {
        class: 'link',
        type: 'button',
        text: '+ 加一项',
        onClick: () => {
          const [next] = addPrize({ prizes: item.prizes }, { name: '新奖品', count: 1 });
          write(next.prizes);
        },
      }),
    ),
    item.prizes.length === 0
      ? h('p', { class: 'pane-empty', text: '还没有奖品。' })
      : h(
          'ol',
          { class: 'rows-edit' },
          item.prizes.map((prize) => {
            const drawn = prizeDrawn(view, prize.id);
            return h(
              'li',
              { class: 'edit-row' },
              h('input', {
                class: 'edit-text',
                type: 'text',
                value: prize.name,
                'aria-label': '奖品名称',
                onInput: (event) => {
                  const value = event.currentTarget.value;
                  app = patchActivityPools(app, item.id, {
                    prizes: item.prizes.map((p) => (p.id === prize.id ? { ...p, name: value } : p)),
                  });
                  saveApp(app);
                },
              }),
              h('span', { class: 'edit-progress', text: `${drawn} / ${prize.count}` }),
              h('input', {
                class: 'edit-count',
                type: 'number',
                min: String(Math.max(1, drawn)),
                value: String(prize.count),
                'aria-label': '名额',
                onChange: (event) => {
                  const value = Math.max(drawn, Math.floor(Number(event.currentTarget.value) || 1));
                  app = patchActivityPools(app, item.id, {
                    prizes: item.prizes.map((p) => (p.id === prize.id ? { ...p, count: value } : p)),
                  });
                  saveApp(app);
                  render();
                },
              }),
              h('button', {
                class: 'icon-button',
                type: 'button',
                text: '×',
                'aria-label': '删除奖品',
                onClick: () => write(item.prizes.filter((p) => p.id !== prize.id)),
              }),
            );
          }),
        ),
  );
}

function renderPeoplePane(item) {
  const view = { people: item.people, results: item.results };
  const write = (people) => {
    app = patchActivityPools(app, item.id, { people });
    saveApp(app);
    render();
  };

  return h(
    'section',
    { class: 'pane' },
    h(
      'header',
      { class: 'pane-head' },
      h('h2', { class: 'pane-title', text: '名单' }),
      h('span', { class: 'pane-count', text: `${item.people.length} 人` }),
      h('button', {
        class: 'link',
        type: 'button',
        text: '+ 加一人',
        onClick: () => {
          const [next] = addPerson({ people: item.people }, { name: '新参与人' });
          write(next.people);
        },
      }),
    ),
    item.people.length === 0
      ? h('p', { class: 'pane-empty', text: '还没有名单。' })
      : h(
          'ol',
          { class: 'rows-edit' },
          item.people.map((person) => {
            const won = hasWon(view, person.id);
            return h(
              'li',
              { class: `edit-row person${won ? ' won' : ''}` },
              h('input', {
                class: 'edit-text',
                type: 'text',
                value: person.name,
                'aria-label': '姓名',
                onInput: (event) => {
                  const value = event.currentTarget.value;
                  app = patchActivityPools(app, item.id, {
                    people: item.people.map((p) => (p.id === person.id ? { ...p, name: value } : p)),
                  });
                  saveApp(app);
                },
              }),
              h('input', {
                class: 'edit-sub',
                type: 'text',
                value: person.dept ?? '',
                placeholder: '部门',
                'aria-label': '部门',
                onInput: (event) => {
                  const value = event.currentTarget.value;
                  app = patchActivityPools(app, item.id, {
                    people: item.people.map((p) => (p.id === person.id ? { ...p, dept: value } : p)),
                  });
                  saveApp(app);
                },
              }),
              won ? h('span', { class: 'edit-flag', text: '已中奖' }) : h('span', { class: 'edit-flag' }),
              h('button', {
                class: 'icon-button',
                type: 'button',
                text: '×',
                'aria-label': '删除这个人',
                onClick: () => write(item.people.filter((p) => p.id !== person.id)),
              }),
            );
          }),
        ),
  );
}

/* ---------- 名单详情 ---------- */

function renderRosterPane() {
  const item = roster();
  if (item === null) {
    return h(
      'div',
      { class: 'pane-empty-full' },
      h('p', { class: 'empty-title', text: '还没有名单' }),
      h('p', { class: 'empty-sub', text: '点左上角的 + 上传一份含「姓名」列的 xlsx。' }),
      h('button', {
        class: 'primary',
        type: 'button',
        text: '上传 xlsx',
        onClick: () => {
          ui.importTarget = 'roster';
          fileEl.click();
        },
      }),
    );
  }
  const write = (people) => {
    app = updateRoster(app, item.id, { people });
    saveApp(app);
    render();
  };

  return h(
    'div',
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
          const value = event.currentTarget.value;
          app = updateRoster(app, item.id, { name: value });
          saveApp(app);
        },
      }),
      h('p', { class: 'detail-meta', text: `${item.people.length} 人 · 改这里不影响已经建好的抽奖` }),
    ),
    h(
      'ol',
      { class: 'rows-edit wide' },
      item.people.map((person) =>
        h(
          'li',
          { class: 'edit-row person' },
          h('input', {
            class: 'edit-text',
            type: 'text',
            value: person.name,
            'aria-label': '姓名',
            onInput: (event) => {
              const value = event.currentTarget.value;
              app = updateRoster(app, item.id, {
                people: item.people.map((p) => (p.id === person.id ? { ...p, name: value } : p)),
              });
              saveApp(app);
            },
          }),
          h('input', {
            class: 'edit-sub',
            type: 'text',
            value: person.dept ?? '',
            placeholder: '部门',
            'aria-label': '部门',
            onInput: (event) => {
              const value = event.currentTarget.value;
              app = updateRoster(app, item.id, {
                people: item.people.map((p) => (p.id === person.id ? { ...p, dept: value } : p)),
              });
              saveApp(app);
            },
          }),
          h('input', {
            class: 'edit-sub',
            type: 'text',
            value: person.employeeId ?? '',
            placeholder: '工号',
            'aria-label': '工号',
            onInput: (event) => {
              const value = event.currentTarget.value;
              app = updateRoster(app, item.id, {
                people: item.people.map((p) => (p.id === person.id ? { ...p, employeeId: value } : p)),
              });
              saveApp(app);
            },
          }),
          h('button', {
            class: 'icon-button',
            type: 'button',
            text: '×',
            'aria-label': '删除这个人',
            onClick: () => write(item.people.filter((p) => p.id !== person.id)),
          }),
        ),
      ),
    ),
    h(
      'footer',
      { class: 'detail-foot' },
      h(
        'div',
        { class: 'settings' },
        h('button', {
          class: 'link danger',
          type: 'button',
          text: '删除这份名单',
          onClick: () => {
            if (!window.confirm(`删除名单「${item.name}」？已经建好的抽奖不受影响。`)) {
              return;
            }
            app = removeRoster(app, item.id);
            ui.rosterId = app.rosters[0]?.id ?? null;
            saveApp(app);
            render();
          },
        }),
      ),
      h(
        'div',
        { class: 'detail-actions' },
        h('button', {
          class: 'ghost',
          type: 'button',
          text: '追加 xlsx',
          onClick: () => {
            ui.importTarget = 'roster-append';
            fileEl.click();
          },
        }),
        h('button', {
          class: 'primary',
          type: 'button',
          text: '加一人',
          onClick: () => {
            const [next] = addPerson({ people: item.people }, { name: '新参与人' });
            write(next.people);
          },
        }),
      ),
    ),
  );
}

/* ---------- 奖品详情 ---------- */

function renderPrizeSetPane() {
  const item = prizeSet();
  if (item === null) {
    return h(
      'div',
      { class: 'pane-empty-full' },
      h('p', { class: 'empty-title', text: '还没有奖品' }),
      h('p', { class: 'empty-sub', text: '点左上角的 + 上传一份含「奖品名称」「数量」两列的 xlsx。' }),
      h('button', {
        class: 'primary',
        type: 'button',
        text: '上传 xlsx',
        onClick: () => {
          ui.importTarget = 'prize';
          fileEl.click();
        },
      }),
    );
  }
  const write = (prizes) => {
    app = updatePrizeSet(app, item.id, { prizes });
    saveApp(app);
    render();
  };

  return h(
    'div',
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
          const value = event.currentTarget.value;
          app = updatePrizeSet(app, item.id, { name: value });
          saveApp(app);
        },
      }),
      h('p', {
        class: 'detail-meta',
        text: `${item.prizes.length} 项 · ${item.prizes.reduce((n, p) => n + p.count, 0)} 个名额 · 改这里不影响已经建好的抽奖`,
      }),
    ),
    h(
      'ol',
      { class: 'rows-edit wide' },
      item.prizes.map((prize) =>
        h(
          'li',
          { class: 'edit-row' },
          h('input', {
            class: 'edit-text',
            type: 'text',
            value: prize.name,
            'aria-label': '奖品名称',
            onInput: (event) => {
              const value = event.currentTarget.value;
              write(item.prizes.map((p) => (p.id === prize.id ? { ...p, name: value } : p)));
            },
          }),
          h('input', {
            class: 'edit-count',
            type: 'number',
            min: '1',
            value: String(prize.count),
            'aria-label': '名额',
            onChange: (event) => {
              const value = Math.max(1, Math.floor(Number(event.currentTarget.value) || 1));
              write(item.prizes.map((p) => (p.id === prize.id ? { ...p, count: value } : p)));
            },
          }),
          h('button', {
            class: 'icon-button',
            type: 'button',
            text: '×',
            'aria-label': '删除奖品',
            onClick: () => write(item.prizes.filter((p) => p.id !== prize.id)),
          }),
        ),
      ),
    ),
    h(
      'footer',
      { class: 'detail-foot' },
      h(
        'div',
        { class: 'settings' },
        h('button', {
          class: 'link danger',
          type: 'button',
          text: '删除这套奖品',
          onClick: () => {
            if (!window.confirm(`删除奖品「${item.name}」？已经建好的抽奖不受影响。`)) {
              return;
            }
            app = removePrizeSet(app, item.id);
            ui.prizeSetId = app.prizeSets[0]?.id ?? null;
            saveApp(app);
            render();
          },
        }),
      ),
      h(
        'div',
        { class: 'detail-actions' },
        h('button', {
          class: 'ghost',
          type: 'button',
          text: '追加 xlsx',
          onClick: () => {
            ui.importTarget = 'prize-append';
            fileEl.click();
          },
        }),
        h('button', {
          class: 'primary',
          type: 'button',
          text: '加一项',
          onClick: () => {
            const [next] = addPrize({ prizes: item.prizes }, { name: '新奖品', count: 1 });
            write(next.prizes);
          },
        }),
      ),
    ),
  );
}

/* ---------- 新建弹窗 ---------- */

function renderNewDialog() {
  const draft =
    ui.draft ?? {
      title: '',
      mode: MODE.PRIZE,
      rosterId: app.rosters[0]?.id ?? '',
      prizeSetId: app.prizeSets[0]?.id ?? '',
      batch: 1,
      stage: DEFAULT_STAGE,
      uniqueWinner: true,
    };
  const set = (patch) => {
    ui.draft = { ...draft, ...patch };
    render();
  };

  const modeCard = (id, title, text) =>
    h(
      'button',
      {
        class: `choice${draft.mode === id ? ' selected' : ''}`,
        type: 'button',
        onClick: () => set({ mode: id }),
      },
      h('span', { class: 'choice-title', text: title }),
      h('span', { class: 'choice-text', text }),
    );

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
      'div',
      { class: 'dialog', role: 'dialog', 'aria-label': '新建抽奖' },
      h(
        'header',
        { class: 'dialog-head' },
        h('h2', { class: 'dialog-title', text: '新建抽奖' }),
        h('button', { class: 'icon-button', type: 'button', text: '×', 'aria-label': '关闭', onClick: closeDialog }),
      ),
      h(
        'div',
        { class: 'dialog-body' },
        h(
          'label',
          { class: 'field' },
          h('span', { class: 'field-label', text: '名称' }),
          h('input', {
            class: 'field-input',
            type: 'text',
            value: draft.title,
            placeholder: '2026 年会',
            onInput: (event) => {
              ui.draft = { ...draft, title: event.currentTarget.value };
            },
          }),
        ),
        h(
          'div',
          { class: 'field' },
          h('span', { class: 'field-label', text: '抽法' }),
          h(
            'div',
            { class: 'choices' },
            modeCard(MODE.PRIZE, '奖品抽人', '先定一支签，再抽出中奖的人。年会大屏。'),
            modeCard(MODE.PERSON, '人抽奖品', '每个人上来抽一次，抽到什么由奖池决定。摊位。'),
          ),
        ),
        h(
          'div',
          { class: 'field-grid' },
          h(
            'label',
            { class: 'field' },
            h('span', { class: 'field-label', text: '名单' }),
            h(
              'select',
              {
                class: 'field-select',
                onChange: (event) => {
                  const value = event.currentTarget.value;
                  if (value === '__upload__') {
                    ui.importTarget = 'draft-roster';
                    fileEl.click();
                    return;
                  }
                  set({ rosterId: value });
                },
              },
              h('option', { value: '', text: '现场名单（空的）', selected: draft.rosterId === '' }),
              app.rosters.map((item) =>
                h('option', {
                  value: item.id,
                  text: `${item.name} · ${item.people.length} 人`,
                  selected: item.id === draft.rosterId,
                }),
              ),
              h('option', { value: '__upload__', text: '上传 xlsx…' }),
            ),
          ),
          h(
            'label',
            { class: 'field' },
            h('span', { class: 'field-label', text: '奖品' }),
            h(
              'select',
              {
                class: 'field-select',
                onChange: (event) => {
                  const value = event.currentTarget.value;
                  if (value === '__upload__') {
                    ui.importTarget = 'draft-prize';
                    fileEl.click();
                    return;
                  }
                  set({ prizeSetId: value });
                },
              },
              h('option', { value: '', text: '现场奖品（空的）', selected: draft.prizeSetId === '' }),
              app.prizeSets.map((item) =>
                h('option', {
                  value: item.id,
                  text: `${item.name} · ${item.prizes.length} 项`,
                  selected: item.id === draft.prizeSetId,
                }),
              ),
              h('option', { value: '__upload__', text: '上传 xlsx…' }),
            ),
          ),
        ),
        h(
          'div',
          { class: 'field-grid' },
          h(
            'label',
            { class: 'field' },
            h('span', { class: 'field-label', text: '每次抽几人' }),
            h(
              'select',
              {
                class: 'field-select',
                onChange: (event) => set({ batch: Number(event.currentTarget.value) }),
              },
              [1, 2, 3, 5, 10].map((size) =>
                h('option', { value: String(size), text: `${size} 人`, selected: draft.batch === size }),
              ),
            ),
          ),
          h(
            'label',
            { class: 'field' },
            h('span', { class: 'field-label', text: '形态' }),
            h(
              'select',
              {
                class: 'field-select',
                onChange: (event) => set({ stage: event.currentTarget.value }),
              },
              STAGES.map((stage) =>
                h('option', {
                  value: stage.id,
                  text: stage.label,
                  selected: draft.stage === stage.id,
                }),
              ),
            ),
          ),
        ),
        h(
          'label',
          { class: 'check' },
          h('input', {
            type: 'checkbox',
            checked: draft.uniqueWinner,
            onChange: (event) => set({ uniqueWinner: event.currentTarget.checked }),
          }),
          h('span', { text: '已中奖的人不再进池' }),
        ),
      ),
      h(
        'footer',
        { class: 'dialog-foot' },
        h('button', { class: 'ghost', type: 'button', text: '取消', onClick: closeDialog }),
        h('button', {
          class: 'primary',
          type: 'button',
          text: '创建',
          onClick: () => {
            const final = ui.draft ?? draft;
            const [next, created] = createActivity(app, {
              title: final.title,
              mode: final.mode,
              stage: final.stage,
              batch: final.batch,
              uniqueWinner: final.uniqueWinner,
              rosterId: final.rosterId,
              prizeSetId: final.prizeSetId,
            });
            app = next;
            ui.activityId = created.id;
            ui.mode = 'lotteries';
            ui.draft = null;
            ui.dialog = null;
            saveApp(app);
            render();
          },
        }),
      ),
    ),
  );
}

function closeDialog() {
  ui.dialog = null;
  ui.draft = null;
  render();
}

/* ---------- 结果弹窗 ---------- */

function openResults() {
  const item = activity();
  if (item === null) {
    return;
  }
  if (item.results.length === 0) {
    toast('还没有开奖记录');
    return;
  }
  ui.dialog = 'results';
  render();
}

function renderResultsDialog() {
  const item = activity();
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
      'div',
      { class: 'dialog dialog-wide', role: 'dialog', 'aria-label': '开奖结果' },
      h(
        'header',
        { class: 'dialog-head' },
        h('h2', { class: 'dialog-title', text: '开奖结果' }),
        h('span', { class: 'dialog-sub', text: `${item.title} · ${rows.length} 人` }),
        h('button', { class: 'icon-button', type: 'button', text: '×', 'aria-label': '关闭', onClick: closeDialog }),
      ),
      h(
        'div',
        { class: 'dialog-body' },
        h(
          'div',
          { class: 'switch', role: 'group', 'aria-label': '排序' },
          [
            ['prize', '按奖项'],
            ['time', '按时间'],
          ].map(([id, label]) =>
            h('button', {
              class: `switch-item${ui.resultsView === id ? ' active' : ''}`,
              type: 'button',
              text: label,
              onClick: () => {
                ui.resultsView = id;
                render();
              },
            }),
          ),
        ),
        ui.resultsView === 'prize'
          ? renderResultsByPrize(item, rows)
          : renderResultsByTime(rows),
      ),
      h(
        'footer',
        { class: 'dialog-foot' },
        h('button', {
          class: 'ghost',
          type: 'button',
          text: '清空记录',
          onClick: () => {
            if (!window.confirm('清空这场抽奖的全部记录？名单与奖品会留着。')) {
              return;
            }
            app = {
              ...app,
              activities: app.activities.map((entry) =>
                entry.id === item.id ? { ...entry, results: [], excluded: [] } : entry,
              ),
            };
            saveApp(app);
            render();
          },
        }),
        h('button', {
          class: 'ghost',
          type: 'button',
          text: '撤销上一次',
          onClick: () => {
            app = {
              ...app,
              activities: app.activities.map((entry) =>
                entry.id === item.id ? { ...entry, results: entry.results.slice(0, -1) } : entry,
              ),
            };
            saveApp(app);
            render();
            toast('已撤销最后一次开奖');
          },
        }),
        h('button', {
          class: 'primary',
          type: 'button',
          text: '导出 xlsx',
          onClick: async () => {
            const bytes = await buildResultWorkbook(item);
            downloadBytes(
              `${item.title || '抽奖'}结果-${new Date().toISOString().slice(0, 10)}.xlsx`,
              bytes,
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            );
          },
        }),
      ),
    ),
  );
}

function renderResultsByPrize(item, rows) {
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
          'ol',
          { class: 'group-rows' },
          group.rows.map((row) =>
            h(
              'li',
              { class: 'group-row' },
              h('span', { class: 'row-num', text: String(row.order).padStart(2, '0') }),
              h('span', { class: 'group-name', text: row.winner.name }),
              h('span', { class: 'group-dept', text: row.winner.dept ?? '' }),
              h('span', { class: 'group-employee', text: row.winner.employeeId ?? '' }),
              h('span', { class: 'group-time', text: clockTime(row.result.at) }),
            ),
          ),
        ),
      ),
    ),
  );
}

function renderResultsByTime(rows) {
  return h(
    'ol',
    { class: 'rows-edit' },
    rows
      .slice()
      .reverse()
      .map((row) =>
        h(
          'li',
          { class: 'edit-row result' },
          h('span', { class: 'row-num', text: String(row.order).padStart(2, '0') }),
          h(
            'span',
            { class: 'result-main' },
            h('span', { class: 'result-name', text: row.winner.name }),
            h('span', { class: 'result-prize', text: row.result.prizeName }),
          ),
          h('span', { class: 'result-dept', text: row.winner.dept ?? '' }),
          h('span', { class: 'row-num', text: clockTime(row.result.at) }),
        ),
      ),
  );
}

/* ---------- 抽奖页 ---------- */

function openDraw(rehearsal) {
  const item = activity();
  if (item === null) {
    return;
  }
  if (item.people.length === 0) {
    toast('这份名单是空的，先加人');
    return;
  }
  ui.rehearsal = rehearsal;
  ui.spinning = false;
  ui.revealed = false;
  ui.selectedPrizeId = null;
  ui.personPickId = null;
  run = runState(item);
  ui.drawing = true;
  render();
}

function leaveDraw() {
  if (document.fullscreenElement !== null) {
    document.exitFullscreen?.();
  }
  destroyStage();
  run = null;
  ui.drawing = false;
  ui.spinning = false;
  ui.revealed = false;
}

function renderDraw() {
  if (run === null) {
    return h('main', { class: 'draw' });
  }
  const stageHost = h('div', { class: 'stage', id: 'stage' });

  return h(
    'main',
    { class: 'draw', id: 'draw' },
    h(
      'header',
      { class: 'draw-head' },
      h(
        'div',
        { class: 'draw-headline' },
        h('span', { class: 'draw-kicker', text: ui.rehearsal ? '彩排' : MODE_LABELS[run.mode] }),
        h('span', { class: 'draw-title', text: run.title }),
        h('span', { class: 'draw-meta', id: 'draw-meta', text: drawMeta() }),
      ),
      h(
        'div',
        { class: 'draw-actions' },
        h('button', {
          class: 'link',
          type: 'button',
          id: 'draw-fullscreen',
          text: document.fullscreenElement === null ? '全屏' : '退出全屏',
          onClick: toggleFullscreen,
        }),
        h('button', {
          class: 'link',
          type: 'button',
          text: '退出',
          onClick: () => {
            leaveDraw();
            render();
          },
        }),
      ),
    ),
    h(
      'div',
      { class: 'draw-body' },
      h(
        'aside',
        { class: 'queue' },
        h(
          'div',
          { class: 'queue-head' },
          h('span', { class: 'queue-label', text: run.mode === MODE.PRIZE ? '签' : '票' }),
          h('span', {
            class: 'queue-count',
            text:
              run.mode === MODE.PRIZE
                ? `${availablePrizes(run).length} / ${run.prizes.length}`
                : `${eligiblePeople(run).length} / ${run.people.length}`,
          }),
        ),
        h('ol', { class: 'queue-list', id: 'queue' }),
      ),
      h('div', { class: 'booth' }, stageHost, h('div', { class: 'idle', id: 'idle' })),
    ),
    h(
      'footer',
      { class: 'draw-foot' },
      h('div', { class: 'draw-status', id: 'draw-status' }),
      ui.rehearsal
        ? h('button', { class: 'link', type: 'button', text: '清空彩排记录', onClick: clearRehearsal })
        : null,
      h('button', {
        class: 'draw-action',
        type: 'button',
        id: 'draw-action',
        text: '开始',
        onClick: onDrawAction,
      }),
      h('div', { class: 'draw-hint', text: '空格 开始 / 停 · ↑↓ 换 · 退格 撤销 · Delete 作废 · Esc 退出' }),
    ),
  );
}

function drawMeta() {
  const total = run.prizes.reduce((sum, prize) => sum + prize.count, 0);
  const handed = run.results.reduce((sum, result) => sum + result.winners.length, 0);
  return `${run.prizes.length} 支签 · ${total} 个名额 · 已抽 ${handed}`;
}

function currentPrize() {
  const picked = run.prizes.find((prize) => prize.id === ui.selectedPrizeId);
  if (picked !== undefined && prizeRemaining(run, picked.id) > 0) {
    return picked;
  }
  return availablePrizes(run)[0] ?? null;
}

function pickedPerson() {
  if (ui.personPickId !== null) {
    const picked = run.people.find((person) => person.id === ui.personPickId);
    if (picked !== undefined && !(run.uniqueWinner && hasWon(run, picked.id))) {
      return picked;
    }
  }
  return nextPerson(run);
}

function allDrawn() {
  return availablePrizes(run).length === 0 || eligiblePeople(run).length === 0;
}

function paintDraw() {
  if (run === null) {
    return;
  }
  const meta = document.getElementById('draw-meta');
  if (meta !== null) {
    meta.textContent = drawMeta();
  }
  paintQueue();
  paintIdle();
  paintFoot();
}

function paintQueue() {
  const list = document.getElementById('queue');
  if (list === null) {
    return;
  }
  clear(list);

  if (run.mode === MODE.PRIZE) {
    for (const [index, prize] of run.prizes.entries()) {
      const drawn = prizeDrawn(run, prize.id);
      const left = Math.max(0, prize.count - drawn);
      const selected = currentPrize()?.id === prize.id;
      list.append(
        h(
          'li',
          { class: `qrow${selected ? ' selected' : ''}${left === 0 ? ' done' : ''}` },
          h('span', { class: 'qrow-num', text: String(index + 1).padStart(2, '0') }),
          h(
            'span',
            { class: 'qrow-main' },
            h('span', { class: 'qrow-name', text: prize.name }),
            h('span', { class: 'qrow-bar' }, h('i', { style: `width:${prize.count === 0 ? 0 : (drawn / prize.count) * 100}%` })),
          ),
          h('span', { class: 'qrow-count', text: `${drawn}/${prize.count}` }),
          h('button', {
            class: 'qrow-start',
            type: 'button',
            text: left === 0 ? '满' : ui.spinning && selected ? '停' : '开始',
            disabled: left === 0 || (ui.spinning && !selected),
            onClick: () => {
              if (ui.spinning && selected) {
                stopDraw();
                return;
              }
              ui.selectedPrizeId = prize.id;
              ui.personPickId = null;
              startDraw();
            },
          }),
        ),
      );
    }
    return;
  }

  const pool = eligiblePeople(run);
  if (pool.length === 0) {
    list.append(h('li', { class: 'qrow done' }, h('span', { class: 'qrow-name', text: '票都抽完了' })));
    return;
  }
  const picked = pickedPerson();
  for (const [index, person] of pool.entries()) {
    const selected = picked?.id === person.id;
    list.append(
      h(
        'li',
        { class: `qrow${selected ? ' selected' : ''}` },
        h('span', { class: 'qrow-num', text: String(index + 1).padStart(2, '0') }),
        h(
          'span',
          { class: 'qrow-main' },
          h('span', { class: 'qrow-name', text: person.name }),
          h('span', { class: 'qrow-sub', text: person.dept || '' }),
        ),
        h('span', { class: 'qrow-count', text: person.employeeId || '' }),
        h('button', {
          class: 'qrow-start',
          type: 'button',
          text: ui.spinning && selected ? '停' : '开始',
          disabled: ui.spinning && !selected,
          onClick: () => {
            if (ui.spinning && selected) {
              stopDraw();
              return;
            }
            ui.personPickId = person.id;
            startDraw();
          },
        }),
      ),
    );
  }
}

function paintIdle() {
  const idle = document.getElementById('idle');
  if (idle === null) {
    return;
  }
  clear(idle);
  const showing = !ui.spinning && !ui.revealed;
  idle.classList.toggle('on', showing);
  if (!showing) {
    return;
  }
  if (allDrawn()) {
    idle.append(
      el('div', 'idle-label', '抽完了'),
      el('div', 'idle-main', '看结果'),
      el('div', 'idle-note', `共 ${run.results.reduce((n, r) => n + r.winners.length, 0)} 人中奖`),
    );
    return;
  }
  if (run.mode === MODE.PRIZE) {
    const prize = currentPrize();
    if (prize === null) {
      return;
    }
    idle.append(
      el('div', 'idle-label', '下一支'),
      el('div', 'idle-main', prize.name),
      el('div', 'idle-note', `还剩 ${prizeRemaining(run, prize.id)} 个名额 · 一次抽 ${Math.min(activity()?.batch ?? 1, prizeRemaining(run, prize.id))} 人`),
    );
    return;
  }
  const person = pickedPerson();
  if (person === null) {
    return;
  }
  idle.append(
    el('div', 'idle-label', '请上台'),
    el('div', 'idle-main', person.name),
    el('div', 'idle-note', person.dept || '抽一次'),
  );
}

function paintFoot() {
  const status = document.getElementById('draw-status');
  if (status !== null) {
    status.textContent = drawStatusText();
  }
  const action = document.getElementById('draw-action');
  if (action === null) {
    return;
  }
  const done = allDrawn();
  action.textContent = ui.spinning ? '停' : done ? '看结果' : '开始';
  action.classList.toggle('running', ui.spinning);
  action.disabled = !ui.spinning && !done && !canDraw();
}

function canDraw() {
  return run.mode === MODE.PRIZE ? currentPrize() !== null : availablePrizes(run).length > 0;
}

function drawStatusText() {
  if (ui.spinning) {
    return '抽奖中 · 再按一次停下';
  }
  if (allDrawn()) {
    return '所有签都抽完了';
  }
  if (run.mode === MODE.PRIZE) {
    const prize = currentPrize();
    if (prize === null) {
      return '所有奖项都抽完了';
    }
    const left = prizeRemaining(run, prize.id);
    return `${ui.revealed ? '下一支' : '这一支'}：${prize.name} · 还剩 ${left} 个名额 · 一次抽 ${Math.min(activity()?.batch ?? 1, left)} 人`;
  }
  const person = pickedPerson();
  if (person === null) {
    return '名单里的人都抽过了';
  }
  return `这一位：${person.name}${person.dept ? ` · ${person.dept}` : ''}`;
}

function onDrawAction() {
  if (ui.spinning) {
    stopDraw();
    return;
  }
  if (allDrawn()) {
    leaveDraw();
    openResults();
    return;
  }
  startDraw();
}

function startDraw() {
  if (run.people.length === 0) {
    toast('还没有可抽的人');
    return;
  }
  if (run.mode === MODE.PRIZE && currentPrize() === null) {
    toast('所有奖项都抽完了');
    return;
  }
  if (run.mode === MODE.PERSON && pickedPerson() === null) {
    toast('名单里的人都抽过了');
    return;
  }
  if (ui.stage === null) {
    return;
  }
  ui.revealed = false;
  ui.stage.begin({ labels: eligiblePeople(run).map((person) => person.name) });
  ui.spinning = true;
  paintDraw();
}

function stopDraw() {
  let outcome;
  try {
    outcome =
      run.mode === MODE.PRIZE
        ? drawByPrize(run, currentPrize().id, activity()?.batch ?? 1)
        : drawByPerson(run, ui.personPickId ?? undefined);
  } catch (error) {
    ui.spinning = false;
    paintDraw();
    toast(error.message);
    return;
  }
  ui.spinning = false;
  ui.personPickId = null;
  ui.revealed = true;
  if (run.mode === MODE.PRIZE && prizeRemaining(outcome.state, outcome.prize.id) === 0) {
    ui.selectedPrizeId = availablePrizes(outcome.state)[0]?.id ?? null;
  }
  commitRun(outcome.state);
  ui.stage?.reveal({ winners: outcome.winners, prizeName: outcome.prize.name });
  paintDraw();
}

function stepSelection(direction) {
  if (ui.spinning || ui.revealed) {
    return;
  }
  if (run.mode === MODE.PRIZE) {
    const pool = availablePrizes(run);
    if (pool.length <= 1) {
      return;
    }
    const at = pool.findIndex((prize) => prize.id === currentPrize()?.id);
    ui.selectedPrizeId = pool[(at + direction + pool.length) % pool.length].id;
  } else {
    const pool = eligiblePeople(run);
    if (pool.length <= 1) {
      return;
    }
    const at = pool.findIndex((person) => person.id === pickedPerson()?.id);
    ui.personPickId = pool[(at + direction + pool.length) % pool.length].id;
  }
  ui.stage?.reset();
  paintDraw();
}

async function toggleFullscreen() {
  const draw = document.getElementById('draw');
  try {
    if (document.fullscreenElement === null) {
      await (draw.requestFullscreen?.() ?? Promise.reject(new Error('no fullscreen')));
    } else {
      await document.exitFullscreen?.();
    }
  } catch {
    toast('这个环境不让全屏；抽奖页本身已经铺满一屏');
  }
}

function undoInStage() {
  if (ui.spinning || run === null) {
    return;
  }
  if (run.results.length === 0) {
    toast('还没有可以撤销的开奖');
    return;
  }
  const last = run.results.at(-1);
  ui.revealed = false;
  ui.stage?.reset();
  commitRun(undoLast(run));
  toast(`已撤销：${last.prizeName}`);
}

function voidLastWinner() {
  if (ui.spinning || run === null) {
    return;
  }
  const result = run.results.at(-1);
  if (result === undefined) {
    toast('还没有可以作废的记录');
    return;
  }
  const winner = result.winners.at(-1);
  try {
    const next = voidWinner(run, result.id, winner.personId);
    ui.revealed = false;
    ui.stage?.reset();
    commitRun(next);
    toast(`${winner.name} 已作废，票移出池`);
  } catch (error) {
    toast(error.message);
  }
}

function clearRehearsal() {
  if (run === null || run.results.length === 0) {
    toast('彩排记录已经是空的');
    return;
  }
  if (!window.confirm('清空这次彩排的开奖记录？名单与奖品会留着。')) {
    return;
  }
  ui.revealed = false;
  ui.stage?.reset();
  commitRun({ ...run, results: [], excluded: [] });
  toast('彩排记录已清空');
}

/* ---------- 导入 ---------- */

async function downloadTemplate() {
  const bytes = await buildTemplateWorkbook();
  downloadBytes('抽奖模板.xlsx', bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

async function handleFile(file, target) {
  if (!/\.xlsx$/i.test(file.name)) {
    toast('只支持 .xlsx；.xls 或 .csv 请先另存一份');
    return;
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await readLotteryWorkbook(bytes);
    const name = file.name.replace(/\.xlsx$/i, '');

    const wantsRoster = target === 'roster' || target === 'roster-append' || target === 'draft-roster';
    if (wantsRoster) {
      if (result.people.length === 0) {
        toast('这份文件里没有名单（需要一张含「姓名」列的表）');
        return;
      }
      if (target === 'roster-append') {
        const item = roster();
        if (item === null) {
          return;
        }
        app = updateRoster(app, item.id, { people: [...item.people, ...result.people] });
        saveApp(app);
      } else {
        const [next, created] = addRoster(app, { name, people: result.people });
        app = next;
        saveApp(app);
        if (target === 'draft-roster') {
          ui.draft = { ...(ui.draft ?? {}), rosterId: created.id };
        } else {
          ui.mode = 'rosters';
          ui.rosterId = created.id;
        }
      }
      toast(`已读入 ${result.people.length} 人`);
      render();
      return;
    }

    if (result.prizes.length === 0) {
      toast('这份文件里没有奖品（需要一张含「奖品名称」的表）');
      return;
    }
    if (target === 'prize-append') {
      const item = prizeSet();
      if (item === null) {
        return;
      }
      app = updatePrizeSet(app, item.id, { prizes: [...item.prizes, ...result.prizes] });
      saveApp(app);
    } else {
      const [next, created] = addPrizeSet(app, { name, prizes: result.prizes });
      app = next;
      saveApp(app);
      if (target === 'draft-prize') {
        ui.draft = { ...(ui.draft ?? {}), prizeSetId: created.id };
      } else {
        ui.mode = 'prizes';
        ui.prizeSetId = created.id;
      }
    }
    toast(`已读入 ${result.prizes.length} 项奖品`);
    render();
  } catch (error) {
    toast(error instanceof Error ? error.message : '这份文件读不了');
  }
}

/* ---------- 事件 ---------- */

fileEl.addEventListener('change', (event) => {
  const file = event.currentTarget.files?.[0];
  const target =
    ui.importTarget ??
    (ui.mode === 'rosters' ? 'roster' : ui.mode === 'prizes' ? 'prize' : null);
  event.currentTarget.value = '';
  ui.importTarget = null;
  if (file !== undefined && target !== null) {
    handleFile(file, target);
  }
});

document.addEventListener('keydown', (event) => {
  if (ui.dialog !== null && event.key === 'Escape') {
    closeDialog();
    return;
  }
  if (!ui.drawing || run === null) {
    return;
  }
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '')) {
    return;
  }
  if (event.key === 'Escape') {
    if (document.fullscreenElement !== null) {
      document.exitFullscreen?.();
      return;
    }
    leaveDraw();
    render();
    return;
  }
  if (event.code === 'Space') {
    event.preventDefault();
    onDrawAction();
    return;
  }
  if (event.key === 'Backspace') {
    event.preventDefault();
    undoInStage();
    return;
  }
  if (event.key === 'Delete') {
    event.preventDefault();
    voidLastWinner();
    return;
  }
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault();
    stepSelection(event.key === 'ArrowDown' ? 1 : -1);
  }
});

document.addEventListener('fullscreenchange', () => {
  document.getElementById('draw')?.classList.toggle('is-full', document.fullscreenElement !== null);
  const button = document.getElementById('draw-fullscreen');
  if (button !== null) {
    button.textContent = document.fullscreenElement === null ? '全屏' : '退出全屏';
  }
});

window.addEventListener('pagehide', () => flushApp(app));
window.addEventListener('beforeunload', () => flushApp(app));

/* ---------- 启动 ---------- */

if (ui.activityId === null && app.activities.length > 0) {
  ui.activityId = app.activities[0].id;
}
if (ui.drawing) {
  const item = activity();
  if (item === null) {
    ui.drawing = false;
  } else {
    ui.rehearsal = false;
    run = runState(item);
  }
}

render();
