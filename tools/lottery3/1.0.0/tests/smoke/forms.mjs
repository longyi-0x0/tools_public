/**
 * 冒烟：形式层的编排。
 *
 * 转盘现在自己画盘面，jsdom 没有 2D 上下文，所以这里塞一份只记调用的假上下文，
 * 量字宽按字数估——要验的是「几个盘、停在第几格、转完没有」，出图留给浏览器。
 * 老虎机仍走通用组件库，换一份假库记录 play / stop 的次序。
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

/* 假 2D 上下文：画什么都不落笔，只保证调用链走得通。 */
const fakeContext = {
  measureText: (text) => ({ width: String(text).length * 10 }),
};
for (const name of [
  'setTransform', 'clearRect', 'beginPath', 'arc', 'moveTo', 'lineTo',
  'closePath', 'fill', 'fillText',
]) {
  fakeContext[name] = () => {};
}
dom.window.HTMLCanvasElement.prototype.getContext = () => fakeContext;

const { createPool, indexPools } = await import('../../site/src/domain/pool.js');
const { createDraw } = await import('../../site/src/domain/draw.js');
const { decide } = await import('../../site/src/domain/engine.js');
const { viewOf } = await import('../../site/src/domain/session.js');
const { createLedger } = await import('../../site/src/domain/ledger.js');
const { planOf, mountForm } = await import('../../site/src/forms/registry.js');

/** 老虎机用的假库：只记 play / stop 的次序与参数。 */
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

async function runPlan(plan, { onStop } = {}) {
  const root = document.createElement('div');
  document.body.append(root);
  const form = await mountForm(root, plan, { library, spinMs: 0, onStop });
  await form.run();
  return { form, root };
}

{
  const draw = createDraw({
    id: 'd',
    slots: [{ key: 'slot1', poolId: 'p1', count: 3 }],
    form: { type: 'wheel' },
  });
  const { round, plan } = planFor(draw);

  const stops = [];
  const { form, root } = await runPlan(plan, {
    onStop: (board, index) => stops.push({ slotKey: board.slotKey, index }),
  });

  assert.equal(stops.length, 3, '抽三个就转三次');

  // 停位是盘面样本里的下标，不是全体候选的下标。
  const entries = plan.boards[0].entries;
  assert.deepEqual(
    stops.map((stop) => entries[stop.index].id),
    round.picks.map((pick) => pick.entryId),
  );

  form.dispose();
  assert.equal(root.children.length, 0, '收场后盘面要清干净');
  console.log('单盘：抽几个转几次，停位对得上，收场不留残渣');
}

{
  const slots = [{ key: 'slot1', poolId: 'p1' }, { key: 'slot2', poolId: 'p2' }];
  const together = planFor(createDraw({ id: 'd', slots, form: { type: 'wheel' }, mode: 'independent' }));
  const stops = [];
  await runPlan(together.plan, { onStop: (board) => stops.push(board.slotKey) });

  assert.equal(stops.length, 2);
  assert.deepEqual([...new Set(stops)].sort(), ['slot1', 'slot2'], '两个盘都转到了');
  console.log('两个盘同时抽：两盘都转');
}

{
  const slots = [{ key: 'slot1', poolId: 'p1' }, { key: 'slot2', poolId: 'p2' }];
  const oneByOne = planFor(createDraw({ id: 'd', slots, form: { type: 'wheel' }, mode: 'a-then-b' }));
  const stops = [];
  await runPlan(oneByOne.plan, { onStop: (board) => stops.push(board.slotKey) });

  assert.deepEqual(stops, ['slot1', 'slot2'], '依次抽：前一个停稳后一个才转');
  console.log('两个盘依次抽：前一个停稳后一个才转');
}

{
  const draw = createDraw({
    id: 'd',
    slots: [{ key: 'slot1', poolId: 'p1', hitRate: 1 }],
    form: { type: 'slot', options: { columns: 3 } },
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
    slots: [{ key: 'slot1', poolId: 'p1', hitRate: 0 }],
    form: { type: 'slot', options: { columns: 3 } },
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
