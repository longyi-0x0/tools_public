/**
 * 抽奖页。
 *
 * 这一层只管引擎与键盘：读存档、算状态、把快照交给形态、把结果写回去。
 * 界面全部由形态自己画 —— 每种形态的受众不同，外壳不共用。
 *
 * 抽法决定转哪个池、大字写谁；形态只按 `view` 与 `reveal` 画，不猜玩法。
 *
 * 形态拿到的接口：
 *   create(host, config, api) -> { begin, reveal, reset, update, destroy }
 *   api: start / toggle / pickSlot / undo / voidLast / results / exit / fullscreen
 *   update(view): 每次状态变化都调
 *
 * 固定槽（`source: 'fixed'`）由主持人先定。以前只能按 ↑↓ 换，投屏和触屏没法用；
 * 现在快照里带一份 `fixed`，形态自己画成侧栏，点了走 `api.pickSlot`。
 */

import {
  asEntry,
  canDraw as engineCanDraw,
  drawOnce,
  eligible,
  entryWeight,
  remaining,
  slotPool as engineSlotPool,
  undoLast,
  voidPick,
} from '../engine.js';
import { lotteryById, runState, writeRunState } from '../data.js';
import { protocolInfo, slotOf, spinSlot } from '../protocols.js';
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
  /** 主持人点下的固定槽：`{ prize: 'a2', person: null }`。 */
  fixed: { prize: null, person: null },
  stage: null,
  resultsOpen: false,
};

if (lottery === null) {
  window.location.replace('./index.html');
} else if (missingPools().length > 0) {
  root.append(emptyState());
} else {
  mount();
}

/* ---------- 抽法的几个位置 ---------- */

function protocol() {
  return protocolInfo(lottery.protocol);
}

function spinDef() {
  return spinSlot(lottery.protocol);
}

/** 盘面转的那个池。 */
function spinPool() {
  return poolAt(spinDef().key);
}

/** 某个槽绑的池；没绑就是 null。 */
function poolAt(slotKey) {
  return engineSlotPool(run, slotKey);
}

function fixedSlot() {
  return protocol().slots.find((slot) => slot.source === 'fixed') ?? null;
}

/** 抽法里那个「事先定好的」槽，待机文案按它说话。 */
function anchorKey() {
  return fixedSlot()?.key ?? protocol().slots[0].key;
}

/** 某个槽当前指着谁：主持人点过的优先，其次池里第一个还能抽的。 */
function pickedIn(slotKey, selectedId) {
  if (slotOf(lottery.protocol, slotKey) === null) {
    return null;
  }
  const list = eligible(run, poolAt(slotKey));
  return list.find((entry) => entry.id === selectedId) ?? list[0] ?? null;
}

function currentOf(slotKey) {
  if (slotOf(lottery.protocol, slotKey) === null) {
    return null;
  }
  return pickedIn(slotKey, ui.fixed[slotKey] ?? null);
}

function missingPools() {
  return protocol().slots
    .filter((slot) => poolAt(slot.key) === null)
    .map((slot) => slot.label);
}

/* ---------- 外壳 ---------- */

function emptyState() {
  const missing = missingPools().join('、');
  return h(
    'div',
    { class: 'draw-empty' },
    h('p', { class: 'draw-empty-title', text: `这场抽奖还没有给「${missing}」选池` }),
    h('p', { class: 'draw-empty-note', text: '回主页在「绑定」里选一个池。' }),
    h('button', { class: 'draw-empty-back', type: 'button', text: '回主页', onClick: goHome }),
  );
}

function goHome() {
  window.location.href = './index.html';
}

