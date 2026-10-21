/**
 * 开奖层：盖住主页的全屏那一层，投到大屏上给所有人看。
 *
 * 尺寸一律用容器查询单位，预览框和投影上是同一套比例。这一层只做两件事：
 * 把已定的结果演出来，演完交给外面入账。它自己不抽奖、不写账本。
 */

import { el, button } from './dom.js';
import { createSession } from '../domain/session.js';
import { planOf, mountForm } from '../forms/registry.js';
import { labelOf } from './labels.js';

export function createStage({ host, onSettled, onUndo }) {
  const frame = el('div', 'stage-frame');

  const top = el('div', 'stage-top');
  const name = el('div', 'name', '');
  const meta = el('div', 'meta', '');
  top.append(name, meta);

  const boards = el('div', 'stage-boards');

  const reveal = el('div', 'stage-reveal');
  const lead = el('div', 'reveal-lead', '');
  const names = el('div', 'reveal-names');
  reveal.append(lead, names);

  const bar = el('div', 'stage-bar');
  const startBtn = button('开始（空格）', spin, 'primary');
  const undoBtn = button('撤销上一轮', () => onUndo());
  const closeBtn = button('退出（Esc）', close);
  bar.append(startBtn, undoBtn, el('div', 'spacer'), el('span', 'tip', '空格开始 / Esc 退出'), closeBtn);

  frame.append(top, boards, reveal, bar);
  host.append(frame);

  let ctx = null;
  let form = null;
  let busy = false;

  document.addEventListener('keydown', (event) => {
    if (host.hidden) return;
    if (event.code === 'Space') {
      event.preventDefault();
      spin();
    } else if (event.key === 'Escape') {
      close();
    }
  });

  function open(draw, state) {
    ctx = { draw, pools: state.pools, rounds: state.rounds };
    name.textContent = draw.name || '抽奖';
    meta.textContent = metaOf(draw, state.pools);
    boards.replaceChildren();
    showReveal(null);
    host.hidden = false;
    render();
  }

  function close() {
    host.hidden = true;
    form?.dispose();
    form = null;
    ctx = null;
  }

  async function spin() {
    if (busy || !ctx || host.hidden) return;
    busy = true;
    startBtn.disabled = true;
    showReveal(null);

    const pools = Object.fromEntries(ctx.pools.map((pool) => [pool.id, pool]));
    const session = createSession({
      draw: ctx.draw,
      pools,
      ledger: { rounds: ctx.rounds },
      seed: `${Date.now()}:${Math.random()}`,
    });
    const plan = planOf(session.round, session.view);

    if (plan.boards.length === 0 || plan.boards.every((board) => board.spins.length === 0)) {
      lead.textContent = '抽不动了';
      names.replaceChildren(el('div', 'reveal-lost', '这个池的候选已空'));
      reveal.classList.add('on');
      busy = false;
      startBtn.disabled = false;
      return;
    }

    for (const board of plan.boards) board.title = pools[board.poolId]?.name ?? '';

    boards.replaceChildren();
    form?.dispose();
    form = await mountForm(boards, plan);
    await form.run();

    showReveal(session.round, pools);
    ctx.rounds = onSettled(session);
    busy = false;
    startBtn.disabled = false;
    render();
  }

  function showReveal(round, pools = {}) {
    if (!round) {
      reveal.classList.remove('on');
      lead.textContent = '';
      names.replaceChildren();
      return;
    }
    reveal.classList.add('on');
    lead.textContent = round.slots.length > 1 ? round.slots.map((slot) => pools[slot.poolId]?.name ?? '').join(' + ') : '';

    if (!round.win || round.picks.length === 0) {
      names.replaceChildren(el('div', 'reveal-lost', '未中奖'));
      return;
    }
    names.dataset.count = String(Math.min(round.picks.length, 4));
    names.replaceChildren(...round.picks.map((pick) => el('div', 'reveal-name', labelOf(pools, pick))));
  }

  function render() {
    undoBtn.disabled = ctx === null || ctx.rounds.length === 0;
  }

  function metaOf(draw, pools) {
    if (draw.slots.length < 2) return '';
    const mode = draw.mode === 'independent' ? '同时抽' : '依次抽';
    return `${draw.slots.length} 个池 · ${mode}`;
  }

  return { open, close, isOpen: () => !host.hidden };
}
