/**
 * 冒烟：把 site/index.html 塞进 jsdom，跑一遍主页装配。
 *
 * 单测（`npm test`）只覆盖不碰 DOM 的那部分，这里补上真实 DOM 里的一趟：
 * 组 → 抽奖的树在不在、池能不能建、条目能不能存、名额与作用域有没有渲染出来。
 * 开奖层要 canvas，jsdom 给不了，那一段只在浏览器里看。
 *
 * 需要 jsdom：`node tests/smoke/index.mjs`（不进 `npm test`，不随工具发布）。
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
const KEY = 'lottery-new:state.v2';

assert.ok(app.querySelector('.shell'), '外壳要是两栏');
assert.ok(app.querySelector('.sidebar .side-tree'), '侧栏要是一棵「组 → 抽奖」的树');
assert.ok(app.querySelector('.main .detail'), '主区要有详情页');
assert.ok(text.includes('中奖记录'), '抽奖详情里要有记录一节');
assert.ok(text.includes('名额'), '槽位要能配名额');
assert.ok(text.includes('作用域'), '槽位要能配作用域');
assert.ok(window.localStorage.getItem(KEY), '起始状态要落盘');

// 树：组是父节点且带成员数，抽奖挂在组下面的分支里；组不再单独占一列。
const groupNode = app.querySelector('.side-group');
assert.ok(groupNode, '组要是树的父节点');
assert.ok(groupNode.textContent.includes('默认组'), '父节点显示组名');
assert.equal(groupNode.querySelector('.side-count').textContent, '1', '组行右边写成员数');
assert.ok(app.querySelector('.side-branch .side-draw'), '抽奖要缩进挂在组下面');
assert.equal(app.querySelectorAll('.side-group').length, 1, '组节点在树里，不在另一列');

const tabLabels = [...app.querySelectorAll('.tabbar .tab')].map((tab) => tab.textContent);
assert.deepEqual(tabLabels, ['抽奖', '池', '亮/暗'], 'tabbar 只剩抽奖与池两页');

// 点组节点进组页，组里的抽奖点得进去。
groupNode.click();
assert.ok(app.textContent.includes('组里的抽奖'), '组节点指向组详情');
const openDraw = [...app.querySelectorAll('.button')].find((item) => item.textContent === '打开');
assert.ok(openDraw, '组里的抽奖要有入口');
openDraw.click();
assert.ok(app.textContent.includes('中奖记录'), '从组里能回到抽奖详情');

const state = JSON.parse(window.localStorage.getItem(KEY));
assert.equal(state.version, 2);
assert.equal(state.pools.length, 1);
assert.equal(state.draws.length, 1);
assert.equal(state.groups.length, 1);
assert.equal(state.draws[0].form.type, 'wheel');
assert.equal(state.draws[0].slots[0].scope, 'draw', '槽位规则内联在槽位上');
assert.equal(state.draws[0].rule, undefined, '不再有独立的规则表');

// 切到池视图，往条目框里写几条，确认存得进去、名字与工号都保得住。
const poolTab = [...app.querySelectorAll('.tab')].find((tab) => tab.textContent === '池');
assert.ok(poolTab, 'tabbar 要有池这一页');
poolTab.click();

const textarea = app.querySelector('textarea');
assert.ok(textarea, '池页要有条目编辑框');
textarea.value = '张三,1,1,E001\n李四,2,3,E002\n王五';
textarea.dispatchEvent(new window.Event('change'));

const after = JSON.parse(window.localStorage.getItem(KEY));
assert.equal(after.pools[0].entries.length, 3);
assert.deepEqual(after.pools[0].entries.map((entry) => entry.label), ['张三', '李四', '王五']);
assert.equal(after.pools[0].entries[1].stock, 3, '份数要按第三列写进去');
assert.equal(after.pools[0].entries[0].extKey, 'E001', '第四列是外部主键');
assert.equal(after.pools[0].entries[2].extKey, '王五', '没填主键时用名字兜底');

// 旧存档：v1 的规则表要迁到槽位上，原文留 .backup。
window.localStorage.clear();
window.localStorage.setItem('lottery-new:state.v1', JSON.stringify({
  pools: [{ id: 'p1', name: '名单', entries: [{ id: 'e1', label: '甲' }] }],
  draws: [{
    id: 'd1',
    name: '旧抽奖',
    slots: [{ key: 'slot1', poolId: 'p1' }],
    form: { type: 'wheel', options: {} },
    mode: 'independent',
    rule: { slot1: { count: 2, replacement: 'without', weighted: true, hitRate: 1, pickLimit: 5 } },
  }],
  rounds: [],
  currentDrawId: 'd1',
}));

const { createStore } = await import(pathToFileURL(resolve(root, 'site/src/store.js')).href);
const migrated = createStore().state;
assert.equal(migrated.version, 2);
assert.equal(migrated.draws[0].slots[0].count, 2, '旧 count 要搬进槽位');
assert.equal(migrated.draws[0].slots[0].quota, 5, '旧 pickLimit 搬成名额');
assert.ok(window.localStorage.getItem('lottery-new:state.v1.backup'), '旧存档要留备份');

console.log('冒烟通过：组 → 抽奖的树、条目与主键落盘、旧存档可迁移');
