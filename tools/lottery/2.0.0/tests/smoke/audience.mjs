/**
 * 冒烟：观众屏收指令的次序。
 *
 * 这里只验一件容易错的事——控制台每轮抽完都会再推一次 ready，观众屏不能因此
 * 把刚亮出来的中奖名单抹掉。顺序错一步，台下就会看到名字闪一下就没了。
 *
 * 需要 jsdom：`node tests/smoke/audience.mjs`。
 */

import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';

const dom = new JSDOM(`<!doctype html><html><body class="audience-body">
  <div class="aud">
    <h1 id="aud-title">等着开始</h1>
    <p id="aud-sub"></p>
    <div id="aud-boards"></div>
    <div id="aud-reveal"><div id="aud-lead"></div><div id="aud-names"></div></div>
  </div>
</body></html>`, { url: 'https://example.org/lottery3/audience.html', pretendToBeVisual: true });

const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
globalThis.requestAnimationFrame ??= (fn) => setTimeout(() => fn(Date.now()), 16);
globalThis.cancelAnimationFrame ??= (id) => clearTimeout(id);
window.requestAnimationFrame ??= globalThis.requestAnimationFrame;
window.cancelAnimationFrame ??= globalThis.cancelAnimationFrame;

/* 盘面要 canvas：给一份只记调用的假上下文，转盘只走到画这一步。 */
const fakeContext = { measureText: (text) => ({ width: String(text).length * 10 }) };
for (const name of [
  'setTransform', 'clearRect', 'beginPath', 'arc', 'moveTo', 'lineTo',
  'closePath', 'fill', 'fillText',
]) {
  fakeContext[name] = () => {};
}
window.HTMLCanvasElement.prototype.getContext = () => fakeContext;

await import('../../site/src/audience.js');

const title = document.getElementById('aud-title');
const boards = document.getElementById('aud-boards');
const reveal = document.getElementById('aud-reveal');
const names = document.getElementById('aud-names');

const plan = {
  type: 'wheel',
  win: false,
  sequential: false,
  boards: [{
    slotKey: 's1',
    poolId: 'p1',
    spins: [],
    entries: ['甲', '乙', '丙'].map((label, i) => ({ id: `e${i}`, label })),
  }],
};

/** 冒充控制台推指令；message 事件在 jsdom 里是异步派发的，等一拍。 */
async function push(message) {
  window.postMessage({ source: 'lottery3-console', ...message }, '*');
  await new Promise((resolve) => setTimeout(resolve, 20));
}

await push({ type: 'ready', payload: { drawName: '三等奖', remain: 5, quota: 5, preview: plan, clear: true } });
assert.equal(title.textContent, '三等奖');
assert.equal(boards.querySelectorAll('.board').length, 1, '待机时盘面先摆出来，不留一块黑屏');
assert.equal(reveal.classList.contains('on'), false);

await push({ type: 'reveal', payload: { names: ['甲', '乙'], drawName: '三等奖', remain: 3, quota: 5 } });
assert.equal(reveal.classList.contains('on'), true);
assert.equal(names.textContent, '甲乙');
assert.equal(document.getElementById('aud-lead').textContent, '三等奖', '亮名字时要带上是哪个奖');

// 真正的坑：这一条是抽完之后控制台顺手发的那次 ready。
await push({ type: 'ready', payload: { drawName: '三等奖', remain: 3, quota: 5, preview: plan, clear: false } });
assert.equal(reveal.classList.contains('on'), true, '刚抽完的 ready 不能把中奖名单抹掉');
assert.equal(names.textContent, '甲乙');

await push({ type: 'ready', payload: { drawName: '二等奖', remain: 2, quota: 2, preview: plan, clear: true } });
assert.equal(reveal.classList.contains('on'), false, '换环节要清场');
assert.equal(title.textContent, '二等奖');

await push({ type: 'rest', payload: { remain: 0 } });
assert.equal(boards.querySelectorAll('.board').length, 0, '收场后盘面清空');

console.log('冒烟通过：观众屏待机摆盘、开奖留名、换环节清场');
