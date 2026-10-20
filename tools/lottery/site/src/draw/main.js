/**
 * 抽奖页。
 *
 * 这一层只管引擎与键盘：读存档、算状态、把快照交给形态、把结果写回去。
 * 界面全部由形态自己画 —— 每种形态的受众不同，外壳不共用。
 *
 * 形态拿到的接口：
 *   create(host, config, api) -> { begin, reveal, reset, update, destroy }
 *   api: start / toggle / pickPrize / pickPerson / undo / voidLast / results / exit / fullscreen
 *   update(view): 每次状态变化都调，形态自己决定列表、按钮、计数长什么样。
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
  prizeWeight,
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

if (lottery === null) {
  window.location.replace('./index.html');
} else if (lottery.people.length === 0) {
  root.append(emptyState());
} else {
  mount();
}

/* ---------- 外壳 ---------- */

function emptyState() {
  return h(
    'div',
    { class: 'draw-empty' },
    h('p', { class: 'draw-empty-title', text: '这份名单还是空的' }),
    h('p', { class: 'draw-empty-note', text: '回主页加人，或导入一份名单。' }),
    h('button', { class: 'draw-empty-back', type: 'button', text: '回主页', onClick: goHome }),
  );
}

function goHome() {
  window.location.href = './index.html';
}

function mount() {
  clear(root);
  root.dataset.stage = lottery.stage;
  root.dataset.mode = run.mode === MODE.PERSON ? 'person' : 'prize';
  mountStage();
  paint();
}

function mountStage() {
  destroyStage();
  const host = el('div', 'stage');
  root.append(host);
  const config = lottery.stageConfig?.[lottery.stage] ?? {};
  ui.stage = createStage(lottery.stage, host, config, stageActions());
}

function destroyStage() {
  if (ui.stage !== null) {
    ui.stage.destroy();
    ui.stage = null;
  }
}

/** 交给形态的入口；形态想放哪就放哪，不规定位置。 */
function stageActions() {
  return {
    start: () => onAction(),
    stop: () => onAction(),
    toggle: () => onAction(),
    pickPrize: (id) => {
      if (ui.spinning) {
        return;
      }
      ui.selectedPrizeId = id;
      paint();
    },
    pickPerson: (id) => {
      if (ui.spinning) {
        return;
      }
      ui.personPickId = id;
      paint();
    },
    undo: () => undoInStage(),
    voidLast: () => voidLastWinner(),
    results: () => {
      ui.resultsOpen = true;
      paint();
    },
    exit: () => goHome(),
    fullscreen: () => toggleFullscreen(),
  };
}

/* ---------- 状态 ---------- */

function paint() {
  ui.stage?.update(view());
  paintResults();
}

function totalSlots() {
  return run.prizes.reduce((sum, prize) => sum + prize.count, 0);
}

function handed() {
  return run.results.reduce((sum, result) => sum + result.winners.length, 0);
}

/**
 * 控制区里高亮的永远是"接下来要抽的那个"。
 * 刚抽完的奖项由揭晓那一行说，不靠高亮再说一遍。
 */
function highlightedPrize() {
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

function canDraw() {
  return run.mode === MODE.PRIZE ? currentPrize() !== null : availablePrizes(run).length > 0;
}

/** 一次快照：形态需要什么就从这里拿，不再去碰引擎。 */
function view() {
  const prize = run.mode === MODE.PRIZE ? currentPrize() : null;
  const person = run.mode === MODE.PERSON ? pickedPerson() : null;
  const pool = run.mode === MODE.PRIZE ? eligiblePeople(run) : availablePrizes(run);
  const remainingPeople = eligiblePeople(run).length;

  return {
    title: run.title,
    mode: run.mode,
    label: stageLabel(lottery.stage),
    spinning: ui.spinning,
    revealed: ui.revealed,
    allDrawn: allDrawn(),
    canDraw: canDraw(),
    handed: handed(),
    totalSlots: totalSlots(),
    batch:
      prize === null
        ? 1
        : Math.max(1, Math.min(lottery.batch, prizeRemaining(run, prize.id), remainingPeople)),
    prizeName: prize?.name ?? '',
    prizeRemaining: prize === null ? 0 : prizeRemaining(run, prize.id),
    personName: person?.name ?? '',
    personDept: person?.dept ?? '',
    prizeCount: availablePrizes(run).length,
    peopleLeft: remainingPeople,
    labels: pool.map((item) => item.name),
    weights: run.mode === MODE.PERSON ? pool.map((item) => prizeWeight(run, item)) : [],
    prizes: run.prizes.map((item) => ({
      id: item.id,
      name: item.name,
      count: item.count,
      drawn: prizeDrawn(run, item.id),
      remaining: prizeRemaining(run, item.id),
      active: run.mode === MODE.PRIZE && highlightedPrize()?.id === item.id,
    })),
    people: run.mode === MODE.PERSON
      ? eligiblePeople(run).map((item) => ({
          id: item.id,
          name: item.name,
          dept: item.dept ?? '',
          employeeId: item.employeeId ?? '',
          picked: person?.id === item.id,
        }))
      : [],
    lastPrizeName: run.results[run.results.length - 1]?.prizeName ?? '',
  };
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

  const pool = run.mode === MODE.PRIZE ? eligiblePeople(run) : availablePrizes(run);
  const labels = pool.map((item) => item.name);
  // 权重就是引擎掷骰子用的那一份，形态拿它按真实概率摆各项
  const weights = run.mode === MODE.PERSON ? pool.map((prize) => prizeWeight(run, prize)) : [];
  const batch =
    run.mode === MODE.PRIZE
      ? Math.max(1, Math.min(lottery.batch, prizeRemaining(run, ui.selectedPrizeId), pool.length))
      : 1;

  ui.revealed = false;
  ui.stage.begin({ labels, weights, batch });
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
      {
        class: `result-scrim stage-${lottery.stage}`,
        onClick: (event) => {
          if (event.target === event.currentTarget) {
            ui.resultsOpen = false;
            paint();
          }
        },
      },
      h(
        'div',
        { class: 'result-panel', role: 'dialog', 'aria-label': '开奖结果' },
        h(
          'div',
          { class: 'result-head' },
          h('h2', { text: '开奖结果' }),
          h('span', { class: 'result-sub', text: `${run.title} · ${handed()} 人` }),
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
            class: 'result-link',
            type: 'button',
            text: '关闭',
            onClick: () => {
              ui.resultsOpen = false;
              paint();
            },
          }),
          h('button', { class: 'result-link', type: 'button', text: '回主页', onClick: goHome }),
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
  paint();
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
