/**
 * 冒烟：彩排不写入账本，且整屏看得出在彩排。
 *
 * v3.0.0 出过这个事：活动页的「彩排一遍」把 rehearsal 当第二个参数传给 onStart，
 * 中间那层没接，于是彩排按正式入了账，演出层连个标记都没有——台下看到的名字
 * 是真的，账本里也留了档。这条冒烟就是那件事的回归锁。
 *
 * 需要 jsdom：`node tests/smoke/rehearsal.mjs`（不进 `npm test`，不随工具发布）。
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const html = readFileSync(resolve(root, 'site/index.html'), 'utf8');

const dom = new JSDOM(html, {
  url: 'https://example.org/lottery3/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});

const { window } = dom;
window.requestAnimationFrame ??= (fn) => setTimeout(() => fn(Date.now()), 16);
window.cancelAnimationFrame ??= (id) => clearTimeout(id);
window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.alert = () => {};
window.confirm = () => true;
window.prompt = () => null;
window.open = () => null;

const fakeContext = { measureText: (text) => ({ width: String(text).length * 10 }) };
for (const name of [
  'setTransform', 'clearRect', 'beginPath', 'arc', 'moveTo', 'lineTo',
  'closePath', 'fill', 'fillText',
]) fakeContext[name] = () => {};
window.HTMLCanvasElement.prototype.getContext = () => fakeContext;

globalThis.window = window;
globalThis.document = window.document;
globalThis.localStorage = window.localStorage;
globalThis.DOMParser = window.DOMParser;
globalThis.Blob = window.Blob;
globalThis.requestAnimationFrame = window.requestAnimationFrame;
globalThis.cancelAnimationFrame = window.cancelAnimationFrame;
globalThis.HTMLElement = window.HTMLElement;

const document = window.document;
const KEY = 'lottery3:state.v3';

await import(pathToFileURL(resolve(root, 'site/src/main.js')).href);

const app = document.getElementById('app');
const wizard = document.getElementById('wizard');
const show = document.getElementById('show');

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const rounds = () => (JSON.parse(localStorage.getItem(KEY) ?? '{}').rounds ?? []);

function click(text, host = app) {
  const hit = [...host.querySelectorAll('.button')].find((item) => item.textContent === text);
  assert.ok(hit, `没找到按钮：${text}`);
  hit.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

function fill(node, value, evt = 'change') {
  node.value = value;
  node.dispatchEvent(new window.Event(evt, { bubbles: true }));
}

function key(code) {
  document.dispatchEvent(new window.KeyboardEvent('keydown', { code, bubbles: true }));
}

/* ① 建一场活动，名单八个人（向导给的默认名额） */
click('开始第一场活动');
const inputs = () => [...wizard.querySelectorAll('.wizard-input')];
fill(inputs()[0], '2026 年会');
fill(inputs()[1], '三等奖');
click('下一步', wizard);
click('下一步', wizard);
fill(wizard.querySelector('textarea'), ['张三', '李四', '王五', '赵六', '孙七', '周八', '吴九', '郑十'].join('\n'), 'input');
click('下一步', wizard);
click('就按这样开始', wizard);

const built = JSON.parse(localStorage.getItem(KEY));
assert.equal(built.draws[0].slots[0].quota, 5, '向导建出来的环节必须有名额，不能是不限量');

/* ② 正式抽一轮：账本多一条 */
click('上台开奖');
key('Space');
await sleep(2600);
assert.equal(rounds().length, 1, '正式抽一轮应当入账');
assert.equal(rounds()[0].status, 'settled');

/* ③ 退出，从活动页进彩排 */
click('退出（Esc）', show);
click('2026 年会');
click('彩排一遍');

const frame = show.querySelector('.show-frame');
assert.ok(frame.classList.contains('rehearsal'), '彩排要整屏标出来，不能只有一个小胶囊');
assert.match(show.textContent, /彩排中/, '演出层要写明在彩排');
const undoBtn = [...show.querySelectorAll('.button')].find((item) => item.textContent === '撤回上一轮');
assert.ok(undoBtn.hidden, '彩排时不给撤回：那时露出来的「上一轮」是上一次正式抽的');

/* ④ 彩排走完整流程，账本不动 */
key('Space');
await sleep(2600);
assert.equal(rounds().length, 1, '彩排一轮之后账本条数不能变');

console.log('冒烟通过：彩排不入账、整屏有标记、彩排时不给撤回');
