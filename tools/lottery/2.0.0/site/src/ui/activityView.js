/**
 * 活动页：一场活动长什么样，一眼看完。
 *
 * 主持人在这一页只做一件事——点「上台开奖」。配环节、改名单都在这里，但按钮
 * 不与开奖抢位置：开奖在最上面，配置在下面。
 */

import {
  el, button, section, actions, card, progressBar, textInput,
} from './dom.js';
import { indexPools } from '../domain/pool.js';
import { sortedDraws } from '../domain/draw.js';
import { drawStatsOf } from '../domain/progress.js';
import {
  progressTextOf, poolKindLabel, formLabelOf, stageLabelOf,
} from './labels.js';
import { recordsSection } from './logView.js';
import { nameOf } from './naming.js';

export function activityPage({
  store, group, refresh, onOpenDraw, onStart, onNewDraw, onOpenPool, onDeleted,
}) {
  const state = store.state;
  const poolMap = indexPools(state.pools);
  const ledger = { rounds: state.rounds };
  const draws = sortedDraws(state.draws.filter((draw) => draw.groupId === group.id));
  const stats = new Map(draws.map((draw) => [draw.id, drawStatsOf({
    ledger, draw, pools: poolMap,
  })]));

  const usedTotal = draws.reduce((sum, draw) => sum + (stats.get(draw.id)?.used ?? 0), 0);
  const people = countPeople(draws, poolMap);

  const head = el('div', 'detail-head');
  head.append(textInput(group.name, (name) => {
    store.update((s) => ({
      ...s,
      groups: s.groups.map((item) => (item.id === group.id ? { ...item, name } : item)),
    }));
    refresh();
  }, 'detail-title'));
  head.append(el('p', 'detail-sub', [
    `${draws.length} 个环节`,
    usedTotal > 0 ? `已抽 ${usedTotal} 个奖` : null,
    people > 0 ? `名单 ${people} 人` : null,
  ].filter(Boolean).join(' · ')));

  const dateField = el('label', 'inline-field');
  dateField.append(el('span', undefined, '活动日期'));
  dateField.append(textInput(group.at, (at) => {
    store.update((s) => ({
      ...s,
      groups: s.groups.map((item) => (item.id === group.id ? { ...item, at } : item)),
    }));
    refresh();
  }));
  head.append(dateField);

  const next = draws.find((draw) => !stats.get(draw.id)?.done) ?? draws[0] ?? null;

  const body = el('div', 'detail-body');

  const goSection = section(
    '上台开奖',
    next
      ? `从「${nameOf(next, '未命名环节')}」开始，抽完一个自动问你要不要接下一个。`
      : '还没有环节，先加一个。',
    next
      ? actions(button('上台开奖', () => onStart(next), 'primary'), button('彩排一遍', () => onStart(next, { rehearsal: true }), 'quiet'))
      : actions(button('加一个环节', onNewDraw, 'primary')),
  );
  body.append(goSection);

  const drawSection = section('环节', '按这个顺序抽。想换顺序就改序号，演出里「下一个环节」跟着走。');
  if (draws.length === 0) {
    drawSection.append(el('p', 'empty', '这场活动还没有环节。'));
  }
  draws.forEach((draw, index) => {
    drawSection.append(drawCard({
      store, draw, index, stat: stats.get(draw.id), poolMap, onOpenDraw, onStart, refresh,
    }));
  });
  drawSection.append(actions(button('＋ 加一个环节', onNewDraw, 'quiet')));
  body.append(drawSection);

  body.append(poolSection({ state, draws, onOpenPool }));

  const roundIds = new Set(draws.map((draw) => draw.id));
  body.append(recordsSection({
    store,
    rounds: state.rounds.filter((round) => roundIds.has(round.drawId)),
    title: '全场中奖记录',
    note: '这场活动所有环节的中奖都在这里；撤销回到环节页的记录里做。',
    onUndo: () => {},
    readonly: true,
  }));

  body.append(section(
    '删除这场活动',
    '环节不会被删，只是从活动里散出来；原来「整场不重复」的环节会退化成「本环节不重复」。',
    actions(button('删除这场活动', () => {
      if (!window.confirm('删除这场活动？环节与中奖记录都保留，只是不再归在这场活动下。')) return;
      store.update((s) => ({
        ...s,
        groups: s.groups.filter((item) => item.id !== group.id),
        draws: s.draws.map((draw) => (draw.groupId === group.id ? { ...draw, groupId: null } : draw)),
      }));
      onDeleted();
    }, 'danger')),
  ));

  const detail = el('div', 'detail');
  detail.append(head, body);
  return detail;
}

/** 环节卡片：序号、名字、从哪张清单抽、进度、状态、开奖。 */
function drawCard({
  store, draw, index, stat, poolMap, onOpenDraw, onStart, refresh,
}) {
  const poolName = nameOf(poolMap[draw.slots[0]?.poolId] ?? null, '还没选清单');

  const node = card(
    `${index + 1}. ${nameOf(draw, '未命名环节')}`,
    `${formLabelOf(draw.form.type)} · ${poolKindLabel(poolMap[draw.slots[0]?.poolId]?.kind)}`,
  );
  node.classList.add(stat.done ? 'is-done' : 'is-live');

  const meta = el('div', 'card-meta');
  meta.append(el('span', undefined, `从「${poolName}」抽`));
  meta.append(el('span', 'badge', stageLabelOf({ used: stat.used, quota: stat.quota, closed: stat.closed })));
  node.append(meta);

  node.append(progressBar(stat.used, stat.quota));
  node.append(el('p', 'card-progress', progressTextOf(stat, { candidates: false })));

  const row = el('div', 'card-actions');
  row.append(button(stat.done ? '再看看' : '上台开奖', () => onStart(draw), stat.done ? 'quiet' : 'primary'));
  row.append(button('配这个环节', () => onOpenDraw(draw.id), 'quiet'));
  node.append(row);

  return node;
}

function poolSection({ state, draws, onOpenPool }) {
  const used = new Set(draws.flatMap((draw) => draw.slots.map((slot) => slot.poolId)));
  const node = section('清单', '这场活动用到了哪些名单与奖品清单。点进去可以加人、导入。');

  if (state.pools.length === 0) {
    node.append(el('p', 'empty', '还没有清单。'));
    return node;
  }

  for (const pool of state.pools) {
    const line = el('div', 'row');
    const left = el('div', 'row-main');
    left.append(el('span', 'row-label', `${nameOf(pool)} · ${poolKindLabel(pool.kind)}`));
    left.append(el('span', 'row-sub', `${pool.entries.length} 项${used.has(pool.id) ? ' · 本场在用' : ''}`));
    line.append(left);
    const right = el('div', 'row-value');
    right.append(button('打开', () => onOpenPool?.(pool.id), 'quiet'));
    line.append(right);
    node.append(line);
  }
  return node;
}

/** 参与人数：本场用到的名单里的人头数，去重按条目 id。 */
function countPeople(draws, poolMap) {
  const ids = new Set();
  for (const draw of draws) {
    for (const slot of draw.slots ?? []) {
      const pool = poolMap[slot.poolId];
      if (pool?.kind !== 'people') continue;
      for (const entry of pool.entries) ids.add(entry.id);
    }
  }
  return ids.size;
}
