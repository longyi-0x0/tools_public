/**
 * 班级列表。
 *
 * 一张卡一个班，卡上说的是「这个班是什么」，卡底那颗是「拿它开始干活」。要一次收拾
 * 好几个班就走多选（卡变勾选项，页头换成批量那一排）。
 */

import { h, icon, toggleFullscreen } from './dom.js';
import { currentMode, toggleMode } from './mode.js';
import * as store from './store.js';
import { exportClassWorkbook } from './klassFile.js';
import { buildZip } from './xlsx.js';
import { download } from './roster.js';
import { today } from './format.js';
import {
  enterSessionFrom,
  importClassFile,
  openFromCard,
  pickFile,
  refreshClasses,
  render,
  state,
} from './state.js';
import { openOverlay } from './overlays/index.js';

/** 多选态下已经被勾上的班，按列表顺序。 */
function pickedClasses() {
  if (state.picking === null) {
    return [];
  }
  return state.classes.filter((klass) => state.picking.has(klass.id));
}

export function togglePick(klassId) {
  if (state.picking === null) {
    return;
  }
  if (state.picking.has(klassId)) {
    state.picking.delete(klassId);
  } else {
    state.picking.add(klassId);
  }
  render();
}

export function startPicking() {
  state.picking = new Set();
  render();
}

export function endPicking() {
  state.picking = null;
  render();
}

export function togglePickAll() {
  const picked = pickedClasses();
  state.picking = picked.length === state.classes.length ? new Set() : new Set(state.classes.map((klass) => klass.id));
  render();
}

/**
 * 把选中的班各导成一份 xlsx，装进一个 zip 下下来。
 *
 * 不能连着触发好几次下载：浏览器会拦「是否允许下载多个文件」，老师多半选否。
 */
export async function exportPicked() {
  const picked = pickedClasses();
  if (picked.length === 0) {
    return;
  }
  const entries = [];
  const used = new Set();
  for (const klass of picked) {
    const sessions = await store.listSessions(klass.id);
    const bytes = await exportClassWorkbook(klass, sessions);
    entries.push({ name: uniqueEntryName(`${klass.name}-${today()}.xlsx`, used), bytes });
  }
  download(`自习点名 ${picked.length} 个班 ${today()}.zip`, await buildZip(entries), 'application/zip');
}

