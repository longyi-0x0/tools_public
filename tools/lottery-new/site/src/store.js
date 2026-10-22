/**
 * 本机存储。
 *
 * 池、抽奖、组与账本一起存。云同步要声明 capabilities 并经壳转发，这里不碰；
 * 拿不到云就一直是本机。存档只有一版在跑，旧版读进来先迁移再覆盖，原文留 `.backup`。
 */

import { createPool } from './domain/pool.js';
import { createDraw } from './domain/draw.js';

const KEY = 'lottery-new:state.v2';
const LEGACY_KEYS = ['lottery-new:state.v1'];
const VERSION = 2;

function emptyState() {
  return { version: VERSION, pools: [], draws: [], groups: [], rounds: [], currentDrawId: null };
}

/**
 * v1 的规则是一张以槽位 key 为键的表，和槽位分两处存；v2 把规则并进槽位。
 * 旧表的 `pickLimit` 是条目级上限，语义接近名额，一律搬成 `quota`：
 * 默认不限，所以绝大多数旧存档行为不变。
 */
function upgradeDraw(draw) {
  if (!draw.rule) return { ...draw, groupId: draw.groupId ?? null };
  const rule = draw.rule;
  const slots = (draw.slots ?? []).map((slot) => {
    const kept = rule[slot.key] ?? {};
    return {
      key: slot.key,
      poolId: slot.poolId,
      quota: kept.pickLimit,
      scope: 'draw',
      count: kept.count,
      replacement: kept.replacement,
      weighted: kept.weighted,
      hitRate: kept.hitRate,
      tags: kept.tags,
    };
  });
  return { ...draw, groupId: draw.groupId ?? null, slots };
}

/** 读进来的每一层都过一遍构造器：Infinity 存成 null，得靠归一还回来。 */
function normalize(raw) {
  return {
    version: VERSION,
    pools: (raw.pools ?? []).map((pool) => createPool(pool)),
    draws: (raw.draws ?? []).map((draw) => createDraw(upgradeDraw(draw))),
    groups: (raw.groups ?? []).map((group) => ({ id: group.id, name: group.name ?? '' })),
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
