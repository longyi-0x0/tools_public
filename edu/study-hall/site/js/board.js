/**
 * 自习看板与待机蒙版。
 *
 * 一次自习就是盖住整屏的这一块：颜色、计时、统计、花名册都在这里。`updateDynamic`
 * 是走秒那条路 —— 只改数字与颜色，不重画整块，免得格子闪、老师正点着的手势被打断。
 */

import { h, root } from './dom.js';
import { renderLegend } from './legend.js';
import { formatDuration, formatStudyTime } from './format.js';
import {
  PHASE,
  STATUS,
  activeLeave,
  awayMs,
  isAwayStatus,
  isPaused,
  remarkTextOf,
  statusOf,
  studyMs,
  summarize,
  themeColumns,
} from './domain.js';
import {
  doEndSession,
  doPause,
  doResume,
  doRestart,
  markReturnedFromIdle,
  noteActivity,
  render,
  showToast,
  state,
  tapStudent,
} from './state.js';
import { displayOrder, tabBar } from './classes.js';
import { openOverlay } from './overlays/index.js';
import { openRollCall, updateRollCall } from './overlays/rollcall.js';

const tiles = new Map();

const timerText = new Map();

const metaText = new Map();

/** 一句话说清当前这一相要老师做什么。 */
function phaseHint(klass, session) {
  if (session === null) {
    return '按「开始自习」进入计时；想点名就按「点名」。';
  }
  if (session.phase === PHASE.ENDED) {
    return '这一场结束了。要接着来就按「收起」回班级列表，再开一场；记录在「自习记录」里。';
  }
  if (isPaused(session)) {
    return `已暂停：自习时间停在 ${formatStudyTime(studyMs(session, state.now))}，外面的人也一起停表。按「继续自习」接着走。`;
  }
  const summary = summarize(klass, session, state.now);
  return summary.absent > 0
    ? `自习中：灰色 ${summary.absent} 人没来。在座的人点一下就记他离开，回来再点一下；按「点名」可以把没来的人挑出来。`
    : '自习中：全班都在座。有人临时离开就点一下他，会开始计时；回来再点一下。';
}

/**
 * 一次自习：盖住整屏的一块。
 *
 * 相变了才整块重画（钮要换），走秒的数字由 `updateDynamic` 定点改。
 */
export function renderSessionMask() {
  const klass = state.klass;
  const section = h('section', { class: 'mask mask--session', 'data-theme': klass.theme });

  const running = state.session !== null && state.session.phase !== PHASE.ENDED;
  // 点名层开着时顶栏也说得清：那时点格子是「他没来」，不是「他离开」
  const chipText = state.rollCallOpen !== null ? '点名中' : running ? '自习中' : '已结束';
  const chipClass = state.rollCallOpen !== null ? 'chip--calling' : `chip--${state.session?.phase ?? PHASE.ENDED}`;
  section.append(
    tabBar({
      crumb: klass.name,
      chip: state.session === null ? undefined : h('span', { class: `chip ${chipClass}`, text: chipText }),
      actions: [
        h('button', {
          class: 'btn',
          // 「收起」两个字没说清收起之后还在计时，容易被读成「结束」
          text: running ? '先收起' : '收起',
          title: running ? '收起看板，自习继续计时' : '收起看板，回到班级列表',
          onClick: () => {
            state.mask = null;
            render();
          },
        }),
        h('button', { class: 'btn', text: '自习记录', onClick: () => openOverlay('history') }),
      ].filter((node) => node !== undefined),
    }),
  );

  // 结束一场就收起看板（见 `doEndSession`），所以这里不会再画「已结束」的样子：
  // 走到这个函数时要么在自习中，要么是刷新时读到一场还没结束的
  const body = h('div', { class: 'board' });
  body.append(renderControls());
  body.append(h('div', { class: 'board__head' }, [renderClock(), renderStatusBar()]));
  body.append(renderLegend());

  const grid = h('div', { class: 'grid' });
  grid.style.setProperty('--cols', String(themeColumns(klass.theme)));
  if (klass.students.length === 0) {
    grid.append(h('p', { class: 'empty__hint', text: '这个班还没有学生。收起这块，到「设置」里导入名册。' }));
  }
  // 点到「没来」的人沉到后面，中间画一条线说清那是另一拨人。
  // 正在点名时不画：那时格子按名册冻着，这条线指的「后面那一拨」并不成立，
  // 而且逐个人点只走定点更新，线的位置与人数会一直停在开门那一刻
  const order = displayOrder(klass, state.session);
  const absent = new Set(state.session?.absentIds ?? []);
  const absentStart = state.rollCallOpen !== null ? -1 : order.findIndex((student) => absent.has(student.id));
  for (const [index, student] of order.entries()) {
    if (index === absentStart && absentStart > 0) {
      grid.append(
        h('p', {
          class: 'grid__divider',
          text: `没来 ${order.length - absentStart} 人`,
        }),
      );
    }
    const tile = renderTile(student);
    tiles.set(student.id, tile);
    grid.append(tile);
  }
  body.append(grid);
  section.append(body);

  return section;
}

