/**
 * 老虎机：单池，三列。
 *
 * 三列同一个 prize 索引才算中奖，这是库内置的判定，所以停位只有两种形态：
 * 中奖 → 三列同一个索引；未中奖 → 每列一个不同索引。mapPlan 只产出这两种。
 */

export function mapPlan(round, view) {
  const slot = (round.slots ?? [])[0];
  const entries = slot ? (view[slot.key]?.entries ?? []) : [];
  const columns = Math.min(3, entries.length);
  const indexOfHit = round.win
    ? entries.findIndex((entry) => entry.id === (view[slot.key]?.hitIds ?? [])[0])
    : -1;

  const spins = [];
  if (round.win && indexOfHit >= 0) {
    spins.push(new Array(columns).fill(indexOfHit));
  } else if (columns >= 2) {
    spins.push(Array.from({ length: columns }, (_, i) => i));
  }

  return {
    type: 'slot',
    win: round.win,
    sequential: false,
    boards: entries.length > 0 ? [{ slotKey: slot?.key ?? 'only', poolId: slot?.poolId ?? null, entries, spins }] : [],
  };
}

export async function mount(root, plan, options = {}) {
  const lib = options.library ?? (await import('../../vendor/lucky-canvas.esm.js'));
  const size = options.size ?? 420;
  const items = plan.boards.map((board) => createBoard(root, board, lib, size));

  return {
    async run(onBoardDone) {
      for (const item of items) {
        for (const stop of item.board.spins) {
          await spin(item.instance, stop, options.spinMs ?? 900);
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
  const id = `slot-${board.slotKey}-${Math.random().toString(36).slice(2, 8)}`;
  const holder = document.createElement('div');
  holder.className = 'board';
  const canvas = document.createElement('div');
  canvas.className = 'board-canvas';
  canvas.id = id;
  holder.append(canvas);
  root.append(holder);

  const order = board.entries.map((_, index) => index);
  const columns = Math.max(2, Math.min(3, board.entries.length));
  const instance = new lib.SlotMachine(`#${id}`, {
    width: size,
    height: Math.round(size * 0.55),
    blocks: [{ padding: '12px', background: '#1b1d24', borderRadius: '14px' }],
    prizes: board.entries.map((entry) => ({
      background: '#f4efe6',
      fonts: [{ text: entry.label || entry.id, fontColor: '#25262c', fontSize: '15px' }],
    })),
    slots: Array.from({ length: columns }, () => ({ order: [...order], speed: 22 })),
    defaultConfig: { mode: 'vertical', rowSpacing: 6, speed: 22 },
    defaultStyle: { fontColor: '#25262c', fontSize: '15px', borderRadius: '10px' },
  });

  return { board, holder, instance };
}

function spin(instance, stop, spinMs) {
  return new Promise((resolve) => {
    instance.play();
    setTimeout(() => {
      instance.stop(stop);
      const tick = () => (instance.step === 0 ? resolve() : requestAnimationFrame(tick));
      requestAnimationFrame(tick);
    }, spinMs);
  });
}
