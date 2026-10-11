/**
 * 界面与装配。
 *
 * 没有框架：工具页是静态页，不经打包器。一棵 DOM 树、一份状态、一个整块重画
 * 的函数 —— 整块重画只在**结构性变化**时发生（换视图、点名、结束一场）；
 * 走秒的数字与颜色由 `tick()` 定点改，不重画整块，免得格子闪、输入框失焦。
 */

import {
  PHASE,
  STATUS,
  activeLeave,
  awayMs,
  beginRollCall,
  createKlass,
  dueAlerts,
  endRollCall,
  endSession,
  markLeft,
  markNotified,
  markPresent,
  markReturned,
  remarkTextOf,
  startSession,
  statusOf,
  studyMs,
  summarize,
  unmarkPresent,
} from './domain.js';
import * as store from './store.js';
import * as sound from './sound.js';
import * as speech from './speech.js';
import { readSheetFile } from './readSheets.js';
import { exportClassWorkbook, parseClassWorkbook } from './klassFile.js';

/** 走秒的间隔。500ms 够计时看上去是连续的，也不费。 */
const TICK_MS = 500;
/** 一屏格子的网格：按人数选列数，人多列多、字小。 */
const GRID_COLUMNS = { junior: 5, middle: 6, senior: 8 };
/**
 * 花名册认哪些扩展名。
 *
 * `.xls` 要收：老师从教务系统拿到的名单常常是这个。但**扩展名不作数** ——
 * 读的时候按内容认（见 `readSheets.js`），这里只是给文件选择框一个提示。
 */
const ROSTER_ACCEPT = '.xlsx,.xls';

/** 从文件名取一个默认的班级名：去掉扩展名。 */
function baseName(fileName) {
  return fileName.replace(/\.(xlsx|xls)$/i, '');
}

const state = {
  view: 'home',
  classes: [],
  klass: null,
  session: null,
  sessions: [],
  now: Date.now(),
  /** 正在开着的浮层：null / 'newClass' / 'remark' / 'settings' / 'history' */
  overlay: null,
  /** 备注浮层当前针对的学生 id */
  remarkStudentId: null,
  /** 冲突导入：同名班级已在库时的待决文件 */
  pendingImport: null,
  toast: '',
};

const root = document.getElementById('root');
const tiles = new Map();
const timerText = new Map();
const metaText = new Map();

/* ---------- 小工具 ---------- */

function h(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === false || value === null) {
      continue;
    }
    if (key === 'class') {
      node.className = value;
    } else if (key === 'text') {
      node.textContent = value;
    } else if (key === 'html') {
      node.innerHTML = value;
    } else if (key === 'value') {
      // 一定要设**属性值**：textarea 的 value 不是 HTML 属性，按属性写进去不显示
      node.value = value;
    } else if (key === 'checked') {
      node.checked = value;
    } else if (key === 'selected') {
      node.selected = value;
    } else if (key.startsWith('on')) {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) {
      node.setAttribute(key, '');
    } else {
      node.setAttribute(key, value);
    }
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === undefined || child === null || child === false) {
      continue;
    }
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function uid(prefix) {
  const random = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

/** 毫米秒 → `12:34`；超过一小时 → `1:02:03`。 */
export function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const pad = (value) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * 自习时间的写法：一律 `时:分:秒`，两位一段。
 *
 * 大屏上的数字宽度得稳 —— 分秒那种「12:34」走到一小时忽然变成「1:02:03」，
 * 字会跳一下。所以小时位一直留着。
 */
export function formatStudyTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}

