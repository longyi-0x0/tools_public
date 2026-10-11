/**
 * 状态与动作。
 *
 * 一份 `state`、所有往库里写的动作、以及整块重画的分发（`render`）。视图只读 `state`，
 * 要改就调这里的动作；动作自己决定是整块重画还是走定点更新，视图不必关心
 * 「改完谁去重画」。
 *
 * 视图模块反过来要 import 这里的动作（`onClick` 得接得上），于是这里与视图之间成环。
 * 环上只走函数声明与 `state` 这个已经建好的对象，模块求值期谁都不调用谁。
 */

import {
  PHASE,
  STATUS,
  activeLeave,
  endSession,
  markLeft,
  markReturned,
  normaliseKlass,
  normaliseSession,
  pauseSession,
  resumeSession,
  startSession,
  statusOf,
  studyMs,
  summarize,
} from './domain.js';
import * as store from './store.js';
import * as sound from './sound.js';
import { exportClassWorkbook, parseClassWorkbook } from './klassFile.js';
import { download } from './roster.js';
import { formatSpan, today } from './format.js';
import { focusIntoOverlay, h, requestFullscreen, root, uid } from './dom.js';
import { renderClassesPage } from './classes.js';
import { renderIdleMask, renderSessionMask, resetTileRefs, updateDynamic, paintPicking } from './board.js';
import { renderOverlay, resetOverlayRefs } from './overlays/index.js';

