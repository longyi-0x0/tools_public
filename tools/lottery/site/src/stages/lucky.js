/**
 * lucky-canvas 的装配层与形态工厂。
 *
 * 大转盘、九宫格、老虎机三种形态都画在同一份库上：lucky-canvas@1.7.27
 * （Apache-2.0，整包放在 site/vendor/，不引外链）。这一层只管「怎么把一台
 * 机器挂到屏上」：建实例、按容器尺寸重建、play / stop、收口。
 *
 * 盘面长什么样、有哪些皮肤，由各形态自己给：
 *   defineLuckyStage({ id, label, kind, skins, build })
 * `build({ labels, weights, w, h, skin })` 返回 lucky-canvas 的 data 配置。
 *
 * 两条不与库争的规矩：
 *   1. 尺寸一律自己量。库内部也会监听 window resize 与 documentElement 属性变化，
 *      但它只 resize 不重绘 —— canvas 被重设尺寸后会白一下，所以这里跟着再建一次。
 *   2. 结果一律引擎给。形态只调 play / stop(index)，不自己掷骰子 ——
 *      lucky-canvas 的 `range` 权重是给「前端随机」用的，本项目不用它。
 */

import { LuckyGrid, LuckyWheel, SlotMachine } from '../../vendor/lucky-canvas.esm.js';
import { MODE } from '../engine.js';
import {
  createAction,
  createAudio,
  createCleanup,
  createMetaBar,
  createReveal,
  el,
  idleCopy,
  mount,
} from './common.js';

const CTORS = { wheel: LuckyWheel, grid: LuckyGrid, slot: SlotMachine };

/** 预览与空池子时的示意盘面：没数据也让形态画得出来。 */
const SAMPLE_LABELS = ['一等奖', '二等奖', '三等奖', '幸运奖', '阳光普照'];

const RESIZE_WAIT = 340;

/**
 * 一台机器：容器 + 一个 lucky-canvas 实例。
 *
 * 实例没有 destroy（库没给），重建靠换 token：旧的回调与观察者随实例一起被丢掉，
 * `mine === token` 之外的异步 init 一律不再生效。
 *
 * 回调挂在 data 上跟着实例走：库认 `start`（点盘面按钮，仅待机时触发）与
 * `end`（停稳后触发）。老虎机没有盘面按钮，`onStart` 传了也不会被叫。
 */
function createMachine(host, kind, build, { onStart, onEnd } = {}) {
  const Ctor = CTORS[kind];
  const cleanup = createCleanup();
  let labels = [];
  let weights = [];
  let instance = null;
  let token = 0;
  let spinning = false;
  let resizeTimer = 0;

  /** 库会把容器的宽高写成固定像素，量之前先把它自己写的那一份清掉。 */
  function unpin() {
    host.style.width = '';
    host.style.height = '';
  }

  function size() {
    return { w: host.clientWidth, h: host.clientHeight };
  }

  async function rebuild() {
    const mine = token + 1;
    token = mine;
    unpin();
    const box = size();
    if (box.w < 8 || box.h < 8) {
      return; // 还没布局出来，量到 0 会画出一块 300×150 的默认 canvas
    }
    host.replaceChildren();
    const data = build({ labels, weights, w: box.w, h: box.h });
    // 回调是这台机器的：每次重建都要重新挂上，旧实例的回调随旧实例一起作废
    if (onStart !== undefined) {
      data.start = onStart;
    }
    if (onEnd !== undefined) {
      data.end = onEnd;
    }
    const next = new Ctor(host, data);
    instance = next;
    spinning = false;
    await next.init();
    if (mine !== token) {
      return; // 已经被更新的那次重建取代
    }
  }

  /** 库内部 resize 会清掉画面：先照原尺寸补画一次，再按新尺寸重建。 */
  function onResize() {
    if (instance !== null) {
      try {
        unpin();
        instance.resize();
        instance.draw();
      } catch (error) {
        // 画不出来就等重建，形态不该因为一次尺寸抖动而报错
      }
    }
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (!spinning) {
        rebuild();
      }
    }, RESIZE_WAIT);
  }

  // 观察外层：board 自己的宽高会被库写成固定像素，量它永远量不到变化
  const observer = new ResizeObserver(onResize);
  observer.observe(host.parentElement ?? host);
  cleanup.observe(observer);
  // 库还监听了 documentElement 的属性变化（切主题会走到），同样要补一次
  const docObserver = new MutationObserver(onResize);
  docObserver.observe(document.documentElement, { attributes: true });
  cleanup.observe(docObserver);

  return {
    set(nextLabels, nextWeights) {
      labels = nextLabels;
      weights = nextWeights;
    },
    labels() {
      return labels;
    },
    rebuild,
    play() {
      spinning = true;
      instance?.play();
    },
    stop(index) {
      instance?.stop(index);
    },
    settled() {
      spinning = false;
    },
    destroy() {
      cleanup.clearAll();
      window.clearTimeout(resizeTimer);
      token += 1;
      instance = null;
      host.replaceChildren();
    },
  };
}

