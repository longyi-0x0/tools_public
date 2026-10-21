/**
 * 冒烟：形式层的编排。
 *
 * 库要 canvas，jsdom 给不了，所以这里换一份假库：只记录 play / stop 的次序与
 * 参数。这样"几个盘、同时转还是依次转、停在第几格"都能在 DOM 里跑一遍，
 * 真正的出图留给浏览器。
 *
 * 需要 jsdom：`node tests/smoke/forms.mjs`。
 */

import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);

const { createPool, indexPools } = await import('../../site/src/domain/pool.js');
const { createDraw } = await import('../../site/src/domain/draw.js');
const { decide } = await import('../../site/src/domain/engine.js');
const { viewOf } = await import('../../site/src/domain/session.js');
const { createLedger } = await import('../../site/src/domain/ledger.js');
const { planOf, mountForm } = await import('../../site/src/forms/registry.js');

const log = [];

class FakeBoard {
  constructor(selector) {
    this.id = selector.replace(/[#\-\d]/g, '').replace(/[^a-z]/gi, '');
    this.step = 0;
  }
  play() {
    log.push(`play:${this.id}`);
    this.step = 1;
  }
  stop(arg) {
    log.push(`stop:${this.id}:${JSON.stringify(arg)}`);
    this.step = 2;
    setTimeout(() => {
      this.step = 0;
    }, 5);
  }
}

const library = { LuckyWheel: FakeBoard, LuckyGrid: FakeBoard, SlotMachine: FakeBoard };

const names = Array.from({ length: 30 }, (_, i) => ({ id: `e${i}`, label: `名字${i}` }));
const pools = indexPools([createPool({ id: 'p1', entries: names }), createPool({ id: 'p2', entries: names })]);

function planFor(draw, seed = 's') {
  const round = decide({ draw, pools, ledger: createLedger(), seed });
  return { round, plan: planOf(round, viewOf(round, pools)) };
}

async function runPlan(plan) {
  const root = document.createElement('div');
  document.body.append(root);
  const form = await mountForm(root, plan, { library, spinMs: 0 });
  await form.run();
  form.dispose();
}

{
  const draw = createDraw({
    id: 'd',
    slots: [{ key: 'slot1', poolId: 'p1' }],
    form: { type: 'wheel' },
    rule: { slot1: { count: 3 } },
  });
  const { round, plan } = planFor(draw);
  log.length = 0;
  await runPlan(plan);

  const stops = log.filter((line) => line.startsWith('stop:'));
  assert.equal(stops.length, 3, '抽三个就转三次');

  // 停位是盘面样本里的下标，不是全体候选的下标。
  const entries = plan.boards[0].entries;
  const stopped = stops.map((line) => entries[JSON.parse(line.split(':')[2])].id);
  assert.deepEqual(stopped, round.picks.map((pick) => pick.entryId));
  console.log('单盘：抽几个转几次，停位对得上');
}

{
  const slots = [{ key: 'slot1', poolId: 'p1' }, { key: 'slot2', poolId: 'p2' }];
  const together = planFor(createDraw({ id: 'd', slots, form: { type: 'wheel' }, mode: 'independent' }));
  log.length = 0;
  await runPlan(together.plan);

  const firstStop = log.findIndex((line) => line.startsWith('stop:'));
  const playsBeforeStop = log.slice(0, firstStop).filter((line) => line.startsWith('play:'));
  assert.equal(playsBeforeStop.length, 2, '同时抽：两个盘都先转起来');
  console.log('两个盘同时抽：两盘一起转');
}

{
  const slots = [{ key: 'slot1', poolId: 'p1' }, { key: 'slot2', poolId: 'p2' }];
  const oneByOne = planFor(createDraw({ id: 'd', slots, form: { type: 'wheel' }, mode: 'a-then-b' }));
  log.length = 0;
  await runPlan(oneByOne.plan);

  const plays = log.filter((line) => line.startsWith('play:'));
  const stops = log.filter((line) => line.startsWith('stop:'));
  assert.equal(plays.length, 2);
  assert.equal(stops.length, 2);
  assert.ok(log.indexOf(stops[0]) < log.indexOf(plays[1]), '依次抽：前一个停了后一个才转');
  console.log('两个盘依次抽：前一个停稳后一个才转');
}

{
  const draw = createDraw({
    id: 'd',
    slots: [{ key: 'slot1', poolId: 'p1' }],
    form: { type: 'slot', options: { columns: 3 } },
    rule: { slot1: { hitRate: 1 } },
  });
  const { round, plan } = planFor(draw);
  log.length = 0;
  await runPlan(plan);

  const stop = JSON.parse(log.find((line) => line.startsWith('stop:')).split(':')[2]);
  assert.equal(stop.length, 3);
  assert.equal(new Set(stop).size, 1, '中奖时三列同一个索引');
  assert.equal(round.picks.length, 1);
  console.log('老虎机中奖：三列停同一个');
}

{
  const draw = createDraw({
    id: 'd',
    slots: [{ key: 'slot1', poolId: 'p1' }],
    form: { type: 'slot', options: { columns: 3 } },
    rule: { slot1: { hitRate: 0 } },
  });
  const { round, plan } = planFor(draw);
  log.length = 0;
  await runPlan(plan);

  const stop = JSON.parse(log.find((line) => line.startsWith('stop:')).split(':')[2]);
  assert.equal(round.win, false);
  assert.equal(new Set(stop).size, 3, '未中奖时三列互不相同');
  console.log('老虎机未中奖：三列各停各的');
}

console.log('冒烟通过：形式编排与停位都对');
