/**
 * 活动状态存在本机浏览器里：刷新、关掉再开都还在。
 *
 * 只存一份当前活动。读回来时补上缺的字段，旧版本存下的东西不至于把页面卡住。
 */

import { MODE, STAGE, createState } from './engine.js';

const KEY = 'lottery.state.v1';

function shape(raw) {
  if (raw === null || typeof raw !== 'object') {
    return createState();
  }
  const state = createState();
  return {
    ...state,
    title: typeof raw.title === 'string' ? raw.title : '',
    mode: raw.mode === MODE.PERSON ? MODE.PERSON : MODE.PRIZE,
    stage: Object.values(STAGE).includes(raw.stage) ? raw.stage : STAGE.LIST,
    uniqueWinner: raw.uniqueWinner !== false,
    prizes: Array.isArray(raw.prizes) ? raw.prizes.filter((item) => item && item.id) : [],
    people: Array.isArray(raw.people) ? raw.people.filter((item) => item && item.id) : [],
    results: Array.isArray(raw.results) ? raw.results.filter((item) => item && Array.isArray(item.winners)) : [],
  };
}

/** 读上一次的活动；没有就新建。 */
export function loadState() {
  try {
    const stored = window.localStorage.getItem(KEY);
    return stored === null ? createState() : shape(JSON.parse(stored));
  } catch {
    return createState();
  }
}

let pending = 0;

/** 存一份；连写时只在空闲后落一次。 */
export function saveState(state) {
  window.clearTimeout(pending);
  pending = window.setTimeout(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* 隐私模式或配额满了：页面照跑，只是关掉会丢 */
    }
  }, 120);
}

/** 立即写一次（切走页面时用）。 */
export function flushState(state) {
  window.clearTimeout(pending);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 同上 */
  }
}
