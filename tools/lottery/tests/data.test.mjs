import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addPrizeSet,
  addRoster,
  createApp,
  createLottery,
  lotteryStatus,
  lotterySummary,
  migrate,
  resetLottery,
  uniqueName,
} from '../site/src/data.js';
import { MODE } from '../site/src/engine.js';
import { normalizeConfig, stageDefaults } from '../site/src/stages/index.js';
import { buildLotteryWorkbook, readLotteryWorkbook } from '../site/src/workbook.js';

const v2App = {
  version: 2,
  lastView: 'home',
  lastActivityId: 'g1',
  rosters: [{ id: 'n1', name: '名单 A', people: [{ id: 'p1', name: '张三' }] }],
  prizeSets: [{ id: 's1', name: '奖品 A', prizes: [{ id: 'a1', name: '一等奖', count: 2 }] }],
  activities: [
    {
      id: 'g1',
      title: '年会',
      mode: MODE.PRIZE,
      stage: 'cards',
      batch: 2,
      uniqueWinner: true,
      rosterId: 'n1',
      rosterName: '名单 A',
      prizeSetId: 's1',
      prizeSetName: '奖品 A',
      prizes: [{ id: 'a1', name: '一等奖', count: 2, weight: 1, level: '' }],
      people: [{ id: 'p1', name: '张三', dept: '', employeeId: '' }],
      results: [
        {
          id: 'r1',
          at: 1,
          mode: MODE.PRIZE,
          prizeId: 'a1',
          prizeName: '一等奖',
          requested: 1,
          winners: [{ personId: 'p1', name: '张三', dept: '', employeeId: '' }],
        },
      ],
      excluded: [],
      createdAt: 1,
    },
  ],
};

test('v2 存档迁移成 v3：活动变抽奖，素材库保留', () => {
  const app = migrate(v2App);
  assert.equal(app.version, 3);
  assert.equal(app.lotteries.length, 1);
  assert.equal(app.rosters.length, 1);
  assert.equal(app.prizeSets.length, 1);
  assert.equal(app.lastLotteryId, 'g1');
  assert.equal(app.lotteries[0].title, '年会');
  // v2 时的 cards 已经不在册，按兜底落到默认形态
  assert.equal(app.lotteries[0].stage, 'wheel');
  assert.equal(app.lotteries[0].stageConfig.wheel.skin, 'red-gold');
  assert.equal(app.lotteries[0].results.length, 1);
});

test('同名按文件系统习惯往后排', () => {
  const items = [{ name: '年会' }, { name: '年会 (1)' }];
  assert.equal(uniqueName(items, '年会'), '年会 (2)');
  assert.equal(uniqueName(items, '摊位'), '摊位');
});

test('形态配置按声明收口', () => {
  const config = normalizeConfig('wheel', { duration: -20, sound: 'yes', skin: 'mint', 多余: 1 });
  assert.equal(config.duration, 2);
  assert.equal(config.sound, false);
  assert.equal(config.skin, 'mint');
  assert.equal('多余' in config, false);
  // 认不出的样式退回默认那一套，盘面不会因为没有配色而空着
  assert.equal(normalizeConfig('wheel', { skin: 'nope' }).skin, 'red-gold');
  assert.deepEqual(normalizeConfig('slot', {}), stageDefaults('slot'));
});

test('新建、进度与重新抽奖', () => {
  let app = createApp();
  [app] = addRoster(app, { name: '名单', people: [{ name: '张三' }, { name: '李四' }] });
  [app] = addPrizeSet(app, {
    name: '奖品',
    prizes: [
      { name: '一等奖', count: 1 },
      { name: '二等奖', count: 1 },
    ],
  });
  const [next, lottery] = createLottery(app, {
    title: '年会',
    mode: MODE.PRIZE,
    rosterId: app.rosters[0].id,
    prizeSetId: app.prizeSets[0].id,
  });
  app = next;
  assert.equal(app.lotteries.length, 1);
  assert.deepEqual(lotterySummary(lottery), { total: 2, handed: 0, people: 2, prizes: 2 });
  assert.equal(lotteryStatus(lottery), 'idle');

  const drawn = {
    ...lottery,
    results: [
      {
        id: 'r1',
        at: 1,
        mode: MODE.PRIZE,
        prizeId: lottery.prizes[0].id,
        prizeName: lottery.prizes[0].name,
        requested: 1,
        winners: [{ personId: lottery.people[0].id, name: '张三', dept: '', employeeId: '' }],
      },
    ],
  };
  app = { ...app, lotteries: [drawn] };
  assert.equal(lotteryStatus(drawn), 'running');

  app = resetLottery(app, drawn.id);
  assert.equal(app.lotteries[0].results.length, 0);
  assert.equal(app.lotteries[0].prizes.length, 2);
  assert.equal(app.lotteries[0].people.length, 2);
});

test('抽奖包导出再导入：人数、奖项、进度、形态配置都回来了', async () => {
  let app = createApp();
  [app] = addRoster(app, { name: '名单', people: [{ name: '张三', dept: '研发', employeeId: 'A1' }] });
  [app] = addPrizeSet(app, { name: '奖品', prizes: [{ name: '一等奖', count: 2 }] });
  const [next, lottery] = createLottery(app, {
    title: '年会',
    mode: MODE.PRIZE,
    stage: 'wheel',
    stageConfig: { wheel: { skin: 'ink-gold', duration: 3.5, sound: false } },
    rosterId: app.rosters[0].id,
    prizeSetId: app.prizeSets[0].id,
  });
  app = next;

  const drafted = {
    ...lottery,
    results: [
      {
        id: 'r1',
        at: Date.now(),
        mode: MODE.PRIZE,
        prizeId: lottery.prizes[0].id,
        prizeName: '一等奖',
        requested: 1,
        winners: [{ personId: lottery.people[0].id, name: '张三', dept: '研发', employeeId: 'A1' }],
      },
    ],
  };

  const bytes = await buildLotteryWorkbook(drafted);
  const parsed = await readLotteryWorkbook(bytes);

  assert.equal(parsed.meta.title, '年会');
  assert.equal(parsed.meta.mode, MODE.PERSON);
  assert.equal(parsed.meta.stage, 'wheel');
  assert.equal(parsed.meta.stageConfig.wheel.skin, 'ink-gold');
  // 三种形态都是「人抽奖品」，一次一人一奖，没有 batch
  assert.equal(parsed.meta.batch, 1);
  assert.equal(parsed.people.length, 1);
  assert.equal(parsed.prizes.length, 1);
  assert.equal(parsed.prizes[0].count, 2);
  assert.equal(parsed.results.length, 1);
  assert.equal(parsed.results[0].winners[0].name, '张三');
});
