/**
 * 形态共用的一点点东西。
 *
 * 每个形态实现 `begin` / `reveal` / `reset` / `update` / `destroy`。
 * 这里只放结构与行为：揭晓的语义、待机文案、列表行、主按钮、定时器收口。
 * 位置、字号、配色全部由各形态自己的样式表决定 —— 五种形态不共用一套皮。
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

/** 洗牌，不改原数组。 */
export function shuffle(items, random = Math.random) {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const at = Math.floor(Math.min(0.999999, Math.max(0, random())) * (index + 1));
    const swap = copy[index];
    copy[index] = copy[at];
    copy[at] = swap;
  }
  return copy;
}

/** 把 root 挂到宿主上，并把宿主清空。 */
export function mount(host, className) {
  const root = el('div', className);
  host.replaceChildren(root);
  return root;
}

/**
 * 揭晓：奖项 / 名字 / 附注三块。
 *
 * 只长结构，不摆位置 —— 各形态用 `.stage-reveal` 自己决定放在哪、多大。
 * `focus` 决定大字写谁：奖品抽人写人，人抽奖品写奖；写反了会让人以为
 * 又抽了一次。
 */
export function createReveal() {
  const node = el('div', 'stage-reveal');
  const prize = el('div', 'reveal-prize');
  const names = el('div', 'reveal-names');
  const meta = el('div', 'reveal-meta');
  node.append(prize, names, meta);

  return {
    node,
    hide() {
      node.classList.remove('on');
    },
    /**
     * `focus` 决定大字写谁：奖品抽人写人，人抽奖品写奖；写反了会让人以为
     * 又抽了一次。
     *
     * `compact` 只留奖项与附注 —— 名字已经在画面里（墙上的格子、翻开的牌），
     * 再来一行就是重复。
     */
    show({ winners = [], prizeName = '', focus = 'people', compact = false } = {}) {
      prize.textContent = '';
      names.replaceChildren();
      meta.textContent = '';

      if (focus === 'prize') {
        const person = winners[0];
        prize.textContent = [person?.name, person?.dept].filter(Boolean).join(' · ');
        names.append(el('span', 'reveal-name', prizeName || '—'));
        meta.textContent = person?.employeeId ?? '';
      } else {
        prize.textContent = prizeName;
        if (!compact) {
          for (const winner of winners) {
            names.append(el('span', 'reveal-name', winner.name));
          }
        }
        meta.textContent = [...new Set(winners.map((winner) => winner.dept).filter(Boolean))].join(' / ');
      }

      names.dataset.count = String(Math.min(4, Math.max(1, names.childElementCount)));
      node.classList.add('on');
    },
  };
}

/** 列表行：一行一项，点了就选它。长什么样由形态的样式表定。 */
export function createPicker(onPick) {
  const node = el('div', 'picker');
  return {
    node,
    update(items = []) {
      node.replaceChildren();
      for (const item of items) {
        const row = el(
          'button',
          `pick${item.active ? ' on' : ''}${item.done ? ' done' : ''}${item.disabled ? ' off' : ''}`,
        );
        row.type = 'button';
        row.disabled = item.disabled === true;
        row.append(
          el('span', 'pick-label', item.label),
          el('span', 'pick-sub', item.sub ?? ''),
          el('span', 'pick-note', item.note ?? ''),
        );
        row.addEventListener('click', () => onPick(item.id));
        node.append(row);
      }
    },
  };
}

/** 主按钮：字与状态由形态自己给，形状由形态自己画。 */
export function createAction(onClick) {
  const label = el('span', 'action-label');
  const hint = el('span', 'action-hint');
  const node = el('button', 'action');
  node.type = 'button';
  node.append(label, hint);
  node.addEventListener('click', onClick);
  return {
    node,
    set({ text = '', note = '', running = false, disabled = false } = {}) {
      label.textContent = text;
      hint.textContent = note;
      node.classList.toggle('running', running);
      node.disabled = disabled;
    },
  };
}

/** 两个小口子：全屏与退出。位置由形态自己摆。 */
export function createMetaBar(api) {
  const node = el('div', 'meta-bar');
  const full = el('button', 'meta-link', '全屏');
  full.type = 'button';
  full.addEventListener('click', () => api.fullscreen?.());
  const exit = el('button', 'meta-link', '退出');
  exit.type = 'button';
  exit.addEventListener('click', () => api.exit?.());
  node.append(full, exit);
  return node;
}

/** 待机该说什么，五种形态共用一套口径，免得同一件事五种说法。 */
export function idleCopy(info = {}) {
  if (info.allDrawn) {
    return { eyebrow: '抽完了', main: '看结果', note: `共 ${info.handed ?? 0} 人中奖` };
  }
  if (info.mode === 'person-prize') {
    return {
      eyebrow: '请上台',
      main: info.personName || '—',
      note: [info.personDept, `还剩 ${info.prizeCount ?? 0} 个奖项`].filter(Boolean).join(' · '),
    };
  }
  return {
    eyebrow: '下一支',
    main: info.prizeName || '—',
    note: `还剩 ${info.remaining ?? 0} 个名额 · 一次抽 ${info.batch ?? 1} 人`,
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
    /** 只清定时器与动画帧：反复开抽时要在保留观察者的前提下重排动画。 */
    clearTimers() {
      for (const id of timers) {
        window.clearInterval(id);
        window.clearTimeout(id);
      }
      for (const id of frames) {
        window.cancelAnimationFrame(id);
      }
      timers.clear();
      frames.clear();
    },
    clearAll() {
      this.clearTimers();
      for (const observer of observers) {
        observer.disconnect();
      }
      observers.clear();
    },
  };
}

/** canvas 里把一行字缩到给定宽度以内，返回最终字号。 */
export function fitCanvasText(context, text, maxWidth, startSize, weight = 600) {
  let size = Math.max(6, startSize);
  for (;;) {
    context.font = `${weight} ${size}px "Songti SC", "Noto Serif SC", "Source Han Serif SC", serif`;
    if (size <= 6 || context.measureText(text).width <= maxWidth) {
      return size;
    }
    size -= 1;
  }
}
