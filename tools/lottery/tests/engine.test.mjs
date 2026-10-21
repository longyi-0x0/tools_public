import assert from 'node:assert/strict';
import test from 'node:test';

import { cleanPool } from '../site/src/pools.js';
import {
  addEntry,
  canDraw,
  createState,
  drawnCount,
  drawOnce,
  eligible,
  readiness,
  remaining,
  removeEntry,
  resetProgress,
  undoLast,
  undoPick,
  updateEntry,
  voidPick,
} from '../site/src/engine.js';

function pools() {
  return [
    cleanPool(
      {
        id: 'people',
        name: '名单',
        kind: 'people',
        entries: [
          { name: '张三', meta: { dept: '研发' } },
          { name: '李四', meta: { dept: '市场' } },
          { name: '王五', meta: { dept: '设计' } },
          { name: '赵六', meta: { dept: '研发' } },
          { name: '钱七', meta: { dept: '运营' } },
        ],
      },
      0,
    ),
    cleanPool(
      {
        id: 'prizes',
        name: '奖品',
        kind: 'prizes',
        entries: [
          { name: '一等奖', capacity: 1 },
          { name: '二等奖', capacity: 2 },
          { name: '三等奖', capacity: 3 },
        ],
      },
      1,
    ),
  ];
}

/** 槽 → 池的绑定。新路径全都靠它，测试夹具也要显式给，不然测不到绑定本身。 */
const BINDINGS = { person: 'people', prize: 'prizes' };

function baseState(overrides = {}) {
  return createState({ protocol: 'prize-person', pools: pools(), slots: BINDINGS, ...overrides });
}

/** 依次给出固定的随机数，用尽后回到 0。 */
function stubRandom(values) {
  let index = 0;
  return () => {
    const value = values[index % values.length];
    index += 1;
    return value;
  };
}

test('奖品抽人：一条结果里既有奖项也有人', () => {
  const state = baseState();
  const { state: next, picks } = drawOnce(state, { fixed: { prize: 'a1' }, random: () => 0 });

  assert.equal(picks.length, 2);
  assert.equal(picks[0].slot, 'prize');
  assert.equal(picks[0].entryId, 'a1');
  assert.equal(picks[1].slot, 'person');
  assert.equal(next.results.length, 1);
  assert.equal(remaining(next, 'prizes', 'a1'), 0);
});

test('一次抽多人：抽到的互不重复，各占一个名额', () => {
  const state = baseState();
  const { state: next, picks } = drawOnce(state, {
    fixed: { prize: 'a3' },
    batch: 3,
    random: stubRandom([0.1, 0.4, 0.7]),
  });
  const people = picks.filter((pick) => pick.slot === 'person');
  assert.equal(people.length, 3);
  assert.equal(new Set(people.map((pick) => pick.entryId)).size, 3);
  for (const pick of people) {
    assert.equal(remaining(next, 'people', pick.entryId), 0);
  }
});

test('名额抽完就不再进池', () => {
  let state = baseState({ excluded: [] });
  state = drawOnce(state, { fixed: { prize: 'a1' } }).state;
  assert.equal(canDraw(state), true);
  assert.equal(eligible(state, state.pools[1]).some((entry) => entry.id === 'a1'), false);
  assert.throws(
    () => drawOnce(state, { fixed: { prize: 'a1' } }),
    /名额已经抽完/,
  );
});

test('人抽奖品：按剩余名额加权，抽完的奖项不再出现', () => {
  let state = baseState({ protocol: 'person-prize' });
  const seen = new Set();
  // 人各抽一次（每人容量 1），奖项名额 1 + 2 + 3 = 6，五抽必然先耗尽小名额
  for (const personId of ['p1', 'p2', 'p3', 'p4', 'p5']) {
    const outcome = drawOnce(state, { fixed: { person: personId }, random: () => 0 });
    state = outcome.state;
    seen.add(outcome.picks.find((pick) => pick.slot === 'prize').entryId);
  }
  assert.equal(remaining(state, 'prizes', 'a1'), 0);
  assert.equal(seen.has('a1'), true);
});

test('不限量：capacity 为 null 时永远抽得动', () => {
  const state = createState({
    protocol: 'person-prize',
    slots: BINDINGS,
    pools: [
      cleanPool(
        {
          id: 'people',
          name: '名单',
          kind: 'people',
          entries: [{ name: '张三', capacity: null }],
        },
        0,
      ),
      cleanPool(
        {
          id: 'prizes',
          name: '奖品',
          kind: 'prizes',
          entries: [{ name: '谢谢参与', capacity: null }],
        },
        1,
      ),
    ],
  });
  let next = state;
  for (let index = 0; index < 4; index += 1) {
    next = drawOnce(next, { fixed: { person: 'p1' }, random: () => 0 }).state;
  }
  assert.equal(remaining(next, 'prizes', 'a1'), Infinity);
  assert.equal(canDraw(next), true);
});

test('撤销一条：名额与池子跟着回去', () => {
  const first = drawOnce(baseState(), { fixed: { prize: 'a1' } });
  const result = first.result;
  const personPick = result.picks.find((pick) => pick.slot === 'person');
  const next = undoPick(first.state, result.id, personPick.poolId, personPick.entryId);

  assert.equal(remaining(next, 'people', personPick.entryId), 1);
  assert.equal(eligible(next, next.pools[0]).some((entry) => entry.id === personPick.entryId), true);
});

test('作废一条：人不算中奖，且不再进池', () => {
  const first = drawOnce(baseState(), { fixed: { prize: 'a1' } });
  const result = first.result;
  const personPick = result.picks.find((pick) => pick.slot === 'person');
  const next = voidPick(first.state, result.id, personPick.poolId, personPick.entryId);

  assert.deepEqual(next.excluded, [`${personPick.poolId}/${personPick.entryId}`]);
  assert.equal(eligible(next, next.pools[0]).some((entry) => entry.id === personPick.entryId), false);
});