/**
 * 待机蒙版：自习中一段时间没人碰屏幕，就换成这一块。
 *
 * 教室前面那块屏，老师不操作时不该一直亮着几十个名字。中间一个大钟，底下「谁还在
 * 外面」—— 从最后一排也看得见。碰哪儿都回到自习看板；点某一张离开的卡片，直接把
 * 那个人记成归来（那是最常用的一手，不必再进一层）。
 */
export function renderIdleMask() {
  const klass = state.klass;
  const session = state.session;
  const section = h('section', {
    class: 'mask mask--idle',
    'data-theme': klass.theme,
    onClick: () => {
      state.mask = 'session';
      noteActivity();
      render();
    },
  });

  const center = h('div', { class: 'idle__center' });
  center.append(h('span', { class: 'idle__wall', dataset: { clock: 'wall' }, text: '--:--' }));
  center.append(
    h('span', { class: 'idle__elapsed' }, [
      h('span', { text: '自习已进行 ' }),
      h('b', { dataset: { clock: 'elapsed' }, text: '00:00:00' }),
    ]),
  );
  center.append(h('span', { class: 'idle__counts', dataset: { idle: 'counts' }, text: '' }));
  section.append(center);

  const away = session === null ? [] : awayStudents(klass, session);
  const foot = h('div', { class: 'idle__away' });
  foot.append(
    h('span', {
      class: 'idle__away-title',
      text: away.length === 0 ? '现在没有人在外面' : `离开中 ${away.length} 人 · 点一下记归来`,
    }),
  );
  if (away.length > 0) {
    const cards = h('div', { class: 'idle__cards' });
    for (const item of away) {
      const card = h('button', {
        class: `idle__card idle__card--${item.status}`,
        onClick: (event) => {
          // 这一下不要冒到蒙版上（冒上去就变成「回到看板」了）
          event.stopPropagation();
          void markReturnedFromIdle(item.student.id);
        },
      });
      card.append(h('span', { class: 'idle__card-name', text: item.student.name }));
      if (item.remark !== '') {
        card.append(h('span', { class: 'idle__card-remark', text: item.remark }));
      }
      card.append(
        h('span', {
          class: 'idle__card-time',
          dataset: { away: item.student.id },
          text: formatDuration(item.awayMs),
        }),
      );
      cards.append(card);
    }
    foot.append(cards);
  }
  section.append(foot);
  section.append(h('p', { class: 'idle__hint', text: '点一下屏幕回到看板' }));
  return section;
}

/** 现在在外面的人，按离开的先后排。 */
function awayStudents(klass, session) {
  const now = state.now;
  const items = [];
  for (const student of klass.students) {
    const leave = activeLeave(session, student.id);
    if (leave === undefined) {
      continue;
    }
    const status = statusOf(session, student.id, now, klass);
    items.push({
      student,
      status,
      awayMs: awayMs(session, student.id, now),
      remark: remarkTextOf(klass, leave),
    });
  }
  return items.sort((left, right) => right.awayMs - left.awayMs);
}