function mount() {
  clear(root);
  root.dataset.stage = lottery.stage;
  root.dataset.focus = protocol().focus;
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
    /** 主持人点固定槽里的某一条；传 null 就是「不指定，让引擎自己挑第一个」。 */
    pickSlot: (key, id) => {
      if (ui.spinning || ui.revealed) {
        return;
      }
      if (ui.fixed[key] === undefined) {
        return;
      }
      ui.fixed[key] = id;
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

/** 已经抽出去几条 —— 数焦点槽，先定的那个槽不算进度。 */
function handed() {
  const focus = protocol().focus;
  let total = 0;
  for (const result of run.results) {
    const hits = result.picks.filter((pick) => pick.slot === focus);
    total += hits.length > 0 ? hits.length : result.picks.length;
  }
  return total;
}

/** 这一抽最多抽几个：名额、池子余量、抽法本身三者取小。 */
function batchSize(candidates) {
  return Math.max(1, Math.min(lottery.batch || 1, candidates.length || 1));
}

/** 某个固定槽当前指着哪一条（供侧栏高亮）。 */
function activeIdOf(slotKey) {
  return pickedIn(slotKey, ui.fixed[slotKey] ?? null)?.id ?? null;
}

/** 固定槽的侧栏数据：形态自己决定摆在左、右还是底下。 */
function fixedPanels() {
  return protocol()
    .slots.filter((slot) => slot.source === 'fixed')
    .map((slot) => {
      const pool = poolAt(slot.key);
      const active = activeIdOf(slot.key);
      return {
        key: slot.key,
        label: slot.label,
        poolName: pool?.name ?? '',
        items: pool === null
          ? []
          : eligible(run, pool).map((entry) => {
              const left = remaining(run, pool.id, entry.id);
              return {
                id: entry.id,
                name: entry.name,
                sub: [
                  entry.meta?.dept,
                  entry.meta?.employeeId,
                  entry.meta?.level,
                  left === Infinity ? '不限量' : `剩 ${left}`,
                ]
                  .filter(Boolean)
                  .join(' · '),
                active: entry.id === active,
              };
            }),
      };
    });
}

/**
 * 一次快照：形态需要什么就从这里拿，不再去碰引擎。
 *
 * 只有两个角色：`anchor` 是事先定好的那个槽（先选奖项 / 先指定上台的人），
 * `focus` 是抽出来的那个槽。两边都按槽取，不问池是什么种类。
 */
function view() {
  const def = protocol();
  const anchorSlot = fixedSlot();
  const focusSlot = slotOf(lottery.protocol, def.focus);
  const pool = spinPool();
  const candidates = eligible(run, pool);

  const anchorPool = anchorSlot === null ? null : poolAt(anchorSlot.key);
  const anchorEntry = anchorSlot === null ? null : currentOf(anchorSlot.key);
  const anchorLeft =
    anchorEntry === null || anchorPool === null
      ? null
      : remaining(run, anchorPool.id, anchorEntry.id);
  const batch = batchSize(candidates);
  const anchorNote = [
    anchorEntry?.meta?.dept,
    anchorEntry?.meta?.employeeId,
    anchorEntry?.meta?.level,
    anchorLeft !== null && anchorLeft > 1 ? `还剩 ${anchorLeft} 个名额` : '',
    batch > 1 ? `一次抽 ${batch} 个` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const focusPool = focusSlot === null ? null : poolAt(focusSlot.key);

  return {
    title: run.title,
    label: stageLabel(lottery.stage),
    protocol: def.id,
    /** 揭晓大字写哪个槽。 */
    focus: def.focus,
    /** 待机时已经定好的那个槽。 */
    anchor: anchorKey(),
    anchorLabel: anchorSlot?.label ?? '',
    anchorName: anchorEntry?.name ?? '',
    anchorNote,
    focusLabel: focusSlot?.label ?? '',
    focusLeft:
      focusPool === null
        ? 0
        : focusPool.entries.reduce(
            (sum, entry) => sum + remaining(run, focusPool.id, entry.id),
            0,
          ),
    focusCount: focusPool === null ? 0 : eligible(run, focusPool).length,
    spinning: ui.spinning,
    revealed: ui.revealed,
    allDrawn: !engineCanDraw(run),
    canDraw: engineCanDraw(run),
    handed: handed(),
    batch,
    labels: candidates.map((entry) => entry.name),
    weights: candidates.map((entry) => entryWeight(run, pool.id, entry)),
    /** 主持人先定的那些槽；形态据此画侧栏，空数组就是不画。 */
    fixed: fixedPanels(),
  };
}

/* ---------- 抽 ---------- */

function onAction() {
  if (ui.spinning) {
    stopDraw();
    return;
  }
  if (!engineCanDraw(run)) {
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
  const pool = spinPool();
  const candidates = eligible(run, pool);
  if (candidates.length === 0) {
    toast('这个池子已经抽完了');
    return;
  }

  ui.revealed = false;
  ui.stage.begin({
    labels: candidates.map((entry) => entry.name),
    weights: candidates.map((entry) => entryWeight(run, pool.id, entry)),
    batch: batchSize(candidates),
  });
  ui.spinning = true;
  paint();
}

/** 主持人先定下的那些槽。没定的交给引擎自己挑。 */
function fixedValues() {
  const fixed = {};
  for (const slot of protocol().slots) {
    if (slot.source !== 'fixed') {
      continue;
    }
    const entry = pickedIn(slot.key, ui.fixed[slot.key] ?? null);
    if (entry !== null) {
      fixed[slot.key] = entry.id;
    }
  }
  return fixed;
}

function stopDraw() {
  const candidates = eligible(run, spinPool());
  let outcome;
  try {
    outcome = drawOnce(run, { fixed: fixedValues(), batch: batchSize(candidates) });
  } catch (error) {
    ui.spinning = false;
    paint();
    toast(error instanceof Error ? error.message : '这一抽没成');
    return;
  }

  run = outcome.state;
  ui.spinning = false;
  ui.revealed = true;
  // 这一抽用掉了某个固定项，下一抽从剩下的重新开始
  ui.fixed = { prize: null, person: null };
  commit();

  const focusKey = protocol().focus;
  const anchorSlot = fixedSlot();
  const anchorPick =
    anchorSlot === null ? null : outcome.picks.find((pick) => pick.slot === anchorSlot.key) ?? null;
  const focusPicks = outcome.picks.filter((pick) => pick.slot === focusKey);
  // 盘面转的是焦点槽的池，所以停在这一抽抽中的那一格；锚只进小字
  ui.stage?.reveal({
    winners: (focusPicks.length > 0 ? focusPicks : outcome.picks).map(asEntry),
    focusName: focusPicks[0]?.name ?? '',
    anchorName: anchorPick?.name ?? '',
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
  ui.fixed = { prize: null, person: null };
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
  const lastFocus = protocol().focus;
  const heads = last.picks.filter((item) => item.slot === lastFocus);
  const pick = heads.pop() ?? last.picks[last.picks.length - 1];
  run = voidPick(run, last.id, pick.poolId, pick.entryId);
  ui.revealed = false;
  ui.stage?.reset();
  commit();
  paint();
  toast(`已作废 ${pick.name}`);
}

/* ---------- 结果 ---------- */

function paintResults() {
  document.querySelector('.result-scrim')?.remove();
  if (!ui.resultsOpen) {
    return;
  }
  // 按锚槽分组（奖品抽人 → 按奖项，人抽奖品 → 按上台的人）；行是抽出来的那些
  const anchorSlot = fixedSlot();
  const focusKey = protocol().focus;
  const groups = new Map();
  for (const result of run.results) {
    const anchorPick =
      anchorSlot === null ? null : result.picks.find((pick) => pick.slot === anchorSlot.key) ?? null;
    const focusPicks = result.picks.filter((pick) => pick.slot === focusKey);
    const key = anchorPick?.name ?? '';
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    for (const pick of (focusPicks.length > 0 ? focusPicks : [anchorPick]).filter(Boolean)) {
      groups.get(key).push({ pick, at: result.at });
    }
  }

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
          h('span', {
            class: 'result-sub',
            text: `${run.title} · ${handed()} 个${slotOf(lottery.protocol, focusKey)?.label ?? ''}`,
          }),
        ),
        h(
          'div',
          { class: 'result-body' },
          [...groups].map(([title, rows]) =>
            h(
              'div',
              { class: 'result-group' },
              h('h3', { text: `${title === '' ? '未分组' : title} · ${rows.length}` }),
              rows.map((row) =>
                h(
                  'div',
                  { class: 'result-row' },
                  h('span', { class: 'who', text: row.pick.name }),
                  h('span', {
                    class: 'meta',
                    text: [row.pick.meta?.dept, row.pick.meta?.employeeId, row.pick.meta?.level]
                      .filter(Boolean)
                      .join(' · '),
                  }),
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

/** ↑↓ 在「事先定好的」那个槽里换人 / 换奖。 */
function stepSelection(direction) {
  if (ui.spinning || ui.revealed) {
    return;
  }
  const slot = fixedSlot();
  if (slot === null) {
    return;
  }
  const list = eligible(run, poolAt(slot.key));
  if (list.length <= 1) {
    return;
  }
  const current = pickedIn(slot.key, ui.fixed[slot.key] ?? null);
  const at = list.findIndex((entry) => entry.id === current?.id);
  const next = list[(at + direction + list.length) % list.length];
  ui.fixed[slot.key] = next.id;
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
