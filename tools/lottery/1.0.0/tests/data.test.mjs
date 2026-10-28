import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addLotteryPool,
  addPool,
  createApp,
  createLottery,
  isUniqueWinner,
  lotteryById,
  lotteryStatus,
  lotterySummary,
  migrate,
  poolOfSlot,
  removeLotteryPool,
  resetLottery,
  runState,
  setLotteryBinding,
  setUniqueWinner,
  uniqueName,
  updateLottery,
  writeRunState,
} from '../site/src/data.js';
import { drawOnce } from '../site/src/engine.js';
import { normalizeConfig, stageDefaults } from '../site/src/stages/index.js';
import {
  buildLotteryWorkbook,
  readLotteryWorkbook,
  uniqueSheetNames,
} from '../site/src/workbook.js';
import { buildWorkbook, number, text } from '../site/src/xlsx.js';

const v3App = {
  version: 3,
  lastView: 'lotteries',
  lastLotteryId: 'g1',
  rosters: [
    {
      id: 'n1',
      name: '名单 A',
      people: [{ id: 'p1', name: '张三', dept: '研发', employeeId: 'A1' }],
    },
  ],
  prizeSets: [
    {
      id: 's1',
      name: '奖品 A',
      prizes: [{ id: 'a1', name: '一等奖', count: 2, weight: 1, level: '1' }],
    },
  ],
  lotteries: [
    {
      id: 'g1',
      title: '年会',
      mode: 'prize-person',
      stage: 'wheel',
      stageConfig: {},
      uniqueWinner: true,
      rosterId: 'n1',
      rosterName: '名单 A',
      prizeSetId: 's1',
      prizeSetName: '奖品 A',
      prizes: [{ id: 'a1', name: '一等奖', count: 2, weight: 1, level: '1' }],
      people: [{ id: 'p1', name: '张三', dept: '研发', employeeId: 'A1' }],
      results: [
        {
          id: 'r1',
          at: 1,
          mode: 'prize-person',
          prizeId: 'a1',
          prizeName: '一等奖',
          requested: 1,
          winners: [{ personId: 'p1', name: '张三', dept: '研发', employeeId: 'A1' }],
        },
      ],
      excluded: [],
    },
  ],
};

test('v3 存档迁移成 v5：名单与奖品变池，记录变 picks', () => {
  const app = migrate(v3App);
  assert.equal(app.version, 5);
  assert.equal(app.pools.length, 2);
  assert.deepEqual(
    app.pools.map((pool) => pool.kind),
    ['people', 'prizes'],
  );

  const lottery = app.lotteries[0];
  assert.equal(lottery.protocol, 'prize-person');
  assert.deepEqual(lottery.slots, { person: 'n1', prize: 's1' });
  assert.deepEqual(
    lottery.pools.map((pool) => 'role' in pool),
    [false, false],
  );
  // 名额就是容量
  assert.equal(lottery.pools[1].entries[0].capacity, 2);
  assert.equal(lottery.pools[0].entries[0].capacity, 1);
  assert.deepEqual(lottery.pools[0].entries[0].meta, { dept: '研发', employeeId: 'A1' });

  const result = lottery.results[0];
  assert.equal(result.picks.length, 2);
  assert.deepEqual(
    result.picks.map((pick) => pick.slot),
    ['prize', 'person'],
  );
  assert.equal(result.picks[1].meta.dept, '研发');
});

test('v3 里关掉不重复中奖：人的容量转成不限', () => {
  const app = migrate({
    ...v3App,
    lotteries: [{ ...v3App.lotteries[0], uniqueWinner: false }],
  });
  assert.equal(app.lotteries[0].pools[0].entries[0].capacity, null);
});

test('v1 单场存档也能迁', () => {
  const app = migrate({
    title: '旧活动',
    mode: 'person-prize',
    prizes: [{ id: 'a1', name: '一等奖', count: 1 }],
    people: [{ id: 'p1', name: '张三' }],
    results: [],
  });
  assert.equal(app.lotteries.length, 1);
  assert.equal(app.pools.length, 2);
  assert.equal(app.lotteries[0].protocol, 'person-prize');
});

test('空存档不炸', () => {
  assert.deepEqual(migrate(null).lotteries, []);
  assert.deepEqual(migrate({}).lotteries, []);
});