export const state = {
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
   * 点名层这一趟攒着的名单：`null` 是没开，`{ absentIds }` 是开着。
   *
   * 层里点的人只改这一份，**不动 `session`** —— 按「完成」才由 `setAbsent` 一次落到
   * 这一场上（见 `overlays/rollcall.js`）。所以半路收窗走人什么也不会留下。
   *
   * `null` 之外的任何值都算「开着」（看板上不画「没来」那条分界也看它）—— 名单本身
   * 可能正好是空的，不能拿它当开关。
   */
  rollCallOpen: null,
  /**
   * 备注浮层当前针对的学生 id。
   *
   * 是**一串**：点一个格子开浮层就是一个人，看板上多选勾出来的就是好几个人 ——
   * 一起出去的那几位本来就该从同一刻起算，挑一条备注一次记上。
   */
  remarkStudentIds: [],
  /**
   * 自习看板上的多选态：`null` 是平时，否则是勾上的学生 id 集合。
   *
   * 常见的一幕是「几个人一起出去」—— 一个一个点、一次次挑备注太啰嗦，这里勾上几个
   * 再挑一次备注就完事。只认**在座**的人：这一手是「记离开」，没来的谈不上离开，
   * 已经在外面也不必再记一次（见 [`togglePickStudent`]）。
   */
  pickingStudents: null,
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

export async function refreshClasses() {
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
export async function loadClass(klass) {
  state.klass = normaliseKlass(klass);
  const sessions = (await store.listSessions(klass.id)).map(normaliseSession);
  state.sessions = sessions;
  state.session = sessions.find((item) => item.phase !== PHASE.ENDED) ?? null;
}

/** 从班级卡上进自习：先把这个班装上。 */
export async function enterSessionFrom(klass) {
  await loadClass(klass);
  await enterSession();
}

/** 从班级卡上开一个挂在这个班上的浮层（设置 / 自习记录）。 */
export async function openFromCard(klass, overlay) {
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
export async function commitSession(next, forceRender = false) {
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

export async function commitClass(next) {
  state.klass = next;
  await store.putClass(next);
  const index = state.classes.findIndex((item) => item.id === next.id);
  if (index >= 0) {
    state.classes[index] = next;
  }
  render();
}

/**
 * 结束自习。
 *
 * 这一场就此定格（记录、明细都留着，在「自习记录」里看），看板直接收起、回到班级列表 ——
 * 课上结束时老师要的是干净地离开这一屏，不是再看一遍刚才那场的账。
 *
 * 先问一句：这一下不可回退（要接着来只能另开一场），课上一时记错就点上的事不新鲜。
 */
export async function doEndSession() {
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
  // 多选态跟着这一场一起收：都下课了，回来不该还留着上一轮的勾
  state.pickingStudents = null;
  render();
  showToast(
    klass === null
      ? '这一场已结束，记录里能看'
      : `「${klass.name}」这一场已结束，${formatSpan(studyMs(state.session, state.now))}，记录里能看`,
  );
}

/** 暂停自习。 */
export async function doPause() {
  await commitSession(pauseSession(state.session, Date.now()));
  showToast('已暂停，谁在外面也一起停表');
}

/** 继续自习。 */
export async function doResume() {
  await commitSession(resumeSession(state.session, Date.now()));
  showToast('已继续');
}

/**
 * 重新开始：结束这一场，另开一场。
 *
 * 这一场已结束（定格、留着），新的一场从零开始（全班在座，点名结果也清空）。
 */
export async function doRestart() {
  const now = Date.now();
  await commitSession(endSession(state.session, now));
  await enterSession();
  showToast('上一场已结束，新的一场从头开始');
}

/**
 * 点一个格子。走哪条路看这个人现在的颜色。
 *
 * 点到没到的人（灰）只在提示里说一句 —— 到没到由点名层定；点到在座的人（蓝）就问一句
 * 备注、开始记他离开；
 * 点到离开中的人（黄 / 红）就记归来。已结束的这一场只读，点格子顶一句。
 */
export async function tapStudent(studentId) {
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

  // 多选态下点格子是「勾上他」，不是「他离开」—— 勾完了按「记离开」再挑备注
  if (state.pickingStudents !== null) {
    togglePickStudent(studentId);
    return;
  }

  const status = statusOf(session, studentId, state.now, state.klass);
  if (status === STATUS.ABSENT) {
    // 到没到只由「点名」定，看板上点他没这一手 —— 顶一句，别默不作声
    showToast('他没到。到没到在「点名」里点，这里点不动');
    return;
  }
  if (status === STATUS.PRESENT) {
    // 变黄前先问备注：模板可以一条都不选，直接确定就是纯计时
    state.remarkStudentIds = [studentId];
    state.overlay = 'remark';
    render();
    return;
  }
  await commitSession(markReturned(session, studentId, Date.now()));
}

/** 进看板上的多选态：勾几个在座的人，一次给同一条离开备注。 */
export function startPickingStudents() {
  state.pickingStudents = new Set();
  render();
}

/** 退多选：勾上的都不算数，谁也没被记上。 */
export function endPickingStudents() {
  state.pickingStudents = null;
  render();
}

/**
 * 多选态下勾一个人 / 取消勾。
 *
 * 只认在座的人：这一手是「给几个要走的人一起记离开」。勾不动的得顶一句 —— 格子是
 * 按钮的样子，点下去没反应，老师会以为坏了。
 */
export function togglePickStudent(studentId) {
  if (state.pickingStudents === null) {
    return;
  }
  if (activeLeave(state.session, studentId) !== undefined) {
    showToast('他已经在外面了，不用再记一次离开');
    return;
  }
  if (state.session.absentIds.includes(studentId)) {
    showToast('他是没来的，记不了离开');
    return;
  }
  if (state.pickingStudents.has(studentId)) {
    state.pickingStudents.delete(studentId);
  } else {
    state.pickingStudents.add(studentId);
  }
  // 只改这一个格子与「已选 N 人」：整块重画会把指头底下那颗节点换掉，连点会丢
  paintPicking();
}

/** 勾完了：开备注浮层，挑一条就给这几个人一起记上。 */
export function beginBatchLeave() {
  const studentIds = [...(state.pickingStudents ?? [])];
  if (studentIds.length === 0) {
    return;
  }
  state.remarkStudentIds = studentIds;
  state.overlay = 'remark';
  render();
}

/**
 * 备注浮层点「确定」。
 *
 * 浮层上那几位一起记上同一条备注、同一个时刻 —— 一起出去的人本来就该从同一秒起算，
 * 各记一个时刻反而是假数据。浮层要收起来，所以这一笔走整块重画。
 */
export async function confirmLeave(templateId, remark) {
  const studentIds = state.remarkStudentIds;
  state.overlay = null;
  state.remarkStudentIds = [];
  const at = Date.now();
  let next = state.session;
  for (const studentId of studentIds) {
    next = markLeft(next, { id: uid('l'), studentId, at, templateId, remark });
  }
  // 多选这一轮到这儿为止：记完就回看板，勾还留着会让人以为没生效
  state.pickingStudents = null;
  await commitSession(next, true);
  if (studentIds.length > 1) {
    showToast(`已给 ${studentIds.length} 人记离开`);
  }
}

export async function exportClass(klass) {
  const sessions = await store.listSessions(klass.id);
  const bytes = await exportClassWorkbook(klass, sessions);
  download(`${klass.name}-${today()}.xlsx`, bytes);
}

/** 读一个整班文件。同名时交给界面问一句。 */
export async function importClassFile(file, overwrite) {
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

export function render() {
  // 上一帧那些节点索引先清掉：整块重画之后它们指向的是已经拆下来的节点
  resetTileRefs();
  resetOverlayRefs();
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

/** 待机蒙版上点一张卡片：直接记归来。 */
export async function markReturnedFromIdle(studentId) {
  const student = state.klass.students.find((item) => item.id === studentId);
  await commitSession(markReturned(state.session, studentId, Date.now()), true);
  showToast(`${student?.name ?? ''} 已记归来`);
}

/**
 * 有人碰了屏幕。
 *
 * **凡是能表明「人在这儿」的信号都算**：指针按下、指针移动、滚轮、键盘、触摸。
 * 鼠标只是晃了一下也是人在这儿 —— 老师盯着屏幕时手常常在鼠标上。所以指针移动也
 * 会把计时推后，待机蒙版因此只会在真的没人时出现。
 *
 * 切回看板由待机蒙版自己的点击处理（这样点某张卡片能拦住，不冒到蒙版上）。
 */
export function noteActivity() {
  state.lastActivityAt = Date.now();
}

let toastTimer = 0;

export function showToast(message) {
  state.toast = message;
  render();
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    state.toast = '';
    render();
  }, 3600);
}

export function pickFile(accept, handler) {
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