function formatDate(ms) {
  const date = new Date(ms);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 一句话说清当前这一相要老师做什么。 */
function phaseHint(klass, session) {
  switch (session.phase) {
    case PHASE.PREPARING:
      return '按「开始点名」，然后逐个点花名册上到了的同学。';
    case PHASE.ROLL_CALL: {
      const missing = klass.students.length - session.markedIds.length;
      return missing > 0 ? `点名中：还有 ${missing} 人没点到（蓝色就是没到）。` : '全班点到，按「结束点名」进入自习。';
    }
    case PHASE.SELF_STUDY: {
      const summary = summarize(klass, session, state.now);
      return summary.absent > 0
        ? `自习中：蓝色 ${summary.absent} 人未到。要是有人临时离开，点一下他。`
        : '自习中。要是有人临时离开，点一下他，会开始计时。';
    }
    default:
      return `这一场已结束，开始于 ${formatDate(session.startedAt)}。`;
  }
}

function phaseLabel(phase) {
  return { preparing: '准备', roll_call: '点名中', self_study: '自习中', ended: '已结束' }[phase] ?? phase;
}

/* ---------- 数据动作 ---------- */

async function refreshClasses() {
  state.classes = await store.listClasses();
}

async function openClass(klass) {
  state.klass = klass;
  const sessions = await store.listSessions(klass.id);
  state.sessions = sessions;
  const active = sessions.find((item) => item.phase !== PHASE.ENDED);
  state.session = active ?? null;
  state.view = 'class';
  await store.putSetting('lastClassId', klass.id);
  render();
}

/**
 * 改一场记录并落盘。所有对会话的写都走这里，免得漏存。
 *
 * 相没变就**不重画整块**：重画会把老师正点着的那个格子换掉，点得快的一下就丢了。
 * 只有相变了（按钮要换、控件要换）才整块重画。浮层收起来这种「壳变了、格子没变」
 * 的情况由调用方传 `forceRender`。
 */
/**
 * 把当前这一场同步进 `state.sessions`。
 *
 * 历史表读的是 `state.sessions` 那一份，而写只会写 `state.session` —— 不跟着换，
 * 历史表里这一场就一直是打开班级时读到的那份旧数据（明明结束了还写「进行中」）。
 */
function syncSessionList(session) {
  const index = state.sessions.findIndex((item) => item.id === session.id);
  if (index >= 0) {
    state.sessions[index] = session;
  } else {
    state.sessions = [...state.sessions, session];
  }
}

async function commitSession(next, forceRender = false) {
  if (next === state.session) {
    if (forceRender) {
      render();
    }
    return;
  }
  const phaseChanged = state.session === null || state.session.phase !== next.phase;
  state.session = next;
  syncSessionList(next);
  await store.putSession(next);
  if (phaseChanged || forceRender) {
    render();
  } else {
    updateDynamic();
  }
}

async function commitClass(next) {
  state.klass = next;
  await store.putClass(next);
  const index = state.classes.findIndex((item) => item.id === next.id);
  if (index >= 0) {
    state.classes[index] = next;
  }
  render();
}

/* ---------- 会话流程 ---------- */

async function startRecording() {
  sound.unlock();
  const session = startSession({ id: uid('s'), classId: state.klass.id, startedAt: Date.now() });
  await store.putSession(session);
  state.session = session;
  state.sessions = [...state.sessions, session];
  render();
}

async function doBeginRollCall() {
  await commitSession(beginRollCall(state.session, Date.now()));
}

async function doEndRollCall() {
  await commitSession(endRollCall(state.session, Date.now()));
}

async function doEndSession() {
  await commitSession(endSession(state.session, Date.now()));
}

/** 点一个格子。走哪条路看当前相与该学生现在的颜色。 */
async function tapStudent(studentId) {
  const session = state.session;
  if (session === null) {
    return;
  }
  const status = statusOf(session, studentId, state.now, state.klass.overtimeThresholdMs);

  if (session.phase === PHASE.ROLL_CALL) {
    await commitSession(
      status === STATUS.PRESENT ? unmarkPresent(session, studentId) : markPresent(session, studentId),
    );
    return;
  }
  if (session.phase !== PHASE.SELF_STUDY) {
    return;
  }
  if (status === STATUS.ABSENT) {
    await commitSession(markPresent(session, studentId));
    return;
  }
  if (status === STATUS.PRESENT) {
    // 变黄前先问备注：模板可以一条都不选，直接确定就是纯计时
    state.remarkStudentId = studentId;
    state.overlay = 'remark';
    render();
    return;
  }
  await commitSession(markReturned(session, studentId, Date.now()));
}

/** 备注浮层点「确定」。浮层要收起来，所以这一笔要整块重画。 */
async function confirmLeave(templateId, remark) {
  const studentId = state.remarkStudentId;
  state.overlay = null;
  state.remarkStudentId = null;
  const next = markLeft(state.session, {
    id: uid('l'),
    studentId,
    at: Date.now(),
    templateId,
    remark,
  });
  await commitSession(next, true);
}

/* ---------- 超时提醒 ---------- */

let alerting = false;

async function checkAlerts() {
  if (alerting || state.session === null || state.session.phase !== PHASE.SELF_STUDY) {
    return;
  }
  if (!state.klass.alertSound || !sound.isSupported()) {
    return;
  }
  const due = dueAlerts(state.session, state.now, state.klass.overtimeThresholdMs, state.klass.alertRepeatMs);
  if (due.length === 0) {
    return;
  }
  alerting = true;
  try {
    await sound.playOvertimeAlert();
    let session = state.session;
    const at = Date.now();
    for (const leave of due) {
      session = markNotified(session, leave.id, at);
    }
    state.session = session;
    await store.putSession(session);
  } finally {
    alerting = false;
  }
}

/* ---------- 花名册导入 ---------- */

/**
 * 把一张表的行读成名册。
 *
 * 认表头：哪一列是姓名、哪一列是学号、哪一列是座位，靠首行文字认；没有表头时
 * 退回「第一列学号、第二列姓名」。姓名空着的行跳过。
 */
function studentsFromRows(rows) {
  const cleaned = rows.filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''));
  if (cleaned.length === 0) {
    return [];
  }
  const header = cleaned[0].map((cell) => String(cell ?? '').trim());
  const findColumn = (...names) => header.findIndex((item) => names.some((name) => item.includes(name)));
  const nameColumn = findColumn('姓名', '名字', '学生');
  const hasHeader = nameColumn >= 0;
  const codeColumn = hasHeader ? findColumn('学号', '编号') : 0;
  const seatColumn = hasHeader ? findColumn('座位', '座号') : -1;
  const body = hasHeader ? cleaned.slice(1) : cleaned;

  const students = [];
  for (const row of body) {
    const name = String(row[hasHeader ? nameColumn : 1] ?? '').trim();
    if (name === '') {
      continue;
    }
    students.push({
      id: uid('stu'),
      name,
      code: codeColumn >= 0 ? String(row[codeColumn] ?? '').trim() : '',
      seat: seatColumn >= 0 ? String(row[seatColumn] ?? '').trim() : '',
    });
  }
  return students;
}

