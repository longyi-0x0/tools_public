/**
 * 存档：抽奖、名单、奖品都放在本机浏览器里。
 *
 * 旧存档会在第一次打开时迁移：`lottery.app.v2`（多活动 + 素材库）与
 * `lottery.state.v1`（只有一场活动）都认。
 */

import { createApp, migrate } from './data.js';

const KEY = 'lottery.app.v3';
const LEGACY_KEYS = ['lottery.app.v2', 'lottery.state.v1'];

function readJson(key) {
  try {
    const text = window.localStorage.getItem(key);
    return text === null ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

/** 读存档；没有就新建，有旧存档就迁移一次。 */
export function loadApp() {
  const current = readJson(KEY);
  if (current !== null) {
    return migrate(current);
  }
  for (const key of LEGACY_KEYS) {
    const legacy = readJson(key);
    if (legacy !== null) {
      return migrate(legacy);
    }
  }
  return createApp();
}

let pending = 0;

function write(app) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(app));
  } catch {
    /* 隐私模式或配额满了：页面照跑，只是关掉会丢 */
  }
}

/** 存一份；连写时只在空闲后落一次。 */
export function saveApp(app) {
  window.clearTimeout(pending);
  pending = window.setTimeout(() => write(app), 120);
}

/** 立即写一次（切走页面时用）。 */
export function flushApp(app) {
  window.clearTimeout(pending);
  write(app);
}