/**
 * 把一种 lucky-canvas 玩法包装成形态。
 *
 * 三种形态的外壳是一个模子：顶栏活动名与当前对象、中间整块画布、底栏状态 +
 * 揭晓。开抽的按钮不放底栏，放在机器自己身上：
 *
 * - 转盘 / 九宫格：盘面中央按钮就是开关（库的 start 回调，仅待机时生效）；
 *   转起来之后点盘面任意处停下（库在转动中不理会盘面点击，由外壳接住）。
 * - 老虎机：库没有盘面按钮，按钮贴在机身下方（`lucky-trigger`）。
 *
 * 区别只在 `kind`、`skins` 与 `build`，所以外壳在这里写一遍。
 */
export function defineLuckyStage({ id, label, kind, skins = [], build, styles, hint = '' }) {
  return {
    id,
    label,
    mode: MODE.PERSON,
    styles,
    config: [
      {
        key: 'skin',
        label: '样式',
        type: 'select',
        value: skins[0]?.id ?? 'default',
        options: skins.map((skin) => ({ value: skin.id, label: skin.label })),
      },
      { key: 'duration', label: '转多久（秒）', type: 'range', min: 2, max: 8, step: 0.5, value: 4 },
      { key: 'sound', label: '音效', type: 'switch', value: true },
    ],

    create(host, config = {}, api = {}) {
      const skin = skins.find((item) => item.id === config.skin) ?? skins[0] ?? { id: 'default' };
      const seconds = Math.max(1, Number(config.duration) || 4);
      const audio = createAudio(config.sound !== false);
      const cleanup = createCleanup();
      const root = mount(host, `stage-${id}`);
      root.dataset.skin = skin.id;
      // 老虎机没有盘面按钮，开关贴在机身上；转盘与九宫格点盘面中央的按钮
      const trigger = kind === 'slot' ? 'button' : 'canvas';

      const head = el('header', 'lucky-head');
      const title = el('div', 'lucky-title');
      const sub = el('div', 'lucky-sub');
      head.append(title, sub);

      const body = el('div', 'lucky-body');
      const board = el('div', 'lucky-board');
      const note = el('div', 'lucky-note', hint);
      body.append(board);
      if (hint !== '') {
        body.append(note);
      }

      const action = createAction(() => api.toggle?.());
      if (trigger === 'button') {
        const holder = el('div', 'lucky-trigger');
        holder.append(action.node);
        body.append(holder);
      }

      const foot = el('footer', 'lucky-foot');
      const status = el('div', 'lucky-status');
      const reveal = createReveal();
      foot.append(status, reveal.node);

      root.append(head, body, foot, createMetaBar(api));

      let labels = SAMPLE_LABELS.slice();
      let pending = null;
      let autoTimer = 0;
      let ticker = 0;
      // 引擎视角的转动中：停下的请求已经发出、机器还在减速的那一段也算
      let engineSpinning = false;

      const machine = createMachine(
        board,
        kind,
        (box) => build({ ...box, skin, labels: box.labels.length > 0 ? box.labels : SAMPLE_LABELS }),
        {
          onStart:
            trigger === 'canvas'
              ? () => {
                  api.toggle?.();
                }
              : undefined,
          onEnd: () => {
            machine.settled();
            window.clearInterval(ticker);
            if (pending !== null) {
              audio.lock();
              reveal.show(pending);
              audio.win();
              pending = null;
            }
          },
        },
      );

      // 转动中点盘面任意处停：用捕获阶段抢在 canvas 之前，待机时不动，
      // 免得和盘面中央的「抽奖」按钮各触发一次
      function onBoardClick(event) {
        if (!engineSpinning) {
          return;
        }
        event.stopPropagation();
        api.toggle?.();
      }
      board.addEventListener('click', onBoardClick, true);

      /** 池子变了就按新池子重画盘面；转着与揭晓后都不动它。 */
      function reload(pool, weights = []) {
        const list = pool.filter((name) => String(name).trim() !== '');
        if (list.length === 0) {
          return;
        }
        if (list.join('|') === machine.labels().join('|')) {
          return;
        }
        machine.set(list, weights);
        machine.rebuild();
      }

      function clearAuto() {
        window.clearTimeout(autoTimer);
        window.clearInterval(ticker);
      }

      function begin({ labels: pool = [], weights = [] } = {}) {
        clearAuto();
        reveal.hide();
        status.classList.remove('hide');
        root.classList.remove('settled');

        labels = pool.filter((name) => String(name).trim() !== '');
        machine.set(labels, weights);
        machine.rebuild();
        machine.play();
        ticker = window.setInterval(() => audio.tick(), 150);

        // 「转多久」是整段时长：扣掉库自己的减速时间，剩下的才是匀速转的时间
        const decel = Number(skin.decelerationTime ?? 2200);
        const hold = Math.max(600, seconds * 1000 - decel);
        autoTimer = window.setTimeout(() => api.toggle?.(), hold);
      }

      function revealWinners({ winners = [], prizeName = '' } = {}) {
        clearAuto();
        const at = Math.max(0, labels.indexOf(prizeName));
        pending = { winners, prizeName, focus: 'prize' };
        machine.stop(kind === 'slot' ? [at, at, at] : at);
        // 揭晓等机器停下（end 回调）再出，免得指针还在转就把名字亮出来
      }

      function reset() {
        clearAuto();
        pending = null;
        root.classList.remove('settled');
        reveal.hide();
        status.classList.remove('hide');
        machine.rebuild();
      }

      function update(next) {
        engineSpinning = next.spinning === true;
        board.classList.toggle('spinning', engineSpinning);
        title.textContent = next.title;
        // 揭晓后引擎已经推进到下一个人，顶栏再写就与底栏的中奖人并列了
        sub.textContent =
          next.revealed || next.personName === '' ? '' : `上台 · ${next.personName}`;

        const copy = idleCopy({
          mode: next.mode,
          allDrawn: next.allDrawn,
          handed: next.handed,
          prizeName: next.prizeName,
          remaining: next.prizeRemaining,
          batch: next.batch,
          personName: next.personName,
          personDept: next.personDept,
          prizeCount: next.prizeCount,
        });
        status.replaceChildren(
          el('span', 'status-eyebrow', copy.eyebrow),
          el('span', 'status-main', copy.main),
          el('span', 'status-note', copy.note),
        );

        // 机身按钮只有老虎机用；盘面按钮的字画在 canvas 里，不在这里更新
        if (trigger === 'button') {
          action.set({
            text: next.spinning ? '停' : next.allDrawn ? '看结果' : '抽一个奖',
            note: next.spinning
              ? '再按一次'
              : next.allDrawn
                ? `${next.handed} 人已中奖`
                : `${next.prizeCount} 个奖项在池`,
            running: next.spinning,
            disabled: !next.spinning && !next.allDrawn && !next.canDraw,
          });
        }

        if (!next.spinning && !next.revealed) {
          root.classList.remove('settled');
          reload(next.labels, next.weights);
        }
      }

      // 主页预览没有 api，也走这一套：先给一份示意盘面
      machine.set(labels, []);
      machine.rebuild();

      return {
        begin,
        reveal: revealWinners,
        reset,
        update,
        destroy() {
          clearAuto();
          board.removeEventListener('click', onBoardClick, true);
          cleanup.clearAll();
          machine.destroy();
          host.replaceChildren();
        },
      };
    },
  };
}

export { SAMPLE_LABELS };
