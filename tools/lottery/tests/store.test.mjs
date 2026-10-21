import assert from 'node:assert/strict';
import test from 'node:test';

// store.js 只碰 window.localStorage 与 window.setTimeout，给个假的就能在 node 里跑
const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  },
  setTimeout,
  clearTimeout,
};

const { loadApp, saveApp, flushApp } = await import('../site/src/store.js');

const V5 = 'lottery.app.v5';
const V4 = 'lottery.app.v4';
const V3 = 'lottery.app.v3';

const v3App = {
  version: 3,
  rosters: [
    { id: 'n1', name: '名单 A', people: [{ id: 'p1', name: '张三', dept: '研发', employeeId: 'A1' }] },
  ],
  prizeSets: [
    { id: 's1', name: '奖品 A', prizes: [{ id: 'a1', name: '一等奖', count: 2, weight: 1, level: '1' }] },
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
      prizeSetId: 's1',
      prizes: [{ id: 'a1', name: '一等奖', count: 2, weight: 1, level: '1' }],
      people: [{ id: 'p1', name: '张三', dept: '研发', employeeId: 'A1' }],
      results: [],
      excluded: [],
    },
  ],
};

const v4App = {
  version: 4,
  lastView: 'lotteries',
  pools: [
    { id: 'k1', name: '研发名单', kind: 'people', entries: [{ id: 'p1', name: '张三' }] },
    { id: 'k2', name: '奖品', kind: 'prizes', entries: [{ id: 'a1', name: '一等奖' }] },
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
          name: '奖品',
          kind: 'prizes',
          role: 'prizes',
          entries: [{ id: 'a1', name: '一等奖' }],
        },
      ],
      results: [],
      excluded: [],
    },
  ],
};

function reset() {
  store.clear();
}

test('v3 存档：迁成 v5 落盘，旧键留一份备份再删掉', () => {
  reset();
  store.set(V3, JSON.stringify(v3App));

  const app = loadApp();
  assert.equal(app.version, 5);
  assert.equal(app.lotteries.length, 1);

  const saved = JSON.parse(store.get(V5));
  assert.equal(saved.version, 5);
  assert.deepEqual(
    saved.pools.map((pool) => pool.kind),
    ['people', 'prizes'],
  );
  assert.deepEqual(saved.lotteries[0].slots, { person: 'n1', prize: 's1' });

  assert.equal(store.has(V3), false, '原键要删掉，否则每次打开都迁一遍');
  assert.deepEqual(JSON.parse(store.get(`${V3}.backup`)), v3App, '备份是 v3 原文');
});

test('v4 存档：迁成 v5 落盘，绑定由 role 推出来', () => {
  reset();
  store.set(V4, JSON.stringify(v4App));

  const app = loadApp();
  assert.equal(app.version, 5);
  assert.deepEqual(app.lotteries[0].slots, { person: 'k1', prize: 'k2' });

  const saved = JSON.parse(store.get(V5));
  assert.deepEqual(saved.lotteries[0].slots, { person: 'k1', prize: 'k2' });
  assert.equal(store.has(V4), false);
  assert.deepEqual(JSON.parse(store.get(`${V4}.backup`)), v4App, '备份是 v4 原文');
});

test('已有 v5：不再动旧键，也不再迁一遍', () => {
  reset();
  store.set(V3, JSON.stringify(v3App));
  loadApp();

  const second = loadApp();
  assert.equal(second.version, 5);
  assert.equal(store.has(`${V3}.backup`), true);
  assert.equal(store.has(V3), false);
});

test('备份已经存在时不覆盖：最早那份才是退路', () => {
  reset();
  const older = { version: 3, rosters: [], prizeSets: [], lotteries: [], note: '更早的一份' };
  store.set(`${V3}.backup`, JSON.stringify(older));
  store.set(V3, JSON.stringify(v3App));

  loadApp();
  assert.deepEqual(JSON.parse(store.get(`${V3}.backup`)), older);
  assert.equal(store.has(V3), false);
});

test('空存档：新建 v5，不写盘', () => {
  reset();
  const app = loadApp();
  assert.equal(app.version, 5);
  assert.equal(store.has(V5), false);
});

test('存一份：saveApp 连写只在空闲后落一次，flushApp 立即写', async () => {
  reset();
  const app = loadApp();
  app.lastView = 'pools';
  saveApp(app);
  app.lastView = 'lotteries';
  saveApp(app);
  assert.equal(store.has(V5), false, '还没到点');

  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(JSON.parse(store.get(V5)).lastView, 'lotteries');

  app.lastView = 'pools';
  flushApp(app);
  assert.equal(JSON.parse(store.get(V5)).lastView, 'pools', 'flush 不等');
});