function renderControls() {
  const bar = h('div', { class: 'controls' });
  const hint = h('p', { class: 'controls__hint' });
  hint.dataset.hint = '1';
  bar.append(hint);

  // 主行动、普通行动、低频破坏性各占一档：原来全是 btn--tall，一排按钮一样重，
  // 手快就会按到「结束并重开」上。
  // 走到这里 session 一定是在跑的那一场：结束一场就收起看板（见 `doEndSession`），
  // 所以这里没有「已结束 / 还没有场」的分支。
  const buttons = h('div', { class: 'controls__buttons' });
  const session = state.session;
  // 自习中：暂停 / 继续是这一相最常按的，点名是「想点才点」的那一颗。
  // 按下去的频次差得远，所以点名压一档，不跟暂停同一排同一种重量。
  buttons.append(
    isPaused(session)
      ? h('button', {
          class: 'btn btn--primary btn--tall',
          text: '继续自习',
          onClick: () => void doResume(),
        })
      : h('button', {
          class: 'btn btn--tall',
          text: '暂停自习',
          title: '自习时间与外面的人都一起停表',
          onClick: () => void doPause(),
        }),
  );
  buttons.append(
    h('button', {
      class: 'btn btn--tall',
      text: '点名',
      title: '逐个挑出没来的人；不点也一样自习',
      onClick: () => openRollCall(),
    }),
  );
  buttons.append(
    h('button', {
      class: 'btn btn--tall',
      text: '结束自习',
      title: '这一场定格，回到班级列表',
      onClick: () => void doEndSession(),
    }),
  );
  buttons.append(quietGroup([restartButton(), idleButton(), muteButton()]));
  bar.append(buttons);
  return bar;
}

/**
 * 「结束并重开」：把这一场结束掉，另开一场。
 *
 * 上课时什么情况都能遇到（点错一堆、被别的事打断、想从头记），所以给一手干净的：
 * 先确认，再结束 + 开新场。旧的那一场留在记录里，不删。低频又不可回退，所以摆在小
 * 字那格里，不与「暂停 / 结束」同重。
 */
function restartButton() {
  return h('button', {
    class: 'btn',
    text: '结束并重开',
    title: '结束这一场，另开一场（这一场的记录会留着）',
    onClick: () => {
      if (window.confirm('结束这一场并另开一场？这一场的记录会留着。')) {
        void doRestart();
      }
    },
  });
}

/** 低频动作盛在一条细分隔线之后，与主行动拉开距离。 */
function quietGroup(children) {
  return h('div', { class: 'controls__quiet' }, children);
}

/**
 * 本场不切待机蒙版。
 *
 * 教室里老师正讲着一道题、或者那会儿就是要一直盯着花名册，屏幕上忽然换成一个大钟
 * 很碍事 —— 与「本场静音」同理，这一颗当场就能按住，而不是去设置里翻。
 *
 * 班级设置里那个「多久不动就换成大时钟」管的是**多快切**，这一颗管的是**这一场切不切**：
 * 设成「不切」的班这一颗压暗按不动（本来就永不切），说清原因而不是让它按下去没反应。
 */
function idleButton() {
  const never = (state.klass?.idleMaskMs ?? 0) <= 0;
  const off = state.idleOff;
  return h('button', {
    class: !never && off ? 'btn btn--icon is-on' : 'btn btn--icon',
    text: off || never ? '☀️' : '🌙',
    title: never
      ? '这个班在设置里选了「不切」，这一场就不会自己换屏'
      : off
        ? '本场不自动换成大时钟，点一下开回来'
        : '本场会在一段时间没人碰屏幕后换成大时钟，点一下本场就不切',
    'aria-label': off ? '本场已关掉自动待机' : '本场自动待机',
    disabled: never ? '' : undefined,
    onClick: () => {
      if (never) {
        return;
      }
      state.idleOff = !state.idleOff;
      showToast(state.idleOff ? '本场不再自己换成大时钟' : '本场恢复自动待机');
    },
  });
}

/**
 * 本场静音。
 *
 * 教室里铃突然响起来，老师需要当场掐掉，而不是去设置里翻。这一下只影响这一场
 * （不改班级设置）；刷新页面会恢复 —— 宁可多响一次，也别一直静着没人知道。
 */
function muteButton() {
  const muted = state.muted;
  return h('button', {
    class: muted ? 'btn btn--icon is-on' : 'btn btn--icon',
    text: muted ? '🔇' : '🔊',
    title: muted ? '本场已静音超时提醒，点一下开回来' : '本场静音超时提醒',
    'aria-label': muted ? '本场已静音' : '本场静音',
    onClick: () => {
      state.muted = !state.muted;
      showToast(state.muted ? '本场不再出声' : '本场恢复出声');
    },
  });
}

