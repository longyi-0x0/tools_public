/**
 * 启动与主循环。
 *
 * 工具页是静态页，不经打包器，所以这里只挂启动、走秒、待机判定、超时提醒与键盘的
 * 退路；界面在两个视图模块与六块浮层里。
 */

import { PHASE, dueAlerts, isPaused, markNotified } from './domain.js';
import { h, root } from './dom.js';
import { updateDynamic } from './board.js';
import { endPicking } from './classes.js';
import * as sound from './sound.js';
import * as store from './store.js';
import {
  commitSession,
  endPickingStudents,
  loadClass,
  noteActivity,
  refreshClasses,
  render,
  state,
} from './state.js';
import { closeOverlay } from './overlays/index.js';

/** 走秒的间隔。500ms 够计时看上去是连续的，也不费。 */
const TICK_MS = 500;

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
    // 走 commitSession：会话的写只有一条路，`state.running` 与 `state.sessions` 才跟得上
    await commitSession(session);
  } finally {
    alerting = false;
  }
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
  // 多选中也不切：那会儿老师正一个个勾人，屏幕上换成大钟，勾到一半的手就断了
  if (state.pickingStudents !== null) {
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
    closeOverlay();
    return;
  }
  if (state.picking !== null) {
    event.preventDefault();
    endPicking();
    return;
  }
  // 看板上的多选同一个道理：这一下退的是勾，不是这一场自习
  if (state.pickingStudents !== null) {
    event.preventDefault();
    endPickingStudents();
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
