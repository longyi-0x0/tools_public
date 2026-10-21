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
     * 一行小字写「这一抽的锚」（先定的那个奖项 / 上台的那个人），
     * 大字写抽出来的那些。谁是谁全由数据决定，形态不猜玩法。
     *
     * `compact` 只留锚与附注 —— 名字已经在画面里（墙上的格子、翻开的牌），
     * 再来一行就是重复。
     */
    show({ winners = [], anchorName = '', compact = false } = {}) {
      prize.textContent = '';
      names.replaceChildren();
      meta.textContent = '';

      prize.textContent = anchorName;
      prize.hidden = anchorName === '';
      if (!compact) {
        for (const winner of winners) {
          names.append(el('span', 'reveal-name', winner.name));
        }
      }
      const depts = [...new Set(winners.map((winner) => winner.dept).filter(Boolean))];
      // 多人同部门时写部门，多人跨部门时写人数 —— 并排列两个部门会被读成
      // 「这些人都属于这两个部门」，反而说不清
      meta.textContent =
        winners.length > 1 && depts.length > 1 ? `${winners.length} 人` : depts.join(' / ');

      names.dataset.count = String(Math.min(4, Math.max(1, names.childElementCount)));
      node.classList.add('on');
    },
  };
}

/**
 * 侧栏：一个标题 + 一列可点的项，点了就选它。
 *
 * 只长结构，不摆位置 —— 长什么样、在左在右还是在底下，由各形态的样式表定。
 * 给的是主持人先定的那个槽（先选奖项 / 先指定上台的人）。
 */
export function createPicker(onPick) {
  const node = el('div', 'picker');
  const title = el('p', 'picker-title');
  const list = el('div', 'picker-list');
  node.append(title, list);

  return {
    node,
    update(items = [], label = '') {
      title.textContent = label;
      title.hidden = label === '';
      list.replaceChildren();
      for (const item of items) {
        const row = el(
          'button',
          `pick${item.active ? ' on' : ''}${item.done ? ' done' : ''}${item.disabled ? ' off' : ''}`,
        );
        row.type = 'button';
        row.disabled = item.disabled === true;
        row.append(
          el('span', 'pick-label', item.label ?? item.name ?? ''),
          el('span', 'pick-sub', item.sub ?? ''),
          el('span', 'pick-note', item.note ?? ''),
        );
        row.addEventListener('click', () => onPick(item.id));
        list.append(row);
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

/**
 * 待机该说什么，各形态共用一套口径，免得同一件事五种说法。
 *
 * 只说锚槽现在指着谁，附注由外壳拼好（部门、还剩几个名额、一次抽几个）。
 * 槽的 label 是抽法给的，形态不认识「人」「奖」这些词。
 */
export function idleCopy(info = {}) {
  if (info.allDrawn) {
    return { eyebrow: '抽完了', main: '看结果', note: `共 ${info.handed ?? 0} 个` };
  }
  return {
    eyebrow: info.anchorLabel || '',
    main: info.anchorName || '—',
    note: info.anchorNote || '',
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

/**
 * 四节拍进度：把「转多久」映射成「走了多少」。
 *
 * 前 12% 蓄势（只走 6%），中间飞转，最后 30% 的时间只走 20% 的路 ——
 * 于是越接近终点间隔越长，形成「咔…咔…咔…」的悬念。终点严格等于 1。
 */
export function spinProgress(t) {
  if (t < 0.12) {
    const u = t / 0.12;
    return 0.06 * u * u;
  }
  if (t < 0.7) {
    const u = (t - 0.12) / 0.58;
    return 0.06 + 0.74 * u;
  }
  const u = (t - 0.7) / 0.3;
  return 0.8 + 0.2 * (1 - Math.pow(1 - u, 3));
}

/** 瞬时速度（步/秒）：把瞬时进度换算成翻页该用多长，越接近终点翻得越慢。 */
export function spinSpeed(t, totalSteps, totalMs) {
  const h = 1e-4;
  const a = spinProgress(Math.max(0, t - h));
  const b = spinProgress(Math.min(1, t + h));
  return ((b - a) / (2 * h)) * totalSteps / (totalMs / 1000);
}

/**
 * 音效：翻页滴答 / 锁定咔哒 / 中奖金色和弦。
 *
 * 全部现场合成，不引外部资源；没有音频设备或没被允许出声时一律静默，
 * 不向形态抛错 —— 声音只是气氛，抽不出奖才是问题。
 */
export function createAudio(enabled = true) {
  let ctx = null;
  let on = enabled === true;

  function tone(freq, dur, gain, type) {
    if (!on) {
      return;
    }
    try {
      if (ctx === null) {
        const Ctor = window.AudioContext ?? window.webkitAudioContext;
        if (Ctor === undefined) {
          on = false;
          return;
        }
        ctx = new Ctor();
      }
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      amp.gain.setValueAtTime(0, ctx.currentTime);
      amp.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.008);
      amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(amp).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur + 0.02);
    } catch (error) {
      on = false;
    }
  }

  return {
    tick() {
      tone(1180 + Math.random() * 160, 0.05, 0.04, 'square');
    },
    lock() {
      tone(320, 0.09, 0.08, 'triangle');
      tone(160, 0.13, 0.05, 'sine');
    },
    win() {
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, index) => {
        window.setTimeout(() => tone(freq, 0.5, 0.06, 'triangle'), index * 85);
      });
    },
    set(next) {
      on = next === true;
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
