/**
 * 自习看板与待机蒙版。
 *
 * 一次自习就是盖住整屏的这一块：颜色、计时、统计、花名册都在这里。`updateDynamic`
 * 是走秒那条路 —— 只改数字与颜色，不重画整块，免得格子闪、老师正点着的手势被打断。
 *
 * 这一块是**教室前面那块屏**，八米外看。所以：默认态（全班在座）是安静的描边块，
 * 只有没来 / 离开 / 超时才上色；动作条压在屏幕下沿（投影与触屏上手最容易到的地方）；
 * 界面上不留解释自己的话 —— 按钮的字已经说清按了会怎样。
 */

import { h, icon, root } from './dom.js';
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
  beginBatchLeave,
  doEndSession,
  doPause,
  doResume,
  doRestart,
  endPickingStudents,
  markReturnedFromIdle,
  noteActivity,
  render,
  showToast,
  startPickingStudents,
  state,
  tapStudent,
  volumeThresholdInUse,
} from './state.js';
import { displayOrder, tabBar } from './classes.js';
import { openOverlay } from './overlays/index.js';
import { openRollCall, updateRollCall } from './overlays/rollcall.js';

const tiles = new Map();

const timerText = new Map();

const metaText = new Map();

/** 多选态下每格的勾选框，键与学生 id 同 [`tiles`]。 */
const pickMarks = new Map();

/** 多选态那一条里的「已选 N 人」与「记离开」，由 [`paintPicking`] 定点改。 */
let pickedCountNode = null;

let leaveButtonNode = null;

/** 待机蒙版那一块与它里面写响度的那一行，由 [`paintIdleVolume`] 定点改。 */
let idleMaskNode = null;

