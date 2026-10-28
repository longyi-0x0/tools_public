/**
 * 演出层：主持人上台后看的那一屏。
 *
 * 这一屏只有三件事：开始、下一轮、下一环节。配置一个控件都没有——不是置灰，
 * 是根本不生成，免得主持人在台上被全场盯着的时候手滑改坏。撤销也不在这里，
 * 它属于收尾，不该在观众面前发生。
 *
 * 结果在点下「开始」的那一刻就定了，动画只是把已定的事实演出来；演完自动入账，
 * 不给主持人第二次点击的机会。彩排走同样的流程，只是不入账。
 */

import { el, button } from './dom.js';
import { indexPools } from '../domain/pool.js';
import { createSession, settle, undoRound } from '../domain/session.js';
import { planOf, mountForm } from '../forms/registry.js';
import { drawStatsOf } from '../domain/progress.js';
import { sortedDraws } from '../domain/draw.js';
import { candidatesOf } from '../domain/rule.js';
import { scopeOf } from '../domain/engine.js';
import { scopedUsage, topSettled } from '../domain/ledger.js';
import {
  labelOf, progressTextOf, slotTitleOf, undoReasonText,
} from './labels.js';
import { nameOf } from './naming.js';
import { createLink, onAudienceHello } from './showLink.js';

