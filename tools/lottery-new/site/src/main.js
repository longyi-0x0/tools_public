/**
 * 装配：两栏外壳 + 开奖层。
 *
 * 侧栏只有两列：「抽奖」是一棵树——组是父节点，抽奖挂在组下面，没进组的抽奖单独列在
 * 「未分组」下；「池」是平铺的条目仓库。组不是文件夹，是去重范围，删组不删抽奖。
 * 写账本的动作只有 settle 与 undoRound 两条路，界面不碰账本。
 */

import { createStore } from './store.js';
import { createPool } from './domain/pool.js';
import { createDraw, createSlot } from './domain/draw.js';
import { createGroup } from './domain/group.js';
import { settle, undoRound } from './domain/session.js';
import { el, button, section, actions, textInput } from './ui/dom.js';
import { poolPage } from './ui/poolsView.js';
import { drawPage } from './ui/drawView.js';
import { createStage } from './ui/stageView.js';

const store = createStore();
ensureStarter();

const app = document.getElementById('app');
const stageHost = document.getElementById('stage');

const VIEWS = [['draws', '抽奖'], ['pools', '池']];
let view = 'draws';
/** 选中组时主区展示组详情；为 null 时按当前抽奖展示。 */
let groupFocus = null;

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
    const last = [...store.state.rounds].reverse().find((round) => round.status === 'settled');
    if (last) undo(last);
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

/* ---------- 侧栏 ---------- */

function sidebar() {
  const aside = el('aside', 'sidebar');

  const head = el('header', 'side-head');
  head.append(el('h1', 'side-title', view === 'pools' ? '池' : '抽奖'));
  const tools = el('div', 'side-tools');
  tools.append(button('＋', addOf(view), 'icon-button'));
  head.append(tools);
  aside.append(head);

  aside.append(view === 'pools' ? poolList() : drawTree());

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
  if (pools.length === 0) return el('p', 'side-empty', '还没有池');

  const current = currentPoolId();
  const list = el('ol', 'side-list');
  for (const pool of pools) {
    const li = el('li');
    li.append(button(
      nameOf(pool),
      () => selectPool(pool.id),
      `side-item${pool.id === current ? ' active' : ''}`,
    ));
    list.append(li);
  }
  return list;
}

/**
 * 抽奖树：组是父节点，抽奖是子节点；没进组（或挂的组已经不存在）的抽奖
 * 落到「未分组」那一段。组的数量写在自己那一行右边，一眼看出哪层是空壳。
 */
function drawTree() {
  const { groups, draws } = store.state;
  const list = el('ol', 'side-tree');

  if (groups.length === 0 && draws.length === 0) {
    list.append(el('li', undefined, el('p', 'side-empty', '还没有抽奖')));
  }

  for (const group of groups) {
    const members = draws.filter((draw) => draw.groupId === group.id);
    const li = el('li', 'tree-group');
    const row = button(
      group.name || '未命名组',
      () => selectGroup(group.id),
      `side-item side-group${groupFocus === group.id ? ' active' : ''}`,
    );
    row.append(el('span', 'side-count', String(members.length)));
    li.append(row);
    if (members.length > 0) li.append(treeBranch(members));
    list.append(li);
  }

  const loose = draws.filter((draw) => !draw.groupId
    || !groups.some((group) => group.id === draw.groupId));
  if (loose.length > 0) {
    const li = el('li', 'tree-group');
    li.append(el('p', 'side-caption', groups.length > 0 ? '未分组' : '全部抽奖'));
    li.append(treeBranch(loose));
    list.append(li);
  }

  const add = el('li');
  add.append(button('＋ 新建组', addGroup, 'side-add'));
  list.append(add);

  return list;
}

