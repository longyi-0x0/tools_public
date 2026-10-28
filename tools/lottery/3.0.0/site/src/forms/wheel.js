/**
 * 大转盘：一个池一个盘。
 *
 * 两件事分开：mapPlan 是纯函数，把已定的结果算成「停在第几格」，单测覆盖；
 * mount 才碰 canvas，只负责转与停，不产生任何结果。
 *
 * 盘面自己画，没走通用组件库——库里把文字沿半径转，下半圈的名字整个倒过来，
 * 投影上看不清。这里的名字一律水平直立，按扇区能塞下的宽度自动缩字号、截断。
 *
 * 一次转盘只能停一格，所以规则要抽几个就转几次；多个盘时按 mode 决定
 * 同时转还是依次转。
 */

const PALETTE = ['#f4efe6', '#e3dccf'];
const RING = '#1b1d24';
const BUTTON = '#c8543f';
const INK = '#25262c';
const ON_BUTTON = '#fff5ee';
const FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", sans-serif';

export function mapPlan(round, view) {
  const boards = (round.slots ?? []).map((slot) => {
    const entries = view[slot.key]?.entries ?? [];
    const hitIds = round.win ? (view[slot.key]?.hitIds ?? []) : [];
    return {
      slotKey: slot.key,
      poolId: slot.poolId,
      entries,
      spins: hitIds.map((id) => entries.findIndex((entry) => entry.id === id)).filter((i) => i >= 0),
    };
  });
  return {
    type: 'wheel',
    win: round.win,
    sequential: round.mode === 'a-then-b' || round.mode === 'b-then-a',
    boards,
  };
}

export async function mount(root, plan, options = {}) {
  const size = options.size ?? 420;
  const items = plan.boards
    .filter((board) => board.entries.length > 0)
    .map((board) => createBoard(root, board, size));

  return {
    async run(onBoardDone) {
      const runOne = async (item) => {
        for (const index of item.board.spins) {
          await item.wheel.spinTo(index, options.spinMs ?? 1500);
          await options.onStop?.(item.board, index);
        }
        await onBoardDone?.(item.board);
      };
      if (plan.sequential) {
        for (const item of items) await runOne(item);
      } else {
        await Promise.all(items.map(runOne));
      }
    },
    dispose() {
      for (const item of items) {
        item.wheel.dispose();
        item.holder.remove();
      }
    },
  };
}

function createBoard(root, board, size) {
  const holder = document.createElement('div');
  holder.className = 'board';
  if (board.title) {
    const label = document.createElement('div');
    label.className = 'board-label';
    label.textContent = board.title;
    holder.append(label);
  }

  const box = document.createElement('div');
  box.className = 'board-canvas';
  holder.append(box);
  root.append(holder);

  const wheel = createWheel(box, { entries: board.entries, size });
  return { board, holder, wheel };
}

/**
 * 一块盘。对外只有 spinTo 与 dispose，角度是内部状态。
 *
 * 角度约定：0 表示第 1 格正对顶部指针。指针固定在 12 点方向，格子顺时针排。
 */
function createWheel(host, { entries, size }) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  host.append(canvas);

  const ctx = canvas.getContext('2d');
  const count = entries.length;
  const step = (Math.PI * 2) / count;
  const labels = entries.map((entry) => entry.label || entry.id);
  const state = { angle: 0, frame: 0 };

  paint();

  function paint() {
    const radius = size / 2;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    // 底盘
    ctx.beginPath();
    ctx.arc(radius, radius, radius - 1, 0, Math.PI * 2);
    ctx.fillStyle = RING;
    ctx.fill();

    // 扇区
    const inner = radius - Math.max(8, size * 0.022);
    for (let i = 0; i < count; i += 1) {
      const center = -Math.PI / 2 + state.angle + i * step;
      ctx.beginPath();
      ctx.moveTo(radius, radius);
      ctx.arc(radius, radius, inner, center - step / 2, center + step / 2);
      ctx.closePath();
      ctx.fillStyle = PALETTE[i % PALETTE.length];
      ctx.fill();
    }

    // 名字：水平直立，按扇区宽度缩字号、超长截断
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = INK;
    // 格子多的时候一圈排不下，隔一个往外挪一点，相邻两个就不挤在一块
    const staggered = count > 12;
    for (let i = 0; i < count; i += 1) {
      const center = -Math.PI / 2 + state.angle + i * step;
      const ring = radius * (staggered ? (i % 2 === 0 ? 0.55 : 0.73) : 0.63);
      const x = radius + Math.cos(center) * ring;
      const y = radius + Math.sin(center) * ring;
      const room = 2 * ring * Math.sin(step / 2);
      const fitted = fit(labels[i], room * 0.92, radius);
      if (!fitted) continue;
      ctx.fillText(fitted.text, x, y);
    }

    // 中心按钮与指针
    const hub = radius * 0.14;
    ctx.beginPath();
    ctx.arc(radius, radius, hub, 0, Math.PI * 2);
    ctx.fillStyle = BUTTON;
    ctx.fill();

    // 指针尖指向 12 点：它标的就是「停在这一格」，得比按钮更抢眼
    ctx.beginPath();
    ctx.moveTo(radius, radius - hub * 1.95);
    ctx.lineTo(radius - hub * 0.44, radius - hub * 0.72);
    ctx.lineTo(radius + hub * 0.44, radius - hub * 0.72);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = ON_BUTTON;
    ctx.font = `600 ${Math.round(Math.min(18, Math.max(10, hub * 0.62)))}px ${FONT}`;
    ctx.fillText('抽奖', radius, radius + 1);
  }

  /** 把名字压到给定宽度里：先缩字号，缩到底再截断加省略号。 */
  function fit(text, maxWidth, radius) {
    if (!text) return null;
    let fontSize = Math.round(Math.min(26, Math.max(10, radius * 0.085)));
    const floor = 9;
    while (fontSize > floor) {
      ctx.font = `500 ${fontSize}px ${FONT}`;
      if (ctx.measureText(text).width <= maxWidth) return { text, fontSize };
      fontSize -= 1;
    }
    ctx.font = `500 ${floor}px ${FONT}`;
    if (ctx.measureText(text).width <= maxWidth) return { text, fontSize: floor };
    let cut = text;
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
    if (ctx.measureText(`${cut}…`).width > maxWidth) return null;
    return { text: `${cut}…`, fontSize: floor };
  }

  function spinTo(index, spinMs) {
    if (count === 0) return Promise.resolve();
    const target = normalize(-index * step);
    const from = state.angle;
    const delta = normalize(target - from) + Math.PI * 2 * 4;
    const start = performance.now();

    return new Promise((resolve) => {
      const tick = (now) => {
        const t = Math.min(1, (now - start) / spinMs);
        // 先快后慢，最后一段几乎停住，台下才有一秒悬念
        const eased = 1 - Math.pow(1 - t, 4);
        state.angle = (from + delta * eased) % (Math.PI * 2);
        paint();
        if (t < 1) {
          state.frame = requestAnimationFrame(tick);
          return;
        }
        state.angle = target;
        paint();
        state.frame = 0;
        resolve();
      };
      state.frame = requestAnimationFrame(tick);
    });
  }

  function normalize(value) {
    const turn = Math.PI * 2;
    return ((value % turn) + turn) % turn;
  }

  function dispose() {
    if (state.frame) cancelAnimationFrame(state.frame);
    state.frame = 0;
    canvas.remove();
  }

  return { spinTo, dispose };
}