/** v4 的一份存档：池带 role，没有 slots。 */
const v4App = {
  version: 4,
  lastView: 'lotteries',
  pools: [
    { id: 'k1', name: '研发名单', kind: 'people', entries: [{ id: 'p1', name: '张三' }] },
    { id: 'k2', name: '市场名单', kind: 'people', entries: [{ id: 'p1', name: '李四' }] },
    { id: 'k3', name: '奖品', kind: 'prizes', entries: [{ id: 'a1', name: '一等奖', capacity: 1 }] },
  ],
  lotteries: [
    {
      id: 'g1',
      title: '年会',
      protocol: 'prize-person',
      stage: 'wheel',
      stageConfig: {},
      pools: [
        {
          id: 'k1',
          name: '研发名单',
          kind: 'people',
          role: 'people',
          entries: [{ id: 'p1', name: '张三' }],
        },
        {
          id: 'k2',
          name: '市场名单',
          kind: 'people',
          role: 'people',
          entries: [{ id: 'p1', name: '李四' }],
        },
        {
          id: 'k3',
          name: '奖品',
          kind: 'prizes',
          role: 'prizes',
          entries: [{ id: 'a1', name: '一等奖', capacity: 1 }],
        },
      ],
      results: [
        {
          id: 'r1',
          at: 1,
          protocol: 'prize-person',
          picks: [
            { slot: 'prize', poolId: 'k3', entryId: 'a1', name: '一等奖' },
            { slot: 'person', poolId: 'k2', entryId: 'p1', name: '李四' },
          ],
        },
      ],
      excluded: [],
    },
  ],
};

test('v4→v5：绑定由 role 推出来，池 id 与 picks 不变', () => {
  const app = migrate(v4App);
  assert.equal(app.version, 5);
  const lottery = app.lotteries[0];
  assert.deepEqual(lottery.slots, { person: 'k1', prize: 'k3' });
  // 池 id 一律保留原值，旧记录的 poolId 必须还命中
  assert.deepEqual(
    lottery.pools.map((pool) => pool.id),
    ['k1', 'k2', 'k3'],
  );
  assert.deepEqual(lottery.results[0].picks.map((pick) => pick.poolId), ['k3', 'k2']);
  assert.deepEqual(
    lottery.pools.map((pool) => 'role' in pool),
    [false, false, false],
  );
});

test('v4 同 role 多池：第一个进绑定，其余留在池里等分配', () => {
  const lottery = migrate(v4App).lotteries[0];
  assert.equal(lottery.pools.length, 3, '多余的池不能被丢掉');
  assert.equal(lottery.slots.person, 'k1');
  assert.equal(lottery.slots.prize, 'k3');
});

test('v4→v5 幂等：迁两次深度相等', () => {
  // 只比较「第一次迁出来的这一份」的再迁 —— 重新从 v4 起迁会拿到新的
  // createdAt/updatedAt，那是时钟不是迁移逻辑
  const once = migrate(v4App);
  const twice = migrate(once);
  assert.deepEqual(twice, once);
  assert.deepEqual(migrate(twice), twice);
});

test('版本号丢失但结构对：当作 v4 迁移', () => {
  const { version, ...rest } = v4App;
  assert.equal(version, 4);
  const lottery = migrate(rest).lotteries[0];
  assert.deepEqual(lottery.slots, { person: 'k1', prize: 'k3' });
});

test('同名往后排', () => {
  assert.equal(uniqueName([], '年会'), '年会');
  assert.equal(uniqueName([{ name: '年会' }], '年会'), '年会 (1)');
  assert.equal(uniqueName([{ name: '年会' }, { name: '年会 (1)' }], '年会'), '年会 (2)');
});