function renderStatusBar() {
  const bar = h('div', { class: 'status' });
  const items = [
    { key: 'total', label: '应到', tone: '' },
    { key: 'present', label: '在座', tone: 'present' },
    { key: 'absent', label: '没来', tone: 'absent' },
    { key: 'left', label: '离开中', tone: 'left' },
    { key: 'overtime', label: '超时', tone: 'overtime' },
    { key: 'leaves', label: '离开人次', tone: '' },
  ];
  for (const item of items) {
    const cell = h('div', { class: 'status__cell' });
    cell.append(h('span', { class: 'status__label', text: item.label }));
    const value = h('span', { class: `status__value ${item.tone === '' ? '' : `is-${item.tone}`}`, text: '0' });
    value.dataset.metric = item.key;
    cell.append(value);
    bar.append(cell);
  }
  return bar;
}

/**
 * 自习时间：这一屏最大的那个数。
 *
 * 教室前面的屏，老师抬头第一眼要能读到「这一节自习走了多久」。所以它比统计那几个
 * 数都大，值单独挂 `data-clock` 给走秒那条路定点改，不整块重画。
 */
function renderClock() {
  const clock = h('div', { class: 'clock' });
  clock.append(h('span', { class: 'clock__label', text: '自习时间' }));
  const value = h('span', { class: 'clock__value', text: '00:00:00' });
  value.dataset.clock = 'study';
  clock.append(value);
  // 「已暂停」跟在数字后面，由走秒那条路定点改（不重画整块）
  clock.append(h('span', { class: 'clock__paused', dataset: { pause: 'tag' }, text: '' }));
  return clock;
}

function renderTile(student) {
  const tile = h('button', {
    class: 'tile',
    dataset: { studentId: student.id },
    title: tileTitle(student),
  });
  tile.append(h('span', { class: 'tile__name', text: student.name }));
  const meta = h('span', { class: 'tile__meta', text: seatLine(student) });
  tile.append(meta);
  metaText.set(student.id, meta);
  const timer = h('span', { class: 'tile__timer' });
  tile.append(timer);
  timerText.set(student.id, timer);
  tile.addEventListener('click', () => void tapStudent(student.id));
  return tile;
}

/**
 * 格子第二行。
 *
 * 只给一样：有座位号就给座位号，没有才退到学号。原来两个并排写成「1号 · 01」，
 * 看着像写重了 —— 老师认人靠座位，学号留给悬停提示。
 */
export function seatLine(student) {
  if (student.seat !== '') {
    return `${student.seat}号`;
  }
  return student.code;
}

/** 格子的悬停提示：座位与学号都写全。 */
export function tileTitle(student) {
  const bits = [student.name];
  if (student.seat !== '') {
    bits.push(`${student.seat}号`);
  }
  if (student.code !== '') {
    bits.push(`学号 ${student.code}`);
  }
  return bits.join(' · ');
}

/**
 * 读表的时刻。
 *
 * 一场结束之后再走秒就是错的：格子里的数字会一直往上爬，比小结里的账还大，
 * 超时判定也跟着漂。所以结束了就一律定格在下课那一刻。墙钟不走这里 —— 那是真时间。
 */
function readAt(session, now) {
  return session?.endedAt ?? now;
}

/**
 * 走秒：只改颜色、计时与统计数，不重画整块。
 *
 * 每 500ms 一次。格子多的时候这是唯一不闪的做法 —— 重画会把还没落的手势打断。
 */
