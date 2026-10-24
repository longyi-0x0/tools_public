/**
 * v3 新增部分的单测：出奖位名字、环节次序与封箱、清单用处、活动日期、
 * 主持人手选的那一位，以及进度派生。
 *
 * 抽签本身的行为（装配、权重、作用域、账本、复算）由原有 78 条守着，这里只补新的。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createSlot, createDraw, sortedDraws, orderOf,
} from '../site/src/domain/draw.js';
import { createPool, createEntry, guessKind } from '../site/src/domain/pool.js';
import { createGroup } from '../site/src/domain/group.js';
import { decide, slotOrder } from '../site/src/domain/engine.js';
import { createLedger } from '../site/src/domain/ledger.js';
import { recompute } from '../site/src/domain/recompute.js';
import { drawStatsOf, slotStatsOf } from '../site/src/domain/progress.js';
import { slotTitleOf, scopeLabelOf } from '../site/src/ui/labels.js';

function people(count, prefix = 'p') {
  const pool = createPool({ id: 'people', name: '全员名单', kind: 'people' });
  pool.entries = Array.from({ length: count }, (_, index) => createEntry({
    label: `${prefix}${index + 1}`, extKey: `${prefix}${index + 1}`, stock: 1,
  }));
  return pool;
}

function prizes() {
  const pool = createPool({ id: 'prize', name: '奖品清单', kind: 'prize' });
  pool.entries = [
    createEntry({ label: '耳机', extKey: 'a', stock: 1 }),
    createEntry({ label: '水杯', extKey: 'b', stock: 1 }),
  ];
  return pool;
}

test('出奖位带名字，默认不手选', () => {
  const slot = createSlot({ key: 's1', label: '三等奖' });
  assert.equal(slot.label, '三等奖');
  assert.equal(slot.manual, false);
  assert.equal(createSlot({ key: 's1' }).label, '');
  assert.equal(createSlot({ key: 's1', manual: 'yes' }).manual, false, '只有布尔真才算手选');
});

test('环节带次序与封箱，没编号时按数组位置', () => {
  const a = createDraw({ id: 'a', name: '三等奖', order: 2 });
  const b = createDraw({ id: 'b', name: '二等奖', order: 1 });
  const c = createDraw({ id: 'c', name: '一等奖' });
  assert.equal(a.closed, false);
  assert.deepEqual(sortedDraws([a, b, c]).map((draw) => draw.id), ['b', 'a', 'c']);
  assert.equal(orderOf(c, 7), 7, '没编号就用它在数组里的位置');
  assert.equal(createDraw({ id: 'd', closed: true }).closed, true);
});

test('清单的用处：认得三个值，能从名字猜', () => {
  assert.equal(createPool({ name: 'x' }).kind, 'generic');
  assert.equal(createPool({ name: 'x', kind: 'nope' }).kind, 'generic');
  assert.equal(guessKind('全员名单'), 'people');
  assert.equal(guessKind('年会奖品'), 'prize');
  assert.equal(guessKind('随便什么'), 'generic');
});

test('活动带日期', () => {
  assert.equal(createGroup({ name: '年会' }).at, '');
  assert.equal(createGroup({ name: '年会', at: '2026-01-20' }).at, '2026-01-20');
});

test('轮次快照冻结环节名与出奖位名，事后改名不改史', () => {
  const pool = people(3);
  const draw = createDraw({
    id: 'd1',
    name: '三等奖',
    slots: [createSlot({ key: 's1', label: '中奖人', poolId: 'people' })],
  });
  const round = decide({ draw, pools: { people: pool }, ledger: createLedger(), seed: 's', now: 1 });

  assert.equal(round.drawName, '三等奖');
  assert.equal(round.slots[0].label, '中奖人');
});

test('主持人手选的那一位：入账、占位、可复算', () => {
  const pool = people(4);
  const prize = prizes();
  const draw = createDraw({
    id: 'd1',
    name: '先定奖项再抽人',
    slots: [
      createSlot({ key: 's1', label: '奖项', poolId: 'prize', manual: true }),
      createSlot({ key: 's2', label: '中奖人', poolId: 'people' }),
    ],
  });

  const round = decide({
    draw,
    pools: { people: pool, prize },
    ledger: createLedger(),
    seed: 'seed-1',
    now: 100,
    manual: { s1: prize.entries[1].id },
  });

  const prizePick = round.picks.find((pick) => pick.slotKey === 's1');
  assert.equal(prizePick?.entryId, prize.entries[1].id, '手选的那一位要入账');
  assert.equal(round.picks.filter((pick) => pick.slotKey === 's2').length, 1, '另一位照常抽');
  assert.equal(recompute(round).ok, true, '手选也照样能复算');
  assert.equal(slotOrder(draw)[0].key, 's1', '手选位按声明顺序先定');
});

test('主持人选的已经抽完时，那一位不出结果', () => {
  const prize = prizes();
  prize.entries = [createEntry({ label: '耳机', extKey: 'a', stock: 1 })];
  const used = {
    rounds: [{
      id: 'r0',
      drawId: 'd1',
      status: 'settled',
      picks: [{ slotKey: 's1', poolId: 'prize', entryId: prize.entries[0].id }],
    }],
  };
  const draw = createDraw({
    id: 'd1',
    slots: [createSlot({ key: 's1', label: '奖项', poolId: 'prize', manual: true })],
  });

  const round = decide({
    draw,
    pools: { prize },
    ledger: used,
    seed: 'seed-2',
    now: 200,
    manual: { s1: prize.entries[0].id },
  });

  assert.equal(round.picks.length, 0, '没有剩余份数就不该再出');
});

test('进度派生：名额合计、不限量与抽完的判据', () => {
  const pool = people(5);
  const draw = createDraw({
    id: 'd1',
    slots: [
      createSlot({ key: 's1', poolId: 'people', quota: 2 }),
      createSlot({ key: 's2', poolId: 'people', quota: 3 }),
    ],
  });
  const pools = { people: pool };
  const empty = drawStatsOf({ ledger: { rounds: [] }, draw, pools });
  assert.equal(empty.used, 0);
  assert.equal(empty.quota, 5, '名额取合计');
  assert.equal(empty.candidates, 5);
  assert.equal(empty.done, false);

  const ledger = {
    rounds: Array.from({ length: 5 }, (_, index) => ({
      id: `r${index}`,
      drawId: 'd1',
      groupId: 'g1',
      status: 'settled',
      picks: [{ slotKey: 's1', poolId: 'people', entryId: pool.entries[index].id }],
    })),
  };
  const full = drawStatsOf({ ledger, draw, pools });
  assert.equal(full.used, 5);
  assert.equal(full.done, true, '抽够了就是抽完了');

  // 同一个活动的下一个环节：中过的人不再进候选，这靠作用域是「整场活动」。
  const loose = drawStatsOf({
    ledger,
    draw: createDraw({
      id: 'd2',
      groupId: 'g1',
      slots: [createSlot({ key: 's1', poolId: 'people', scope: 'group' })],
    }),
    pools,
  });
  assert.equal(loose.quota, Infinity, '任意一个不限量，合计就是不限量');
  assert.equal(loose.candidates, 0, '人都中过了，候选归零');
  assert.equal(loose.done, true, '没有候选也算抽完');
});

test('单个出奖位也能问出候选与剩余', () => {
  const pool = people(2);
  const draw = createDraw({ id: 'd1', slots: [createSlot({ key: 's1', poolId: 'people', quota: 1 })] });
  const stat = slotStatsOf({ ledger: { rounds: [] }, draw, slot: draw.slots[0], pools: { people: pool } });
  assert.equal(stat.candidates, 2);
  assert.equal(stat.remain, 1);
  assert.equal(stat.used, 0);
});

test('界面词典：出奖位名字有兜底，去重范围说人话', () => {
  assert.equal(slotTitleOf({ label: '三等奖' }, 0), '三等奖');
  assert.equal(slotTitleOf({}, 0, 'people'), '中奖人');
  assert.equal(slotTitleOf({}, 1, 'prize'), '奖项');
  assert.equal(slotTitleOf({}, 2, 'generic'), '出奖位 3');
  assert.equal(scopeLabelOf('group'), '整场活动都不重复');
  assert.ok(!scopeLabelOf('draw').includes('作用域'));
});