test('新建抽奖：把选中的池复制一份，之后各改各的', () => {
  let app = createApp();
  let roster;
  [app, roster] = addPool(app, { name: '名单', kind: 'people', entries: [{ name: '张三' }] });
  let prizes;
  [app, prizes] = addPool(app, {
    name: '奖品',
    kind: 'prizes',
    entries: [{ name: '一等奖', capacity: 1 }],
  });

  const [next, lottery] = createLottery(app, {
    title: '年会',
    poolIds: [roster.id, prizes.id],
    slots: { person: roster.id, prize: prizes.id },
  });
  assert.equal(next.lotteries.length, 1);
  assert.equal(lottery.pools.length, 2);
  assert.equal(lottery.pools[1].entries[0].capacity, 1);
  // 给了谁就绑谁，不按 kind 推
  assert.deepEqual(lottery.slots, { person: roster.id, prize: prizes.id });

  // 改素材不影响这场
  const after = { ...next, pools: next.pools.map((pool) => ({ ...pool, name: '改过了' })) };
  assert.equal(lotteryById(after, lottery.id).pools[0].name, '名单');
});

test('新建抽奖：显式绑定可以指到第二个同 kind 的池', () => {
  let app = createApp();
  let research;
  let market;
  let prizes;
  [app, research] = addPool(app, { name: '研发', kind: 'people', entries: [{ name: '张三' }] });
  [app, market] = addPool(app, { name: '市场', kind: 'people', entries: [{ name: '李四' }] });
  [app, prizes] = addPool(app, { name: '奖品', kind: 'prizes', entries: [{ name: '一等奖' }] });

  const [, lottery] = createLottery(app, {
    poolIds: [research.id, market.id, prizes.id],
    slots: { person: market.id, prize: prizes.id },
  });
  assert.equal(lottery.slots.person, market.id);
  assert.equal(poolOfSlot(lottery, 'person').name, '市场');
});

test('改绑定：换到另一个池，换完立刻能抽', () => {
  let app = createApp();
  let research;
  let market;
  let prizes;
  [app, research] = addPool(app, { name: '研发', kind: 'people', entries: [{ name: '张三' }] });
  [app, market] = addPool(app, { name: '市场', kind: 'people', entries: [{ name: '李四' }] });
  [app, prizes] = addPool(app, { name: '奖品', kind: 'prizes', entries: [{ name: '一等奖' }] });
  const [next, lottery] = createLottery(app, { poolIds: [research.id, market.id, prizes.id] });

  const swapped = setLotteryBinding(next, lottery.id, 'person', market.id);
  const after = lotteryById(swapped, lottery.id);
  assert.equal(after.slots.person, market.id);
  assert.equal(poolOfSlot(after, 'person').name, '市场');

  // 解绑后抽不动
  const unbound = lotteryById(setLotteryBinding(swapped, lottery.id, 'person', null), lottery.id);
  assert.equal(unbound.slots.person, null);
  assert.equal(lotteryStatus({ ...unbound, results: [] }), 'idle');
});

test('换抽法后绑定跟着键走，认不出的值落成未绑定', () => {
  let app = createApp();
  let prizes;
  [app, prizes] = addPool(app, { name: '奖品', kind: 'prizes', entries: [{ name: '一等奖' }] });
  const [next, lottery] = createLottery(app, { poolIds: [prizes.id] });
  const after = lotteryById(
    updateLottery(next, lottery.id, { protocol: 'person-prize', slots: { person: '不存在' } }),
    lottery.id,
  );
  assert.deepEqual(Object.keys(after.slots).sort(), ['person', 'prize']);
  assert.equal(after.slots.person, null, '指到不存在的池要落成未绑定');
  assert.equal(after.slots.prize, prizes.id);
});

test('加池与删池：绑着的不许删，抽过的也不许删', () => {
  let app = createApp();
  let prizes;
  [app, prizes] = addPool(app, { name: '奖品', kind: 'prizes', entries: [{ name: '一等奖' }] });
  const [next, lottery] = createLottery(app, { poolIds: [prizes.id] });

  const [withPool, added] = addLotteryPool(next, lottery.id, { name: '研发', kind: 'people' });
  assert.equal(added.kind, 'people');
  assert.equal(lotteryById(withPool, lottery.id).pools.length, 2);

  // 绑着的时候不许删
  const bound = setLotteryBinding(withPool, lottery.id, 'person', added.id);
  const [stillThere, error] = removeLotteryPool(bound, lottery.id, added.id);
  assert.match(error, /还填着某个槽/);
  assert.equal(lotteryById(stillThere, lottery.id).pools.length, 2);

  // 解绑后能删
  const unbound = setLotteryBinding(bound, lottery.id, 'person', null);
  const [removed, ok] = removeLotteryPool(unbound, lottery.id, added.id);
  assert.equal(ok, null);
  assert.equal(lotteryById(removed, lottery.id).pools.length, 1);
});

