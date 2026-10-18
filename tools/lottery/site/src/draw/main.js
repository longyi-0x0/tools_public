/**
 * 抽奖页。
 *
 * 独立入口：只认 URL 上的 `?id=`，自己读存档、跑引擎、把结果写回去。
 * 与主页不共享 DOM、样式或状态；主页退出后回到 `index.html`。
 */

import {
  MODE,
  availablePrizes,
  drawByPerson,
  drawByPrize,
  eligiblePeople,
  nextPerson,
  prizeDrawn,
  prizeRemaining,
  undoLast,
  voidWinner,
} from '../engine.js';
import { lotteryById, runState, writeRunState } from '../data.js';
import { loadApp, saveApp, flushApp } from '../store.js';
import { createStage, stageLabel } from '../stages/index.js';
import { clear, el, h } from '../dom.js';

const params = new URLSearchParams(window.location.search);
const lotteryId = params.get('id');
const root = document.getElementById('draw');

let app = loadApp();
let lottery = lotteryId === null ? null : lotteryById(app, lotteryId);
let run = lottery === null ? null : runState(lottery);

const ui = {
  spinning: false,
  revealed: false,
  selectedPrizeId: null,
  personPickId: null,
  stage: null,
  resultsOpen: false,
};

/** 抽奖页的引擎状态。 */

if (lottery === null) {
  window.location.replace('./index.html');
} else if (lottery.people.length === 0) {
  root.append(
    h(
      'div',
      { class: 'result-scrim' },
      h(
        'div',
        { class: 'result-panel' },
        h('div', { class: 'result-head' }, h('h2', { text: '这份名单还是空的' })),
        h('div', { class: 'result-body' }, h('p', { text: '回主页加人，或导入一份名单。' })),
        h(
          'div',
          { class: 'result-foot' },
          h('button', { class: 'link', type: 'button', text: '回主页', onClick: goHome }),
        ),
      ),
    ),
  );
} else {
  mount();
}

/* ---------- 渲染 ---------- */

function goHome() {
  window.location.href = './index.html';
}

function mount() {
  clear(root);
  root.append(...renderShell());
  mountStage();
  paint();
}

function renderShell() {
  return [
    h(
      'header',
      { class: 'draw-head' },
      h(
        'div',
        { class: 'draw-headline' },
        h('span', { class: 'draw-title', text: run.title }),
        h('span', { class: 'draw-meta', id: 'draw-meta' }),
      ),
      h(
        'div',
        { class: 'draw-actions' },
        h('button', {
          class: 'link',
          type: 'button',
          id: 'draw-fullscreen',
          text: '全屏',
          onClick: toggleFullscreen,
        }),
        h('button', { class: 'link', type: 'button', text: '退出', onClick: goHome }),
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
          h('span', { class: 'queue-count', id: 'queue-count' }),
        ),
        h('ol', { class: 'queue-list', id: 'queue' }),
      ),
      h('div', { class: 'booth' }, h('div', { class: 'stage', id: 'stage' }), h('div', { class: 'idle', id: 'idle' })),
    ),
    h(
      'footer',
      { class: 'draw-foot' },
      h('div', { class: 'draw-status', id: 'draw-status' }),
      h('button', {
        class: 'draw-action',
        type: 'button',
        id: 'draw-action',
        text: '开始',
        onClick: onAction,
      }),
      h('div', { class: 'draw-hint', text: '空格 开始 / 停 · ↑↓ 换 · 退格 撤销 · Delete 作废 · Esc 退全屏' }),
    ),
  ];
}

function mountStage() {
  destroyStage();
  const host = document.getElementById('stage');
  if (host === null) {
    return;
  }
  const config = lottery.stageConfig?.[lottery.stage] ?? {};
  ui.stage = createStage(lottery.stage, host, config);
}

function destroyStage() {
  if (ui.stage !== null) {
    ui.stage.destroy();
    ui.stage = null;
  }
}

function paint() {
  const meta = document.getElementById('draw-meta');
  if (meta !== null) {
    meta.textContent = `${stageLabel(lottery.stage)} · ${run.prizes.length} 个奖项 · ${totalSlots()} 个名额 · 已抽 ${handed()}`;
  }
  paintQueue();
  paintIdle();
  paintFoot();
  paintResults();
}

function totalSlots() {
  return run.prizes.reduce((sum, prize) => sum + prize.count, 0);
}

function handed() {
  return run.results.reduce((sum, result) => sum + result.winners.length, 0);
}

