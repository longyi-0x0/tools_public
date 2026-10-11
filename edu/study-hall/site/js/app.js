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
  isPaused,
  markLeft,
  markNotified,
  markPresent,
  markReturned,
  normaliseKlass,
  normaliseSession,
  pauseSession,
  remarkTextOf,
  resumeSession,
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
  /**
   * 盖在页上的蒙版：null 是没盖，'session' 是自习看板，'idle' 是待机。
   *
   * 自习不再挤在班级页里，而是盖住整屏的一块 —— 一次自习就是这一块。老师可以随时
   * 把它收起来（会话继续跑），班级卡上那颗钮变成「继续自习」。
   */
  mask: null,
  classes: [],
  /**
   * 每个班当前那场**没结束的**自习：`班级 id → 会话`。
   *
   * 班级列表要显示「自习中 00:12:33」并把钮换成「继续自习」，就得知道哪些班还在跑。
   * 一次读全量再分好，比按班各跑一趟省事。`state.session` 是**正在看的那一场**，
   * 这个表是**列表要用的总览**，两者由 `commitSession` 一处保持同步。
   */
  running: new Map(),
  klass: null,
  session: null,
  sessions: [],
  now: Date.now(),
  /** 最后一次碰屏幕的时刻，用来判该不该切待机蒙版 */
  lastActivityAt: Date.now(),
  /** 正在开着的浮层：null / 'newClass' / 'remark' / 'settings' / 'history' / 'conflict' */
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
    } else if (key === 'dataset') {
      // dataset 不是 HTML 属性，得逐项写到元素上；走 setAttribute 只会得到
      // "[object Object]" 这样的垃圾属性，之后再 querySelector('[data-x]') 就找不着
      for (const [name, item] of Object.entries(value)) {
        if (item !== undefined && item !== null) {
          node.dataset[name] = String(item);
        }
      }
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
      if (isPaused(session)) {
        return `已暂停：自习时间停在 ${formatStudyTime(studyMs(session, state.now))}，外面的人也一起停表。按「继续自习」接着走。`;
      }
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
  state.classes = (await store.listClasses()).map(normaliseKlass);
  state.running = await readRunningSessions();
}

/** 每个班当前那场没结束的自习。一次读全量再分好，不按班各跑一趟。 */
async function readRunningSessions() {
  const sessions = await store.listSessions();
  const map = new Map();
  for (const session of sessions) {
    if (session.phase !== PHASE.ENDED) {
      map.set(session.classId, normaliseSession(session));
    }
  }
  return map;
}

/**
 * 把某个班装进状态：名册、记录、有没有一场还没结束的。
 *
 * 没有专门的班级页了，这个函数就是「按这个班的上下文做一件事」的入口 ——
 * 开始自习、设置、全班记录都从班级卡上按，按之前先把它的上下文装上。
 */
async function loadClass(klass) {
  state.klass = normaliseKlass(klass);
  const sessions = (await store.listSessions(klass.id)).map(normaliseSession);
  state.sessions = sessions;
  state.session = sessions.find((item) => item.phase !== PHASE.ENDED) ?? null;
}

/** 从班级卡上进自习：先把这个班装上。 */
async function enterSessionFrom(klass) {
  await loadClass(klass);
  await enterSession();
}

/** 从班级卡上开一个挂在这个班上的浮层（设置 / 全班记录）。 */
async function openFromCard(klass, overlay) {
  await loadClass(klass);
  state.overlay = overlay;
  render();
}

/**
 * 进自习：没有进行中的那场就先开一场，然后盖上蒙版。
 *
 * 这是老师按下去的一下，顺手要一次浏览器全屏 —— 教室前面的屏不该留地址栏。
 * 已有进行中的那场就直接盖上（「继续自习」）。
 */
async function enterSession() {
  sound.unlock();
  noteActivity();
  requestFullscreen();

  if (state.session !== null && state.session.phase !== PHASE.ENDED) {
    state.mask = 'session';
    render();
    return;
  }

  const session = startSession({ id: uid('s'), classId: state.klass.id, startedAt: Date.now() });
  await store.putSession(session);
  state.session = session;
  state.sessions = [...state.sessions, session];
  syncRunning(session);
  state.mask = 'session';
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

/**
 * 把一场记录写进库与内存，并同步班级列表要用的那份总览。
 *
 * `state.running` 是班级卡看的，`state.session` 是正在看的那一场 —— 两者只能在这里
 * 一处同时改，不然列表上会出现「已经结束的一场还写着自习中」。
 */
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
  syncRunning(next);
  await store.putSession(next);
  if (phaseChanged || forceRender) {
    render();
  } else {
    updateDynamic();
  }
}