/**
 * 在一份文件的各张表里找名册。
 *
 * 先看有没有哪张表叫「名册」；没有就按顺序一张张试，取第一张能读出学生的。
 * 之所以要试而不是直接取第一张：教务系统的导出常把标题、说明各占一张表，
 * 名册在里面某一张上。
 */
function rosterFromSheets(sheets) {
  const named = sheets.find((sheet) => sheet.name.includes('名册'));
  if (named !== undefined) {
    const students = studentsFromRows(named.rows);
    if (students.length > 0) {
      return students;
    }
  }
  for (const sheet of sheets) {
    const students = studentsFromRows(sheet.rows);
    if (students.length > 0) {
      return students;
    }
  }
  return [];
}

/* ---------- 导出 / 导入整班 ---------- */

function download(filename, bytes) {
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = h('a', { href: url, download: filename });
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function exportClass(klass) {
  const sessions = await store.listSessions(klass.id);
  const bytes = await exportClassWorkbook(klass, sessions);
  download(`${klass.name}.xlsx`, bytes);
}

/** 读一个整班文件。同名时交给界面问一句。 */
async function importClassFile(file, overwrite) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const parsed = await parseClassWorkbook(bytes);
  const existing = state.classes.find((item) => item.name === parsed.klass.name);

  if (existing !== undefined && overwrite !== true) {
    state.pendingImport = { parsed, existing, file };
    state.overlay = 'conflict';
    render();
    return;
  }

  const targetId = existing !== undefined ? existing.id : uid('k');
  const klass = { ...parsed.klass, id: targetId, createdAt: existing?.createdAt ?? parsed.klass.createdAt };
  await store.putClass(klass);

  // 覆盖就是真的换一份：旧记录连同明细一起清掉，再落文件里的那些
  const existingSessions = existing !== undefined ? await store.listSessions(existing.id) : [];
  for (const session of existingSessions) {
    await store.deleteSession(session.id);
  }
  for (const session of parsed.sessions) {
    await store.putSession({ ...session, classId: targetId });
  }

  await refreshClasses();
  state.overlay = null;
  state.pendingImport = null;
  const fresh = await store.getClass(targetId);
  await openClass(fresh);
}

/* ---------- 视图 ---------- */

function render() {
  tiles.clear();
  timerText.clear();
  metaText.clear();
  root.replaceChildren(renderShell());
  // 挂上去了才算数：updateDynamic 是去已挂的 DOM 里按 data-metric 找格子的
  updateDynamic();
}

function renderShell() {
  const body = h('div', { class: 'shell' });
  body.append(renderHeader());

  if (state.view === 'home') {
    body.append(renderHome());
  } else {
    body.append(renderClassView());
  }

  if (state.toast !== '') {
    body.append(h('div', { class: 'toast', text: state.toast }));
  }
  body.append(renderOverlay());
  return body;
}

function renderHeader() {
  const header = h('header', { class: 'tab' });
  const left = h('div', { class: 'tab__left' });
  left.append(h('span', { class: 'tab__mark', 'aria-hidden': 'true' }));
  left.append(h('h1', { class: 'tab__title', text: '自习点名' }));
  if (state.klass !== null && state.view === 'class') {
    left.append(h('span', { class: 'tab__sep', text: '/' }));
    left.append(h('span', { class: 'tab__sub', text: state.klass.name }));
    if (state.session !== null) {
      left.append(
        h('span', {
          class: `chip chip--${state.session.phase}`,
          text: phaseLabel(state.session.phase),
        }),
      );
    }
  }
  header.append(left);

  const right = h('div', { class: 'tab__right' });
  if (state.view === 'class') {
    right.append(
      h('button', { class: 'btn', text: '全班记录', onClick: () => openOverlay('history') }),
    );
    right.append(
      h('button', { class: 'btn', text: '班级设置', onClick: () => openOverlay('settings') }),
    );
    right.append(
      h('button', {
        class: 'btn',
        text: '返回',
        onClick: () => {
          state.view = 'home';
          state.klass = null;
          state.session = null;
          render();
        },
      }),
    );
  }
  right.append(
    h('button', {
      class: 'btn btn--icon',
      title: '全屏',
      'aria-label': '全屏',
      text: '⛶',
      onClick: toggleFullscreen,
    }),
  );
  header.append(right);
  return header;
}