function highlightedPrize() {
  if (ui.revealed) {
    return run.prizes.find((prize) => prize.id === ui.selectedPrizeId) ?? null;
  }
  return currentPrize();
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

function hasWon(state, personId) {
  return state.results.some((result) => result.winners.some((winner) => winner.personId === personId));
}

function allDrawn() {
  return availablePrizes(run).length === 0 || eligiblePeople(run).length === 0;
}

function paintQueue() {
  const list = document.getElementById('queue');
  const count = document.getElementById('queue-count');
  if (list === null) {
    return;
  }
  clear(list);
  if (count !== null) {
    count.textContent =
      run.mode === MODE.PRIZE
        ? `${availablePrizes(run).length} / ${run.prizes.length}`
        : `${eligiblePeople(run).length} / ${run.people.length}`;
  }

  if (run.mode === MODE.PRIZE) {
    const selected = highlightedPrize();
    for (const [index, prize] of run.prizes.entries()) {
      const drawn = prizeDrawn(run, prize.id);
      const left = Math.max(0, prize.count - drawn);
      const active = selected?.id === prize.id;
      list.append(
        h(
          'li',
          { class: `qrow${active ? ' selected' : ''}${left === 0 ? ' done' : ''}` },
          h('span', { class: 'qrow-num', text: String(index + 1).padStart(2, '0') }),
          h(
            'span',
            { class: 'qrow-main' },
            h('span', { class: 'qrow-name', text: prize.name }),
            h(
              'span',
              { class: 'qrow-bar' },
              h('i', { style: `width:${prize.count === 0 ? 0 : (drawn / prize.count) * 100}%` }),
            ),
          ),
          h('span', { class: 'qrow-count', text: `${drawn}/${prize.count}` }),
          h('button', {
            class: 'qrow-start',
            type: 'button',
            text: left === 0 ? '满' : ui.spinning && active ? '停' : '开始',
            disabled: left === 0 || (ui.spinning && !active),
            onClick: () => {
              if (ui.spinning && active) {
                stopDraw();
                return;
              }
              ui.selectedPrizeId = prize.id;
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
    const active = picked?.id === person.id;
    list.append(
      h(
        'li',
        { class: `qrow${active ? ' selected' : ''}` },
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
          text: ui.spinning && active ? '停' : '开始',
          disabled: ui.spinning && !active,
          onClick: () => {
            if (ui.spinning && active) {
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
  const showing = !ui.spinning && !ui.revealed && !ui.resultsOpen;
  idle.classList.toggle('on', showing);
  if (!showing) {
    return;
  }
  if (allDrawn()) {
    idle.append(
      el('div', 'idle-label', '抽完了'),
      el('div', 'idle-main', '看结果'),
      el('div', 'idle-note', `共 ${handed()} 人中奖`),
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
      el(
        'div',
        'idle-note',
        `还剩 ${prizeRemaining(run, prize.id)} 个名额 · 一次抽 ${Math.min(lottery.batch, prizeRemaining(run, prize.id))} 人`,
      ),
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
    status.textContent = statusText();
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

function statusText() {
  if (ui.spinning) {
    return '再按一次停下';
  }
  if (allDrawn()) {
    return `已抽完 · ${handed()} 人中奖`;
  }
  if (run.mode === MODE.PERSON && pickedPerson() === null) {
    return '名单已经抽完';
  }
  if (run.mode === MODE.PRIZE && currentPrize() === null) {
    return '奖项已经抽完';
  }
  // 待机时舞台上已经写清楚抽什么，这里不再复述
  return '';
}

/* ---------- 抽 ---------- */

function onAction() {
  if (ui.spinning) {
    stopDraw();
    return;
  }
  if (allDrawn()) {
    ui.resultsOpen = true;
    paint();
    return;
  }
  startDraw();
}

function startDraw() {
  if (ui.stage === null) {
    return;
  }
  if (run.mode === MODE.PRIZE) {
    const prize = currentPrize();
    if (prize === null) {
      toast('奖项已经抽完');
      return;
    }
    ui.selectedPrizeId = prize.id;
  } else {
    const person = pickedPerson();
    if (person === null) {
      toast('名单已经抽完');
      return;
    }
    ui.personPickId = person.id;
  }
  const labels =
    run.mode === MODE.PRIZE
      ? eligiblePeople(run).map((person) => person.name)
      : availablePrizes(run).map((prize) => prize.name);
  ui.revealed = false;
  ui.stage.begin({ labels });
  ui.spinning = true;
  paint();
}

function stopDraw() {
  let outcome;
  try {
    outcome =
      run.mode === MODE.PRIZE
        ? drawByPrize(run, currentPrize().id, lottery.batch)
        : drawByPerson(run, pickedPerson()?.id);
  } catch (error) {
    ui.spinning = false;
    paint();
    toast(error instanceof Error ? error.message : '这一抽没成');
    return;
  }
  run = outcome.state;
  ui.spinning = false;
  ui.revealed = true;
  ui.personPickId = null;
  if (run.mode === MODE.PRIZE) {
    ui.selectedPrizeId = outcome.prize.id;
  }
  commit();
  ui.stage?.reveal({
    winners: outcome.winners,
    prizeName: outcome.prize.name,
    focus: run.mode === MODE.PERSON ? 'prize' : 'people',
  });
  paint();
}

function commit() {
  app = writeRunState(app, lottery.id, run);
  lottery = lotteryById(app, lottery.id) ?? lottery;
  saveApp(app);
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
  paint();
}

function undoInStage() {
  if (ui.spinning) {
    return;
  }
  run = undoLast(run);
  ui.revealed = false;
  ui.selectedPrizeId = null;
  ui.stage?.reset();
  commit();
  paint();
  toast('已撤销上一次');
}

function voidLastWinner() {
  if (ui.spinning) {
    return;
  }
  const last = run.results[run.results.length - 1];
  if (last === undefined) {
    return;
  }
  const winner = last.winners[last.winners.length - 1];
  run = voidWinner(run, last.id, winner.personId);
  ui.revealed = false;
  ui.stage?.reset();
  commit();
  paint();
  toast(`已作废 ${winner.name}`);
}

/* ---------- 结果 ---------- */

function paintResults() {
  document.querySelector('.result-scrim')?.remove();
  if (!ui.resultsOpen) {
    return;
  }
  const groups = run.prizes
    .map((prize) => ({
      prize,
      rows: run.results.flatMap((result) =>
        result.prizeId === prize.id ? result.winners.map((winner) => ({ winner, at: result.at })) : [],
      ),
    }))
    .filter((group) => group.rows.length > 0);

  document.body.append(
    h(
      'div',
      { class: 'result-scrim', onClick: (event) => {
        if (event.target === event.currentTarget) {
          ui.resultsOpen = false;
          paint();
        }
      } },
      h(
        'div',
        { class: 'result-panel', role: 'dialog', 'aria-label': '开奖结果' },
        h(
          'div',
          { class: 'result-head' },
          h('h2', { text: '开奖结果' }),
          h('span', { class: 'draw-meta', text: `${run.title} · ${handed()} 人` }),
        ),
        h(
          'div',
          { class: 'result-body' },
          groups.map((group) =>
            h(
              'div',
              { class: 'result-group' },
              h('h3', { text: `${group.prize.name} · ${group.rows.length} / ${group.prize.count}` }),
              group.rows.map((row) =>
                h(
                  'div',
                  { class: 'result-row' },
                  h('span', { class: 'who', text: row.winner.name }),
                  h('span', { class: 'meta', text: [row.winner.dept, row.winner.employeeId].filter(Boolean).join(' · ') }),
                ),
              ),
            ),
          ),
        ),
        h(
          'div',
          { class: 'result-foot' },
          h('button', {
            class: 'link',
            type: 'button',
            text: '关闭',
            onClick: () => {
              ui.resultsOpen = false;
              paint();
            },
          }),
          h('button', { class: 'link', type: 'button', text: '回主页', onClick: goHome }),
        ),
      ),
    ),
  );
}

/* ---------- 全屏与键盘 ---------- */

function toggleFullscreen() {
  if (document.fullscreenElement === null) {
    document.documentElement.requestFullscreen?.().catch(() => toast('当前环境不支持全屏'));
    return;
  }
  document.exitFullscreen?.();
}

document.addEventListener('fullscreenchange', () => {
  root.classList.toggle('is-full', document.fullscreenElement !== null);
  const button = document.getElementById('draw-fullscreen');
  if (button !== null) {
    button.textContent = document.fullscreenElement === null ? '全屏' : '退出全屏';
  }
});

document.addEventListener('keydown', (event) => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '')) {
    return;
  }
  if (ui.resultsOpen) {
    if (event.key === 'Escape') {
      ui.resultsOpen = false;
      paint();
    }
    return;
  }
  if (event.key === 'Escape') {
    if (document.fullscreenElement !== null) {
      document.exitFullscreen?.();
    }
    return;
  }
  if (event.code === 'Space') {
    event.preventDefault();
    onAction();
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

/* ---------- 启动 ---------- */

function toast(message) {
  document.querySelector('.toast')?.remove();
  const node = el('div', 'toast', message);
  document.body.append(node);
  window.setTimeout(() => node.classList.add('leaving'), 2200);
  window.setTimeout(() => node.remove(), 2800);
}

window.addEventListener('pagehide', () => flushApp(app));
window.addEventListener('beforeunload', () => flushApp(app));