export function updateDynamic() {
  const now = state.now;

  if (state.mask === 'idle') {
    updateIdle();
    return;
  }
  // 班级列表上没有看板，但卡片上有还在跑的那一场的时钟
  if (state.mask === null) {
    updateCardClocks(now);
    return;
  }
  if (state.klass === null) {
    return;
  }
  const session = state.session;
  const at = readAt(session, now);
  updateCardClocks(at);

  if (state.mask !== 'session') {
    return;
  }

  // 点名层开着时，名字的灰蓝也走定点更新 —— 点一下只换一个格子的脸，
  // 不重画整块（重画会把老师正点着的那个位置和键盘焦点一起丢掉）
  updateRollCall();

  for (const student of state.klass.students) {
    const tile = tiles.get(student.id);
    if (tile === undefined) {
      continue;
    }
    const timer = timerText.get(student.id);
    const meta = metaText.get(student.id);
    if (session === null) {
      tile.dataset.status = STATUS.PRESENT;
      if (timer !== undefined) {
        timer.textContent = '';
      }
      if (meta !== undefined) {
        meta.textContent = seatLine(student);
      }
      continue;
    }
    const status = statusOf(session, student.id, at, state.klass);
    tile.dataset.status = status;
    if (timer === undefined) {
      continue;
    }
    if (isAwayStatus(status) || status === STATUS.OVERTIME) {
      timer.textContent = formatDuration(awayMs(session, student.id, at));
      // 离开时这一行换成原因：老师更要知道为什么，而不是他坐哪
      if (meta !== undefined) {
        const remark = remarkTextOf(state.klass, activeLeave(session, student.id));
        meta.textContent = remark === '' ? '离开中' : remark;
      }
    } else {
      timer.textContent = '';
      if (meta !== undefined) {
        meta.textContent = seatLine(student);
      }
    }
  }

  const summary = session === null
    ? { total: state.klass.students.length, present: 0, absent: state.klass.students.length, left: 0, overtime: 0, leaveCount: 0 }
    : summarize(state.klass, session, now);

  // 提示语随点名进度变，但它不换结构，所以在这里定点改
  const hint = root.querySelector('[data-hint]');
  if (hint !== null) {
    hint.textContent = phaseHint(state.klass, session);
  }

  // 自习时间：开始自习就在走；暂停时停住并标注；结束后定住
  const clock = root.querySelector('[data-clock="study"]');
  if (clock !== null) {
    clock.textContent = formatStudyTime(session === null ? 0 : studyMs(session, now));
    clock.classList.toggle('is-idle', session === null);
    clock.classList.toggle('is-paused', session !== null && isPaused(session));
  }
  const pauseTag = root.querySelector('[data-pause="tag"]');
  if (pauseTag !== null) {
    pauseTag.textContent = session !== null && isPaused(session) ? '已暂停' : '';
  }
  const values = {
    total: String(summary.total),
    present: String(summary.present),
    absent: String(summary.absent),
    left: String(summary.left),
    overtime: String(summary.overtime),
    leaves: String(summary.leaveCount),
  };
  applyMetricValues(values);
}

/**
 * 班级卡上那些「自习中 00:12:33」。
 *
 * 蒙版收起来以后，还在跑的那一场只能从卡片上看出走了多久。一张卡一个节点，
 * 名字是 `card:<班级 id>`，从 `state.running` 里取那一场。
 */
function updateCardClocks(now) {
  for (const node of root.querySelectorAll('[data-clock^="card:"]')) {
    const session = state.running.get(node.dataset.clock.slice('card:'.length)) ?? null;
    node.textContent =
      session !== null ? formatStudyTime(studyMs(session, readAt(session, now))) : '00:00:00';
  }
}

/** 待机蒙版：墙钟、自习已进行、统计一行、每张卡片上的时长。 */
function updateIdle() {
  const now = state.now;
  const session = state.session;
  const wall = root.querySelector('[data-clock="wall"]');
  if (wall !== null) {
    const date = new Date(now);
    wall.textContent = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  const elapsed = root.querySelector('[data-clock="elapsed"]');
  if (elapsed !== null) {
    elapsed.textContent = formatStudyTime(session === null ? 0 : studyMs(session, readAt(session, now)));
  }
  if (session !== null) {
    const at = readAt(session, now);
    const summary = summarize(state.klass, session, at);
    const counts = root.querySelector('[data-idle="counts"]');
    if (counts !== null) {
      counts.textContent = `应到 ${summary.total} · 在座 ${summary.present} · 没来 ${summary.absent} · 离开中 ${summary.left}`;
    }
    for (const node of root.querySelectorAll('[data-away]')) {
      const studentId = node.dataset.away;
      node.textContent = formatDuration(awayMs(session, studentId, at));
    }
  }
}

function applyMetricValues(values) {
  for (const node of root.querySelectorAll('[data-metric]')) {
    const next = values[node.dataset.metric];
    if (next !== undefined && node.textContent !== next) {
      node.textContent = next;
    }
    if (node.dataset.metric === 'left' || node.dataset.metric === 'overtime') {
      node.classList.toggle('is-on', Number(next) > 0);
    }
  }
}

/** 清掉上一帧那些格子的索引。整块重画之前先清，免得指向已经拆下来的节点。 */
export function resetTileRefs() {
  tiles.clear();
  timerText.clear();
  metaText.clear();
}
