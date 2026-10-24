/**
 * 九宫格：单池，八个格子绕一圈，中间是按钮。
 *
 * 与转盘同一套思路：mapPlan 算出停在第几格，mount 只管跑动画。
 */

/** 八格顺时针的坐标，从左上开始；中间 (1,1) 留给按钮。 */
const CELLS = [
  [0, 0], [1, 0], [2, 0],
  [2, 1], [2, 2], [1, 2],
  [0, 2], [0, 1],
];

export function mapPlan(round, view) {
  const slot = (round.slots ?? [])[0];
  const entries = slot ? (view[slot.key]?.entries ?? []) : [];
  const hitIds = round.win && slot ? (view[slot.key]?.hitIds ?? []) : [];
  const board = {
    slotKey: slot?.key ?? 'only',
    poolId: slot?.poolId ?? null,
    entries,
    spins: hitIds.map((id) => entries.findIndex((entry) => entry.id === id)).filter((i) => i >= 0),
  };
  return { type: 'grid', win: round.win, sequential: false, boards: entries.length > 0 ? [board] : [] };
}

export async function mount(root, plan, options = {}) {
  const lib = options.library ?? (await import('../../vendor/lucky-canvas.esm.js'));
  const size = options.size ?? 420;
  const items = plan.boards.map((board) => createBoard(root, board, lib, size));

  return {
    async run(onBoardDone) {
      for (const item of items) {
        for (const index of item.board.spins) {
          await spin(item.instance, index, options.spinMs ?? 900);
          await options.onStop?.(item.board);
        }
        await onBoardDone?.(item.board);
      }
    },
    dispose() {
      for (const item of items) item.holder.remove();
    },
  };
}

function createBoard(root, board, lib, size) {
  const id = `grid-${board.slotKey}-${Math.random().toString(36).slice(2, 8)}`;
  const holder = document.createElement('div');
  holder.className = 'board';
  const canvas = document.createElement('div');
  canvas.className = 'board-canvas';
  canvas.id = id;
  holder.append(canvas);
  root.append(holder);

  const instance = new lib.LuckyGrid(`#${id}`, {
    width: size,
    height: size,
    rows: 3,
    cols: 3,
    blocks: [{ padding: '14px', background: '#1b1d24', borderRadius: '16px' }],
    prizes: board.entries.slice(0, 8).map((entry, index) => {
      const [x, y] = CELLS[index] ?? [0, 0];
      return {
        x, y,
        background: index % 2 === 0 ? '#f4efe6' : '#e3dccf',
        fonts: [{ text: entry.label || entry.id, fontColor: '#25262c', fontSize: '14px' }],
      };
    }),
    buttons: [
      {
        x: 1,
        y: 1,
        background: '#c8543f',
        fonts: [{ text: '抽奖', fontColor: '#fff5ee', fontSize: '18px' }],
      },
    ],
    defaultConfig: { speed: 18, gutter: 6 },
    defaultStyle: { fontColor: '#25262c', fontSize: '14px', borderRadius: '14px' },
    activeStyle: { background: '#ffd28a', shadow: '' },
  });

  return { board, holder, instance };
}

function spin(instance, index, spinMs) {
  return new Promise((resolve) => {
    instance.play();
    setTimeout(() => {
      instance.stop(index);
      const tick = () => (instance.step === 0 ? resolve() : requestAnimationFrame(tick));
      requestAnimationFrame(tick);
    }, spinMs);
  });
}
