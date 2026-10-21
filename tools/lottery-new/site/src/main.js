/**
 * 装配：两栏外壳 + 开奖层。
 *
 * 侧栏列出当前视图的对象，底部 tabbar 在"抽奖"与"池"之间切；主区是详情页
 * （标题 + 小节 + 行）。写账本的动作只有 settle 与 undoRound 两条路，
 * 界面不直接改账本。
 */

import { createStore } from './store.js';
import { createPool } from './domain/pool.js';
import { createDraw, createRule } from './domain/draw.js';
import { settle, undoRound } from './domain/session.js';
import { el, button } from './ui/dom.js';
import { poolPage } from './ui/poolsView.js';
import { drawPage } from './ui/drawView.js';
import { createStage } from './ui/stageView.js';

const store = createStore();
ensureStarter();

const app = document.getElementById('app');
const stageHost = document.getElementById('stage');

// 视图：抽奖或池。侧栏与 tabbar 都跟着它变。
let view = 'draws';

const stage = createStage({
  host: stageHost,
  onSettled: (session) => {
    let rounds = store.state.rounds;
    store.update((state) => {
      const { ledger } = settle(session, { rounds: state.rounds });
      rounds = ledger.rounds;
      return { ...state, rounds };
    });
    render();
    return rounds;
  },
  onUndo: () => {
    const last = store.state.rounds[store.state.rounds.length - 1];
    if (last) undo(last.id);
  },
});

function render() {
  app.replaceChildren(shell());
}

function shell() {
  const node = el('div', 'shell');
  node.append(sidebar(), mainOf());
  return node;
}

function sidebar() {
  const isPools = view === 'pools';
  const items = isPools ? store.state.pools : store.state.draws;
  const currentId = isPools ? currentPoolId() : currentDrawId();

  const aside = el('aside', 'sidebar');

  const head = el('header', 'side-head');
  head.append(el('h1', 'side-title', isPools ? '池' : '抽奖'));
  const tools = el('div', 'side-tools');
  tools.append(button('＋', isPools ? addPool : addDraw, 'icon-button'));
  head.append(tools);
  aside.append(head);

  if (items.length === 0) {
    aside.append(el('p', 'side-empty', isPools ? '还没有池' : '还没有抽奖'));
  } else {
    const list = el('ol', 'side-list');
    for (const item of items) {
      const li = el('li');
      li.append(button(
        nameOf(item),
        () => {
          if (isPools) selectPool(item.id);
          else store.update((state) => ({ ...state, currentDrawId: item.id }));
          render();
        },
        `side-item${item.id === currentId ? ' active' : ''}`,
      ));
      list.append(li);
    }
    aside.append(list);
  }

  const tabbar = el('nav', 'tabbar');
  for (const [key, label] of [['draws', '抽奖'], ['pools', '池']]) {
    tabbar.append(button(label, () => {
      view = key;
      render();
    }, `tab${view === key ? ' active' : ''}`));
  }
  tabbar.append(button('亮/暗', toggleTheme, 'tab tab-settings'));
  aside.append(tabbar);

  return aside;
}

function mainOf() {
  const main = el('main', 'main');
  const workbench = el('div', 'workbench');
  const scroller = el('div', 'scroller');

  if (view === 'pools') {
    const pool = store.state.pools.find((item) => item.id === currentPoolId());
    scroller.append(pool
      ? poolPage({
        store,
        pool,
        refresh: render,
        onDeleted: () => {
          selectPool(store.state.pools[0]?.id ?? null);
          render();
        },
      })
      : emptyDetail('还没有池', '点侧栏上面的 ＋ 建一个。'));
  } else {
    const draw = store.state.draws.find((item) => item.id === currentDrawId());
    scroller.append(draw
      ? drawPage({
        store,
        draw,
        refresh: render,
        onStart: (target) => stage.open(target, store.state),
        onUndo: undo,
      })
      : emptyDetail('还没有抽奖', '点侧栏上面的 ＋ 建一个。'));
  }

  workbench.append(scroller);
  main.append(workbench);
  return main;
}

function emptyDetail(title, note) {
  const detail = el('div', 'detail');
  const head = el('div', 'detail-head');
  head.append(el('h1', 'detail-title', title));
  head.append(el('p', 'detail-sub', note));
  detail.append(head);
  return detail;
}

/* ---------- 状态操作 ---------- */

let poolSelection = null;

function currentPoolId() {
  if (poolSelection && store.state.pools.some((pool) => pool.id === poolSelection)) return poolSelection;
  return store.state.pools[0]?.id ?? null;
}

function selectPool(id) {
  poolSelection = id;
}

function currentDrawId() {
  const state = store.state;
  if (state.currentDrawId && state.draws.some((draw) => draw.id === state.currentDrawId)) return state.currentDrawId;
  return state.draws[0]?.id ?? null;
}

function nameOf(item) {
  return item.name || '未命名';
}

function addDraw() {
  const draw = createDraw({
    name: `抽奖 ${store.state.draws.length + 1}`,
    slots: [{ key: 'slot1', poolId: store.state.pools[0]?.id ?? '' }],
    form: { type: 'wheel', options: {} },
    mode: 'independent',
    rule: { slot1: createRule() },
  });
  store.update((state) => ({ ...state, draws: [...state.draws, draw], currentDrawId: draw.id }));
  render();
}

function addPool() {
  const pool = createPool({ name: `池 ${store.state.pools.length + 1}`, entries: [] });
  store.update((state) => ({ ...state, pools: [...state.pools, pool] }));
  selectPool(pool.id);
  render();
}

function undo(roundId) {
  store.update((state) => {
    const { ledger } = undoRound({ rounds: state.rounds }, roundId);
    return { ...state, rounds: ledger.rounds };
  });
  render();
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem('lottery-new:theme', next);
  } catch (error) {}
}

/** 第一次打开给一份能用的起始状态：一个空池、一个默认抽奖。 */
function ensureStarter() {
  store.update((state) => {
    if (state.draws.length > 0) return state;
    const pool = createPool({ name: '名单', entries: [] });
    const draw = createDraw({
      name: '抽奖 1',
      slots: [{ key: 'slot1', poolId: pool.id }],
      form: { type: 'wheel', options: {} },
      mode: 'independent',
      rule: { slot1: createRule() },
    });
    return { ...state, pools: [pool], draws: [draw], currentDrawId: draw.id };
  });
}

render();
