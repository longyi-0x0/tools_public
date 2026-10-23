/**
 * 本机存储。
 *
 * 清单、环节、活动与账本一起存。云同步要声明 capabilities 并经壳转发，这里不碰；
 * 拿不到云就一直是本机。存档只有一版在跑，旧版读进来先迁移再覆盖，原文留 `.backup`。
 *
 * v3 比 v2 多的都是「让界面能说人话」的字段：出奖位的名字、环节的次序与封箱、
 * 清单的用处、活动的日期。抽签相关的东西一个没动。
 */

import { createPool, guessKind } from './domain/pool.js';
import { createDraw } from './domain/draw.js';
import { createGroup } from './domain/group.js';

const KEY = 'lottery3:state.v3';
const LEGACY_KEYS = ['lottery3:state.v2', 'lottery3:state.v1'];
const VERSION = 3;

function emptyState() {
  return { version: VERSION, pools: [], draws: [], groups: [], rounds: [], currentDrawId: null };
}

/** 老环节补新字段：出奖位名字留空（界面按次序兜底），次序留空（按数组位置）。 */
function upgradeDraw(draw) {
  return {
    ...draw,
    groupId: draw.groupId ?? null,
    order: Number.isFinite(draw.order) ? draw.order : null,
    closed: draw.closed === true,
    slots: (draw.slots ?? []).map((slot) => ({
      ...slot,
      label: String(slot.label ?? '').trim(),
      manual: slot.manual === true,
    })),
  };
}

/** 读进来的每一层都过一遍构造器：Infinity 存成 null，得靠归一还回来。 */
function normalize(raw) {
  return {
    version: VERSION,
    pools: (raw.pools ?? []).map((pool) => createPool({
      ...pool,
      kind: pool.kind ?? guessKind(pool.name ?? ''),
    })),
    draws: (raw.draws ?? []).map((draw) => createDraw(upgradeDraw(draw))),
    groups: (raw.groups ?? []).map((group) => createGroup(group)),
    rounds: raw.rounds ?? [],
    currentDrawId: raw.currentDrawId ?? null,
  };
}

function load() {
  try {
    const key = [KEY, ...LEGACY_KEYS].find((candidate) => localStorage.getItem(candidate));
    if (!key) return emptyState();
    const text = localStorage.getItem(key);
    const parsed = JSON.parse(text);
    if (key !== KEY) {
      localStorage.setItem(`${key}.backup`, text);
      localStorage.removeItem(key);
    }
    return normalize(parsed);
  } catch (error) {
    return emptyState();
  }
}

export function createStore() {
  let state = load();
  const listeners = new Set();

  function emit() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (error) {
      // 写不进去不影响这一轮的使用，下次打开会回到上次存下的样子。
    }
    for (const listener of listeners) listener(state);
  }

  return {
    get state() {
      return state;
    },
    update(mutate) {
      state = mutate(state) ?? state;
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
