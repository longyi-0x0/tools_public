/**
 * 中奖记录：环节页与活动页共用的一节。
 *
 * 每一轮都留着，撤过的也在，只是状态不同——审计要看的是「这轮开过、又被撤了」。
 * 撤销只能撤最近一次结算的那轮，所以除了栈顶，其余按钮都灰着并写清原因。
 * 种子不摆在明面上：它是给「复算」用的，观众和主持人都用不着看见。
 */

import {
  el, button, section, actions, collapsible,
} from './dom.js';
import { indexPools } from '../domain/pool.js';
import { topSettled } from '../domain/ledger.js';
import { recompute } from '../domain/recompute.js';
import { labelOf, timeOf, roundStatusLabel } from './labels.js';
import { writeXlsx } from '../xlsx.js';

export function recordsSection({
  store,
  rounds = [],
  onUndo = () => {},
  title = '中奖记录',
  note = null,
  readonly = false,
}) {
  const pools = indexPools(store.state.pools);
  const ledger = { rounds: store.state.rounds };
  const list = [...rounds].reverse();

  if (list.length === 0) {
    return section(title, note, el('p', 'empty', '还没有抽出结果。'));
  }

  const top = topSettled(ledger);
  const node = section(title, note ?? '撤过的轮次留在这里，状态标成「已撤销」，占额已经回滚。');

  for (const round of list) {
    node.append(roundRow({ round, pools, top, onUndo, readonly }));
  }

  const bar = actions(button('导出 xlsx', () => exportXlsx(pools, [...list].reverse())));
  node.append(bar);
  return node;
}

function roundRow({ round, pools, top, onUndo, readonly }) {
  const item = el('div', 'log-item');
  const line = el('div', 'log-row');

  line.append(el('span', `badge badge-${round.status}`, roundStatusLabel(round.status)));
  const who = el('span', 'log-who', textOf(round, pools));
  line.append(who);
  if (round.drawName) line.append(el('span', 'log-draw', round.drawName));
  line.append(el('span', 'log-meta', timeOf(round.at ?? Date.now())));
  line.append(el('span', 'spacer'));

  line.append(button('复算', () => verifyInto(round, item), 'quiet'));

  if (!readonly) {
    const undo = button('撤销', () => onUndo(round));
    if (round.status !== 'settled') {
      undo.disabled = true;
      undo.title = '只有已入账的轮次能撤销';
    } else if (!top || top.id !== round.id) {
      undo.disabled = true;
      undo.title = '只能撤最近一次结算的那一轮，先把后面的撤掉';
    } else {
      undo.title = '整轮撤销：占额清空，这一轮留档为已撤销';
    }
    line.append(undo);
  }

  item.append(line);
  return item;
}

/** 复算结果贴在这一轮下面：对得上就说对得上，对不上就把第一处差异指出来。 */
function verifyInto(round, item) {
  item.querySelector('.log-verify')?.remove();

  const result = recompute(round);
  const note = el('p', `log-verify ${result.ok ? 'ok' : 'bad'}`);
  if (result.ok) {
    note.textContent = '复算一致：同种子同快照，命中原样重现。';
  } else if (result.diffs.length === 0) {
    note.textContent = result.reason ?? '无法复算。';
  } else {
    const first = result.diffs[0];
    note.textContent = `复算不一致：第 ${first.index + 1} 项 原 ${first.expected?.entryId ?? '空'} / 算 ${first.actual?.entryId ?? '空'}`;
  }
  item.append(note);

  // 种子只在这里露面：它是复算的输入，不是给人读的结果。
  item.append(collapsible('验证用的种子', el('p', 'log-seed', round.seed ?? '（没有种子）')));
}

function textOf(round, pools) {
  if (!round.win || (round.picks ?? []).length === 0) return '未中奖';
  return round.picks.map((pick) => labelOf(pools, pick)).join(' · ');
}

async function exportXlsx(pools, rounds) {
  const rows = [['时间', '状态', '环节', '清单', '条目', '种子']];
  for (const round of rounds) {
    const status = roundStatusLabel(round.status);
    if (!round.win || (round.picks ?? []).length === 0) {
      rows.push([timeOf(round.at ?? Date.now()), status, round.drawName ?? '', '', '未中奖', round.seed ?? '']);
      continue;
    }
    for (const pick of round.picks) {
      rows.push([
        timeOf(round.at ?? Date.now()),
        status,
        round.drawName ?? '',
        pools[pick.poolId]?.name ?? '',
        labelOf(pools, pick),
        round.seed ?? '',
      ]);
    }
  }

  const blob = await writeXlsx(rows, '中奖记录');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = '中奖记录.xlsx';
  link.click();
  URL.revokeObjectURL(link.href);
}
