/**
 * 亮暗。
 *
 * 两块面（教室前面那块屏、老师坐下来看的那几层）各有两个值，一起换。一次自习多半打在
 * 投影上，所以暗是默认那一档；白天在笔记本上备课，按顶栏那颗换成亮。
 *
 * 挑过就记住。**没挑过时只跟着系统的 `prefers-color-scheme` 走一次，之后不跟着它变** ——
 * 教室前面那块屏在课中间忽然翻成亮色，比一开始就选错更糟。要换就按那颗钮。
 *
 * 值写在 `<html>` 的 `data-mode` 上，样式里只有两处分支。首屏那一遍在 index.html 里先
 * 跑过（等这个模块加载完再上色，会闪一下白底）。
 */

const KEY = 'study-hall:mode';

/** 存过的那一档；没挑过是 null。 */
function stored() {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

/** 系统那一档。读不到就当暗 —— 这块屏的主场是教室投影。 */
function fromSystem() {
  try {
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** 现在这一档：`<html>` 上已经写着就用它，没写就按存过的、再按系统的。 */
export function currentMode() {
  const on = document.documentElement.dataset.mode;
  if (on === 'light' || on === 'dark') {
    return on;
  }
  return stored() ?? fromSystem();
}

/** 换一档，并存下来。返回换到的那一档。 */
export function toggleMode() {
  const next = currentMode() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.mode = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* 存不了就只作用这一次 */
  }
  return next;
}
