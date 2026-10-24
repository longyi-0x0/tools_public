/**
 * 装配：侧栏两列 + 主区 + 演出层。
 *
 * 侧栏是「活动 → 环节」两层，加一列清单。主区按选中的东西给页面：选中活动给活动页
 * （这场活动有哪些环节），选中环节给环节页（配这一个环节），选中清单给清单页。
 *
 * 演出层盖住整个主页：上台之后配置只读，主持人只有开始、下一轮、下一环节三个动作。
 * 写账本的路只有两条——演完入账与撤销，界面不碰账本。
 */

import { createStore } from './store.js';
import { sortedDraws } from './domain/draw.js';
import { createPool } from './domain/pool.js';
import { undoRound } from './domain/session.js';
import { el, button } from './ui/dom.js';
import { nameOf } from './ui/naming.js';
import { activityPage } from './ui/activityView.js';
import { drawPage } from './ui/drawView.js';
import { poolPage } from './ui/poolsView.js';
import { createWizard } from './ui/wizardView.js';
import { createShow } from './ui/showView.js';

const store = createStore();

const app = document.getElementById('app');
const showHost = document.getElementById('show');
const wizardHost = document.getElementById('wizard');

const VIEWS = [['draws', '活动'], ['pools', '清单']];
let view = 'draws';
/** 选中的东西：一场活动或一个环节。空存档时为 null，主区给欢迎页。 */
let focus = initialFocus();

const show = createShow({
  host: showHost,
  store,
  onExit: () => render(),
});

const wizard = createWizard({
  host: wizardHost,
  store,
  onDone: (groupId, drawId) => {
    focus = { type: 'draw', id: drawId };
    view = 'draws';
    render();
  },
});

function initialFocus() {
  const state = store.state;
  if (state.groups.length > 0) return { type: 'group', id: state.groups[0].id };
  if (state.draws.length > 0) return { type: 'draw', id: state.draws[0].id };
  return null;
}

function focusedGroup() {
  if (focus?.type !== 'group') return null;
  return store.state.groups.find((group) => group.id === focus.id) ?? null;
}

function focusedDraw() {
  const state = store.state;
  if (focus?.type === 'draw') {
    const hit = state.draws.find((draw) => draw.id === focus.id);
    if (hit) return hit;
  }
  return null;
}

function render() {
  app.replaceChildren(shell());
}

function shell() {
  const node = el('div', 'shell');
  node.append(sidebar(), mainOf());
  return node;
}

/* ---------- 侧栏 ---------- */

function sidebar() {
  const aside = el('aside', 'sidebar');
  const head = el('header', 'side-head');
  head.append(el('h1', 'side-title', view === 'pools' ? '清单' : '活动'));
  const tools = el('div', 'side-tools');
  tools.append(button('＋', addOf(view), 'icon-button'));
  head.append(tools);
  aside.append(head);

  aside.append(view === 'pools' ? poolList() : groupTree());

  const tabbar = el('nav', 'tabbar');
  for (const [key, label] of VIEWS) {
    tabbar.append(button(label, () => {
      view = key;
      render();
    }, `tab${view === key ? ' active' : ''}`));
  }
  tabbar.append(button('亮/暗', toggleTheme, 'tab tab-settings'));
  aside.append(tabbar);

  return aside;
}

function poolList() {
  const pools = store.state.pools;
  if (pools.length === 0) return el('p', 'side-empty', '还没有清单');

  const list = el('ol', 'side-list');
  for (const pool of pools) {
    const li = el('li');
    li.append(button(
      `${nameOf(pool)} · ${pool.entries.length} 项`,
      () => selectPool(pool.id),
      `side-item${poolSelection === pool.id ? ' active' : ''}`,
    ));
    list.append(li);
  }
  return list;
}

/** 活动树：活动是父节点，环节是子节点；没归到任何活动的环节列在「散着的环节」下。 */
function groupTree() {
  const { groups, draws } = store.state;
  const list = el('ol', 'side-tree');

  if (groups.length === 0 && draws.length === 0) {
    const empty = el('li');
    empty.append(el('p', 'side-empty', '还没有活动'));
    list.append(empty);
  }

  for (const group of groups) {
    const members = sortedDraws(draws.filter((draw) => draw.groupId === group.id));
    const li = el('li', 'tree-group');
    li.append(button(
      nameOf(group, '未命名活动'),
      () => selectGroup(group.id),
      `side-item side-group${focus?.type === 'group' && focus.id === group.id ? ' active' : ''}`,
    ));
    if (members.length > 0) li.append(drawBranch(members));
    list.append(li);
  }

  const loose = sortedDraws(draws.filter((draw) => !draw.groupId
    || !groups.some((group) => group.id === draw.groupId)));
  if (loose.length > 0) {
    const li = el('li', 'tree-group');
    li.append(el('p', 'side-caption', groups.length > 0 ? '散着的环节' : '全部环节'));
    li.append(drawBranch(loose));
    list.append(li);
  }

  const addRow = el('li');
  addRow.append(button('＋ 新建活动', () => wizard.open(), 'side-add'));
  list.append(addRow);
  return list;
}

