/**
 * 冒烟：开奖页（draw.html）在 jsdom 里跑一次真实的「空格开始 → 空格停 → 退格撤销」，
 * 确认抽法、形态、引擎在真实 DOM 里接得上，结果落进 v5 存档。
 * 另外验证固定槽侧栏：点第二项，这一抽用的就是它。
 *
 * 形态与抽法用环境变量换，跑满六种组合：
 *   for s in wheel grid slot; do for p in prize-person person-prize; do
 *     STAGE=$s PROTOCOL=$p node tests/smoke/draw.mjs
 *   done; done
 *
 * 需要 jsdom：在 lottery/ 下 `npm i -D jsdom`。不进 `npm test`，也不随工具发布。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const SITE = fileURLToPath(new URL('../../site/', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const failures = [];
const check = (label, ok, extra = '') => {
  if (ok) {
    console.log(`  ok   ${label}`);
  } else {
    console.log(`  FAIL ${label}${extra === '' ? '' : ` — ${extra}`}`);
    failures.push(label);
  }
};

const { createApp, addPool, createLottery } = await import(pathToFileURL(`${SITE}/src/data.js`).href);

let app = createApp();
let pool;
[app, pool] = addPool(app, {
  name: '名单 A',
  kind: 'people',
  entries: [{ name: '张三' }, { name: '李四' }, { name: '王五' }],
});
const peopleId = pool.id;
[app, pool] = addPool(app, {
  name: '奖品 A',
  kind: 'prizes',
  entries: [{ name: '一等奖', capacity: 1 }, { name: '二等奖', capacity: 2 }],
});
const prizeId = pool.id;
const STAGE = process.env.STAGE ?? 'wheel';
const PROTOCOL = process.env.PROTOCOL ?? 'prize-person';
let lottery;
[app, lottery] = createLottery(app, {
  title: '年会抽奖',
  protocol: PROTOCOL,
  stage: STAGE,
  poolIds: [peopleId, prizeId],
  // 绑定显式给：槽不认识池的类型，这一层由人决定
  slots: { person: peopleId, prize: prizeId },
});
const KEY = 'lottery.app.v5';
console.log(`形态 ${STAGE} / 抽法 ${PROTOCOL}`);

const html = readFileSync(`${SITE}/draw.html`, 'utf8').replace(/<script type="module"[\s\S]*?<\/script>/g, '');
const dom = new JSDOM(html, {
  url: `http://localhost:8787/draw.html?id=${lottery.id}`,
  pretendToBeVisual: true,
});
const { window } = dom;

const canvasContext = {
  clearRect() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, arc() {},
  closePath() {}, fill() {}, stroke() {}, save() {}, restore() {}, translate() {},
  rotate() {}, scale() {}, fillText() {}, strokeText() {}, setTransform() {},
  setLineDash() {}, clip() {}, ellipse() {}, rect() {}, quadraticCurveTo() {},
  bezierCurveTo() {}, measureText: () => ({ width: 10 }),
  createLinearGradient: () => ({ addColorStop() {} }),
  createRadialGradient: () => ({ addColorStop() {} }),
};
window.HTMLCanvasElement.prototype.getContext = () => canvasContext;
window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.requestAnimationFrame = (fn) => window.setTimeout(() => fn(Date.now()), 16);
window.cancelAnimationFrame = (id) => window.clearTimeout(id);
window.AudioContext = class {
  constructor() {
    this.state = 'running';
    this.destination = {};
    this.currentTime = 0;
  }
  createOscillator() {
    return { connect() {}, start() {}, stop() {}, frequency: { value: 0 }, type: 'sine' };
  }
  createGain() {
    return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } };
  }
  resume() {}
};

globalThis.window = window;
globalThis.document = window.document;
globalThis.localStorage = window.localStorage;
globalThis.Node = window.Node;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Event = window.Event;
globalThis.KeyboardEvent = window.KeyboardEvent;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame = window.requestAnimationFrame;
globalThis.AudioContext = window.AudioContext;
// stages/*.js 直接引用这几个构造函数（不写 window.），一并挂到全局
for (const name of ['ResizeObserver', 'MutationObserver', 'IntersectionObserver', 'PointerEvent', 'MouseEvent']) {
  globalThis[name] = window[name] ?? globalThis[name];
}
globalThis.MutationObserver = window.MutationObserver;

window.localStorage.setItem(KEY, JSON.stringify(app));

console.log('打开开奖页');
await import(pathToFileURL(`${SITE}/src/draw/main.js`).href);
await new Promise((resolve) => setTimeout(resolve, 300));

const root = window.document.getElementById('draw');
const text = () => root.textContent;
const has = (needle) => text().includes(needle);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

check('舞台渲染出来了', root.children.length > 0);
// 台面锚在哪一槽由抽法说了算：奖品抽人锚奖项，人抽奖品锚人
const anchors = PROTOCOL === 'person-prize' ? ['张三', '李四', '王五'] : ['一等奖', '二等奖'];
check(
  `台面锚在${PROTOCOL === 'person-prize' ? '人' : '奖项'}上`,
  anchors.some((name) => has(name)),
  text().replace(/\s+/g, ' ').slice(0, 120),
);
check('没缺池提示', !has('还没有给'));

// 待机文案的抬头就是锚槽的 label —— 形态不认识「人」「奖」，只说槽名
const eyebrow = window.document.querySelector('.status-eyebrow')?.textContent?.trim() ?? '';
check(
  '待机抬头是锚槽的槽名',
  eyebrow === (PROTOCOL === 'person-prize' ? '参与人' : '奖项'),
  eyebrow,
);

console.log('\n固定槽侧栏');
const rows = () => [...window.document.querySelectorAll('.slot-picker .pick')];
check('侧栏列出了可点选项', rows().length > 0, String(rows().length));
let chosenFixed = null;
if (rows().length > 1) {
  const second = rows()[1];
  chosenFixed = second.querySelector('.pick-label')?.textContent ?? null;
  second.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(120);
  const active = window.document.querySelector('.slot-picker .pick.on .pick-label')?.textContent ?? null;
  check('点第二项后它成了当前项', active === chosenFixed, `${active} / ${chosenFixed}`);
}

const press = () => window.document.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'Space', key: ' ' }));

console.log('\n空格开始抽');
press();
await new Promise((resolve) => setTimeout(resolve, 60));
const spinning = JSON.parse(window.localStorage.getItem(KEY));
check('开抽后还没有记录落地', spinning.lotteries[0].results.length === 0);

console.log('\n空格停下');
press();
await new Promise((resolve) => setTimeout(resolve, 200));
const after = JSON.parse(window.localStorage.getItem(KEY));
const results = after.lotteries[0].results;
check('落了一条开奖记录', results.length === 1, String(results.length));
if (results.length === 1) {
  const picks = results[0].picks;
  check('一条记录里奖项与人各一个', picks.length === 2, JSON.stringify(picks.map((p) => p.slot)));
  check('奖项是真实的奖项', picks.some((p) => p.slot === 'prize' && ['一等奖', '二等奖'].includes(p.name)));
  check(
    '中奖人是名单里的',
    picks.some((p) => p.slot === 'person' && ['张三', '李四', '王五'].includes(p.name)),
  );
  if (chosenFixed !== null) {
    const fixedKey = PROTOCOL === 'person-prize' ? 'person' : 'prize';
    check(
      '这一抽用的就是侧栏点的那一项',
      picks.some((pick) => pick.slot === fixedKey && pick.name === chosenFixed),
      `${fixedKey} = ${picks.find((pick) => pick.slot === fixedKey)?.name} / ${chosenFixed}`,
    );
  }
}
check('结果面板给了文案', has('开奖结果') || has('中奖'));

console.log('\n退格撤销');
window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Backspace' }));
await new Promise((resolve) => setTimeout(resolve, 200));
const undone = JSON.parse(window.localStorage.getItem(KEY));
check('撤销后记录回到 0', undone.lotteries[0].results.length === 0, String(undone.lotteries[0].results.length));

console.log(`\n${failures.length === 0 ? '冒烟通过' : `冒烟失败 ${failures.length} 项`}`);
process.exit(failures.length === 0 ? 0 : 1);
