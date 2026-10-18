import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MODE,
  addPerson,
  addPrize,
  availablePrizes,
  createState,
  drawByPerson,
  drawByPrize,
  eligiblePeople,
  hasWon,
  prizeDrawn,
  prizeRemaining,
  removePerson,
  removePrize,
  replacePools,
  resetProgress,
  undoLast,
  updatePrize,
} from '../site/src/engine.js';

function baseState() {
  return replacePools(createState(), {
    prizes: [
      { name: '一等奖', count: 1 },
      { name: '二等奖', count: 2 },
      { name: '三等奖', count: 3 },
    ],
    people: [
      { name: '张三', dept: '研发' },
      { name: '李四', dept: '市场' },
      { name: '王五', dept: '设计' },
      { name: '赵六', dept: '研发' },
      { name: '钱七', dept: '运营' },
    ],
  });
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

test('导入后名额与人数来自池', () => {
  const state = baseState();
  assert.equal(state.prizes.length, 3);
  assert.equal(state.people.length, 5);
  assert.equal(prizeRemaining(state, 'a1'), 1);
  assert.equal(eligiblePeople(state).length, 5);
});

test('奖品抽人按人数抽且不重复', () => {
  const state = baseState();
  const { state: next, winners } = drawByPrize(state, 'a3', 3, stubRandom([0.1, 0.4, 0.7]));
  assert.equal(winners.length, 3);
  assert.deepEqual(
    winners.map((winner) => winner.name),
    ['张三', '王五', '钱七'],
  );
  assert.equal(new Set(winners.map((winner) => winner.personId)).size, 3);
  assert.equal(prizeRemaining(next, 'a3'), 0);
  assert.equal(next.results.length, 1);
});

test('奖品抽人不会超出剩余名额，也不会让中过的人再中', () => {
  const state = baseState();
  const first = drawByPrize(state, 'a1', 3, stubRandom([0]));
  assert.equal(first.winners.length, 1);
  assert.equal(prizeRemaining(first.state, 'a1'), 0);

  assert.throws(() => drawByPrize(first.state, 'a1', 1), /名额已经抽完/);

  const won = first.winners[0].personId;
  const second = drawByPrize(first.state, 'a2', 4, stubRandom([0]));
  assert.equal(second.winners.length, 2);
  assert.ok(second.winners.every((winner) => winner.personId !== won));
});

test('撤销把名额与人一起还回去', () => {
  const state = baseState();
  const { state: drawn } = drawByPrize(state, 'a2', 2, stubRandom([0.2, 0.8]));
  assert.equal(prizeDrawn(drawn, 'a2'), 2);

  const undone = undoLast(drawn);
  assert.equal(prizeDrawn(undone, 'a2'), 0);
  assert.equal(prizeRemaining(undone, 'a2'), 2);
  for (const result of drawn.results) {
    for (const winner of result.winners) {
      assert.equal(hasWon(undone, winner.personId), false);
    }
  }
  assert.equal(undoLast(undoLast(undone)), undone);
});

test('人抽奖品按剩余名额加权，抽空的奖项不再出现', () => {
  const state = replacePools(createState(), {
    prizes: [{ name: '大奖', count: 1 }],
    people: [{ name: '张三' }, { name: '李四' }],
  });
  const first = drawByPerson(state, 'p1', stubRandom([0.99]));
  assert.equal(first.prize.name, '大奖');
  assert.equal(prizeRemaining(first.state, 'a1'), 0);
  assert.equal(availablePrizes(first.state).length, 0);
  assert.throws(() => drawByPerson(first.state, 'p2'), /全部抽完/);
});

test('权重改变命中概率的方向', () => {
  const state = replacePools(createState(), {
    prizes: [
      { name: '常见', count: 100, weight: 1 },
      { name: '稀有', count: 1, weight: 100 },
    ],
    people: [{ name: '张三' }],
  });
  // 总权重 100×1 + 1×100 = 200；0.4 落在「常见」那一段
  const common = drawByPerson(state, 'p1', stubRandom([0.4]));
  assert.equal(common.prize.name, '常见');
  // 0.9 落在「稀有」那一段
  const rare = drawByPerson(state, 'p1', stubRandom([0.9]));
  assert.equal(rare.prize.name, '稀有');
});

test('同一个人的第二抽会被拦下，关掉唯一中奖后放行', () => {
  const state = replacePools(createState(), {
    prizes: [{ name: '奖品', count: 3 }],
    people: [{ name: '张三' }],
  });
  const first = drawByPerson(state, 'p1', stubRandom([0]));
  assert.throws(() => drawByPerson(first.state, 'p1'), /已经中过/);

  const repeated = drawByPerson({ ...first.state, uniqueWinner: false }, 'p1', stubRandom([0]));
  assert.equal(repeated.winners.length, 1);
});

test('名单抽空后不再有可抽的人', () => {
  const state = replacePools(createState(), {
    prizes: [{ name: '奖品', count: 10 }],
    people: [{ name: '甲' }, { name: '乙' }],
  });
  const one = drawByPrize(state, 'a1', 2, stubRandom([0.5]));
  assert.equal(one.winners.length, 2);
  assert.equal(eligiblePeople(one.state).length, 0);
  assert.throws(() => drawByPrize(one.state, 'a1', 1), /没有可抽的人/);
});

test('奖项数量不能改到低于已抽数量', () => {
  const state = baseState();
  const { state: drawn } = drawByPrize(state, 'a2', 2, stubRandom([0]));
  const next = updatePrize(drawn, 'a2', { count: 1 });
  assert.equal(next.prizes.find((prize) => prize.id === 'a2').count, 2);
  const raised = updatePrize(next, 'a2', { count: 5 });
  assert.equal(raised.prizes.find((prize) => prize.id === 'a2').count, 5);
});

test('抽过的奖项与中过的人不能删', () => {
  const state = baseState();
  const { state: drawn, winners } = drawByPrize(state, 'a2', 1, stubRandom([0]));
  assert.throws(() => removePrize(drawn, 'a2'), /已经抽出过结果/);
  assert.throws(() => removePerson(drawn, winners[0].personId), /已经中过奖/);
  assert.equal(removePrize(state, 'a2').prizes.length, 2);
});

test('新增奖项与参与人沿用递增 id', () => {
  const state = baseState();
  const [withPrize, prize] = addPrize(state, { name: '特等奖', count: 1 });
  assert.equal(prize.id, 'a4');
  const [withPerson, person] = addPerson(withPrize, { name: '孙八' });
  assert.equal(person.id, 'p6');
  assert.equal(withPerson.people.length, 6);
});

test('清空记录不碰奖项与名单', () => {
  const state = baseState();
  const { state: drawn } = drawByPrize(state, 'a1', 1, stubRandom([0]));
  const cleared = resetProgress(drawn);
  assert.equal(cleared.results.length, 0);
  assert.equal(cleared.prizes.length, 3);
  assert.equal(cleared.people.length, 5);
});

test('两种方向都记下用了哪个模型', () => {
  const prizeState = baseState();
  const a = drawByPrize(prizeState, 'a1', 1, stubRandom([0]));
  assert.equal(a.state.results[0].mode, MODE.PRIZE);

  const personState = replacePools(createState(), {
    prizes: [{ name: '奖品', count: 1 }],
    people: [{ name: '甲' }],
  });
  const b = drawByPerson(personState, 'p1', stubRandom([0]));
  assert.equal(b.state.results[0].mode, MODE.PERSON);
});