function treeBranch(draws) {
  const branch = el('ul', 'side-branch');
  for (const draw of draws) {
    const li = el('li');
    li.append(button(
      nameOf(draw),
      () => selectDraw(draw.id),
      `side-item side-draw${isCurrentDraw(draw.id) ? ' active' : ''}`,
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
    const pool = store.state.pools.find((item) => item.id === currentPoolId());
    scroller.append(pool
      ? poolPage({
        store,
        pool,
        refresh: render,
        onDeleted: () => {
          poolSelection = store.state.pools[0]?.id ?? null;
          render();
        },
      })
      : emptyDetail('还没有池', '点侧栏上面的 ＋ 建一个。'));
  } else if (focusedGroup()) {
    scroller.append(groupPage(focusedGroup()));
  } else {
    const draw = store.state.draws.find((item) => item.id === currentDrawId());
    scroller.append(draw
      ? drawPage({
        store,
        draw,
        groups: store.state.groups,
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

/**
 * 组详情：名字、组里的抽奖、删组。抽奖在组里点得进去——树和详情说的是同一件事，
 * 不该一个能点一个只能看。
 */
function groupPage(group) {
  const members = store.state.draws.filter((draw) => draw.groupId === group.id);

  const head = el('div', 'detail-head');
  head.append(textInput(group.name, (name) => {
    store.update((state) => ({
      ...state,
      groups: state.groups.map((item) => (item.id === group.id ? { ...item, name } : item)),
    }));
    render();
  }, 'detail-title'));
  head.append(el('p', 'detail-sub', `${members.length} 个抽奖 · 同组共享一片去重范围`));

  const body = el('div', 'detail-body');

  const list = section('组里的抽奖', '谁在这个组里中过，换一场也不会再中。组里不放条目，只划去重范围。');
  if (members.length === 0) {
    list.append(el('p', 'empty', '还没有抽奖归到这个组。'));
  } else {
    for (const draw of members) {
      list.append(drawRow(draw));
    }
  }
  list.append(actions(button('在这个组里新建抽奖', () => addDraw(group.id), 'quiet')));
  body.append(list);

  body.append(section(
    '删除这个组',
    '组没了，抽奖还在；原来按「同组」去重的槽位会退化为按本场算，不报错。',
    actions(button('删除这个组', () => {
      if (!window.confirm('删除这个组？抽奖不会被删，只会从组里移出来。')) return;
      store.update((state) => ({
        ...state,
        groups: state.groups.filter((item) => item.id !== group.id),
        draws: state.draws.map((draw) => (draw.groupId === group.id ? { ...draw, groupId: null } : draw)),
      }));
      groupFocus = null;
      render();
    }, 'danger')),
  ));

  const detail = el('div', 'detail');
  detail.append(head, body);
  return detail;
}

/** 组里的一行抽奖：名字、槽位摘要，右边一个入口。 */
function drawRow(draw) {
  const line = el('div', 'row');
  const left = el('div', 'row-main');
  left.append(el('span', 'row-label', nameOf(draw)));
  left.append(el('span', 'row-sub', draw.slots.map((slot) => slot.key).join(' / ')));
  line.append(left);
  const right = el('div', 'row-value');
  right.append(button('打开', () => selectDraw(draw.id), 'quiet'));
  line.append(right);
  return line;
}

function emptyDetail(title, note) {
  const detail = el('div', 'detail');
  const head = el('div', 'detail-head');
  head.append(el('h1', 'detail-title', title));
  head.append(el('p', 'detail-sub', note));
  detail.append(head);
  return detail;
}

/* ---------- 选择与新建 ---------- */

let poolSelection = null;

function currentPoolId() {
  if (poolSelection && store.state.pools.some((pool) => pool.id === poolSelection)) return poolSelection;
  return store.state.pools[0]?.id ?? null;
}

function currentDrawId() {
  const state = store.state;
  if (state.currentDrawId && state.draws.some((draw) => draw.id === state.currentDrawId)) {
    return state.currentDrawId;
  }
  return state.draws[0]?.id ?? null;
}

function isCurrentDraw(id) {
  return groupFocus === null && currentDrawId() === id;
}

/** 选中的组；组被删掉后自动失效，不会把主区卡在一个不存在的组上。 */
function focusedGroup() {
  if (!groupFocus) return null;
  return store.state.groups.find((group) => group.id === groupFocus) ?? null;
}

function selectPool(id) {
  poolSelection = id;
  render();
}

function selectGroup(id) {
  groupFocus = id;
  render();
}

function selectDraw(id) {
  groupFocus = null;
  store.update((state) => ({ ...state, currentDrawId: id }));
  render();
}

function addOf(key) {
  return key === 'pools' ? addPool : addDraw;
}

function nameOf(item) {
  return item.name || '未命名';
}

/** 新建抽奖。从组页进来时直接落在这个组里，不用再去详情页改归属。 */
function addDraw(groupId = null) {
  const draw = createDraw({
    name: `抽奖 ${store.state.draws.length + 1}`,
    groupId: groupId ?? focusedGroup()?.id ?? null,
    slots: [createSlot({ key: 'slot1', poolId: store.state.pools[0]?.id ?? '' })],
  });
  groupFocus = null;
  store.update((state) => ({ ...state, draws: [...state.draws, draw], currentDrawId: draw.id }));
  render();
}

function addPool() {
  const pool = createPool({ name: `池 ${store.state.pools.length + 1}`, entries: [] });
  store.update((state) => ({ ...state, pools: [...state.pools, pool] }));
  poolSelection = pool.id;
  render();
}

function addGroup() {
  const group = createGroup({ name: `组 ${store.state.groups.length + 1}` });
  store.update((state) => ({ ...state, groups: [...state.groups, group] }));
  view = 'draws';
  groupFocus = group.id;
  render();
}

/**
 * 撤销一轮。栈顶与状态都交给领域判，界面只负责把拒绝的理由说清楚——
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

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem('lottery-new:theme', next);
  } catch (error) {}
}

/** 第一次打开给一份能用的起始状态：一个空池、一个组、一个默认抽奖。 */
function ensureStarter() {
  store.update((state) => {
    if (state.draws.length > 0) return state;
    const pool = createPool({ name: '名单', entries: [] });
    const group = createGroup({ name: '默认组' });
    const draw = createDraw({
      name: '抽奖 1',
      groupId: group.id,
      slots: [createSlot({ key: 'slot1', poolId: pool.id })],
    });
    return {
      ...state,
      pools: [pool],
      groups: [group],
      draws: [draw],
      currentDrawId: draw.id,
    };
  });
}

render();