test('删池：开奖记录里还有它的条目时拦住', () => {
  let app = createApp();
  let roster;
  let prizes;
  [app, roster] = addPool(app, { name: '名单', kind: 'people', entries: [{ name: '张三' }] });
  [app, prizes] = addPool(app, { name: '奖品', kind: 'prizes', entries: [{ name: '一等奖' }] });
  const [next, lottery] = createLottery(app, {
    poolIds: [roster.id, prizes.id],
    slots: { person: roster.id, prize: prizes.id },
  });
  const drawn = drawOnce(runState(lottery), { fixed: { prize: 'a1' }, random: () => 0 });
  const written = lotteryById(writeRunState(next, lottery.id, drawn.state), lottery.id);

  // 先把奖品池解绑，再试着删它
  const unbound = setLotteryBinding({ lotteries: [written], pools: [] }, lottery.id, 'prize', null);
  const [, error] = removeLotteryPool(unbound, lottery.id, prizes.id);
  assert.match(error, /开奖记录里还有这个池/);
});

test('一次抽几个：缺省跟形态走，设了就用设的', () => {
  let app = createApp();
  let prizes;
  [app, prizes] = addPool(app, { name: '奖品', kind: 'prizes', entries: [{ name: '一等奖', capacity: 9 }] });
  const [next, lottery] = createLottery(app, { poolIds: [prizes.id] });
  assert.equal(lottery.batchSize, null);
  assert.equal(lottery.batch, 1, '三种形态都没声明 batch，缺省是 1');

  const three = lotteryById(updateLottery(next, lottery.id, { batchSize: 3 }), lottery.id);
  assert.equal(three.batchSize, 3);
  assert.equal(three.batch, 3);

  const capped = lotteryById(updateLottery(next, lottery.id, { batchSize: 999 }), lottery.id);
  assert.equal(capped.batch, 50, '上限 50');
});

test('不重复中奖：开关直接改人的容量', () => {
  let app = createApp();
  let roster;
  [app, roster] = addPool(app, { name: '名单', kind: 'people', entries: [{ name: '张三' }] });
  const [next, lottery] = createLottery(app, { poolIds: [roster.id] });
  assert.equal(isUniqueWinner(lottery), true);

  const off = setUniqueWinner(next, lottery.id, false);
  assert.equal(isUniqueWinner(lotteryById(off, lottery.id)), false);
  assert.equal(lotteryById(off, lottery.id).pools[0].entries[0].capacity, null);
});

test('摘要与状态：抽不动了才算完成', () => {
  let app = createApp();
  let roster;
  [app, roster] = addPool(app, { name: '名单', kind: 'people', entries: [{ name: '张三' }] });
  let prizes;
  [app, prizes] = addPool(app, {
    name: '奖品',
    kind: 'prizes',
    entries: [{ name: '一等奖', capacity: 1 }],
  });
  const [next, lottery] = createLottery(app, {
    poolIds: [roster.id, prizes.id],
    slots: { person: roster.id, prize: prizes.id },
  });
  assert.equal(lotteryStatus(lottery), 'idle');
  const summary = lotterySummary(lottery);
  assert.equal(summary.total, 1);
  assert.equal(summary.handed, 0);
  assert.equal(summary.unlimited, false);
  assert.deepEqual(summary.slots.map((slot) => slot.key), ['prize', 'person']);
  assert.deepEqual(summary.slots.map((slot) => slot.entries), [1, 1]);

  const drawn = drawOnce(runState(lottery), { fixed: { prize: 'a1' }, random: () => 0 });
  const written = writeRunState(next, lottery.id, drawn.state);
  const after = lotteryById(written, lottery.id);
  assert.equal(lotterySummary(after).handed, 1);
  assert.equal(lotteryStatus(after), 'done');

  assert.deepEqual(lotteryById(resetLottery(written, lottery.id), lottery.id).results, []);
});