let idleVolumeNode = null;

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
          class: 'btn btn--small',
          onClick: () => {
            state.mask = null;
            // 多选态跟着看板一起收：回来时那几颗勾还在，反而像没退出去
            state.pickingStudents = null;
            render();
          },
        }, [icon('back'), h('span', { text: '返回' })]),
        h('button', {
          class: 'btn btn--small',
          onClick: () => openOverlay('history'),
        }, [icon('history'), h('span', { text: '记录' })]),
      ].filter((node) => node !== undefined),
    }),
  );

  // 结束一场就收起看板（见 `doEndSession`），所以这里不会再画「已结束」的样子：
  // 走到这个函数时要么在自习中，要么是刷新时读到一场还没结束的
  const body = h('div', { class: 'board' });
  body.append(h('div', { class: 'board__head' }, [renderClock(), renderStatusBar()]));

  const grid = h('div', { class: 'grid' });
  grid.style.setProperty('--cols', String(themeColumns(klass.theme)));
  if (klass.students.length === 0) {
    grid.append(h('p', { class: 'empty__hint', text: '这个班还没有学生。到「设置」里导入名册。' }));
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
  body.append(renderControls());
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
  idleMaskNode = section;

  const center = h('div', { class: 'idle__center' });
  center.append(h('span', { class: 'idle__class', text: klass.name }));
  center.append(h('span', { class: 'idle__wall', dataset: { clock: 'wall' }, text: '--:--' }));
  center.append(
    h('span', { class: 'idle__elapsed' }, [
      h('span', { text: '自习已进行 ' }),
      h('b', { dataset: { clock: 'elapsed' }, text: '00:00:00' }),
    ]),
  );
  center.append(h('span', { class: 'idle__counts', dataset: { idle: 'counts' }, text: '' }));
  // 教室的响度：听着的时候才有这一行 —— 老师得看得见机器读的是什么数，
  // 不然那条阈值线凭什么是那个位置就没法判断
  idleVolumeNode = h('span', { class: 'idle__volume' });
  center.append(idleVolumeNode);
  section.append(center);

  const away = session === null ? [] : awayStudents(klass, session);
  const foot = h('div', { class: 'idle__away' });
  foot.append(
    h('span', {
      class: 'idle__away-title',
      text: away.length === 0 ? '现在没有人在外面' : `离开中 ${away.length} 人，点一下名字就记他回来`,
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
  section.append(h('p', { class: 'idle__hint', text: '点屏幕回到看板' }));
  paintIdleVolume();
  return section;
}

/**
 * 待机页按教室的响度染色。
 *
 * 只染**底**那一层：大钟的字、统计、还有那几张「离开中」的卡片都不动 —— 卡片刷的是那条
 * 备注的颜色，压在淡底上本来就得看得清；字色再跟着底色走，从后排反而更难读。
 *
 * 底与那一行读数都按「读数离阈值多远」算，**不用**那个带迟滞的判定：染色要回答的是
 * 「现在离那条线多近」，判定要回答的是「算不算吵起来了」（那一套要守 3 拍、回落要守 1 秒，
 * 拿它染色会看到「教室已经安静了、屏幕还暖着」）。两处用同一个问法，屏幕上才不会自相矛盾。
 */
export function paintIdleVolume() {
  if (idleMaskNode === null) {
    return;
  }
  if (!state.listening) {
    // 没在听就一点颜色都不留，回到纸底 —— 屏幕上偏绿偏暖总该有来由
    idleMaskNode.dataset.volume = 'off';
    idleVolumeNode.textContent = '';
    idleVolumeNode.classList.remove('is-over');
    return;
  }
  const threshold = volumeThresholdInUse();
  const level = state.volumeLevel;
  const gap = level - threshold;
  idleMaskNode.dataset.volume =
    gap >= 20 ? 'over' : gap >= 8 ? 'warm' : gap > -8 ? 'edge' : gap > -20 ? 'quiet' : 'calm';
  idleVolumeNode.textContent = `教室 ${level} · 阈值 ${threshold}`;
  idleVolumeNode.classList.toggle('is-over', gap >= 0);
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
  const bar = h('div', { class: 'board__foot' });

  // 多选态下那一排动作钮全让位 —— 那时按格子是「选他」，暂停 / 点名 / 结束都不该待在
  // 手边（与班级卡多选时钮让位是同一个道理）
  if (state.pickingStudents !== null) {
    bar.append(renderPickBar());
    return bar;
  }

  // 走到这里 session 一定是在跑的那一场：结束一场就收起看板（见 `doEndSession`），
  // 所以这里没有「已结束 / 还没有场」的分支。
  const session = state.session;
  const start = h('div', { class: 'board__foot-group' });
  // 自习中：暂停 / 继续是这一相最常按的，所以它是实心的那一颗
  start.append(
    isPaused(session)
      ? h('button', {
          class: 'btn btn--primary btn--tall',
          onClick: () => void doResume(),
        }, [icon('play'), h('span', { text: '继续自习' })])
      : h('button', {
          class: 'btn btn--primary btn--tall',
          onClick: () => void doPause(),
        }, [icon('pause'), h('span', { text: '暂停自习' })]),
  );
  start.append(
    h('button', {
      class: 'btn btn--tall',
      onClick: () => openRollCall(),
    }, [icon('check'), h('span', { text: '点名' })]),
  );
  start.append(
    h('button', {
      class: 'btn btn--tall',
      onClick: () => startPickingStudents(),
    }, [icon('users'), h('span', { text: '多人离开' })]),
  );

  // 本场的开关（听教室 / 自动待机 / 看大时钟 / 静音）与收尾那一组一起靠右：
  // 左边是「接着上课」，右边是「这一场怎么过、什么时候完」
  const end = h('div', { class: 'board__foot-group board__foot-group--end' });
  end.append(restartButton());
  end.append(
    h('button', {
      class: 'btn btn--danger btn--tall',
      text: '结束自习',
      onClick: () => void doEndSession(),
    }),
  );

  bar.append(start);
  bar.append(
    h('div', { class: 'board__foot-group' }, [
      listenButton(),
      idleButton(),
      idleJumpButton(),
      muteButton(),
      end,
    ]),
  );
  return bar;
}

/**
 * 多选态那条钮：选了几个、记离开、退出。
 *
 * 「记离开」是这一态里唯一的出口，所以它是主行动，一颗没勾时按住不让按（见
 * `paintPicking`）—— 那时按下去只会开一层空的备注窗。
 */
function renderPickBar() {
  const bar = h('div', { class: 'board__foot-group' });
  pickedCountNode = h('span', {
    class: 'controls__picked',
    text: `已选 ${state.pickingStudents.size} 人`,
  });
  bar.append(pickedCountNode);
  leaveButtonNode = h('button', {
    class: 'btn btn--primary btn--tall',
    text: '记离开',
    disabled: state.pickingStudents.size === 0 ? '' : undefined,
    onClick: () => beginBatchLeave(),
  });
  bar.append(leaveButtonNode);
  bar.append(
    h('button', {
      class: 'btn btn--tall',
      text: '退出多选',
      onClick: () => endPickingStudents(),
    }),
  );
  return bar;
}

/**
 * 「重开一场」：把这一场结束掉，另开一场。
 *
 * 上课时什么情况都能遇到（点错一堆、被别的事打断、想从头记），所以给一手干净的：
 * 先确认，再结束 + 开新场。旧的那一场留在记录里，不删。
 */
function restartButton() {
  return h('button', {
    class: 'btn',
    onClick: () => {
      if (window.confirm('结束这一场并另开一场？这一场的记录会留着。')) {
        void doRestart();
      }
    },
  }, [icon('restart'), h('span', { text: '重开一场' })]);
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
  const on = !never && !state.idleOff;
  return h('button', {
    class: `btn btn--small${on ? '' : ' is-on'}`,
    'aria-pressed': on ? 'false' : 'true',
    disabled: never ? '' : undefined,
    onClick: () => {
      if (never) {
        return;
      }
      state.idleOff = !state.idleOff;
      showToast(state.idleOff ? '这一场不再自动换成大时钟' : '这一场恢复自动待在待机屏');
      render();
    },
  }, [icon(on ? 'moon' : 'sun'), h('span', { text: '自动待机' })]);
}

/**
 * 听教室。
 *
 * 教室的响度是**整场自习**的事，不是待机页那一块屏的事 —— 所以这一颗管的是「这一场
 * 听不听」，待机页只是它的一块显示屏。麦克风是一只能伸进教室的耳朵，所以默认不听。
 *
 * 点开的是浮层而不是当场切换：浮层里要摆那条阈值尺与当前的读数（老师得看着数拧它）。
 */
function listenButton() {
  const on = state.listening;
  return h('button', {
    class: `btn btn--small${on ? ' is-on' : ''}`,
    'aria-pressed': on ? 'true' : 'false',
    onClick: () => openOverlay('listen'),
  }, [icon(on ? 'mic' : 'mic-off'), h('span', { text: '听教室' })]);
}

/**
 * 现在就去待机屏。
 *
 * 与旁边那颗「自动待机」是**两件事**：那一颗管的是「这一场要不要自己换屏」，这一颗管的是
 * 「现在就换过去」—— 课上常常是老师要离开一会儿，随手把屏幕换成大钟；也常常是班设置里
 * 选了「不切」，而某一刻就是想要那块钟。
 */
function idleJumpButton() {
  return h('button', {
    class: 'btn btn--small',
    onClick: () => {
      state.mask = 'idle';
      render();
    },
  }, [icon('clock'), h('span', { text: '大时钟' })]);
}

/**
 * 本场静音。
 *
 * 教室里铃突然响起来，老师需要当场掐掉。这一下只影响这一场（不改班级设置）；
 * 刷新页面会恢复。
 */
function muteButton() {
  const muted = state.muted;
  return h('button', {
    class: `btn btn--small${muted ? ' is-on' : ''}`,
    'aria-pressed': muted ? 'true' : 'false',
    onClick: () => {
      state.muted = !state.muted;
      showToast(state.muted ? '这一场不再出声' : '这一场恢复出声');
      render();
    },
  }, [icon(muted ? 'volume-off' : 'volume'), h('span', { text: muted ? '已静音' : '静音' })]);
}

/**
 * 四个计数，同时就是四色的字典。
 *
 * 每个数前面带自己的色点 —— 图例不必另起一行：老师看数字的时候顺带就把颜色认了，
 * 而单独一行小灰字在投影上根本读不出来。
 *
 * 「应到」与「离开人次」不摆在这儿：应到等于在座加没来（一眼算得出），离开人次这一场
 * 结束时去「记录」里看更合适 —— 看板上只留需要当场反应的四个数。
 */
function renderStatusBar() {
  const bar = h('div', { class: 'board__stats' });
  const items = [
    { key: 'present', label: '在座', tone: 'present' },
    { key: 'absent', label: '没来', tone: 'absent' },
    { key: 'left', label: '离开', tone: 'yellow' },
    { key: 'overtime', label: '超时', tone: 'overtime' },
  ];
  for (const item of items) {
    const cell = h('span', { class: 'stat' });
    cell.append(h('i', { class: 'stat__dot', dataset: { status: item.tone } }));
    cell.append(h('span', { class: 'stat__label', text: item.label }));
    const value = h('span', { class: 'stat__value', text: '0' });
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
  const picking = pickingTile(student.id);
  const picked = picking && state.pickingStudents.has(student.id);
  const tile = h('button', {
    class: `tile${picking ? ' tile--pick' : ''}${picked ? ' is-picked' : ''}`,
    dataset: { studentId: student.id },
    title: tileTitle(student),
  });
  if (picking) {
    // 多选态下这一格是勾选框：勾没勾得上报给读屏，别只靠那颗小勾的颜色
    tile.setAttribute('aria-pressed', picked ? 'true' : 'false');
    const mark = h('span', { class: 'tile__pick', 'aria-hidden': 'true', text: picked ? '✓' : '' });
    pickMarks.set(student.id, mark);
    tile.append(mark);
  }
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
 * 这一格在多选态下要不要长勾选框。
 *
 * 只认在座的人：多选是为了「给几个要走的人一起记离开」，没来的、已经在外面的人都勾
 * 不动（点上去由 `togglePickStudent` 顶一句），那几格就不该长出一颗按不了的勾。
 */
function pickingTile(studentId) {
  if (state.pickingStudents === null || state.session === null) {
    return false;
  }
  return statusOf(state.session, studentId, state.now, state.klass) === STATUS.PRESENT;
}

/**
 * 多选态那一层：勾选框、已选人数、以及「记离开」能不能按。
 *
 * 点一下只改那一个格子与那两个数 —— 整块重画会把指头底下那颗节点换掉（点击事件还在
 * 它身上），连点就会丢。
 */
export function paintPicking() {
  const picking = state.pickingStudents !== null;
  const picked = picking ? state.pickingStudents.size : 0;
  for (const [studentId, mark] of pickMarks) {
    const on = picking && state.pickingStudents.has(studentId);
    mark.textContent = on ? '✓' : '';
    const tile = tiles.get(studentId);
    if (tile !== undefined) {
      tile.classList.toggle('is-picked', on);
      tile.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }
  if (pickedCountNode !== null) {
    pickedCountNode.textContent = `已选 ${picked} 人`;
  }
  if (leaveButtonNode !== null) {
    // 一个都没勾时按住不让按：按下去只会开一层空的备注窗
    leaveButtonNode.disabled = picked === 0;
  }
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
      counts.textContent = `在座 ${summary.present} · 没来 ${summary.absent} · 离开 ${summary.left} · 超时 ${summary.overtime}`;
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
    // 离开与超时只在真有人的时候点亮 —— 0 是常态，不该一直在那儿发亮
    if (node.dataset.metric === 'left') {
      node.classList.toggle('is-on', Number(next) > 0);
      node.classList.toggle('is-left', Number(next) > 0);
    }
    if (node.dataset.metric === 'overtime') {
      node.classList.toggle('is-on', Number(next) > 0);
    }
  }
}

/** 清掉上一帧那些格子的索引。整块重画之前先清，免得指向已经拆下来的节点。 */
export function resetTileRefs() {
  tiles.clear();
  timerText.clear();
  metaText.clear();
  pickMarks.clear();
  pickedCountNode = null;
  leaveButtonNode = null;
  idleMaskNode = null;
  idleVolumeNode = null;
}
