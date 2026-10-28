/**
 * 存档：抽奖与池都放在本机浏览器里。
 *
 * 旧存档会在第一次打开时迁移并立刻写成 v5：`lottery.app.v4`（池 + 抽奖）、
 * `lottery.app.v3`（多活动 + 名单/奖品素材）、`lottery.app.v2`、
 * `lottery.state.v1`（只有一场活动）都认。
 *
 * 旧键的原文在转换后另存一份到 `<旧键>.backup` 再删原键 —— 迁移函数只看一遍
 * 旧数据是不够的，出问题时得有一条退路。
 */

import { createApp, migrate } from './data.js';

const KEY = 'lottery.app.v5';
const LEGACY_KEYS = ['lottery.app.v4', 'lottery.app.v3', 'lottery.app.v2', 'lottery.state.v1'];
const BACKUP_SUFFIX = '.backup';

function readRaw(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readJson(key) {
  const text = readRaw(key);
  if (text === null) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function write(app) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(app));
  } catch {
    /* 隐私模式或配额满了：页面照跑，只是关掉会丢 */
  }
}

/** 迁移成功后把旧存档原文留一份，再把原键删掉。 */
function retire(key) {
  try {
    const text = readRaw(key);
    if (text !== null && readRaw(key + BACKUP_SUFFIX) === null) {
      window.localStorage.setItem(key + BACKUP_SUFFIX, text);
    }
    window.localStorage.removeItem(key);
  } catch {
    /* 存不下备份就只删原键，迁移结果已经写进 v4 了 */
  }
}

/** 读存档；没有就新建，有旧存档就迁移一次并落盘。 */
export function loadApp() {
  const current = readJson(KEY);
  if (current !== null) {
    return migrate(current);
  }
  for (const key of LEGACY_KEYS) {
    const legacy = readJson(key);
    if (legacy === null) {
      continue;
    }
    const app = migrate(legacy);
    write(app);
    retire(key);
    return app;
  }
  return createApp();
}

let pending = 0;

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