export function createShow({ host, store, onExit }) {
  const frame = el('div', 'show-frame');

  const top = el('div', 'show-top');
  const title = el('div', 'show-title', '');
  const progress = el('div', 'show-progress', '');
  top.append(title, progress);

  const notice = el('div', 'show-notice');
  const manualRow = el('div', 'show-manual');
  const boards = el('div', 'show-boards');
  const revealBox = el('div', 'show-reveal');
  const lead = el('div', 'show-lead', '');
  const names = el('div', 'show-names');
  revealBox.append(lead, names);

  const bar = el('div', 'show-bar');
  const startBtn = button('开始（空格）', spin, 'primary');
  const nextBtn = button('下一环节 →', goNext, 'quiet');
  const screenBtn = button('开大屏', openScreen, 'quiet');
  const exitBtn = button('退出（Esc）', close, 'quiet');
  // 撤回是收尾动作，不是演出动作：默认不出现，只在待机、且真有得撤时才露面。
  const undoBtn = button('撤回上一轮', undoLast, 'quiet undo');
  bar.append(startBtn, el('div', 'spacer'), undoBtn, nextBtn, screenBtn, exitBtn);

  frame.append(top, notice, manualRow, boards, revealBox, bar);
  host.append(frame);

  const link = createLink();
  let ctx = null;
  let busy = false;
  let form = null;
  /** 待机盘面的指纹：同一份名单不必重画，换了环节或名单才重装。 */
  let previewKey = '';
  /** 主持人在台上自己定的那几位：{ [slotKey]: entryId }。 */
  let manualPick = {};

  onAudienceHello(() => link.replay());

  document.addEventListener('keydown', (event) => {
    if (host.hidden) return;
    if (event.code === 'Space') {
      event.preventDefault();
      spin();
    } else if (event.key === 'Escape') {
      // 演出中不给退：手滑 Esc 会让全场看黑屏。
      if (!busy) close();
    }
  });

  function open(draw, { rehearsal = false } = {}) {
    ctx = { draw, rehearsal };
    manualPick = {};
    busy = false;
    host.hidden = false;
    boards.replaceChildren();
    previewKey = '';
    hideReveal();
    sync();
  }

  function close() {
    host.hidden = true;
    form?.dispose();
    form = null;
    ctx = null;
    link.close();
    onExit?.();
  }

  /* ---------- 渲染 ---------- */

  function sync() {
    if (!ctx) return;
    const poolMap = indexPools(store.state.pools);
    const ledger = { rounds: store.state.rounds };
    const stat = drawStatsOf({ ledger, draw: ctx.draw, pools: poolMap });

    title.textContent = nameOf(ctx.draw, '未命名环节');
    progress.textContent = progressTextOf(stat);

    // 彩排要整屏看得见：主持人不能靠角落一个小胶囊判断这一轮算不算数。
    frame.classList.toggle('rehearsal', ctx.rehearsal === true);
    // 名字还亮在屏上时撤回按钮不出现：台下已经看见那个人了，这时候点下去最尴尬。
    undoBtn.hidden = busy || ctx.rehearsal === true
      || revealBox.classList.contains('on') || !undoTarget();

    notice.replaceChildren();
    if (ctx.rehearsal) {
      notice.append(el('span', 'pill pill-warn', '彩排中 · 不计入结果'));
    }
    notice.append(el('span', `pill ${link.isOpen() ? 'pill-ok' : 'pill-warn'}`,
      link.isOpen() ? '大屏已开' : '单屏模式（没开成大屏）'));

    renderManual();
    renderPreview(poolMap, ledger);

    nextBtn.hidden = !nextDraw();
    startBtn.disabled = busy || stat.done;
    startBtn.textContent = stat.done ? '这一环节抽完了' : (stat.used > 0 ? '再抽一轮（空格）' : '开始（空格）');

    link.send({
      type: 'ready',
      payload: {
        drawName: nameOf(ctx.draw, '未命名环节'),
        remain: stat.remain,
        quota: stat.quota,
        done: stat.done,
        // 观众屏也得说清楚在彩排：台下看到名字会当真。
        rehearsal: ctx.rehearsal === true,
        preview: previewPlanOf(poolMap, ledger),
        // 刚抽完那一次不发 clear：观众屏上的中奖名单要留在那儿给全场看。
        clear: !revealBox.classList.contains('on'),
      },
    });
  }

  /**
   * 待机盘面：还没开抽时先把这一轮的盘摆出来。
   *
   * 大屏有观众屏去演，但开不出弹窗时这块屏就是投影——空着一片黑不好看，
   * 也说不清「现在要抽谁」。只画不转，结果仍然只在「开始」那一下定。
   */
  function renderPreview(poolMap, ledger) {
    if (busy || revealBox.classList.contains('on')) return;
    const plan = previewPlanOf(poolMap, ledger);
    const key = plan
      ? `${plan.boards.map((board) => `${board.slotKey}/${board.entries.length}`).join('|')}`
      : '';
    if (key === previewKey) return;
    previewKey = key;

    form?.dispose();
    form = null;
    boards.replaceChildren();
    if (!plan) return;
    mountForm(boards, plan, { size: boardSize() }).then((mounted) => {
      form = mounted;
    }).catch(() => {
      // 画不出来就空着，等真开抽时再画。
    });
  }

  /**
   * 控制台这块屏也可能就是投影（开不出弹窗时），盘面得按屏的大小给，
   * 名字多了才不至于缩成一撮。上限与 CSS 里 .board 的 58cqh 对齐。
   */
  function boardSize() {
    const side = Math.min(window.innerWidth * 0.52, window.innerHeight * 0.56);
    return Math.round(Math.max(320, Math.min(760, side)));
  }

  /**
   * 待机盘面要摆哪些人。
   *
   * 只在屏幕上摆着，不转、不定结果——定结果仍然只发生在「开始」那一下。
   * 名单太长时转盘本来就看不清，这里不做裁剪，免得待机和真转是两副样子。
   */
  function previewPlanOf(poolMap, ledger) {
    if (!ctx) return null;
    const boards = [];
    for (const slot of ctx.draw.slots ?? []) {
      const pool = poolMap[slot.poolId];
      if (!pool) continue;
      const usage = scopedUsage(ledger, {
        scope: scopeOf(slot, ctx.draw),
        drawId: ctx.draw.id,
        groupId: ctx.draw.groupId,
      });
      const entries = candidatesOf(pool, usage, slot);
      if (entries.length === 0) continue;
      boards.push({ slotKey: slot.key, poolId: slot.poolId, entries, spins: [] });
    }
    if (boards.length === 0) return null;
    return { type: ctx.draw.form?.type ?? 'wheel', win: false, sequential: false, boards };
  }

  /** 主持人在台上自己定的那几位，比如先点一个奖项再抽人。 */
  function renderManual() {
    manualRow.replaceChildren();
    if (!ctx) return;

    const poolMap = indexPools(store.state.pools);
    const ledger = { rounds: store.state.rounds };

    for (const slot of ctx.draw.slots ?? []) {
      if (!slot.manual) continue;
      const pool = poolMap[slot.poolId];
      const usage = scopedUsage(ledger, {
        scope: scopeOf(slot, ctx.draw),
        drawId: ctx.draw.id,
        groupId: ctx.draw.groupId,
      });
      const options = pool ? candidatesOf(pool, usage, slot) : [];

      const wrap = el('label', 'show-manual-item');
      wrap.append(el('span', undefined, slotTitleOf(slot, 0, pool?.kind)));
      const picker = document.createElement('select');
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = options.length > 0 ? '挑一个…' : '没有可选的了';
      picker.append(blank);
      for (const entry of options) {
        const option = document.createElement('option');
        option.value = entry.id;
        option.textContent = entry.label || '（未命名）';
        picker.append(option);
      }
      picker.value = manualPick[slot.key] ?? '';
      picker.addEventListener('change', () => {
        manualPick[slot.key] = picker.value;
      });
      wrap.append(picker);
      manualRow.append(wrap);
    }
  }

  /* ---------- 抽一轮 ---------- */

  async function spin() {
    if (busy || !ctx || host.hidden) return;
    const poolMap = indexPools(store.state.pools);
    const ledger = { rounds: store.state.rounds };
    const stat = drawStatsOf({ ledger, draw: ctx.draw, pools: poolMap });
    if (stat.done) return;

    busy = true;
    startBtn.disabled = true;
    hideReveal();

    const session = createSession({
      draw: ctx.draw,
      pools: poolMap,
      ledger,
      seed: `${Date.now()}:${Math.random()}`,
      manual: manualPick,
    });
    const plan = planOf(session.round, session.view);

    if (plan.boards.length === 0 || plan.boards.every((board) => board.spins.length === 0)) {
      showReveal({
        lead: '',
        names: [],
        empty: '这个奖已经抽完了，去下一个环节吧。',
      });
      link.send({ type: 'rest', payload: { remain: 0, done: true } });
      busy = false;
      sync();
      return;
    }

    for (const board of plan.boards) {
      board.title = poolMap[board.poolId]?.name ?? '';
    }

    link.send({ type: 'spin', payload: { plan } });

    boards.replaceChildren();
    form?.dispose();
    form = null;
    previewKey = '';
    form = await mountForm(boards, plan, { size: boardSize() });
    await form.run();

    const names = session.round.win && session.round.picks.length > 0
      ? session.round.picks.map((pick) => labelOf(poolMap, pick))
      : [];

    showReveal({
      lead: session.round.slots.length > 1
        ? session.round.slots.map((slot) => slotTitleOf(slot, 0)).join(' + ')
        : '',
      names,
      empty: names.length === 0 ? '这一轮没中' : null,
    });

    if (!ctx.rehearsal) {
      const result = settle(session, { rounds: store.state.rounds });
      if (result.applied) {
        store.update((state) => ({ ...state, rounds: result.ledger.rounds }));
      }
    }

    const after = drawStatsOf({ ledger: { rounds: store.state.rounds }, draw: ctx.draw, pools: poolMap });
    link.send({
      type: 'reveal',
      payload: {
        names,
        drawName: nameOf(ctx.draw, '未命名环节'),
        remain: after.remain,
        quota: after.quota,
      },
    });

    busy = false;
    sync();
  }

  function showReveal({ lead: leadText, names: list, empty }) {
    revealBox.classList.add('on');
    lead.textContent = leadText ?? '';
    names.replaceChildren();
    if (empty) {
      names.append(el('div', 'show-name muted', empty));
      return;
    }
    names.dataset.count = String(Math.min(list.length, 4));
    for (const name of list) names.append(el('div', 'show-name', name));
  }

  function hideReveal() {
    revealBox.classList.remove('on');
    lead.textContent = '';
    names.replaceChildren();
  }

  /* ---------- 撤回上一轮 ---------- */

  /**
   * 能撤的只有账本栈顶那一轮，而且必须是本环节的。
   *
   * 彩排不给撤：彩排根本没入账，那时露出来的「上一轮」是上一次正式抽的，
   * 主持人一点就把真结果撤了。宁可没有这个按钮，也不能有这种按钮。
   */
  function undoTarget() {
    if (!ctx || ctx.rehearsal) return null;
    const round = topSettled({ rounds: store.state.rounds });
    return round?.drawId === ctx.draw.id ? round : null;
  }

  function undoLast() {
    const target = undoTarget();
    if (!target) return;
    if (!window.confirm('撤回上一轮？占额清空、库存回滚，这一轮留档为「已撤销」。')) return;

    const result = undoRound({ rounds: store.state.rounds }, target.id);
    if (result.reason) {
      window.alert(undoReasonText(result.reason));
      return;
    }
    store.update((state) => ({ ...state, rounds: result.ledger.rounds }));
    manualPick = {};
    hideReveal();
    sync();
  }

  /* ---------- 环节推进 ---------- */

  function nextDraw() {
    if (!ctx) return null;
    const poolMap = indexPools(store.state.pools);
    const ledger = { rounds: store.state.rounds };
    const siblings = sortedDraws(store.state.draws.filter((draw) => draw.groupId === ctx.draw.groupId));
    const index = siblings.findIndex((draw) => draw.id === ctx.draw.id);
    const after = siblings.slice(index + 1);
    return after.find((draw) => !drawStatsOf({ ledger, draw, pools: poolMap }).done) ?? null;
  }

  function goNext() {
    const next = nextDraw();
    if (!next) {
      showReveal({ lead: '', names: [], empty: '这场活动抽完了。退出去导出名单吧。' });
      return;
    }
    ctx = { draw: next, rehearsal: ctx?.rehearsal ?? false };
    manualPick = {};
    hideReveal();
    boards.replaceChildren();
    form?.dispose();
    form = null;
    previewKey = '';
    sync();
  }

  function openScreen() {
    const ok = link.open();
    if (!ok) {
      window.alert('浏览器没让弹窗出来。检查弹窗拦截，或者直接把当前窗口全屏投出去。');
    }
    sync();
  }

  return { open, close, isOpen: () => !host.hidden };
}
