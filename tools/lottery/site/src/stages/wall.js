/**
 * 名单墙：给班级、学校这类场合用。亮底、墨字、朱红只在中奖那一格出现。
 *
 * 一屏就是全部：顶部是场次名与奖项，中间是整面名字，底部左边说状态、右边是
 * 唯一的按钮。没有侧栏，也不跟其他形态共用外壳。
 *
 * 逻辑：墙上每一格都是一个候选人；停下时中奖的名字落进"正在跳"的那几格，
 * 不会出现墙上写 A、结果说 B。
 */

import { MODE } from '../engine.js';
import {
  createAction,
  createCleanup,
  createPicker,
  createReveal,
  el,
  idleCopy,
  mount,
  shuffle,
} from './common.js';

const ROWS = 12;
const MAX_CELLS = 240;

export default {
  id: 'list',
  label: '名单墙',
  mode: MODE.PRIZE,
  styles: new URL('./wall.css', import.meta.url).href,
  config: [
    { key: 'rows', label: '行数', type: 'range', min: 6, max: 20, step: 1, value: ROWS },
    { key: 'speed', label: '跳动速度', type: 'range', min: 0.6, max: 2.4, step: 0.2, value: 1 },
    { key: 'batch', label: '每次抽几人', type: 'range', min: 1, max: 10, step: 1, value: 1 },
  ],

  create(host, config = {}, api = {}) {
    const rows = config.rows ?? ROWS;
    const speed = config.speed ?? 1;
    const root = mount(host, 'stage-wall');

    const head = el('header', 'wall-head');
    const title = el('div', 'wall-title');
    const picker = createPicker((id) => api.pickPrize?.(id));
    head.append(title, picker.node);

    const body = el('div', 'wall-body');
    const board = el('div', 'wall-board');
    body.append(board);

    const foot = el('footer', 'wall-foot');
    const status = el('div', 'wall-status');
    const reveal = createReveal();
    const action = createAction(() => api.toggle?.());
    foot.append(status, reveal.node, action.node);

    root.append(head, body, foot);

    const cleanup = createCleanup();
    let cells = [];
    let hot = new Set();
    let names = [];
    let ticking = false;
    let timer = 0;
    let builtKey = '';
    let buildToken = 0;
    let settledWinners = [];

    /* ---------- 墙 ---------- */

    function build(pool) {
      /*
       * 只信宿主与页头页脚：形态样式表还没到时，board 会退回块级排版（高度
       * 被内容撑到几千像素），拿它量出来的列数会一路错到底。
       */
      const hostRect = host.getBoundingClientRect();
      const headRect = head.getBoundingClientRect();
      const footRect = foot.getBoundingClientRect();
      const width = Math.max(160, hostRect.width * (1 - 0.068));
      const height = Math.max(
        120,
        hostRect.height - headRect.height - footRect.height - hostRect.height * 0.044,
      );
      builtKey = `${Math.round(width)}x${Math.round(height)}`;

      const cellHeight = height / rows;
      const font = Math.max(10, Math.min(cellHeight * 0.44, height * 0.05));
      const perName = font * 3.6 + font * 0.9;
      const columns = Math.max(3, Math.min(16, Math.floor(width / perName)));
      const rowCount = Math.max(rows, Math.ceil(Math.min(MAX_CELLS, rows * columns) / columns));
      const total = Math.min(MAX_CELLS, rowCount * columns);

      board.style.setProperty('--cols', String(columns));
      board.style.setProperty('--rows', String(Math.ceil(total / columns)));

      const source = pool.length > 0 ? pool : ['—'];
      board.replaceChildren();
      cells = [];
      // 逐行重洗：池子比格子少时，不然名字会排成一条斜线
      for (let row = 0; row < rowCount; row += 1) {
        const order = shuffle(source);
        for (let column = 0; column < columns; column += 1) {
          const cell = el('div', 'wall-cell', order[Math.floor(Math.random() * order.length)]);
          board.append(cell);
          cells.push(cell);
        }
      }
      hot = new Set();
      if (settledWinners.length > 0) {
        markWinners(settledWinners);
      }
    }

    /** 首帧常常还没有样式，下一帧再量一次。 */
    function scheduleBuild(pool) {
      const token = (buildToken += 1);
      const rebuild = () => {
        if (token === buildToken) {
          build(pool);
        }
      };
      build(pool);
      // 样式表可能晚一到两帧才落地，补量两次
      cleanup.frame(rebuild);
      cleanup.timeout(rebuild, 320);
    }

    function tick() {
      for (const cell of hot) {
        cell.classList.remove('hot');
      }
      hot = new Set();
      const count = Math.max(2, Math.round(cells.length * 0.05));
      for (let index = 0; index < count; index += 1) {
        const cell = cells[Math.floor(Math.random() * cells.length)];
        if (cell === undefined) {
          continue;
        }
        cell.classList.add('hot');
        hot.add(cell);
      }
    }

    function stopTick() {
      if (ticking) {
        window.clearInterval(timer);
        ticking = false;
      }
      for (const cell of hot) {
        cell.classList.remove('hot');
      }
      hot = new Set();
    }

    function markWinners(winners, seed) {
      const landing = [...(seed ?? [])];
      hot = new Set();
      for (const cell of cells) {
        if (landing.length >= winners.length) {
          break;
        }
        if (!landing.includes(cell)) {
          landing.push(cell);
        }
      }
      winners.forEach((winner, index) => {
        const cell = landing[index];
        if (cell === undefined) {
          return;
        }
        cell.classList.remove('hot');
        cell.classList.add('won');
        cell.textContent = winner.name;
      });
    }

    /* ---------- 形态接口 ---------- */

    function begin({ labels = [] } = {}) {
      cleanup.clearTimers();
      stopTick();
      root.classList.remove('settled');
      status.classList.remove('hide');
      reveal.hide();

      names = labels.filter((label) => String(label).trim() !== '');
      scheduleBuild(names);

      ticking = true;
      timer = cleanup.interval(tick, Math.round(90 / speed));
      tick();
    }

    function revealWinners({ winners = [], prizeName = '' } = {}) {
      const seed = [...hot];
      stopTick();
      settledWinners = winners;
      markWinners(winners, seed);
      root.classList.add('settled');
      status.classList.add('hide');
      reveal.show({ winners, prizeName, focus: 'people' });
    }

    function reset() {
      cleanup.clearTimers();
      stopTick();
      root.classList.remove('settled');
      reveal.hide();
      status.classList.remove('hide');
      settledWinners = [];
      scheduleBuild(names);
    }

    function update(next) {
      title.textContent = next.title;

      if (next.mode === MODE.PRIZE) {
        picker.update(
          next.prizes.map((prize) => ({
            id: prize.id,
            label: prize.name,
            sub: `${prize.drawn}/${prize.count}`,
            note: prize.remaining > 0 ? `剩 ${prize.remaining}` : '已抽完',
            active: prize.active,
            done: prize.remaining === 0,
          })),
        );
      }

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

      action.set({
        text: next.spinning ? '停' : next.allDrawn ? '看结果' : `抽 ${next.batch} 人`,
        note: next.spinning ? '再按一次' : next.allDrawn ? `${next.handed} 人已中奖` : `${next.peopleLeft} 人在池`,
        running: next.spinning,
        disabled: !next.spinning && !next.allDrawn && !next.canDraw,
      });

      // 待机与撤销后把墙收回当前池；抽奖中、揭晓后都不动它
      if (!next.spinning && !next.revealed) {
        const pool = next.labels.filter((label) => String(label).trim() !== '');
        if (pool.join('|') !== names.join('|')) {
          names = pool;
          scheduleBuild(names);
        }
        root.classList.remove('settled');
        settledWinners = [];
        status.classList.remove('hide');
        reveal.hide();
      }
    }

    cleanup.observe(
      new ResizeObserver(() => {
        const hostRect = host.getBoundingClientRect();
        const key = `${Math.round(hostRect.width)}x${Math.round(hostRect.height)}`;
        if (key === builtKey) {
          return;
        }
        build(names);
      }),
    );

    return {
      begin,
      reveal: revealWinners,
      reset,
      update,
      destroy() {
        cleanup.clearAll();
        stopTick();
        host.replaceChildren();
      },
    };
  },
};
