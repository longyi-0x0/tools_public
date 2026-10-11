/**
 * 界面与装配。
 *
 * 没有框架：工具页是静态页，不经打包器。一棵 DOM 树、一份状态、一个整块重画
 * 的函数 —— 整块重画只在**结构性变化**时发生（换视图、点名、结束一场）；
 * 走秒的数字与颜色由 `tick()` 定点改，不重画整块，免得格子闪、输入框失焦。
 */

import {
  AWAY_COLORS,
  DEFAULT_AWAY_COLOR,
  PHASE,
  STATUS,
  activeLeave,
  awayMs,
  createKlass,
  dueAlerts,
  endSession,
  invertAbsent,
  isAwayStatus,
  isPaused,
  markAbsent,
  markLeft,
  markNotified,
  markPresent,
  markReturned,
  normaliseKlass,
  normaliseSession,
  overtimeCount,
  pauseSession,
  remarkTextOf,
  resumeSession,
  startSession,
  statusOf,
  studyMs,
  summarize,
} from './domain.js';
import * as store from './store.js';
import * as sound from './sound.js';
import * as speech from './speech.js';
import { readSheetFile } from './readSheets.js';
import { exportClassWorkbook, parseClassWorkbook } from './klassFile.js';
import { buildZip } from './xlsx.js';

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
  /**
   * 本场静音。教室里铃突然响起来时当场就能掐掉；只存内存，刷新即恢复 ——
   * 宁可多提醒一次，也别一直静着没人知道。
   */
  muted: false,
  /**
   * 本场不切待机蒙版。老师在教室里正讲着一道题、或者那会儿就是要一直看着花名册，
   * 屏幕上忽然换成一个大钟很碍事 —— 看板上那颗钮当场就能按住。
   *
   * 只存内存、只管这一场，理由与 [`muted`] 一样：新场从头来，宁可多切一次，
   * 也别一直不切而没人知道。班级设置里那个「多久不动就换成大时钟」管的是**多快切**，
   * 这一颗管的是**这一场切不切** —— 两件事。
   */
  idleOff: false,
  /**
   * 正在开着的浮层：null / 'newClass' / 'remark' / 'settings' / 'history' / 'conflict' / 'rollCall'
   *
   * 「点名」就是这一层里的一个 —— 它是叠在自习看板上的一层可选的窗，不再是一个相。
   */
  overlay: null,
  /**
   * 点名层的状态：`null` 是没开，`{ absentIds }` 是开着 —— 存的是**开门那一刻**的
   * 没来名单，用来给右上角的 ✕ 撤销。
   *
   * `null` 之外的任何值都算「开着」（订正格子的分支也看它是否为空）—— 名单本身可能
   * 正好是空的，不能拿它当开关。
   */
  rollCallOpen: null,
  /** 备注浮层当前针对的学生 id */
  remarkStudentId: null,
  /** 冲突导入：同名班级已在库时的待决文件 */
  pendingImport: null,
  /**
   * 新建班级：从表里读出来的名册与默认名。`null` 是还没选表。
   *
   * 读表会重画这一块，认到的名字得留在状态里，不然老师选的表一重画就没了。
   */
  pendingNewClass: null,
  /** 新建班级那个输入框里正在打的字（与上面同理：重画不能把字弄丢）。 */
  newClassName: null,
  /**
   * 班级列表的多选态：`null` 是平时，否则是选中班级的 id 集合。
   *
   * 导出与删除平时都收在「设置」里，一个班一个班来；要一次收拾好几个班就走这里。
   */
  picking: null,
  /** 上一次画出来的浮层，用来判断这一帧是不是「浮层刚出现」。 */
  overlayShown: null,
  toast: '',
};

const root = document.getElementById('root');
const tiles = new Map();
const timerText = new Map();
const metaText = new Map();
/** 点名层里那些名字的格子：`学生 id → 格子`，与看板上那一套同理，走定点更新。 */
const rollTiles = new Map();
/** 点名层脚上那颗「完成」：人数变了要跟着改字，但不值得为它重画整块。 */
let rollFoot = null;

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
function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const pad = (value) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * 写给人看的时长：`1 小时 12 分` / `20 分 02 秒` / `40 秒`。
 *
 * 小结是念出来的一句话，用中文单位；大时钟是给教室看的表盘，才用 `时:分:秒`。
 */
