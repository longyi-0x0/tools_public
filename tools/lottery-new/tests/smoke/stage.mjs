/**
 * 冒烟：开奖层的接线。
 *
 * 库要 canvas，jsdom 给不了，所以换一份假库（只记录 play / stop）。这里验的是
 * 接线本身：点开始会不会定出结果、演完有没有入账、入账后撤销按钮亮不亮、
 * 抽不动时有没有说人话。真正的出图留给浏览器。
 *
 * 需要 jsdom：`node tests/smoke/stage.mjs`。
 */

import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';

const dom = new JSDOM('<!doctype html><html><body><div id="stage" hidden></div></body></html>', {
  pretendToBeVisual: true,
});
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
globalThis.HTMLElement = window.HTMLElement;

const { createPool, indexPools } = await import('../../site/src/domain/pool.js');
const { createDraw } = await import('../../site/src/domain/draw.js');
const { usageOf } = await import('../../site/src/domain/ledger.js');
const { createStage } = await import('../../site/src/ui/stageView.js');

class FakeBoard {
  constructor(selector) {
    this.id = selector;
    this.step = 0;
  }
  play() {
    this.step = 1;
  }
  stop() {
    this.step = 2;
    setTimeout(() => {
      this.step = 0;
    }, 1);
  }
}

const library = { LuckyWheel: FakeBoard, LuckyGrid: FakeBoard, SlotMachine: FakeBoard };

const pool = createPool({
  id: 'p1',
  name: '名单',
  entries: [{ id: 'a', label: '张三' }, { id: 'b', label: '李四' }, { id: 'c', label: '王五' }],
});
const pools = indexPools([pool]);
const draw = createDraw({ id: 'd1', name: '年会', slots: [{ key: 'slot1', poolId: 'p1' }] });

const host = document.getElementById('stage');
let rounds = [];
let undoCount = 0;

const stage = createStage({
  host,
  mountOptions: { library, spinMs: 0 },
  onSettled: (session) => {
    rounds = [...rounds, { ...session.round, status: 'settled' }];
    return rounds;
  },
  onUndo: () => {
    undoCount += 1;
  },
});

stage.open(draw, { pools: [pool], rounds: [] });
assert.equal(host.hidden, false, '开奖层要打开');

const undoBtn = () => [...host.querySelectorAll('.button')].find((node) => node.textContent === '撤销上一轮');
assert.equal(undoBtn().disabled, true, '还没入账时撤销要灰着');

host.querySelector('.button.primary').click();

for (let i = 0; i < 100 && rounds.length === 0; i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

assert.equal(rounds.length, 1, '演完要自动入账一次');
assert.equal(rounds[0].status, 'settled');
assert.ok(usageOf({ rounds }).size > 0, '账本里要有占额');
assert.ok(host.querySelector('.reveal-name'), '揭晓层要写出中奖人');
assert.ok(host.textContent.includes('种子'), '揭晓后面要露出这一轮的种子');
assert.equal(undoBtn().disabled, false, '入账之后撤销才可点');

undoBtn().click();
assert.equal(undoCount, 1, '撤销按钮要交回外面处理');
console.log('开奖层：点开始 → 定结果 → 入账 → 撤销可用');

// 名额出满之后要说「抽不动了」，不是静默空转。
const quotaDraw = createDraw({ id: 'd3', name: '名额 1', slots: [{ key: 'slot1', poolId: 'p1', quota: 1 }] });
const before = rounds.length;
stage.open(quotaDraw, { pools: [pool], rounds: rounds });

host.querySelector('.button.primary').click();
for (let i = 0; i < 100 && rounds.length === before; i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 10));
}
assert.equal(rounds.length, before + 1, '名额 1 的第一轮要能中');

host.querySelector('.button.primary').click();
for (let i = 0; i < 60 && !host.textContent.includes('抽不动了'); i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 10));
}
assert.ok(host.textContent.includes('抽不动了'), '名额出满要明说抽不动');
assert.equal(rounds.length, before + 1, '抽不动的一轮不入账');

console.log('开奖层：名额出满时明说抽不动');
