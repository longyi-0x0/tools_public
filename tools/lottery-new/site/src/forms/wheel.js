/**
 * 大转盘：一个池一个盘。
 *
 * 两件事分开：mapPlan 是纯函数，把已定的结果算成"停在第几格"，单测覆盖；
 * mount 才碰 canvas，只负责转与停，不产生任何结果。
 *
 * 一次转盘只能停一格，所以规则要抽几个就转几次；多个盘时按 mode 决定
 * 同时转还是依次转。
 */

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
  const lib = options.library ?? (await import('../../vendor/lucky-canvas.esm.js'));
  const size = options.size ?? 420;
  const items = plan.boards.filter((board) => board.entries.length > 0).map((board) => createBoard(root, board, lib, size));

  return {
    async run(onBoardDone) {
      const runOne = async (item) => {
        for (const index of item.board.spins) {
          await spin(item.instance, index, options.spinMs ?? 900);
          await options.onStop?.(item.board);
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
      for (const item of items) item.holder.remove();
    },
  };
}

function createBoard(root, board, lib, size) {
  const id = `wheel-${board.slotKey}-${Math.random().toString(36).slice(2, 8)}`;
  const holder = document.createElement('div');
  holder.className = 'board';
  if (board.title) {
    const label = document.createElement('div');
    label.className = 'board-label';
    label.textContent = board.title;
    holder.append(label);
  }
  const canvas = document.createElement('div');
  canvas.className = 'board-canvas';
  canvas.id = id;
  holder.append(canvas);
  root.append(holder);

  const instance = new lib.LuckyWheel(`#${id}`, {
    width: size,
    height: size,
    blocks: [{ padding: '14px', background: '#1b1d24', borderRadius: '50%' }],
    prizes: board.entries.map((entry, index) => ({
      background: index % 2 === 0 ? '#f4efe6' : '#e3dccf',
      fonts: [{ text: entry.label || entry.id, top: '38%', fontColor: '#25262c', fontSize: '15px' }],
    })),
    buttons: [
      {
        radius: '22%',
        background: '#c8543f',
        pointer: true,
        fonts: [{ text: '抽奖', top: '-18px', fontColor: '#fff5ee', fontSize: '18px' }],
      },
    ],
    defaultConfig: { speed: 14, stopRange: 0.6 },
    defaultStyle: { fontColor: '#25262c', fontSize: '15px' },
  });

  return { board, holder, instance };
}

/** 转一次：先加速转一会儿再下停止令，等库自己减速到停。 */
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