function toggleFullscreen() {
  if (document.fullscreenElement === null) {
    void document.documentElement.requestFullscreen?.();
  } else {
    void document.exitFullscreen?.();
  }
}

function renderHome() {
  const main = h('main', { class: 'home' });
  const bar = h('div', { class: 'home__bar' });
  bar.append(h('h2', { class: 'home__title', text: '班级' }));
  bar.append(
    h('div', { class: 'home__actions' }, [
      h('button', {
        class: 'btn btn--primary',
        text: '新建班级（导入名册）',
        onClick: () => openOverlay('newClass'),
      }),
      h('button', { class: 'btn', text: '导入班级文件', onClick: () => pickFile('.xlsx', importClassFile) }),
    ]),
  );
  main.append(bar);

  if (state.classes.length === 0) {
    main.append(
      h('div', { class: 'empty' }, [
        h('p', { class: 'empty__title', text: '还没有班级' }),
        h('p', {
          class: 'empty__hint',
          text: '导入一份花名册就能建班（.xlsx 或 .xls，网页表格改名的 .xls 也认）。表里有一列写着「姓名」即可，学号与座位列可选。',
        }),
      ]),
    );
    return main;
  }

  const grid = h('div', { class: 'cards' });
  for (const klass of state.classes) {
    grid.append(renderClassCard(klass));
  }
  main.append(grid);
  return main;
}

function renderClassCard(klass) {
  const card = h('article', { class: 'card' });
  card.append(
    h('button', {
      class: 'card__open',
      onClick: () => void openClass(klass),
      title: `打开 ${klass.name}`,
    }, [
      h('h3', { class: 'card__name', text: klass.name }),
      h('p', {
        class: 'card__meta',
        text: `${klass.students.length} 人 · 超时 ${Math.round(klass.overtimeThresholdMs / 60000)} 分钟 · ${themeLabel(klass.theme)}`,
      }),
    ]),
  );
  const actions = h('div', { class: 'card__actions' });
  actions.append(h('button', { class: 'btn btn--small', text: '导出', onClick: () => void exportClass(klass) }));
  actions.append(
    h('button', {
      class: 'btn btn--small btn--danger',
      text: '删除',
      onClick: async () => {
        if (window.confirm(`删除「${klass.name}」及其全部记录？这一步不能撤回。`)) {
          await store.deleteClass(klass.id);
          await refreshClasses();
          render();
        }
      },
    }),
  );
  card.append(actions);
  return card;
}

function themeLabel(theme) {
  return { junior: '童趣（小学）', middle: '标准', senior: '沉稳（高中）' }[theme] ?? theme;
}

function renderClassView() {
  const main = h('main', { class: 'board', 'data-theme': state.klass.theme });
  main.append(renderControls());
  // 时钟与统计同排：宽屏上一左一右，窄屏上折行
  main.append(h('div', { class: 'board__head' }, [renderClock(), renderStatusBar()]));

  const grid = h('div', { class: 'grid' });
  grid.style.setProperty('--cols', String(GRID_COLUMNS[state.klass.theme] ?? 6));
  if (state.klass.students.length === 0) {
    grid.append(h('p', { class: 'empty__hint', text: '这个班还没有学生。到「班级设置」里导入名册。' }));
  }
  for (const student of state.klass.students) {
    const tile = renderTile(student);
    tiles.set(student.id, tile);
    grid.append(tile);
  }
  main.append(grid);
  return main;
}

function renderControls() {
  const bar = h('div', { class: 'controls' });
  const hint = h('p', { class: 'controls__hint' });
  hint.dataset.hint = '1';
  bar.append(hint);

  const buttons = h('div', { class: 'controls__buttons' });
  const session = state.session;
  if (session === null || session.phase === PHASE.ENDED) {
    buttons.append(
      h('button', {
        class: 'btn btn--primary btn--tall',
        text: session === null ? '开始记录' : '再开一场记录',
        onClick: () => void startRecording(),
      }),
    );
  } else if (session.phase === PHASE.PREPARING) {
    buttons.append(beginButton());
  } else if (session.phase === PHASE.ROLL_CALL) {
    buttons.append(
      h('button', {
        class: 'btn btn--primary btn--tall',
        text: '结束点名，进入自习',
        onClick: () => void doEndRollCall(),
      }),
    );
  } else {
    buttons.append(
      h('button', { class: 'btn btn--tall', text: '结束自习', onClick: () => void doEndSession() }),
    );
  }
  bar.append(buttons);
  return bar;
}