test('换抽法：配不上的形态自动换掉', () => {
  let app = createApp();
  let roster;
  [app, roster] = addPool(app, { name: '名单', kind: 'people', entries: [{ name: '张三' }] });
  let prizes;
  [app, prizes] = addPool(app, {
    name: '奖品',
    kind: 'prizes',
    entries: [{ name: '一等奖', capacity: 1 }],
  });
  const [next, lottery] = createLottery(app, {
    poolIds: [roster.id, prizes.id],
    slots: { person: roster.id, prize: prizes.id },
    stage: 'wheel',
  });
  const changed = lotteryById(updateLottery(next, lottery.id, { protocol: 'person-prize' }), lottery.id);
  assert.equal(changed.protocol, 'person-prize');
  assert.equal(changed.pools.length, 2);
});

test('抽奖包往返：导出再导入还是同一场', async () => {
  let app = createApp();
  let roster;
  [app, roster] = addPool(app, {
    name: '名单',
    kind: 'people',
    entries: [{ name: '张三', meta: { dept: '研发', employeeId: 'A1' } }, { name: '李四' }],
  });
  let prizes;
  [app, prizes] = addPool(app, {
    name: '奖品',
    kind: 'prizes',
    entries: [
      { name: '一等奖', capacity: 1, weight: 1, meta: { level: '1' } },
      { name: '二等奖', capacity: 3, weight: 1 },
    ],
  });
  const [next, lottery] = createLottery(app, {
    title: '年会',
    poolIds: [roster.id, prizes.id],
    slots: { person: roster.id, prize: prizes.id },
    stage: 'wheel',
  });
  const drawn = drawOnce(runState(lottery), { fixed: { prize: 'a1' }, random: () => 0 });
  const withResults = lotteryById(writeRunState(next, lottery.id, drawn.state), lottery.id);

  const bytes = await buildLotteryWorkbook(withResults);
  const parsed = await readLotteryWorkbook(bytes);

  assert.equal(parsed.meta.title, '年会');
  assert.equal(parsed.meta.protocol, 'prize-person');
  assert.equal(parsed.meta.stage, 'wheel');
  assert.equal(parsed.pools.length, 2);
  assert.equal(parsed.pools[0].entries.length, 2);
  assert.equal(parsed.pools[1].entries[0].capacity, 1);
  assert.equal(parsed.pools[1].entries[1].capacity, 3);
  assert.equal(parsed.results.length, 1);
  assert.equal(parsed.results[0].picks.length, 2);
  assert.deepEqual(
    parsed.results[0].picks.map((pick) => pick.slot),
    ['prize', 'person'],
  );
});

test('抽奖包往返：不限量的名额不会被写成 1', async () => {
  let app = createApp();
  let prizes;
  [app, prizes] = addPool(app, {
    name: '奖品',
    kind: 'prizes',
    entries: [
      { name: '阳光普照', capacity: null },
      { name: '一等奖', capacity: 2 },
    ],
  });
  const [, lottery] = createLottery(app, { title: '不限量', protocol: 'person-prize', stage: 'slot', poolIds: [prizes.id] });

  const parsed = await readLotteryWorkbook(await buildLotteryWorkbook(lottery));
  assert.equal(parsed.pools[0].entries[0].capacity, null, '不限量要原样回来');
  assert.equal(parsed.pools[0].entries[1].capacity, 2);
  assert.deepEqual(parsed.problems, [], '不限量是合法写法，不该报读不出正数');
});

/** 一场里两个名单池 + 一个奖品池，是「一个池还是两个池」里最难的那一种。 */
async function twoRostersLottery() {
  let app = createApp();
  let research;
  let market;
  let prizes;
  [app, research] = addPool(app, {
    name: '研发名单',
    kind: 'people',
    entries: [{ name: '张三', meta: { dept: '研发' } }, { name: '赵六' }],
  });
  [app, market] = addPool(app, {
    name: '市场名单',
    kind: 'people',
    entries: [{ name: '李四', meta: { dept: '市场' } }],
  });
  [app, prizes] = addPool(app, {
    name: '年终奖',
    kind: 'prizes',
    entries: [
      { name: '一等奖', capacity: 1 },
      { name: '二等奖', capacity: 2 },
    ],
  });
  const [next, lottery] = createLottery(app, {
    title: '双池',
    poolIds: [research.id, market.id, prizes.id],
    slots: { person: market.id, prize: prizes.id },
    batchSize: 2,
  });
  return { next, lottery };
}