function formatSpan(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const two = (value) => String(value).padStart(2, '0');
  if (hours > 0) {
    return `${hours} 小时 ${minutes} 分`;
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes} 分 ${two(seconds)} 秒` : `${minutes} 分`;
  }
  return `${seconds} 秒`;
}

/**
 * 自习时间的写法：一律 `时:分:秒`，两位一段。
 *
 * 大屏上的数字宽度得稳 —— 分秒那种「12:34」走到一小时忽然变成「1:02:03」，
 * 字会跳一下。所以小时位一直留着。
 */
function formatStudyTime(ms) {
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
    ? `自习中：蓝色 ${summary.absent} 人没来。在座的人点一下就记他离开，回来再点一下；按「点名」可以把没来的人挑出来。`
    : '自习中：全班都在座。有人临时离开就点一下他，会开始计时；回来再点一下。';
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
 * 开始自习、设置、自习记录都从班级卡上按，按之前先把它的上下文装上。
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

/** 从班级卡上开一个挂在这个班上的浮层（设置 / 自习记录）。 */
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
 *
 * 一按下去就在计时：**点名不在这一步里**，想点再按蒙版上的「点名」。
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
  // 静音与本场不切都只管一场：新场从头来，出声与自动待机都回来 ——
  // 不然老师不知道自己是静音的、也不知道屏幕为什么不切了
  state.muted = false;
  state.idleOff = false;
  state.mask = 'session';
  render();
}

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
 *
 * 相没变就**不重画整块**：重画会把老师正点着的那个格子换掉，点得快的一下就丢了。
 * 只有相变了（按钮要换、控件要换）才整块重画。浮层收起来这种「壳变了、格子没变」
 * 的情况由调用方传 `forceRender`。
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

/**
 * 点错的人退回没来：灰 → 蓝。
 *
 * 隔了一阵再补记也说得通（他那天确实没来），所以自习里随时能做，不必正在点名。
 */
async function doNotHere(studentId) {
  state.overlay = null;
  state.remarkStudentId = null;
  await commitSession(markAbsent(state.session, studentId, state.now), true);
}

/**
 * 结束自习。
 *
 * 这一场就此定格（记录、明细都留着，在「自习记录」里看），看板直接收起、回到班级列表 ——
 * 课上结束时老师要的是干净地离开这一屏，不是再看一遍刚才那场的账。
 *
 * 先问一句：这一下不可回退（要接着来只能另开一场），课上一时记错就点上的事不新鲜。
 */
async function doEndSession() {
  const klass = state.klass;
  const session = state.session;
  if (session === null || session.phase === PHASE.ENDED) {
    return;
  }
  const summary = summarize(klass, session, state.now);
  const bits = [`应到 ${summary.total}`, `在座 ${summary.present}`, `没来 ${summary.absent}`];
  if (summary.leaveCount > 0) {
    bits.push(`离开 ${summary.leaveCount} 人次`);
  }
  if (
    !window.confirm(
      `结束这一场自习？\n已走了 ${formatSpan(studyMs(session, state.now))}（${bits.join(' · ')}）。\n\n` +
        '结束时这一场就定格了，不能接着走；要看这一场就按「自习记录」。',
    )
  ) {
    return;
  }
  await commitSession(endSession(session, Date.now()));
  state.mask = null;
  render();
  showToast(
    klass === null
      ? '这一场已结束，记录里能看'
      : `「${klass.name}」这一场已结束，${formatSpan(studyMs(state.session, state.now))}，记录里能看`,
  );
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
 * 这一场已结束（定格、留着），新的一场从零开始（全班在座，点名结果也清空）。
 */
async function doRestart() {
  const now = Date.now();
  await commitSession(endSession(state.session, now));
  await enterSession();
  showToast('上一场已结束，新的一场从头开始');
}

/**
 * 点一个格子。走哪条路看这个人现在的颜色。
 *
 * 点到没来的人（蓝）点一下就归队；点到在座的人（灰）就问一句备注、开始记他离开；
 * 点到离开中的人（黄 / 红）就记归来。已结束的这一场只读，点格子顶一句。
 */
async function tapStudent(studentId) {
  const session = state.session;
  if (session === null) {
    return;
  }

  // 已结束的一场点格子什么也不算 —— 不能默不作声：格子是按钮的样子，点下去没反应，
  // 老师会以为坏了。（结束就收起看板，所以这里多半只在别处点开过记录时走到）
  if (session.phase === PHASE.ENDED) {
    showToast('这一场已经结束，记录里能看');
    return;
  }

  const status = statusOf(session, studentId, state.now, state.klass);
  if (status === STATUS.ABSENT) {
    // 自习中按「在座的在前」排过：他这一下是归队，得整块重画 ——
    // 不然格子还留在「没来」那一段里，分界线上的人数也不跟着变
    await commitSession(markPresent(session, studentId), true);
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
  if (alerting || state.session === null || state.session.phase !== PHASE.STUDYING) {
    return;
  }
  // 暂停期间不响：那段时间不算在外面，一直响只会吵
  if (isPaused(state.session)) {
    return;
  }
  if (!state.klass.alertSound || !sound.isSupported() || state.muted) {
    return;
  }
  const due = dueAlerts(state.klass, state.session, state.now, state.klass.alertRepeatMs);
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

function download(filename, bytes, type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
  const blob = new Blob([bytes], { type });
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
  download(`${klass.name}-${today()}.xlsx`, bytes);
}

/** 文件名里的日期：`2026-10-11`。 */
function today() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/* ---------- 班级列表的多选 ---------- */

/** 多选态下已经被勾上的班，按列表顺序。 */
function pickedClasses() {
  if (state.picking === null) {
    return [];
  }
  return state.classes.filter((klass) => state.picking.has(klass.id));
}

function togglePick(klassId) {
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

function startPicking() {
  state.picking = new Set();
  render();
}

function endPicking() {
  state.picking = null;
  render();
}

function togglePickAll() {
  const picked = pickedClasses();
  state.picking = picked.length === state.classes.length ? new Set() : new Set(state.classes.map((klass) => klass.id));
  render();
}

/**
 * 把选中的班各导成一份 xlsx，装进一个 zip 下下来。
 *
 * 不能连着触发好几次下载：浏览器会拦「是否允许下载多个文件」，老师多半选否。
 */
async function exportPicked() {
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
async function removePicked() {
  const picked = pickedClasses();
  if (picked.length === 0) {
    return;
  }
  const names = picked.slice(0, 3).map((klass) => klass.name).join('、');
  const rest = picked.length > 3 ? ` 等 ${picked.length} 个班` : '';
  const runningCount = picked.filter((klass) => state.running.has(klass.id)).length;
  const warning =
    runningCount > 0 ? `\n其中 ${runningCount} 个班有正在进行的自习，那一场也一起删掉。` : '';
  if (!window.confirm(`删除「${names}」${rest}及其全部记录？${warning}\n这一步不能撤回。`)) {
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
  showToast(picked.length === 1 ? `「${picked[0].name}」已删除` : `已删除 ${picked.length} 个班`);
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
  rollTiles.clear();
  rollFoot = null;
  // 判据放在这里而不是各个打开浮层的地方：直接设 state.overlay 的有好几处
  // （卡上的钮、导入撞名、点格子开备注），逐处打标记迟早漏一个
  const before = state.overlayShown;
  state.overlayShown = state.overlay;
  root.replaceChildren(renderShell());
  // 挂上去了才算数：updateDynamic 是去已挂的 DOM 里找那些要逐拍改的节点
  updateDynamic();
  // 焦点得等节点挂上去才能给
  if (state.overlay !== null && state.overlay !== before) {
    focusIntoOverlay();
  }
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

/**
 * 班级列表的页头动作。
 *
 * 平时是「新建 / 恢复」；进了多选态就换成批量的那几颗 —— 一个班一个班地导出、
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
        text: '导出选中',
        title: '每个班一份 xlsx，打成一个 zip 下载',
        disabled: picked.length === 0 ? '' : undefined,
        onClick: () => void exportPicked(),
      }),
      h('button', {
        class: 'btn btn--danger',
        text: '删除选中',
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
      title: '一次导出或删除好几个班',
      // 一个班都没有时没什么可多选的
      disabled: state.classes.length === 0 ? '' : undefined,
      onClick: startPicking,
    }),
    h('button', { class: 'btn', text: '从文件恢复一个班', title: '导入之前导出的整班 xlsx（含记录）', onClick: () => pickFile('.xlsx', importClassFile) }),
    h('button', {
      class: 'btn btn--primary',
      text: '新建班级',
      onClick: () => openOverlay('newClass'),
    }),
  ]);
}

function renderClassesPage() {
  const main = h('main', { class: 'page' });
  // 这一页不在教室前面用，用不上全屏钮
  main.append(tabBar({ fullscreen: false }));

  const body = h('div', { class: 'home' });
  const bar = h('div', { class: 'home__bar' });
  bar.append(h('h2', { class: 'home__title', text: '班级' }));
  bar.append(renderHomeActions());
  body.append(bar);

  if (state.classes.length === 0) {
    // 第一次打开没人教，所以把「怎么用」直接写在这里
    const steps = h('ol', { class: 'empty__steps' });
    steps.append(
      h('li', {
        text: '导入一份花名册建班（.xlsx 或 .xls，网页表格改名的 .xls 也认；表里有一列写着「姓名」即可）',
      }),
    );
    steps.append(h('li', { text: '开始自习 —— 一按下去就在计时，全班默认在座（灰）' }));
    steps.append(h('li', { text: '有人临时离开，点一下他，会开始计时；超过设定时长转红并提醒' }));
    steps.append(h('li', { text: '想点名就按「点名」，点一下没来的人，他变蓝并沉到后面' }));
    steps.append(h('li', { text: '换机器或留档：按「多选」勾上几个班，导出成一个 zip；一个班一份 xlsx' }));
    body.append(
      h('div', { class: 'empty' }, [
        h('p', { class: 'empty__title', text: '还没有班级' }),
        steps,
        renderLegend(),
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
  const card = h('article', { class: `card${picking ? ' card--pick' : ''}${picked ? ' is-picked' : ''}` });
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
  const bits = [`${klass.students.length} 人`, themeLabel(klass.theme)];
  title.append(h('p', { class: 'card__meta', text: bits.join(' · ') }));
  if (running !== null) {
    title.append(
      h('span', { class: 'chip chip--studying' }, [
        h('span', { text: '自习中 ' }),
        h('span', {
          class: 'chip__clock',
          dataset: { clock: `card:${klass.id}` },
          text: '00:00:00',
        }),
      ]),
    );
  }
  head.append(title);

  if (!picking) {
    // 记录与设置都是「翻资料」，挨着放；开自习是「干活」，隔到卡底去
    const tools = h('div', { class: 'card__tools' });
    tools.append(
      h('button', {
        class: 'btn',
        text: '自习记录',
        title: '以前每一场自习的账',
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
function displayOrder(klass, session) {
  if (session === null || state.rollCallOpen !== null) {
    return klass.students;
  }
  const absent = new Set(session.absentIds);
  return [
    ...klass.students.filter((student) => !absent.has(student.id)),
    ...klass.students.filter((student) => absent.has(student.id)),
  ];
}

function themeLabel(theme) {
  return { junior: '童趣（小学）', middle: '标准', senior: '简洁（高中）' }[theme] ?? theme;
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
  grid.style.setProperty('--cols', String(GRID_COLUMNS[klass.theme] ?? 6));
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
 * 四色图例。
 *
 * 灰 / 蓝 / 黄 / 红是这一屏的语言，但界面上原本一个字都没解释 —— 第一次用的老师
 * 看到一片灰，分不清那是「还没点」还是「都在座」。这一行就是那本小字典，平时压得很暗。
 *
 * 「离开中」画黄 —— 那是默认色；老师给某条备注挑了别的颜色，格子跟着走，图例不追。
 * 这里说的是颜色的**意思**，不是某一格的颜色。
 */
function renderLegend() {
  const legend = h('div', { class: 'legend' });
  for (const [status, label] of [
    [STATUS.ABSENT, '没来'],
    [STATUS.PRESENT, '在座'],
    [DEFAULT_AWAY_COLOR, '离开中'],
    [STATUS.OVERTIME, '超时'],
  ]) {
    const item = h('span', { class: 'legend__item' });
    item.append(h('i', { class: 'legend__dot', dataset: { status } }));
    item.append(h('span', { text: label }));
    legend.append(item);
  }
  return legend;
}

/**
 * 格子第二行。
 *
 * 只给一样：有座位号就给座位号，没有才退到学号。原来两个并排写成「1号 · 01」，
 * 看着像写重了 —— 老师认人靠座位，学号留给悬停提示。
 */
function seatLine(student) {
  if (student.seat !== '') {
    return `${student.seat}号`;
  }
  return student.code;
}

/** 格子的悬停提示：座位与学号都写全。 */
function tileTitle(student) {
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
  const session = state.session;
  const at = readAt(session, now);
  updateCardClocks(at);

  if (state.mask !== 'session') {
    return;
  }

  // 点名层开着时，名字的灰蓝也走定点更新 —— 点一下只换一个格子的脸，
  // 不重画整块（重画会把老师正点着的那个位置和键盘焦点一起丢掉）
  updateRollCall(session);

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

/** 走的计时与「离开中」的亮灭。模式与格子上那一套一致。 */
/**
 * 点名层里那些名字的灰蓝，以及脚上那颗「完成」的人数。
 *
 * 与看板上的格子同理：点一下只换那一个格子的脸，不重画整块 —— 几十号人一次点不完，
 * 每次重画都会把老师刚点着的那个位置重新排一遍，键盘的焦点也会掉出去。
 */
function updateRollCall(session) {
  if (state.overlay !== 'rollCall' || session === null) {
    return;
  }
  const absent = new Set(session.absentIds);
  for (const [studentId, tile] of rollTiles) {
    tile.classList.toggle('is-absent', absent.has(studentId));
  }
  if (rollFoot !== null) {
    rollFoot.textContent = rollDoneText(absent.size);
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

/* ---------- 浮层 ---------- */

function openOverlay(name) {
  state.overlay = name;
  render();
}

/**
 * 浮层一出来就把焦点送进去。
 *
 * 键盘老师按下的那一刻焦点在触发它的那颗钮上，浮层一出来整棵树重画、焦点掉回 body，
 * 再按 Tab 会从班级列表开头走一圈。所以浮层刚出现时把焦点送进去，顺序是：
 * `data-autofocus`（备注要打字、设置要改名字）→ 第一个输入类控件 → 浮层本身。
 *
 * 一轮按钮排在最后是有意的：浮层头上的第一颗钮是「✕」，焦点若落在它上面，老师顺手
 * 一个回车就把刚打开的窗又关了。点名层的 ✕ 也是这个道理 —— 那里一次点空就是撤销一整趟，
 * 更不该让一个回车碰上。
 *
 * 只做「进来」不做「出去」：关闭时那颗触发它的钮已经是新节点了，硬要还原得给每颗钮
 * 编个号，不值当 —— Esc 与 Tab 能走通就够用了。
 */
function focusIntoOverlay() {
  const modal = root.querySelector('.modal');
  if (modal === null) {
    return;
  }
  const target =
    modal.querySelector('[data-autofocus]') ??
    modal.querySelector('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])');
  (target ?? modal).focus?.();
}

/**
 * 关掉当前浮层。
 *
 * 点名层是唯一的例外：它的 ✕ / Esc / 点窗外都是**撤销这一趟**，交给 `cancelRollCall`
 * 去做（它把名单退回开门那一刻，再收窗）。
 */
function closeOverlay() {
  if (state.overlay === 'rollCall') {
    void cancelRollCall();
    return;
  }
  state.overlay = null;
  state.remarkStudentId = null;
  state.pendingNewClass = null;
  state.newClassName = null;
  render();
}

/**
 * 一块浮层的壳：标题栏 + 内容 + 底下一排钮。
 *
 * `options.closeLabel` / `closeTitle` 改那颗 ✕ 的说法 —— 点名层把 ✕ 当「撤销这一趟」，
 * 光写「关闭」会让人以为跟脚上的「完成」是一回事。
 */
function modalFrame(title, bodyNodes, footNodes, options = {}) {
  // tabindex：浮层里一个输入控件都没有时（比如自习记录），焦点落在浮层本身，
  // 既算「进来了」，回车也不会误触里面任何一颗钮
  const modal = h('div', {
    class: `modal ${options.class ?? ''}`.trim(),
    role: 'dialog',
    'aria-modal': 'true',
    tabindex: '-1',
  });
  const head = h('div', { class: 'modal__head' });
  head.append(h('h2', { class: 'modal__title', text: title }));
  head.append(
    h('button', {
      class: 'btn btn--icon',
      text: '✕',
      'aria-label': options.closeLabel ?? '关闭',
      title: options.closeTitle,
      onClick: state.overlay === 'rollCall' ? () => void cancelRollCall() : closeOverlay,
    }),
  );
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
  const scrim = h('div', {
    class: 'scrim',
    onClick: state.overlay === 'rollCall' ? () => void cancelRollCall() : closeOverlay,
  });
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
    case 'rollCall':
      return renderRollCall();
    default:
      return h('span');
  }
}

/**
 * 点名层：一块盖在自习上的窗。
 *
 * 它是**可选的**，不是必经的一步 —— 关掉自习一点不受影响，没点完也一样。点过的人当场
 * 变蓝并沉到看板后面，所以中途随时能收。
 *
 * 栏上有两个出口，说的是两件事：
 *
 * - **✕**（右上）当作**撤销**：名单退回开门那一刻，这一趟点的全不算。课上常常是点着
 *   点着发现点错了人、或者班长说名单不对，整趟作废比逐个撤回快。
 * - **完成**（脚上，带「N 人没来」）：点过的留下，收窗回自习。
 *
 * 两条路都得有：只给「完成」的话，点错整趟就得一个个退回去；只给「撤销」的话，
 * 点完想收工就没路。Esc 与点窗外跟 ✕ 同义（没保存就退出去，退的是这一趟）。
 */
function renderRollCall() {
  const klass = state.klass;
  const session = state.session;
  const body = [];

  body.push(
    h('p', {
      class: 'modal__hint',
      text: '点一下名字就是「他没来」——他变蓝并沉到后面去；点错了再点一下退回灰色。不点名也能自习，随时关掉。',
    }),
  );

  const absent = new Set(session?.absentIds ?? []);
  const list = h('div', { class: 'rollcall__list' });
  // 按名册顺序排：老师是照着名单点人，格子一挪就会点错
  for (const student of klass.students) {
    const isAbsent = absent.has(student.id);
    const tile = h('button', {
      class: `rollcall__tile${isAbsent ? ' is-absent' : ''}`,
      title: tileTitle(student),
      dataset: { rollcallId: student.id },
      onClick: () => void doMarkPresentOrAbsent(student.id),
    });
    tile.append(h('span', { class: 'rollcall__name', text: student.name }));
    const seat = seatLine(student);
    if (seat !== '') {
      tile.append(h('span', { class: 'rollcall__seat', text: seat }));
    }
    list.append(tile);
    rollTiles.set(student.id, tile);
  }
  if (klass.students.length === 0) {
    list.append(h('p', { class: 'empty__hint', text: '这个班还没有学生。' }));
  }
  body.push(list);

  const foot = [];
  // 反选收拾的是「一整轮点错了」：一班几十号人，偶尔只有少数没来，先把全班都算作
  // 没来再点回那几个更省事。它翻的是整张表，所以压一档、摆在最左，不与「关闭」同重
  foot.push(
    h('button', {
      class: 'btn btn--quiet',
      text: '反选',
      title: '把全班翻过来：没来的都算在座，在座的都算没来',
      disabled: klass.students.length === 0 ? '' : undefined,
      onClick: () => void doInvert(),
    }),
  );
  const absentCount = absent.size;
  // 主行动压在最右：点完按它就是收工。字随「记下几个人」变，由 `updateRollCall`
  // 定点改，不为它重画整块。一层里只留这一条出口 —— 曾经脚上还有一颗「关闭」、
  // 标题栏还有一颗 ✕，三颗说同一件事，老师还得猜哪个算数。
  //
  // 提示语里的数现读 `state.session`，不用上面那个 `absentCount`：这一层画出来之后
  // 老师又点了几下，闭包里的数早就旧了。
  const done = h('button', {
    class: 'btn btn--primary',
    dataset: { rollDone: '1' },
    text: rollDoneText(absentCount),
    title: '点过的留下，收起这层回自习',
    onClick: finishRollCall,
  });
  rollFoot = done;
  foot.push(done);
  return modalFrame('点名', body, foot, {
    class: 'modal--rollcall',
    closeLabel: '撤销这一趟点名',
    closeTitle: '撤销这一趟：把刚才点出来的没来退回开门那一刻',
  });
}

/** 点名层那颗「完成」上的字。 */
function rollDoneText(absentCount) {
  return absentCount === 0 ? '完成' : `完成（${absentCount} 人没来）`;
}
/**
 * 点名层的「反选」：全班翻过来 —— 没来的都算在座，在座的都算没来。
 *
 * 与逐个人点一样，这一下也走定点更新：几十个格子各自换脸，浮层不重画，老师刚点到的
 * 位置与焦点都留着。
 */
async function doInvert() {
  const ids = state.klass.students.map((item) => item.id);
  const next = invertAbsent(state.session, ids, state.now);
  await commitSession(next);
  const absent = next.absentIds.length;
  const total = ids.length;
  showToast(
    absent === total
      ? '全班都算作没来了；在座的点一下他，变回灰色'
      : absent === 0
        ? '全班都算作在座了'
        : `翻过来了：${total - absent} 人在座，${absent} 人没来`,
  );
}

/**
 * 点名层里点一个人：蓝的退回灰，灰的记成没来。
 *
 * 只换那一个格子，不重画整块 —— 几十号人一次点不完，重画会把老师刚点着的位置重新
 * 排一遍，键盘的焦点也会掉出去。所以这里不传 `forceRender`，由 `updateDynamic`
 * 里的 `updateRollCall` 定点改。
 */
async function doMarkPresentOrAbsent(studentId) {
  const status = statusOf(state.session, studentId, state.now, state.klass);
  const at = state.now;
  await commitSession(
    status === STATUS.ABSENT
      ? markPresent(state.session, studentId)
      : markAbsent(state.session, studentId, at),
  );
}

/**
 * 点名层的开关。两种收工，各说各的意思：
 *
 * - **完成**（脚上的主钮）：点过的照旧留着，收窗回自习 —— 这一趟点出来的没来就是这一场的账。
 * - **✕ / Esc / 点窗外**：撤销这一趟 —— 回到**开门那一刻**的名单，中间点过的一概不留。
 *
 * 课上常常是点着点着发现点错了人、或者班长说名单不对，整趟作废比逐个撤回快；
 * 当然也可能相反（点了一大半不想走回头路），那就按「完成」。所以出口是两个，不是一个。
 */
function openRollCall() {
  if (state.session === null) {
    return;
  }
  noteActivity();
  // 记下开门那一刻的名单：✕ 撤销时回到这里。撤销不落盘之外的痕迹 —— 只写一次会话
  state.rollCallOpen = { absentIds: [...state.session.absentIds] };
  state.overlay = 'rollCall';
  render();
}

/** 「完成」：这一趟点出来的没来留下，收窗回自习。 */
function finishRollCall() {
  const count = state.session?.absentIds.length ?? 0;
  closeRollCall();
  showToast(count === 0 ? '全班都在座' : `已记下 ${count} 人没来`);
}

/** ✕：这一趟作废，名单退回开门那一刻，收窗回自习。 */
async function cancelRollCall() {
  const opened = state.rollCallOpen;
  // 先收窗（层与看板都整块重画，见下），再往回退
  state.rollCallOpen = null;
  state.overlay = null;
  state.remarkStudentId = null;
  if (opened === null || state.session === null) {
    render();
    return;
  }
  await commitSession({ ...state.session, absentIds: [...opened.absentIds] }, true);
  showToast('已撤销这一趟点名');
}

/** 收窗。名单已经改好了（或已撤销），这里只把层拿掉、把格子归位。 */
function closeRollCall() {
  state.rollCallOpen = null;
  state.overlay = null;
  state.remarkStudentId = null;
  // 关掉之后「没来的人」才归位到最后那一块，所以这一下要整块重画
  render();
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

  if (state.pendingNewClass === null) {
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
        if (state.pendingNewClass === null) {
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
        state.pendingNewClass = null;
        state.newClassName = null;
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
      text: `给「${student?.name ?? ''}」记一次临时离开。挑一条常用备注，他的格子就按那条的颜色走；那条填了时长的话，过了就转红并出声。不挑也行，就是默认的黄、不限时。`,
    }),
  );

  let templateId;
  const chips = h('div', { class: 'chips' });
  for (const template of klass.remarkTemplates) {
    const chip = h('button', {
      class: `chip chip--pick chip--away-${template.color}`,
      dataset: { templateId: template.id },
      onClick: () => {
        templateId = templateId === template.id ? undefined : template.id;
        for (const node of chips.children) {
          node.classList.toggle('is-on', node.dataset.templateId === templateId);
        }
      },
    });
    chip.append(h('i', { class: 'chip__dot' }));
    chip.append(h('span', { text: template.text }));
    // 时长写在条上：老师挑的时候就得看见「这条几分钟算超时」，不然得回设置里翻
    if (template.timeoutMs > 0) {
      chip.append(h('span', { class: 'chip__minutes', text: `${Math.round(template.timeoutMs / 60000)} 分钟` }));
    }
    chips.append(chip);
  }
  if (klass.remarkTemplates.length === 0) {
    chips.append(h('span', { class: 'modal__hint', text: '还没有常用备注，到「班级设置」里加。' }));
  }
  body.push(h('div', { class: 'field' }, [h('span', { class: 'field__label', text: '常用备注' }), chips]));

  const textarea = h('textarea', {
    class: 'input input--area',
    rows: 2,
    placeholder: '补充一句（可空）',
    // 键盘老师点开备注就是要打字，焦点别落在上面那排常用备注上
    'data-autofocus': '',
  });
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
  // 退路：自习中点错了人（他其实没来），得能退回蓝色。不给这条，一次手抖就改不掉了。
  foot.push(
    h('button', {
      class: 'btn',
      text: '他没来',
      title: '改成没来（蓝色）',
      onClick: () => void doNotHere(state.remarkStudentId),
    }),
  );
  foot.push(
    h('button', {
      class: 'btn btn--primary',
      text: '开始计时',
      onClick: () => void confirmLeave(templateId, textarea.value.trim()),
    }),
  );
  return modalFrame('临时离开', body, foot);
}

/**
 * 设置里的一行备注模板：文本 + 颜色 + 时长。
 *
 * 行的当前颜色挂在 `data-tpl-color` 上，保存时从那里读 —— 色块只是把它改掉，
 * 不必再往每个色块上辨认哪个是选中的。
 */
function templateRow(template) {
  const row = h('div', { class: 'tpl', dataset: { tpl: '1', tplColor: template.color } });
  row.append(
    h('input', {
      class: 'input tpl__text',
      placeholder: '写着什么（比如「上厕所」）',
      value: template.text,
      dataset: { tplText: '1' },
    }),
  );
  row.append(colorSwatches(template.color, (color) => {
    row.dataset.tplColor = color;
  }));
  row.append(
    h('label', { class: 'tpl__time' }, [
      h('input', {
        class: 'input tpl__minutes',
        type: 'number',
        min: '0',
        max: '180',
        placeholder: '不限',
        value: template.timeoutMs > 0 ? String(Math.round(template.timeoutMs / 60000)) : '',
        dataset: { tplMinutes: '1' },
      }),
      h('span', { class: 'tpl__unit', text: '分钟' }),
    ]),
  );
  row.append(
    h('button', {
      class: 'btn btn--icon tpl__remove',
      text: '✕',
      'aria-label': '删掉这条',
      title: '删掉这条',
      onClick: () => row.remove(),
    }),
  );
  return row;
}

/** 一排颜色小圆点。选了哪颗由 `is-on` 标出来，颜色名同时写进 title 与 data。 */
function colorSwatches(selected, onPick) {
  const box = h('div', { class: 'swatches' });
  for (const color of AWAY_COLORS) {
    const dot = h('button', {
      type: 'button',
      class: `swatch swatch--${color}${color === selected ? ' is-on' : ''}`,
      dataset: { color },
      title: awayColorLabel(color),
      'aria-label': awayColorLabel(color),
      onClick: () => {
        for (const node of box.children) {
          node.classList.toggle('is-on', node.dataset.color === color);
        }
        onPick(color);
      },
    });
    box.append(dot);
  }
  return box;
}

/** 颜色名写成中文，悬停能认出来。 */
function awayColorLabel(color) {
  return { yellow: '黄', orange: '橙', green: '绿', violet: '紫', pink: '粉', teal: '青' }[color] ?? color;
}

function renderSettings() {
  const klass = state.klass;
  const body = [];

  const nameInput = h('input', { class: 'input', value: klass.name });
  body.push(h('label', { class: 'field' }, [h('span', { class: 'field__label', text: '班级名称' }), nameInput]));

  const themeSelect = h('select', { class: 'input' });
  for (const [value, label] of [['junior', '童趣（小学）'], ['middle', '标准'], ['senior', '简洁（高中）']]) {
    themeSelect.append(h('option', { value, text: label, ...(klass.theme === value ? { selected: true } : {}) }));
  }
  body.push(h('label', { class: 'field' }, [h('span', { class: 'field__label', text: '主题' }), themeSelect]));

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
      h('span', { class: 'field__label', text: '隔多久再提醒一次（秒）' }),
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
      h('span', { class: 'field__label', text: '多久不动就换成大时钟' }),
      idleSelect,
      h('span', {
        class: 'field__note',
        text: '自习中这么久没人碰屏幕，就换成一个大钟加「谁还在外面」。点一下、动一下鼠标、敲一下键都算，都会重新计时。',
      }),
    ]),
  );

  // 每条备注自带颜色与时长。原来这里是「一行一条」的输入框 —— 现在一条有三个字段，
  // 就得一行一行摆：文本、颜色、分钟数，右边一个删。
  const templateList = h('div', { class: 'tpls' });
  for (const template of klass.remarkTemplates) {
    templateList.append(templateRow(template));
  }
  body.push(
    h('div', { class: 'field' }, [
      h('span', { class: 'field__label', text: '常用备注' }),
      h('span', {
        class: 'field__note',
        text: '点一个人记离开时可以挑一条。颜色是他的格子在他离开期间的颜色；填了分钟数就按这条算超时，过了转红并出声，空着就是不限时。',
      }),
      templateList,
      h('button', {
        class: 'btn',
        text: '加一条',
        onClick: () => {
          templateList.append(templateRow({ text: '', color: DEFAULT_AWAY_COLOR, timeoutMs: 0 }));
        },
      }),
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
        const templates = [...templateList.querySelectorAll('[data-tpl]')]
          .map((row) => ({
            text: row.querySelector('[data-tpl-text]').value.trim(),
            color: row.dataset.tplColor,
            timeoutMs: Math.max(0, Number(row.querySelector('[data-tpl-minutes]').value) || 0) * 60000,
          }))
          // 文本空着的那一行不算一条：老师加了一条又没写，不该在挑的时候冒出来
          .filter((item) => item.text !== '')
          .map((item, index) => ({ id: `tpl-${index + 1}`, ...item }));
        state.overlay = null;
        await commitClass({
          ...state.klass,
          name: nameInput.value.trim() === '' ? state.klass.name : nameInput.value.trim(),
          theme: themeSelect.value,
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
    body.push(h('p', { class: 'modal__hint', text: '这个班还没有自习记录。' }));
  } else {
    const end = Date.now();
    const total = sessions.reduce((sum, item) => sum + studyMs(item, item.endedAt ?? end), 0);
    const leaves = sessions.reduce((sum, item) => sum + item.leaves.length, 0);
    // 有超时的场次才把这一条说出来：全班都没超时的时候提它反而扎眼
    const overtimeRuns = sessions.filter((item) => overtimeCount(state.klass, item, item.endedAt ?? end) > 0).length;
    const bits = [`共 ${sessions.length} 场`, `自习合计 ${formatSpan(total)}`, `离开 ${leaves} 人次`];
    if (overtimeRuns > 0) {
      bits.push(`有超时 ${overtimeRuns} 场`);
    }
    body.push(h('p', { class: 'modal__hint', text: bits.join(' · ') }));

    const table = h('table', { class: 'table' });
    const head = h('tr');
    for (const label of ['开始', '结束', '自习时长', '在座', '离开人次', '超时']) {
      head.append(h('th', { text: label }));
    }
    table.append(h('thead', {}, [head]));
    const tbody = h('tbody');
    for (const session of sessions) {
      const endAt = session.endedAt ?? Date.now();
      const summary = summarize(state.klass, session, endAt);
      const overtime = overtimeCount(state.klass, session, endAt);
      const row = h('tr');
      row.append(h('td', { text: formatDate(session.startedAt) }));
      row.append(h('td', { text: session.endedAt === undefined ? '进行中' : formatDate(session.endedAt) }));
      // 表里这份用「时:分:秒」：一列数上下对齐才好比长短，中文单位会把列撑得忽宽忽窄
      row.append(h('td', { text: formatStudyTime(studyMs(session, endAt)) }));
      row.append(h('td', { text: String(summary.present) }));
      row.append(h('td', { text: String(summary.leaveCount) }));
      row.append(h('td', { class: overtime > 0 ? 'is-overtime' : '', text: overtime > 0 ? String(overtime) : '—' }));
      tbody.append(row);
    }
    table.append(tbody);
    body.push(table);
  }
  const foot = [];
  foot.push(h('button', { class: 'btn', text: '关闭', onClick: closeOverlay }));
  foot.push(h('button', { class: 'btn btn--primary', text: '导出全班 xlsx', onClick: () => void exportClass(state.klass) }));
  return modalFrame('自习记录', body, foot);
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
  // 老师在自习页上按了「本场不切」：这一场就只看板，不再自己换屏
  if (state.idleOff) {
    return false;
  }
  // 浮层开着就不切：老师正开着点名层或备注窗，那是他当下在做的事。切了的话看板会从
  // 底下换成大钟，那扇窗还浮在大钟上面 —— 两层各说各的，看着像坏了
  if (state.overlay !== null) {
    return false;
  }
  // 只在正式自习时间里切：点名时屏幕上正等着老师点人，不该自己走掉。
  // 暂停时也不切：那时什么都没在计时，屏幕上留着「已暂停」比换成大钟有用。
  if (state.session.phase !== PHASE.STUDYING || isPaused(state.session)) {
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

/**
 * 键盘的退路。
 *
 * Esc 先关浮层 —— 键盘老师最需要的就是「退出去」。浮层是点名层时这一下是**撤销这一趟**
 * （与那颗 ✕ 同义：没保存就退出去，退的就是这一趟）。多选态下退多选。
 * 其余场合不碰 Esc：自习蒙版下那一下是浏览器自己的「退出全屏」。
 */
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') {
    return;
  }
  if (state.overlay !== null) {
    event.preventDefault();
    if (state.overlay === 'rollCall') {
      void cancelRollCall();
      return;
    }
    closeOverlay();
    return;
  }
  if (state.picking !== null) {
    event.preventDefault();
    endPicking();
  }
});

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
