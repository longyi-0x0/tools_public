/**
 * 装配：两栏外壳 + 开奖层。
 *
 * 侧栏列出当前视图的对象，底部 tabbar 在「抽奖」「池」「组」之间切；主区是详情页
 * （标题 + 小节 + 行）。写账本的动作只有 settle 与 undoRound 两条路，界面不碰账本。
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

const VIEWS = [['draws', '抽奖'], ['pools', '池'], ['groups', '组']];
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

function itemsOf(key) {
  if (key === 'pools') return store.state.pools;
  if (key === 'groups') return store.state.groups;
  return store.state.draws;
}

function sidebar() {
  const items = itemsOf(view);
  const currentId = currentIdOf();

  const aside = el('aside', 'sidebar');

  const head = el('header', 'side-head');
  head.append(el('h1', 'side-title', labelOfView(view)));
  const tools = el('div', 'side-tools');
  tools.append(button('＋', addOf(view), 'icon-button'));
  head.append(tools);
  aside.append(head);

  if (items.length === 0) {
    aside.append(el('p', 'side-empty', `还没有${labelOfView(view)}`));
  } else {
    const list = el('ol', 'side-list');
    for (const item of items) {
      const li = el('li');
      li.append(button(
        nameOf(item),
        () => selectIn(view, item.id),
        `side-item${item.id === currentId ? ' active' : ''}`,
      ));
      list.append(li);
    }
    aside.append(list);
  }

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

function mainOf() {
  const main = el('main', 'main');
  const workbench = el('div', 'workbench');
  const scroller = el('div', 'scroller');

  if (view === 'pools') {
    const pool = store.state.pools.find((item) => item.id === currentIdOf());
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
  } else if (view === 'groups') {
    const group = store.state.groups.find((item) => item.id === currentIdOf());
    scroller.append(group
      ? groupPage(group)
      : emptyDetail('还没有组', '组只是去重范围：同组的抽奖，中过的人不会在另一场再中。'));
  } else {
    const draw = store.state.draws.find((item) => item.id === currentIdOf());
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

/** 组详情：名字 + 组里的抽奖 + 删组。删组不删抽奖，只是那层去重范围没了。 */
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
  head.append(el('p', 'detail-sub', `${members.length} 个抽奖属于这个组`));

  const body = el('div', 'detail-body');

  const list = section('组里的抽奖', '同一个组共用一片用量：谁在这个组里中过，换一场也不会再中。');
  if (members.length === 0) {
    list.append(el('p', 'empty', '还没有抽奖归到这个组。'));
  } else {
    for (const draw of members) {
      const line = el('div', 'row');
      line.append(el('span', 'row-label', draw.name || '未命名'));
      line.append(el('span', 'row-sub', draw.slots.map((slot) => slot.key).join(' / ')));
      list.append(line);
    }
  }
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
      render();
    }, 'danger')),
  ));

  const detail = el('div', 'detail');
  detail.append(head, body);
  return detail;
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
let groupSelection = null;

function currentIdOf() {
  if (view === 'pools') {
    if (poolSelection && store.state.pools.some((pool) => pool.id === poolSelection)) return poolSelection;
    return store.state.pools[0]?.id ?? null;
  }
  if (view === 'groups') {
    if (groupSelection && store.state.groups.some((group) => group.id === groupSelection)) return groupSelection;
    return store.state.groups[0]?.id ?? null;
  }
  const state = store.state;
  if (state.currentDrawId && state.draws.some((draw) => draw.id === state.currentDrawId)) return state.currentDrawId;
  return state.draws[0]?.id ?? null;
}

function selectIn(key, id) {
  if (key === 'pools') poolSelection = id;
  else if (key === 'groups') groupSelection = id;
  else store.update((state) => ({ ...state, currentDrawId: id }));
  render();
}

function addOf(key) {
  if (key === 'pools') return addPool;
  if (key === 'groups') return addGroup;
  return addDraw;
}

function labelOfView(key) {
  return key === 'pools' ? '池' : key === 'groups' ? '组' : '抽奖';
}

function nameOf(item) {
  return item.name || '未命名';
}

function addDraw() {
  const draw = createDraw({
    name: `抽奖 ${store.state.draws.length + 1}`,
    slots: [createSlot({ key: 'slot1', poolId: store.state.pools[0]?.id ?? '' })],
  });
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
  groupSelection = group.id;
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