/** 归档里的条目名不能重：同名时插一个序号，别让后面的把前面的顶掉。 */
function uniqueEntryName(name, used) {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const stem = dot === -1 ? name : name.slice(0, dot);
  const tail = dot === -1 ? '' : name.slice(dot);
  for (let index = 2; ; index += 1) {
    const candidate = `${stem}(${index})${tail}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
}

/** 一次删掉选中的几个班。名单可能很长，确认话里只念前三个。 */
export async function removePicked() {
  const picked = pickedClasses();
  if (picked.length === 0) {
    return;
  }
  const names = picked.slice(0, 3).map((klass) => klass.name).join('、');
  const rest = picked.length > 3 ? ` 等 ${picked.length} 个班` : '';
  const runningCount = picked.filter((klass) => state.running.has(klass.id)).length;
  const warning =
    runningCount > 0 ? `\n其中 ${runningCount} 个班正在上自习，那一场也会被删掉。` : '';
  if (!window.confirm(`删除「${names}」${rest}？${warning}\n全部记录一并删除，无法撤回。`)) {
    return;
  }
  for (const klass of picked) {
    await store.deleteClass(klass.id);
    // 删掉的正好是当前装着的那个班：把上下文一并放下，别留一个指向空班的引用
    if (state.klass?.id === klass.id) {
      state.klass = null;
      state.session = null;
      state.sessions = [];
    }
  }
  state.picking = null;
  await refreshClasses();
}

/** 删掉一个班（连同它的全部记录）。问一句，确认了才动手。 */
export async function removeClass(klass) {
  if (!window.confirm(`删除「${klass.name}」？全部记录一并删除，无法撤回。`)) {
    return false;
  }
  await store.deleteClass(klass.id);
  await refreshClasses();
  return true;
}

/**
 * 顶栏。三处共用，只在左头与右钮上不同。
 *
 * - `back` 给了就摆在**最左边、班名之前**：它是一个「离开这一屏」的动作，不在右边那排
 *   动作里。右边那排是「在这一屏里做什么」，左边是「不在这儿待了」。
 * - `actions` 是这一屏自己的动作，摆在右边最前。
 * - 接着是亮暗，最后是全屏。
 * - `fullscreen` 默认开着：看板上需要它（进自习**不**自动要全屏，见 `enterSession`，
 *   投影上要全屏就按这颗）。班级列表页关掉 —— 那一页不在教室前面用，多这一颗只是碍事。
 */
export function tabBar(options) {
  const header = h('header', { class: 'tab' });
  const left = h('div', { class: 'tab__left' });
  if (options.back !== undefined) {
    left.append(options.back);
  }
  // 顶栏上不写工具名：这一栏说的是「在哪、什么状态、能做什么」，工具名在浏览器标签上
  left.append(h('span', { class: 'tab__mark', 'aria-hidden': 'true' }));
  if (options.crumb !== undefined) {
    // 班名前面那道斜杠是「自习点名 / 高二（3）班」留下的。工具名不再写在这一栏里，
    // 前面没有东西可分了，这一道就成了一道悬着的线 —— 去掉
    left.append(h('span', { class: 'tab__sub', text: options.crumb }));
  }
  if (options.chip !== undefined) {
    left.append(options.chip);
  }
  header.append(left);

  const right = h('div', { class: 'tab__right' });
  for (const node of options.actions ?? []) {
    right.append(node);
  }
  right.append(modeButton());
  if (options.fullscreen !== false) {
    right.append(
      h('button', {
        class: 'btn btn--icon',
        'aria-label': '全屏',
        onClick: toggleFullscreen,
      }, [icon('fullscreen')]),
    );
  }
  header.append(right);
  return header;
}

/**
 * 亮暗那一颗。
 *
 * 图标与字说的都是**按下去会得到什么**（现在暗，就写「亮色」配一颗太阳）—— 一颗钮的
 * 内容读作「按了会怎样」，比读作「现在是什么」少一层反推。
 */
function modeButton() {
  const dark = currentMode() === 'dark';
  return h('button', {
    class: 'btn btn--small',
    'aria-label': dark ? '切换到亮色' : '切换到暗色',
    onClick: () => {
      toggleMode();
      // 整棵树重画：图标与这一颗的字都要跟着换
      render();
    },
  }, [icon(dark ? 'sun' : 'moon'), h('span', { text: dark ? '亮色' : '暗色' })]);
}

/**
 * 班级列表的页头动作。
 *
 * 平时是「多选 / 导入 / 新建」；进了多选态就换成批量的那几颗 —— 一个班一个班地导出、
 * 删除仍然在「设置」里，这里只管一次收拾好几个班。
 */
function renderHomeActions() {
  if (state.picking !== null) {
    const picked = pickedClasses();
    const all = state.classes.length > 0 && picked.length === state.classes.length;
    return h('div', { class: 'home__actions' }, [
      h('span', { class: 'home__picked', text: `已选 ${picked.length} / ${state.classes.length}` }),
      h('button', { class: 'btn', text: all ? '取消全选' : '全选', onClick: togglePickAll }),
      h('button', {
        class: 'btn',
        text: '导出所选',
        disabled: picked.length === 0 ? '' : undefined,
        onClick: () => void exportPicked(),
      }),
      h('button', {
        class: 'btn btn--danger',
        text: '删除所选',
        disabled: picked.length === 0 ? '' : undefined,
        onClick: () => void removePicked(),
      }),
      // 不叫「取消」：旁边就挨着「取消全选」，两颗都以取消开头容易按错
      h('button', { class: 'btn btn--quiet', text: '退出多选', onClick: endPicking }),
    ]);
  }
  // 实心的那一颗放在最右边：一排钮里最边上的一颗最好按，也最不容易跟旁边混起来
  return h('div', { class: 'home__actions' }, [
    h('button', {
      class: 'btn',
      text: '多选',
      // 一个班都没有时没什么可多选的
      disabled: state.classes.length === 0 ? '' : undefined,
      onClick: startPicking,
    }),
    h('button', {
      class: 'btn',
      text: '导入班级文件',
      onClick: () => pickFile('.xlsx', importClassFile),
    }),
    h('button', {
      class: 'btn btn--primary',
      onClick: () => openOverlay('newClass'),
    }, [icon('plus'), h('span', { text: '新建班级' })]),
  ]);
}

export function renderClassesPage() {
  const main = h('main', { class: 'page' });
  // 这一页不在教室前面用，用不上全屏钮（全屏只从看板那一颗进）
  main.append(tabBar({ fullscreen: false }));

  const body = h('div', { class: 'home' });
  const bar = h('div', { class: 'home__bar' });
  // 顶栏不再写工具名，这一页的 h1 由这个标题顶上
  bar.append(h('h1', { class: 'home__title', text: '班级' }));
  bar.append(renderHomeActions());
  body.append(bar);

  if (state.classes.length === 0) {
    // 第一次打开没人教：只给一句 + 一颗钮。怎么用等建了班在看板上自然就懂了 ——
    // 在这儿铺五条步骤，第一次来的人先读到的是说明书，而不是动手的那一下
    body.append(
      h('div', { class: 'empty' }, [
        h('p', { class: 'empty__title', text: '还没有班级' }),
        h('p', { class: 'empty__hint', text: '导入一份花名册就能开始上课' }),
        h('button', {
          class: 'btn btn--primary btn--tall',
          text: '新建班级',
          onClick: () => openOverlay('newClass'),
        }),
      ]),
    );
    main.append(body);
    return main;
  }

  const grid = h('div', { class: 'cards' });
  for (const klass of state.classes) {
    grid.append(renderClassCard(klass));
  }
  body.append(grid);
  main.append(body);
  return main;
}

/**
 * 一张班级卡：谁、多少人、有没有在跑的一场，加一行动作。
 *
 * 这里就是入口 —— 不再有单独的班级页，花名册在自习蒙版里看，设置与自习记录从这张卡
 * 上开（都是浮层）。
 *
 * 排布就两块：卡上是「这个班是什么」（名字、人数、有没有在跑、自习记录、设置），
 * 卡底是「拿它开始干活」—— 一整行都是「开始自习」。多选态下整张卡变成一个勾选项，
 * 这些钮全让位：那时候按卡片是这个意思，不是那个意思。
 */
function renderClassCard(klass) {
  const running = state.running.get(klass.id) ?? null;
  const picking = state.picking !== null;
  const picked = picking && state.picking.has(klass.id);
  const card = h('article', {
    class: `card${running !== null ? ' card--running' : ''}${picking ? ' card--pick' : ''}${picked ? ' is-picked' : ''}`,
  });
  if (picking) {
    card.setAttribute('role', 'checkbox');
    card.setAttribute('aria-checked', picked ? 'true' : 'false');
    card.tabIndex = 0;
    card.addEventListener('click', () => togglePick(klass.id));
    card.addEventListener('keydown', (event) => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        togglePick(klass.id);
      }
    });
  }

  const head = h('div', { class: 'card__head' });
  if (picking) {
    // 放在卡头上而不是标题里：标题那一列是纵的，勾选框会掉到名字上面去
    head.append(h('span', { class: 'card__pick', 'aria-hidden': 'true', text: picked ? '✓' : '' }));
  }
  const title = h('div', { class: 'card__title' });
  title.append(h('h3', { class: 'card__name', text: klass.name }));
  const meta = h('p', { class: 'card__meta' });
  meta.append(h('span', { text: `${klass.students.length} 人` }));
  if (running !== null) {
    // 正在跑的那一场写在人数这一行上：这张卡与别的班不一样的，就是它还在上着
    meta.append(h('span', { text: ' · ' }));
    meta.append(
      h('span', { class: 'card__clock' }, [
        h('span', { text: '自习中' }),
        h('b', { dataset: { clock: `card:${klass.id}` }, text: '00:00:00' }),
      ]),
    );
  }
  title.append(meta);
  head.append(title);

  if (!picking) {
    // 记录与设置都是「翻资料」，挨着放；开自习是「干活」，隔到卡底去
    const tools = h('div', { class: 'card__tools' });
    tools.append(
      h('button', {
        class: 'btn',
        text: '记录',
        onClick: () => void openFromCard(klass, 'history'),
      }),
    );
    tools.append(
      h('button', { class: 'btn', text: '设置', onClick: () => void openFromCard(klass, 'settings') }),
    );
    head.append(tools);
  }
  card.append(head);

  if (!picking) {
    const foot = h('div', { class: 'card__foot' });
    foot.append(
      h('button', {
        class: 'btn btn--primary btn--tall',
        text: running === null ? '开始自习' : '继续自习',
        onClick: () => void enterSessionFrom(klass),
      }),
    );
    card.append(foot);
  }
  return card;
}

/**
 * 看板上花名册的排布。
 *
 * 点到「没来」的人沉到最后另起一块：自习里老师看的是「谁在这儿、谁在外面」，
 * 那几个没来的放在最后才不占眼睛。**正在点名时不排** —— 那时老师正顺着名册逐个点，
 * 格子一挪就会点错人，等关掉点名层再归位。
 *
 * 已结束也照排，免得下课那一刻整块跳回去。待机蒙版与导出的明细都另按名册顺序走，
 * 这里只管看板上的显示。
 */
export function displayOrder(klass, session) {
  if (session === null || state.rollCallOpen !== null) {
    return klass.students;
  }
  const absent = new Set(session.absentIds);
  return [
    ...klass.students.filter((student) => !absent.has(student.id)),
    ...klass.students.filter((student) => absent.has(student.id)),
  ];
}