/** 把一场记录登记进 `state.running`；已经结束的就从表里去掉。 */
function syncRunning(session) {
  if (session.phase === PHASE.ENDED) {
    state.running.delete(session.classId);
  } else {
    state.running.set(session.classId, session);
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

async function doBeginRollCall() {
  await commitSession(beginRollCall(state.session, Date.now()));
}

async function doEndRollCall() {
  await commitSession(endRollCall(state.session, Date.now()));
}

async function doEndSession() {
  await commitSession(endSession(state.session, Date.now()));
  // 这一场定格了，蒙版收起来 —— 结束自习就是回班级列表
  state.mask = null;
  render();
}

/** 暂停自习。 */
async function doPause() {
  await commitSession(pauseSession(state.session, Date.now()));
  showToast('已暂停，谁在外面也一起停表');
}

/** 继续自习。 */
async function doResume() {
  await commitSession(resumeSession(state.session, Date.now()));
  showToast('已继续');
}

/**
 * 重新开始：结束这一场，另开一场。
 *
 * 这一场已结束（定格、留着），新的一场从头来（准备相，需要重新点名）。
 */
async function doRestart() {
  const now = Date.now();
  await commitSession(endSession(state.session, now));
  await enterSession();
  showToast('上一场已结束，新的一场从头开始');
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
  // 暂停期间不响：那段时间不算在外面，一直响只会吵
  if (isPaused(state.session)) {
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

/** 删掉一个班（连同它的全部记录）。问一句，确认了才动手。 */
async function removeClass(klass) {
  if (!window.confirm(`删除「${klass.name}」及其全部记录？这一步不能撤回。`)) {
    return false;
  }
  await store.deleteClass(klass.id);
  await refreshClasses();
  return true;
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
  render();
}

/* ---------- 视图 ---------- */

function render() {
  tiles.clear();
  timerText.clear();
  metaText.clear();
  root.replaceChildren(renderShell());
  // 挂上去了才算数：updateDynamic 是去已挂的 DOM 里找那些要逐拍改的节点
  updateDynamic();
}

/**
 * 两层：班级列表 → 自习蒙版 / 待机蒙版。
 *
 * 蒙版盖住整屏，所以有蒙版时就不再画底下那一页 —— 反正看不见，白画一遍还慢。
 */
function renderShell() {
  const shell = h('div', { class: 'shell' });

  if (state.mask === 'session') {
    shell.append(renderSessionMask());
  } else if (state.mask === 'idle') {
    shell.append(renderIdleMask());
  } else {
    shell.append(renderClassesPage());
  }

  if (state.toast !== '') {
    shell.append(h('div', { class: 'toast', text: state.toast }));
  }
  shell.append(renderOverlay());
  return shell;
}

/** 顶栏：三处共用，只在左头与右钮上不同。 */
/**
 * 顶栏。三处共用，只在左头与右钮上不同。
 *
 * `fullscreen` 默认开着：蒙版上需要它（投影开着时可以随手进出全屏）。班级列表页关掉 ——
 * 那一页不在教室前面用，多这一颗只是碍事；进自习时会自己向浏览器要一次全屏。
 */
function tabBar(options) {
  const header = h('header', { class: 'tab' });
  const left = h('div', { class: 'tab__left' });
  left.append(h('span', { class: 'tab__mark', 'aria-hidden': 'true' }));
  left.append(h('h1', { class: 'tab__title', text: '自习点名' }));
  if (options.crumb !== undefined) {
    left.append(h('span', { class: 'tab__sep', text: '/' }));
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
  if (options.fullscreen !== false) {
    right.append(
      h('button', {
        class: 'btn btn--icon',
        title: '全屏',
        'aria-label': '全屏',
        text: '⛶',
        onClick: toggleFullscreen,
      }),
    );
  }
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

/** 进自习那一下顺手要一次浏览器全屏：教室前面的屏，不该留着地址栏。 */
function requestFullscreen() {
  try {
    void document.documentElement.requestFullscreen?.();
  } catch {
    /* 浏览器不给就算了，蒙版本身已经盖满视口 */
  }
}

function renderClassesPage() {
  const main = h('main', { class: 'page' });
  // 这一页不在教室前面用，用不上全屏钮
  main.append(tabBar({ fullscreen: false }));

  const body = h('div', { class: 'home' });
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
  body.append(bar);

  if (state.classes.length === 0) {
    body.append(
      h('div', { class: 'empty' }, [
        h('p', { class: 'empty__title', text: '还没有班级' }),
        h('p', {
          class: 'empty__hint',
          text: '导入一份花名册就能建班（.xlsx 或 .xls，网页表格改名的 .xls 也认）。表里有一列写着「姓名」即可，学号与座位列可选。',
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
 * 这里就是入口 —— 不再有单独的班级页。花名册在自习蒙版里看，设置与全班记录从这张卡
 * 上开（都是浮层）。
 */
/**
 * 一张班级卡：谁、多少人、有没有在跑的一场。
 *
 * 排布按「按下去的频次」分三处：卡右上角是导出 / 设置 / 删除（平时才动），
 * 底下一条是全班记录（靠左）与开始自习（靠右）—— 自习时最常按的就是右边那颗。
 */
function renderClassCard(klass) {
  const running = state.running.get(klass.id) ?? null;
  const card = h('article', { class: 'card' });

  const head = h('div', { class: 'card__head' });
  const title = h('div', { class: 'card__title' });
  title.append(h('h3', { class: 'card__name', text: klass.name }));
  const bits = [
    `${klass.students.length} 人`,
    `超时 ${Math.round(klass.overtimeThresholdMs / 60000)} 分钟`,
    themeLabel(klass.theme),
  ];
  title.append(h('p', { class: 'card__meta', text: bits.join(' · ') }));
  if (running !== null) {
    title.append(
      h('span', { class: `chip chip--${running.phase}` }, [
        h('span', { text: `${phaseLabel(running.phase)} ` }),
        h('span', {
          class: 'chip__clock',
          dataset: { clock: `card:${klass.id}` },
          text: '00:00:00',
        }),
      ]),
    );
  }
  head.append(title);

  const tools = h('div', { class: 'card__tools' });
  tools.append(
    h('button', { class: 'btn', text: '设置', onClick: () => void openFromCard(klass, 'settings') }),
  );
  head.append(tools);
  card.append(head);

  const foot = h('div', { class: 'card__foot' });
  foot.append(
    h('button', {
      class: 'btn',
      text: '全班记录',
      onClick: () => void openFromCard(klass, 'history'),
    }),
  );
  foot.append(
    h('button', {
      class: 'btn btn--primary btn--tall',
      text: running === null ? '开始自习' : '继续自习',
      onClick: () => void enterSessionFrom(klass),
    }),
  );
  card.append(foot);
  return card;
}

function themeLabel(theme) {
  return { junior: '童趣（小学）', middle: '标准', senior: '沉稳（高中）' }[theme] ?? theme;
}

/**
 * 一次自习：盖住整屏的一块。
 *
 * 相变了才整块重画（钮要换），走秒的数字由 `updateDynamic` 定点改。
 */
function renderSessionMask() {
  const klass = state.klass;
  const section = h('section', { class: 'mask mask--session', 'data-theme': klass.theme });

  const running = state.session !== null && state.session.phase !== PHASE.ENDED;
  section.append(
    tabBar({
      crumb: klass.name,
      chip:
        state.session === null
          ? undefined
          : h('span', {
              class: `chip chip--${state.session.phase}`,
              text: phaseLabel(state.session.phase),
            }),
      actions: [
        h('button', {
          class: 'btn',
          text: '收起',
          title: '收起这块，自习继续跑',
          onClick: () => {
            state.mask = null;
            render();
          },
        }),
        h('button', { class: 'btn', text: '全班记录', onClick: () => openOverlay('history') }),
      ].filter((node) => node !== undefined),
    }),
  );

  const body = h('div', { class: 'board' });
  body.append(renderControls());
  body.append(h('div', { class: 'board__head' }, [renderClock(), renderStatusBar()]));

  const grid = h('div', { class: 'grid' });
  grid.style.setProperty('--cols', String(GRID_COLUMNS[klass.theme] ?? 6));
  if (klass.students.length === 0) {
    grid.append(h('p', { class: 'empty__hint', text: '这个班还没有学生。收起这块，到「设置」里导入名册。' }));
  }
  for (const student of klass.students) {
    const tile = renderTile(student);
    tiles.set(student.id, tile);
    grid.append(tile);
  }
  body.append(grid);
  section.append(body);

  if (!running) {
    section.append(
      h('p', { class: 'mask__foot', text: '这一场已结束，收起这块回到班级列表。' }),
    );
  }
  return section;
}

/**
 * 待机蒙版：自习中一段时间没人碰屏幕，就换成这一块。
 *
 * 教室前面那块屏，老师不操作时不该一直亮着几十个名字。中间一个大钟，底下「谁还在
 * 外面」—— 从最后一排也看得见。碰哪儿都回到自习看板；点某一张离开的卡片，直接把
 * 那个人记成归来（那是最常用的一手，不必再进一层）。
 */
function renderIdleMask() {
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
    const status = statusOf(session, student.id, now, klass.overtimeThresholdMs);
    items.push({
      student,
      status,
      awayMs: awayMs(session, student.id, now),
      remark: remarkTextOf(klass, leave),
    });
  }
  return items.sort((left, right) => right.awayMs - left.awayMs);
}

/** 待机蒙版上点一张卡片：直接记归来。 */
async function markReturnedFromIdle(studentId) {
  const student = state.klass.students.find((item) => item.id === studentId);
  await commitSession(markReturned(state.session, studentId, Date.now()), true);
  showToast(`${student?.name ?? ''} 已记归来`);
}

function renderControls() {
  const bar = h('div', { class: 'controls' });
  const hint = h('p', { class: 'controls__hint' });
  hint.dataset.hint = '1';
  bar.append(hint);

  const buttons = h('div', { class: 'controls__buttons' });
  const session = state.session;
  if (session === null || session.phase === PHASE.ENDED) {
    // 蒙版上走到这里只有一种情形：上一场已结束，老师要接着开下一场
    buttons.append(
      h('button', {
        class: 'btn btn--primary btn--tall',
        text: '再开一场自习',
        onClick: () => void enterSession(),
      }),
    );
  } else if (session.phase === PHASE.PREPARING) {
    buttons.append(beginButton());
    buttons.append(restartButton());
  } else if (session.phase === PHASE.ROLL_CALL) {
    buttons.append(
      h('button', {
        class: 'btn btn--primary btn--tall',
        text: '结束点名，进入自习',
        onClick: () => void doEndRollCall(),
      }),
    );
    buttons.append(restartButton());
  } else {
    buttons.append(
      isPaused(session)
        ? h('button', {
            class: 'btn btn--primary btn--tall',
            text: '继续自习',
            onClick: () => void doResume(),
          })
        : h('button', { class: 'btn btn--tall', text: '暂停自习', onClick: () => void doPause() }),
    );
    buttons.append(restartButton());
    buttons.append(
      h('button', { class: 'btn btn--tall', text: '结束自习', onClick: () => void doEndSession() }),
    );
  }
  bar.append(buttons);
  return bar;
}

/**
 * 「重新开始」：把这一场结束掉，另开一场。
 *
 * 上课时什么情况都能遇到（点错一堆、被别的事打断、想从头记），所以给一手干净的：
 * 先确认，再结束 + 开新场。旧的那一场留在记录里，不删。
 */
function restartButton() {
  return h('button', {
    class: 'btn btn--tall',
    text: '重新开始',
    title: '结束这一场，另开一场',
    onClick: () => {
      if (window.confirm('结束这一场并另开一场？这一场的记录会留着。')) {
        void doRestart();
      }
    },
  });
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
  // 「已暂停」跟在数字后面，由走秒那条路定点改（不重画整块）
  clock.append(h('span', { class: 'clock__paused', dataset: { pause: 'tag' }, text: '' }));
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
  const threshold = state.klass.overtimeThresholdMs;
  const session = state.session;
  updateCardClocks(now);

  if (state.mask !== 'session') {
    return;
  }

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

  // 自习时间：点名结束前是 0 且暗淡；自习中一路走；暂停时停住并标注；结束后定住
  const clock = root.querySelector('[data-clock="study"]');
  if (clock !== null) {
    const started = session !== null && session.rollCallEndedAt !== undefined;
    clock.textContent = formatStudyTime(started ? studyMs(session, now) : 0);
    clock.classList.toggle('is-idle', !started);
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

/* ---------- 逐拍更新 ---------- */

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
      session !== null && session.rollCallEndedAt !== undefined ? formatStudyTime(studyMs(session, now)) : '00:00:00';
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
    elapsed.textContent = formatStudyTime(session === null ? 0 : studyMs(session, now));
  }
  if (session !== null) {
    const summary = summarize(state.klass, session, now);
    const counts = root.querySelector('[data-idle="counts"]');
    if (counts !== null) {
      counts.textContent = `应到 ${summary.total} · 已到 ${summary.present} · 没到 ${summary.absent} · 离开中 ${summary.left}`;
    }
    for (const node of root.querySelectorAll('[data-away]')) {
      const studentId = node.dataset.away;
      node.textContent = formatDuration(awayMs(session, studentId, now));
    }
  }
}

/** 走的计时与「离开中」的亮灭。模式与格子上那一套一致。 */
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
        render();
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

  const idleSelect = h('select', { class: 'input' });
  for (const [value, label] of [
    ['15', '15 秒'],
    ['30', '30 秒'],
    ['60', '1 分钟'],
    ['120', '2 分钟'],
    ['300', '5 分钟'],
    ['0', '不切（一直显示看板）'],
  ]) {
    idleSelect.append(
      h('option', {
        value,
        text: label,
        ...(String(Math.round(klass.idleMaskMs / 1000)) === value ? { selected: true } : {}),
      }),
    );
  }
  body.push(
    h('label', { class: 'field' }, [
      h('span', { class: 'field__label', text: '待机蒙版' }),
      idleSelect,
      h('span', {
        class: 'field__note',
        text: '自习中这么久没人碰屏幕，就换成一个大钟加「谁还在外面」。点一下、动一下鼠标、敲一下键都算，都会重新计时。',
      }),
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
      // 没有单独的花名册页了，名字就在这里看
      h('p', {
        class: 'field__note field__note--roster',
        text: klass.students.length === 0 ? '还没有学生。' : klass.students.map((item) => item.name).join('、'),
      }),
      rosterInput,
    ]),
  );

  // 删班是「平时的资料动作」，放在设置的最后一行 —— 不跟保存挤在底栏里
  const danger = h('button', {
    class: 'btn btn--danger',
    text: '删除这个班',
    onClick: async () => {
      if (await removeClass(klass)) {
        state.klass = null;
        state.session = null;
        state.sessions = [];
        state.overlay = null;
        showToast(`「${klass.name}」已删除`);
      }
    },
  });
  body.push(
    h('div', { class: 'field field--danger' }, [
      h('span', { class: 'field__label', text: '删除' }),
      h('span', { class: 'field__note', text: '连同这个班的全部记录一起删掉，不能撤回。' }),
      danger,
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
          idleMaskMs: Math.max(0, Number(idleSelect.value) || 0) * 1000,
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
        render();
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

/* ---------- 待机 ---------- */

/**
 * 有人碰了屏幕。
 *
 * **凡是能表明「人在这儿」的信号都算**：指针按下、指针移动、滚轮、键盘、触摸。
 * 鼠标只是晃了一下也是人在这儿 —— 老师盯着屏幕时手常常在鼠标上。所以指针移动也
 * 会把计时推后，待机蒙版因此只会在真的没人时出现。
 *
 * 切回看板由待机蒙版自己的点击处理（这样点某张卡片能拦住，不冒到蒙版上）。
 */
function noteActivity() {
  state.lastActivityAt = Date.now();
}

/** 自习中一段时间没人碰，就切待机蒙版。 */
function maybeGoIdle() {
  if (state.mask !== 'session' || state.klass === null || state.session === null) {
    return false;
  }
  // 只在正式自习时间里切：点名时屏幕上正等着老师点人，不该自己走掉。
  // 暂停时也不切：那时什么都没在计时，屏幕上留着「已暂停」比换成大钟有用。
  if (state.session.phase !== PHASE.SELF_STUDY || isPaused(state.session)) {
    return false;
  }
  const threshold = state.klass.idleMaskMs;
  if (threshold <= 0) {
    return false;
  }
  if (state.now - state.lastActivityAt < threshold) {
    return false;
  }
  state.mask = 'idle';
  render();
  return true;
}

/** 把活动监听挂上。用捕获与被动：只记时刻，不干预页面自己的处理。 */
function watchActivity() {
  for (const event of ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart']) {
    document.addEventListener(event, noteActivity, { capture: true, passive: true });
  }
}

/* ---------- 启动 ---------- */

function tick() {
  state.now = Date.now();
  if (maybeGoIdle()) {
    return;
  }
  updateDynamic();
  void checkAlerts();
}

async function boot() {
  await store.requestPersistence();
  await refreshClasses();

  // 有一场自习还在跑就直接盖上蒙版：刷新或崩了重开，老师要回到看板接着用。
  // 扫全库而不是记「上次打开的班」—— 上次打开的可能是别的班，那不是正在跑的那一场。
  const [runningClassId] = state.running.keys();
  if (runningClassId !== undefined) {
    const klass = state.classes.find((item) => item.id === runningClassId);
    if (klass !== undefined) {
      await loadClass(klass);
      state.mask = 'session';
    }
  }
  noteActivity();
  watchActivity();
  render();
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
