/**
 * 形态共用的一点点东西。
 *
 * 每个形态只需要实现四个方法：`begin` / `reveal` / `reset` / `destroy`。
 * 揭晓牌、随机取名字、清理定时器这些每张形态都要做的事放在这里，
 * 新加形态时不必再抄一遍。
 */

import { el } from '../dom.js';

export { el };

/** 从候选名字里随机取若干个，不重复；不够时循环补齐。 */
export function sampleLabels(labels, count, random = Math.random) {
  if (labels.length === 0) {
    return [];
  }
  const pool = labels.slice();
  const picked = [];
  while (picked.length < count) {
    if (pool.length === 0) {
      pool.push(...labels);
    }
    const at = Math.floor(Math.min(0.999999, Math.max(0, random())) * pool.length);
    picked.push(pool.splice(at, 1)[0]);
  }
  return picked;
}

/** 把 root 挂到宿主上，并把宿主清空。 */
export function mount(host, className) {
  const root = el('div', className);
  host.replaceChildren(root);
  return root;
}

/**
 * 揭晓牌：形态只负责动，结果一律由这块牌子给。
 *
 * `show({ winners, prizeName, meta })`；`winners` 是 `{ name, dept }` 的数组。
 */
export function createPlate() {
  const node = el('div', 'stage-plate');
  return {
    node,
    hide() {
      node.classList.remove('on');
      node.replaceChildren();
    },
    show({ winners = [], prizeName = '', meta = '' } = {}) {
      node.replaceChildren();
      if (prizeName) {
        node.append(el('div', 'stage-plate-prize', prizeName));
      }
      const names = el('div', 'stage-winners');
      for (const winner of winners) {
        names.append(el('span', 'stage-winner', winner.name));
      }
      node.append(names);
      if (meta) {
        node.append(el('div', 'stage-plate-meta', meta));
      }
      node.classList.add('on');
    },
  };
}

/**
 * 登记需要清理的东西：定时器、动画帧、观察者。
 *
 * 形态忘了清会一直在后台跑，尤其是 canvas 那几种；用一个 `clearAll()` 收口。
 */
export function createCleanup() {
  const timers = new Set();
  const frames = new Set();
  const observers = new Set();

  return {
    interval(fn, ms) {
      const id = window.setInterval(fn, ms);
      timers.add(id);
      return id;
    },
    timeout(fn, ms) {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
      return id;
    },
    frame(fn) {
      const id = window.requestAnimationFrame((time) => {
        frames.delete(id);
        fn(time);
      });
      frames.add(id);
      return id;
    },
    cancelFrame(id) {
      window.cancelAnimationFrame(id);
      frames.delete(id);
    },
    observe(observer) {
      observers.add(observer);
      return observer;
    },
    clearAll() {
      for (const id of timers) {
        window.clearInterval(id);
        window.clearTimeout(id);
      }
      for (const id of frames) {
        window.cancelAnimationFrame(id);
      }
      for (const observer of observers) {
        observer.disconnect();
      }
      timers.clear();
      frames.clear();
      observers.clear();
    },
  };
}
