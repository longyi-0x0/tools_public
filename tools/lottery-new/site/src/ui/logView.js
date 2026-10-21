/**
 * 中奖记录：抽奖详情页里的一节。
 *
 * 撤销是账本层面的整轮移除；因为库存与已中次数都从账本派生，撤销完下一轮
 * 立刻能再抽到这个人。
 */

import { el, button, section, actions } from './dom.js';
import { indexPools } from '../domain/pool.js';
import { labelOf, timeOf } from './labels.js';
import { writeXlsx } from '../xlsx.js';

export function recordsSection({ store, onUndo }) {
  const pools = indexPools(store.state.pools);
  const rounds = [...store.state.rounds].reverse();

  if (rounds.length === 0) {
    return section('中奖记录', null, el('p', 'empty', '还没有抽出结果。'));
  }

  const node = section('中奖记录', null);
  for (const round of rounds) {
    const line = el('div', 'log-row');
    line.append(el('span', 'log-who', textOf(round, pools)));
    line.append(el('span', 'log-meta', timeOf(round.at ?? Date.now())));
    const spacer = el('span', 'spacer');
    line.append(spacer);
    line.append(button('撤销', () => onUndo(round.id), 'quiet'));
    node.append(line);
  }

  node.append(actions(button('导出 xlsx', () => exportXlsx(store, pools))));
  return node;
}

function textOf(round, pools) {
  if (!round.win || round.picks.length === 0) return '未中奖';
  return round.picks.map((pick) => labelOf(pools, pick)).join(' · ');
}

async function exportXlsx(store, pools) {
  const rows = [['时间', '池', '条目']];
  for (const round of store.state.rounds) {
    if (!round.win || round.picks.length === 0) {
      rows.push([timeOf(round.at ?? Date.now()), '', '未中奖']);
      continue;
    }
    for (const pick of round.picks) {
      rows.push([timeOf(round.at ?? Date.now()), pools[pick.poolId]?.name ?? '', labelOf(pools, pick)]);
    }
  }

  const blob = await writeXlsx(rows, '中奖记录');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = '中奖记录.xlsx';
  link.click();
  URL.revokeObjectURL(link.href);
}