function drawBranch(draws) {
  const branch = el('ul', 'side-branch');
  for (const draw of draws) {
    const li = el('li');
    li.append(button(
      nameOf(draw, '未命名环节'),
      () => selectDraw(draw.id),
      `side-item side-draw${focus?.type === 'draw' && focus.id === draw.id ? ' active' : ''}`,
    ));
    branch.append(li);
  }
  return branch;
}

/* ---------- 主区 ---------- */

function mainOf() {
  const main = el('main', 'main');
  const workbench = el('div', 'workbench');
  const scroller = el('div', 'scroller');

  if (view === 'pools') {
    scroller.append(poolMain());
  } else if (focusedGroup()) {
    const group = focusedGroup();
    scroller.append(activityPage({
      store,
      group,
      refresh: render,
      onOpenDraw: selectDraw,
      onOpenPool: (id) => {
        view = 'pools';
        selectPool(id);
      },
      onStart: startShow,
      onNewDraw: () => wizard.open({ groupId: group.id }),
      onDeleted: () => {
        focus = initialFocus();
        render();
      },
    }));
  } else if (focusedDraw()) {
    scroller.append(drawPage({
      store,
      draw: focusedDraw(),
      refresh: render,
      onStart: startShow,
      onRehearse: startRehearse,
      onUndo: undo,
    }));
  } else {
    scroller.append(welcome());
  }

  workbench.append(scroller);
  main.append(workbench);
  return main;
}

function poolMain() {
  const pool = store.state.pools.find((item) => item.id === currentPoolId());
  if (!pool) return emptyDetail('还没有清单', '点侧栏上面的 ＋ 建一张，或从活动页导入名单。');
  return poolPage({
    store,
    pool,
    refresh: render,
    onDeleted: () => {
      poolSelection = null;
      render();
    },
  });
}

function welcome() {
  const detail = el('div', 'detail welcome');
  detail.append(el('h1', 'detail-title', '先备好一场活动，再上台开抽'));
  detail.append(el('p', 'detail-sub', '两件事决定一场抽奖：谁参与、抽什么。剩下的都给你配好默认值。'));
  const go = el('div', 'actions');
  go.append(button('开始第一场活动', () => wizard.open(), 'primary'));
  detail.append(go);
  return detail;
}

function emptyDetail(title, note) {
  const detail = el('div', 'detail');
  detail.append(el('h1', 'detail-title', title));
  detail.append(el('p', 'detail-sub', note));
  return detail;
}

/* ---------- 选择 ---------- */

let poolSelection = null;

function currentPoolId() {
  if (poolSelection && store.state.pools.some((pool) => pool.id === poolSelection)) return poolSelection;
  return store.state.pools[0]?.id ?? null;
}

function selectPool(id) {
  poolSelection = id;
  render();
}

function selectGroup(id) {
  focus = { type: 'group', id };
  render();
}

function selectDraw(id) {
  focus = { type: 'draw', id };
  store.update((state) => ({ ...state, currentDrawId: id }));
  render();
}

function addOf(key) {
  return key === 'pools' ? addPool : () => wizard.open();
}

function addPool() {
  const name = window.prompt('这张清单叫什么', `名单 ${store.state.pools.length + 1}`);
  if (name === null) return;
  store.update((state) => ({
    ...state,
    pools: [...state.pools, createPool({ name: name.trim() || '未命名清单', kind: 'people' })],
  }));
  render();
}

/**
 * 撤销一轮。能不能撤、为什么不能撤都由领域判，界面只负责把理由说清楚——
 * 而不是把按钮灰掉就算完，用户得知道为什么不能撤。
 */
function undo(round) {
  const result = undoRound({ rounds: store.state.rounds }, round.id);
  if (result.reason) {
    const text = {
      missing: '这一轮不在账本里。',
      'not-settled': '只有已入账的轮次能撤销。',
      'not-top': '只能撤最近一次结算的那一轮，先把后面的按倒序撤掉。',
    }[result.reason] ?? '这一轮撤不了。';
    window.alert(text);
    return;
  }
  if (!window.confirm('撤销这一轮？占额会清空、库存回滚，轮次留档为「已撤销」。')) return;

  store.update((state) => ({ ...state, rounds: result.ledger.rounds }));
  render();
}

function startShow(draw) {
  show.open(draw, { rehearsal: false });
}

function startRehearse(draw) {
  show.open(draw, { rehearsal: true });
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem('lottery3:theme', next);
  } catch (error) {}
}

render();