test('撤销上一次：记录少一条，条目回到池里', () => {
  const first = drawOnce(baseState(), { fixed: { prize: 'a1' } });
  const next = undoLast(first.state);
  assert.equal(next.results.length, 0);
  assert.equal(drawnCount(next, 'prizes', 'a1'), 0);
});

test('清空记录：池与名额不动', () => {
  const first = drawOnce(baseState(), { fixed: { prize: 'a1' } });
  const next = resetProgress(first.state);
  assert.equal(next.results.length, 0);
  assert.equal(next.pools[1].entries.length, 3);
});

test('改条目：名额不会低于已抽出数量', () => {
  const first = drawOnce(baseState(), { fixed: { prize: 'a1' } });
  const next = updateEntry(first.state, 'prizes', 'a1', { capacity: 0 });
  assert.equal(remaining(next, 'prizes', 'a1'), 0);
  assert.equal(next.pools[1].entries[0].capacity, 1);
});

test('删条目：抽出过的删不掉，没抽过的可以', () => {
  const first = drawOnce(baseState(), { fixed: { prize: 'a1' } });
  assert.throws(() => removeEntry(first.state, 'prizes', 'a1'), /已经抽出过结果/);
  const next = removeEntry(first.state, 'prizes', 'a3');
  assert.equal(next.pools[1].entries.length, 2);
});

test('加条目：id 往后接着排', () => {
  const state = baseState();
  const [next, entry] = addEntry(state, 'people', { name: '孙八' });
  assert.equal(entry.id, 'p6');
  assert.equal(next.pools[0].entries.length, 6);
});

test('槽没有绑定：抽不动，报 slot-unbound', () => {
  const state = createState({
    protocol: 'prize-person',
    pools: pools(),
    slots: { prize: null, person: null },
  });
  assert.equal(canDraw(state), false);
  assert.throws(
    () => drawOnce(state, {}),
    (error) => error.code === 'slot-unbound' && /还没有给「奖项」选池/.test(error.message),
  );
});

test('没选池：不按种类兜底，直接抽不动', () => {
  const state = createState({ protocol: 'prize-person', pools: pools() });
  const report = readiness(state);
  assert.equal(report.canDraw, false);
  assert.deepEqual(
    report.slots.map((slot) => slot.poolId),
    [null, null],
  );
});

test('池的种类不参与：同一个池填两个槽也照抽', () => {
  const state = createState({
    protocol: 'prize-person',
    slots: { prize: 'p', person: 'p' },
    pools: [cleanPool({ id: 'p', name: '一张表', kind: 'people', entries: [{ name: '甲', capacity: null }] }, 0)],
  });
  const { picks } = drawOnce(state, { fixed: { prize: 'p1' }, random: () => 0 });
  assert.deepEqual(
    picks.map((pick) => [pick.slot, pick.poolId]),
    [
      ['prize', 'p'],
      ['person', 'p'],
    ],
  );
});

test('作废只作用那一格：别的池里的同名条目还在', () => {
  const state = createState({
    protocol: 'prize-person',
    slots: { prize: 'a', person: 'b' },
    pools: [
      cleanPool({ id: 'a', name: 'A', kind: 'prizes', entries: [{ name: '奖' }] }, 0),
      cleanPool({ id: 'b', name: 'B', kind: 'people', entries: [{ id: 'p1', name: '甲' }] }, 1),
    ],
    results: [
      {
        id: 'r1',
        at: 1,
        protocol: 'prize-person',
        picks: [
          { slot: 'prize', poolId: 'a', entryId: 'a1', name: '奖', meta: {} },
          { slot: 'person', poolId: 'b', entryId: 'p1', name: '甲', meta: {} },
        ],
      },
    ],
  });
  const next = voidPick(state, 'r1', 'b', 'p1');
  assert.deepEqual(next.excluded, ['b/p1']);
  assert.equal(eligible(next, next.pools[1]).length, 0, '被作废的那格不再进池');
});

test('两个同 kind 的池互不顶替：绑哪个就抽哪个', () => {
  const state = createState({
    protocol: 'prize-person',
    slots: { prize: 'prizes', person: 'pb' },
    pools: [
      cleanPool({ id: 'pa', name: '研发', kind: 'people', entries: [{ name: '张三' }] }, 0),
      cleanPool({ id: 'pb', name: '市场', kind: 'people', entries: [{ name: '李四' }] }, 1),
      ...pools().slice(1),
    ],
  });
  const { picks } = drawOnce(state, { fixed: { prize: 'a1' }, random: () => 0 });
  const person = picks.find((pick) => pick.slot === 'person');
  assert.equal(person.poolId, 'pb');
  assert.equal(person.name, '李四');
});

test('readiness 报出绑定与来源', () => {
  const report = readiness(baseState());
  assert.equal(report.canDraw, true);
  assert.deepEqual(
    report.slots.map((slot) => slot.key),
    ['prize', 'person'],
  );
  assert.equal(report.slots[1].entries, 5);
  assert.deepEqual(
    report.slots.map((slot) => [slot.source, slot.bound]),
    [
      ['fixed', 'prizes'],
      ['draw', 'people'],
    ],
  );
  assert.equal(report.slots[1].poolName, '名单');
});

test('fixed 槽可以指定抽哪一条', () => {
  const state = baseState();
  const { picks } = drawOnce(state, { fixed: { prize: 'a2' }, random: () => 0 });
  assert.equal(picks[0].entryId, 'a2');
  assert.equal(picks[0].name, '二等奖');
});
