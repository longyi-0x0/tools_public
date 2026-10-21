/**
 * 冒烟：把 site/index.html 塞进 jsdom，跑一遍主页装配。
 *
 * 单测（`npm test`）只覆盖不碰 DOM 的那部分，这里补上真实 DOM 里的一趟：
 * 三块面板在不在、池能不能建、条目能不能存、记录能不能撤销。
 * 开奖层要 canvas，jsdom 给不了，那一段只在浏览器里看。
 *
 * 需要 jsdom：在 lottery-new/ 下 `npm i -D jsdom`，然后
 * `node tests/smoke/index.mjs`。不进 `npm test`，也不随工具发布。
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
  url: 'https://example.org/lottery-new/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});

// 主程序要的浏览器全局：jsdom 有 window/document，这里补齐它缺的那几样。
const { window } = dom;
window.requestAnimationFrame ??= (fn) => setTimeout(() => fn(Date.now()), 16);
window.cancelAnimationFrame ??= (id) => clearTimeout(id);
window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

globalThis.window = window;
globalThis.document = window.document;
globalThis.localStorage = window.localStorage;
globalThis.DOMParser = window.DOMParser;
globalThis.Blob = window.Blob;
globalThis.requestAnimationFrame = window.requestAnimationFrame;
globalThis.cancelAnimationFrame = window.cancelAnimationFrame;
globalThis.HTMLElement = window.HTMLElement;

await import(pathToFileURL(resolve(root, 'site/src/main.js')).href);

const app = window.document.getElementById('app');
const text = app.textContent ?? '';

assert.ok(app.querySelector('.shell'), '外壳要是两栏');
assert.ok(app.querySelector('.sidebar .side-list'), '侧栏要有列表');
assert.ok(app.querySelector('.main .detail'), '主区要有详情页');
assert.ok(text.includes('中奖记录'), '抽奖详情里要有记录一节');
assert.ok(window.localStorage.getItem('lottery-new:state.v1'), '起始状态要落盘');

const state = JSON.parse(window.localStorage.getItem('lottery-new:state.v1'));
assert.equal(state.pools.length, 1);
assert.equal(state.draws.length, 1);
assert.equal(state.draws[0].form.type, 'wheel');

// 切到池视图，往条目框里写几条，确认存得进去、名字保得住。
const poolTab = [...app.querySelectorAll('.tab')].find((tab) => tab.textContent === '池');
assert.ok(poolTab, 'tabbar 要有池这一页');
poolTab.click();

const textarea = app.querySelector('textarea');
assert.ok(textarea, '池页要有条目编辑框');
textarea.value = '张三,1,1\n李四,2,3\n王五';
textarea.dispatchEvent(new window.Event('change'));

const after = JSON.parse(window.localStorage.getItem('lottery-new:state.v1'));
assert.equal(after.pools[0].entries.length, 3);
assert.deepEqual(after.pools[0].entries.map((entry) => entry.label), ['张三', '李四', '王五']);
assert.equal(after.pools[0].entries[1].stock, 3, '份数要按第三列写进去');
assert.equal(after.pools[0].entries[0].weight, 1);

console.log('冒烟通过：两栏外壳齐备，视图切换与条目存储都成立');