test('两个同 kind 的池：导出后表名互不相同，往返仍是两个', async () => {
  const { lottery } = await twoRostersLottery();
  const parsed = await readLotteryWorkbook(await buildLotteryWorkbook(lottery));

  const names = parsed.sheets.map((sheet) => sheet.name);
  assert.equal(new Set(names).size, names.length, '两张表不能同名');
  assert.equal(parsed.pools.length, 3);
  assert.deepEqual(parsed.pools.map((pool) => pool.kind).sort(), ['people', 'people', 'prizes']);
  assert.deepEqual(
    parsed.pools.filter((pool) => pool.kind === 'people').map((pool) => pool.name).sort(),
    ['市场名单', '研发名单'],
    '池名靠「池名」列还原，不靠被截断的表名',
  );
});

test('同 kind 多池：池 id 与条目 id 都不重复', async () => {
  const { lottery } = await twoRostersLottery();
  const parsed = await readLotteryWorkbook(await buildLotteryWorkbook(lottery));

  const ids = parsed.pools.map((pool) => pool.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids.filter((id) => id.startsWith('p-')).sort(), ['p-1', 'p-2'], 'id 不许有断层');

  const entryIds = parsed.pools.flatMap((pool) => pool.entries.map((entry) => entry.id));
  assert.equal(new Set(entryIds).size, entryIds.length, '条目 id 跨池也不能撞');
});

test('绑定与一次抽几个随抽奖包往返', async () => {
  const { lottery } = await twoRostersLottery();
  const parsed = await readLotteryWorkbook(await buildLotteryWorkbook(lottery));

  const market = parsed.pools.find((pool) => pool.name === '市场名单');
  const prizes = parsed.pools.find((pool) => pool.name === '年终奖');
  assert.deepEqual(parsed.meta.slots, { person: market.id, prize: prizes.id });
  assert.equal(parsed.meta.batchSize, 2);
});

test('表名去重：重名加后缀，与「设置」「开奖记录」撞名也躲开', () => {
  const sheets = uniqueSheetNames(
    [
      { name: '名单', rows: [] },
      { name: '名单', rows: [] },
      { name: '开奖记录', rows: [] },
      { name: '奖'.repeat(40), rows: [] },
    ],
    ['设置', '开奖记录'],
  );
  assert.deepEqual(
    sheets.map((sheet) => sheet.name).slice(0, 3),
    ['名单', '名单 2', '开奖记录 2'],
  );
  assert.ok(sheets[3].name.length <= 31, '超长名字要截到 31 字以内');
});test('名额列写「不限」：读成不限，写 0 才报提示', async () => {
  const workbook = await buildWorkbook([
    {
      name: '奖品',
      rows: [
        ['奖品名称', '数量'].map(text),
        [text('阳光普照'), text('不限')],
        [text('纪念奖'), number(0)],
      ],
    },
  ]);
  const parsed = await readLotteryWorkbook(workbook);
  assert.equal(parsed.pools[0].entries[0].capacity, null);
  assert.equal(parsed.pools[0].entries[1].capacity, 1);
  assert.equal(parsed.problems.length, 1);
  assert.match(parsed.problems[0].message, /读不出正数/);
});

test('形态配置按形态各存一份', () => {
  const defaults = stageDefaults('wheel');
  assert.equal(typeof defaults.duration, 'number');
  const config = normalizeConfig('wheel', { duration: 999, skin: '不存在' });
  // 超出范围的数收到上下限，认不出的选项退回默认
  assert.equal(config.duration, 8);
  assert.equal(config.skin, defaults.skin);
});

test('旧存档的作废清单：裸条目 id 补成「池/条目」', () => {
  const pools = [
    { id: 'k1', name: '名单', kind: 'people', entries: [{ id: 'p1', name: '张三' }] },
    { id: 'k2', name: '奖品', kind: 'prizes', entries: [{ id: 'a1', name: '一等奖' }] },
  ];
  const app = migrate({
    version: 5,
    pools,
    lotteries: [
      {
        id: 'g1',
        title: '年会',
        protocol: 'prize-person',
        pools,
        slots: { prize: 'k2', person: 'k1' },
        results: [],
        excluded: ['p1'],
      },
    ],
  });
  assert.deepEqual(app.lotteries[0].excluded, ['k1/p1']);
});