function beginButton() {
  // 开始点名是一次用户手势，顺手把 AudioContext 唤醒 —— 之后超时提示音才响得出来
  return h('button', {
    class: 'btn btn--primary btn--tall',
    text: '开始点名',
    onClick: () => void doBeginRollCall(),
  });
}

function renderStatusBar() {
  const bar = h('div', { class: 'status' });
  const items = [
    { key: 'total', label: '应到', tone: '' },
    { key: 'present', label: '已到', tone: 'present' },
    { key: 'absent', label: '没到', tone: 'absent' },
    { key: 'left', label: '离开中', tone: 'left' },
    { key: 'overtime', label: '超时', tone: 'overtime' },
    { key: 'leaves', label: '累计人次', tone: '' },
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
  return clock;
}

function renderTile(student) {
  const tile = h('button', { class: 'tile', dataset: { studentId: student.id } });
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

/** 座位与学号那一行。 */
function seatLine(student) {
  return [student.seat === '' ? '' : `${student.seat}号`, student.code].filter(Boolean).join(' · ');
}

/**
 * 走秒：只改颜色、计时与统计数，不重画整块。
 *
 * 每 500ms 一次。格子多的时候这是唯一不闪的做法 —— 重画会把还没落的手势打断。
 */
function updateDynamic() {
  if (state.view !== 'class' || state.klass === null) {
    return;
  }
  const now = state.now;
  const threshold = state.klass.overtimeThresholdMs;
  const session = state.session;

  for (const student of state.klass.students) {
    const tile = tiles.get(student.id);
    if (tile === undefined) {
      continue;
    }
    const timer = timerText.get(student.id);
    const meta = metaText.get(student.id);
    if (session === null) {
      tile.dataset.status = STATUS.ABSENT;
      if (timer !== undefined) {
        timer.textContent = '';
      }
      if (meta !== undefined) {
        meta.textContent = seatLine(student);
      }
      continue;
    }
    const status = statusOf(session, student.id, now, threshold);
    tile.dataset.status = status;
    if (timer === undefined) {
      continue;
    }
    if (status === STATUS.LEFT || status === STATUS.OVERTIME) {
      timer.textContent = formatDuration(awayMs(session, student.id, now));
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
    hint.textContent = phaseHint(state.klass, session ?? { phase: PHASE.PREPARING, markedIds: [], leaves: [], startedAt: now });
  }

  // 自习时间：点名结束前是 0 且暗淡，自习中一路走，结束后定住
  const clock = root.querySelector('[data-clock="study"]');
  if (clock !== null) {
    const running = session !== null && session.rollCallEndedAt !== undefined;
    clock.textContent = formatStudyTime(running ? studyMs(session, now) : 0);
    clock.classList.toggle('is-idle', !running);
  }
  const values = {
    total: String(summary.total),
    present: String(summary.present),
    absent: String(summary.absent),
    left: String(summary.left),
    overtime: String(summary.overtime),
    leaves: String(summary.leaveCount),
  };
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

/* ---------- 浮层 ---------- */

function openOverlay(name) {
  state.overlay = name;
  render();
}

function closeOverlay() {
  state.overlay = null;
  state.remarkStudentId = null;
  state.pendingNewClass = undefined;
  state.newClassName = undefined;
  render();
}

function modalFrame(title, bodyNodes, footNodes, extraClass = '') {
  const modal = h('div', { class: `modal ${extraClass}`.trim(), role: 'dialog', 'aria-modal': 'true' });
  const head = h('div', { class: 'modal__head' });
  head.append(h('h2', { class: 'modal__title', text: title }));
  head.append(h('button', { class: 'btn btn--icon', text: '✕', 'aria-label': '关闭', onClick: closeOverlay }));
  modal.append(head);
  const body = h('div', { class: 'modal__body' });
  for (const node of bodyNodes) {
    body.append(node);
  }
  modal.append(body);
  if (footNodes !== undefined) {
    const foot = h('div', { class: 'modal__foot' });
    for (const node of footNodes) {
      foot.append(node);
    }
    modal.append(foot);
  }
  const scrim = h('div', { class: 'scrim', onClick: closeOverlay });
  return h('div', { class: 'overlay' }, [scrim, modal]);
}

function renderOverlay() {
  switch (state.overlay) {
    case 'newClass':
      return renderNewClass();
    case 'remark':
      return renderRemark();
    case 'settings':
      return renderSettings();
    case 'history':
      return renderHistory();
    case 'conflict':
      return renderConflict();
    default:
      return h('span');
  }
}

function renderNewClass() {
  const body = [];
  body.push(
    h('p', {
      class: 'modal__hint',
      text: '选一份花名册（.xlsx 或 .xls）。表里有一列写着「姓名」就会被认出来，学号与座位列可选。',
    }),
  );
  const nameInput = h('input', {
    class: 'input',
    placeholder: '班级名称',
    value: state.newClassName ?? state.pendingNewClass?.defaultName ?? '',
  });
  // 选表会重画这一块，名字要留在状态里，不然刚打的字就没了
  nameInput.addEventListener('input', () => {
    state.newClassName = nameInput.value;
  });
  body.push(h('label', { class: 'field' }, [h('span', { class: 'field__label', text: '班级名称' }), nameInput]));

  const fileInput = h('input', { type: 'file', accept: ROSTER_ACCEPT, class: 'hidden' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    try {
      const students = rosterFromSheets(await readSheetFile(file));
      if (students.length === 0) {
        showToast('这张表里没读到学生，请确认有一列写着姓名');
        return;
      }
      state.pendingNewClass = {
        students,
        defaultName: nameInput.value.trim() !== '' ? nameInput.value.trim() : baseName(file.name),
      };
      render();
    } catch (error) {
      showToast(`读表失败：${error.message}`);
    }
  });

  if (state.pendingNewClass === undefined) {
    body.push(
      h('div', { class: 'pick' }, [
        h('p', { class: 'pick__title', text: '还没选表' }),
        h('button', { class: 'btn btn--primary', text: '选一份花名册', onClick: () => fileInput.click() }),
      ]),
    );
  } else {
    const students = state.pendingNewClass.students;
    body.push(
      h('div', { class: 'pick' }, [
        h('p', { class: 'pick__title', text: `认到 ${students.length} 位同学` }),
        h('p', { class: 'pick__list', text: students.slice(0, 12).map((item) => item.name).join('、') + (students.length > 12 ? ' …' : '') }),
        h('button', { class: 'btn', text: '换一份表', onClick: () => fileInput.click() }),
      ]),
    );
  }
  body.push(fileInput);

  const foot = [];
  foot.push(h('button', { class: 'btn', text: '取消', onClick: closeOverlay }));
  foot.push(
    h('button', {
      class: 'btn btn--primary',
      text: '建班',
      onClick: async () => {
        if (state.pendingNewClass === undefined) {
          showToast('先选一份花名册');
          return;
        }
        const name = nameInput.value.trim() !== '' ? nameInput.value.trim() : state.pendingNewClass.defaultName;
        const klass = createKlass({
          id: uid('k'),
          name,
          createdAt: Date.now(),
          students: state.pendingNewClass.students,
        });
        await store.putClass(klass);
        await refreshClasses();
        state.pendingNewClass = undefined;
        state.newClassName = undefined;
        state.overlay = null;
        await openClass(klass);
      },
    }),
  );
  return modalFrame('新建班级', body, foot);
}

function renderRemark() {
  const klass = state.klass;
  const student = klass.students.find((item) => item.id === state.remarkStudentId);
  const body = [];
  body.push(
    h('p', {
      class: 'modal__hint',
      text: `给「${student?.name ?? ''}」记一次临时离开。备注可以留空 —— 不填就是纯计时。`,
    }),
  );

  let templateId;
  const chips = h('div', { class: 'chips' });
  for (const template of klass.remarkTemplates) {
    const chip = h('button', {
      class: 'chip chip--pick',
      text: template.text,
      onClick: () => {
        templateId = templateId === template.id ? undefined : template.id;
        for (const node of chips.children) {
          node.classList.toggle('is-on', node.dataset.templateId === templateId);
        }
      },
    });
    chip.dataset.templateId = template.id;
    chips.append(chip);
  }
  if (klass.remarkTemplates.length === 0) {
    chips.append(h('span', { class: 'modal__hint', text: '还没有常用备注，到「班级设置」里加。' }));
  }
  body.push(h('div', { class: 'field' }, [h('span', { class: 'field__label', text: '常用备注' }), chips]));

  const textarea = h('textarea', { class: 'input input--area', rows: 2, placeholder: '补充一句（可空）' });
  const micNote = h('span', { class: 'field__note' });
  const mic = h('button', {
    class: 'btn btn--mic',
    text: '🎤 语音输入',
    onClick: () => {
      const status = speech.availability();
      if (!status.ok) {
        showToast(`语音输入不可用：${status.reason}`);
        return;
      }
      if (listening !== null) {
        listening();
        listening = null;
        mic.classList.remove('is-on');
        mic.textContent = '🎤 语音输入';
        return;
      }
      mic.classList.add('is-on');
      mic.textContent = '🎤 正在听…（点一下停）';
      listening = speech.listen({
        onResult: (text, isFinal) => {
          textarea.value = text;
          if (isFinal) {
            micNote.textContent = '已识别，可以改';
          }
        },
        onError: (code) => {
          const reason =
            code === 'not-allowed'
              ? '没给麦克风权限'
              : code === 'network'
                ? '连不上识别服务（国内网络常这样）'
                : `识别失败（${code}）`;
          showToast(`语音输入：${reason}`);
          listening = null;
          mic.classList.remove('is-on');
          mic.textContent = '🎤 语音输入';
        },
        onEnd: () => {
          listening = null;
          mic.classList.remove('is-on');
          mic.textContent = '🎤 语音输入';
        },
      });
    },
  });
  body.push(h('div', { class: 'field' }, [
    h('span', { class: 'field__label', text: '补充说明' }),
    textarea,
    h('div', { class: 'field__row' }, [mic, micNote]),
  ]));

  const foot = [];
  foot.push(h('button', { class: 'btn', text: '取消', onClick: closeOverlay }));
  foot.push(
    h('button', {
      class: 'btn btn--primary',
      text: '开始计时',
      onClick: () => void confirmLeave(templateId, textarea.value.trim()),
    }),
  );
  return modalFrame('临时离开', body, foot);
}

function renderSettings() {
  const klass = state.klass;
  const body = [];

  const nameInput = h('input', { class: 'input', value: klass.name });
  body.push(h('label', { class: 'field' }, [h('span', { class: 'field__label', text: '班级名称' }), nameInput]));

  const themeSelect = h('select', { class: 'input' });
  for (const [value, label] of [['junior', '童趣（小学）'], ['middle', '标准'], ['senior', '沉稳（高中）']]) {
    themeSelect.append(h('option', { value, text: label, ...(klass.theme === value ? { selected: true } : {}) }));
  }
  body.push(h('label', { class: 'field' }, [h('span', { class: 'field__label', text: '主题' }), themeSelect]));

  const thresholdInput = h('input', {
    class: 'input',
    type: 'number',
    min: '1',
    max: '180',
    value: String(Math.round(klass.overtimeThresholdMs / 60000)),
  });
  body.push(
    h('label', { class: 'field' }, [
      h('span', { class: 'field__label', text: '超时阈值（分钟）' }),
      thresholdInput,
      h('span', { class: 'field__note', text: '离开超过这个时长，格子转红并出声提醒。' }),
    ]),
  );

  const soundToggle = h('input', { type: 'checkbox', ...(klass.alertSound ? { checked: true } : {}) });
  body.push(
    h('label', { class: 'field field--row' }, [
      soundToggle,
      h('span', { class: 'field__label', text: '超时出声提醒' }),
    ]),
  );

  const repeatInput = h('input', {
    class: 'input',
    type: 'number',
    min: '15',
    max: '600',
    value: String(Math.round(klass.alertRepeatMs / 1000)),
  });
  body.push(
    h('label', { class: 'field' }, [
      h('span', { class: 'field__label', text: '补响间隔（秒）' }),
      repeatInput,
      h('span', { class: 'field__note', text: '还没回来就每隔这么久再响一次。' }),
    ]),
  );

  const templatesArea = h('textarea', {
    class: 'input input--area',
    rows: 5,
    value: klass.remarkTemplates.map((item) => item.text).join('\n'),
  });
  body.push(
    h('label', { class: 'field' }, [
      h('span', { class: 'field__label', text: '常用备注（一行一条）' }),
      templatesArea,
    ]),
  );

  const rosterInput = h('input', { type: 'file', accept: ROSTER_ACCEPT, class: 'hidden' });
  rosterInput.addEventListener('change', async () => {
    const file = rosterInput.files?.[0];
    if (file === undefined) {
      return;
    }
    try {
      const students = rosterFromSheets(await readSheetFile(file));
      if (students.length === 0) {
        showToast('这张表里没读到学生');
        return;
      }
      await commitClass({ ...state.klass, students });
      showToast(`名册已换成 ${students.length} 人`);
    } catch (error) {
      showToast(`读表失败：${error.message}`);
    }
  });
  body.push(
    h('div', { class: 'field' }, [
      h('span', { class: 'field__label', text: `名册（现在 ${klass.students.length} 人）` }),
      h('div', { class: 'field__row' }, [
        h('button', { class: 'btn', text: '导回名册（换成表里的）', onClick: () => rosterInput.click() }),
        h('button', { class: 'btn', text: '导出全班 xlsx', onClick: () => void exportClass(klass) }),
      ]),
      rosterInput,
    ]),
  );

  const foot = [];
  foot.push(h('button', { class: 'btn', text: '取消', onClick: closeOverlay }));
  foot.push(
    h('button', {
      class: 'btn btn--primary',
      text: '保存',
      onClick: async () => {
        const templates = templatesArea.value
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line !== '')
          .map((text, index) => ({ id: `tpl-${index + 1}`, text }));
        state.overlay = null;
        await commitClass({
          ...state.klass,
          name: nameInput.value.trim() === '' ? state.klass.name : nameInput.value.trim(),
          theme: themeSelect.value,
          overtimeThresholdMs: Math.max(1, Number(thresholdInput.value) || 10) * 60000,
          alertSound: soundToggle.checked,
          alertRepeatMs: Math.max(15, Number(repeatInput.value) || 60) * 1000,
          remarkTemplates: templates,
        });
        showToast('设置已保存');
      },
    }),
  );
  return modalFrame('班级设置', body, foot);
}

function renderHistory() {
  const body = [];
  const sessions = [...state.sessions].sort((left, right) => right.startedAt - left.startedAt);
  if (sessions.length === 0) {
    body.push(h('p', { class: 'modal__hint', text: '还没有记录。' }));
  } else {
    const table = h('table', { class: 'table' });
    const head = h('tr');
    for (const label of ['开始', '结束', '自习时长', '已到', '离开人次']) {
      head.append(h('th', { text: label }));
    }
    table.append(h('thead', {}, [head]));
    const tbody = h('tbody');
    for (const session of sessions) {
      const endAt = session.endedAt ?? Date.now();
      const summary = summarize(state.klass, session, endAt);
      const row = h('tr');
      row.append(h('td', { text: formatDate(session.startedAt) }));
      row.append(h('td', { text: session.endedAt === undefined ? '进行中' : formatDate(session.endedAt) }));
      row.append(h('td', { text: formatStudyTime(studyMs(session, endAt)) }));
      row.append(h('td', { text: String(summary.present) }));
      row.append(h('td', { text: String(summary.leaveCount) }));
      tbody.append(row);
    }
    table.append(tbody);
    body.push(table);
  }
  const foot = [];
  foot.push(h('button', { class: 'btn', text: '关闭', onClick: closeOverlay }));
  foot.push(h('button', { class: 'btn btn--primary', text: '导出全班 xlsx', onClick: () => void exportClass(state.klass) }));
  return modalFrame('全班记录', body, foot);
}

function renderConflict() {
  const pending = state.pendingImport;
  const body = [];
  body.push(
    h('p', {
      class: 'modal__hint',
      text: `库里已经有一个叫「${pending.parsed.klass.name}」的班。要覆盖它，还是另建一个副本？`,
    }),
  );
  body.push(
    h('ul', { class: 'diff' }, [
      h('li', { text: `文件里：${pending.parsed.klass.students.length} 人 · ${pending.parsed.sessions.length} 场记录` }),
      h('li', { text: `库里：${pending.existing.students.length} 人` }),
    ]),
  );
  const foot = [];
  foot.push(h('button', { class: 'btn', text: '取消导入', onClick: () => {
    state.pendingImport = null;
    state.overlay = null;
    render();
  } }));
  foot.push(
    h('button', {
      class: 'btn',
      text: '另建副本',
      onClick: async () => {
        const parsed = pending.parsed;
        const copy = { ...parsed.klass, id: uid('k'), name: `${parsed.klass.name} 副本`, createdAt: Date.now() };
        await store.putClass(copy);
        for (const session of parsed.sessions) {
          await store.putSession({ ...session, id: uid('s'), classId: copy.id });
        }
        await refreshClasses();
        state.pendingImport = null;
        state.overlay = null;
        await openClass(copy);
      },
    }),
  );
  foot.push(
    h('button', {
      class: 'btn btn--danger',
      text: '覆盖',
      onClick: () => void importClassFile(pending.file, true),
    }),
  );
  return modalFrame('同名班级', body, foot);
}

/* ---------- 杂项 ---------- */

let toastTimer = 0;
function showToast(message) {
  state.toast = message;
  render();
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    state.toast = '';
    render();
  }, 3600);
}

function pickFile(accept, handler) {
  const input = h('input', { type: 'file', accept, class: 'hidden' });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.remove();
    if (file === undefined) {
      return;
    }
    try {
      await handler(file);
    } catch (error) {
      showToast(`导入失败：${error.message}`);
    }
  });
  document.body.append(input);
  input.click();
}

let listening = null;

/* ---------- 启动 ---------- */

function tick() {
  state.now = Date.now();
  updateDynamic();
  void checkAlerts();
}

async function boot() {
  await store.requestPersistence();
  await refreshClasses();
  let lastId = await store.getSetting('lastClassId', null);
  if (lastId !== null) {
    const klass = await store.getClass(lastId);
    if (klass !== null) {
      await openClass(klass);
    }
  }
  if (state.view === 'home') {
    render();
  }
  window.setInterval(tick, TICK_MS);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    tick();
  }
});

void boot().catch((error) => {
  root.replaceChildren(
    h('div', { class: 'fatal' }, [
      h('h1', { text: '自习点名打不开' }),
      h('p', { text: error instanceof Error ? error.message : String(error) }),
    ]),
  );
});
