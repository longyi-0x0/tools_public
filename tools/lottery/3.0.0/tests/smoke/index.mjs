/**
 * 冒烟：把 site/index.html 塞进 jsdom，走一遍真实路径。
 *
 * 单测（`npm test`）只覆盖不碰 DOM 的那部分，这里补上：空存档 → 向导建活动
 * → 环节页 → 上台开奖。开奖动画要 canvas，jsdom 给不了，所以只验演出层的形状
 * （一个可编辑控件都没有），不验演出过程。
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
  url: 'https://example.org/lottery3/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});

const { window } = dom;
window.requestAnimationFrame ??= (fn) => setTimeout(() => fn(Date.now()), 16);
window.cancelAnimationFrame ??= (id) => clearTimeout(id);
window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
// jsdom 没有弹窗：给一份安静的实现，免得流程被一句提醒打断。
window.alert ??= () => {};
window.confirm ??= () => true;
window.prompt ??= () => null;
window.open ??= () => null;

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

function buttonsIn(host) {
  return [...host.querySelectorAll('.button')];
}

function click(text, host = app) {
  const hit = buttonsIn(host).find((item) => item.textContent === text);
  assert.ok(hit, `找不到按钮：${text}`);
  hit.click();
  return hit;
}

/* ---------- 空存档：先给欢迎页，不给三个半成品 ---------- */

assert.ok(app.textContent.includes('先备好一场活动'), '空存档要给欢迎页');
assert.equal(document.querySelector('.side-tree .side-group'), null, '空存档不该凭空造一个活动');

/* ---------- 走一遍向导 ---------- */

click('开始第一场活动');
assert.equal(wizard.hidden, false, '向导要打开');
assert.ok(wizard.textContent.includes('这是什么活动'), '第一步问活动名');

const fields = [...wizard.querySelectorAll('input.wizard-input')];
assert.equal(fields.length, 3, '第一步三格：活动名 / 日期 / 环节名');
fields[0].value = '2026 年会';
fields[0].dispatchEvent(new window.Event('change'));
fields[2].value = '三等奖';
fields[2].dispatchEvent(new window.Event('change'));

click('下一步', wizard);
assert.ok(wizard.textContent.includes('怎么抽'), '第二步选场景');
assert.ok(wizard.textContent.includes('从名单抽人'), '场景 a 要在');

click('下一步', wizard);
assert.ok(wizard.textContent.includes('谁参与'), '第三步给名单');
const area = wizard.querySelector('textarea.wizard-text');
assert.ok(area, '要有粘贴名单的地方');
area.value = '张三\n李四\n王五';
area.dispatchEvent(new window.Event('input'));

click('下一步', wizard);
assert.ok(wizard.textContent.includes('挑个外观'), '第四步挑外观');

click('就按这样开始', wizard);
assert.equal(wizard.hidden, true, '完成向导后要关掉');

/* ---------- 落盘：活动、环节、名单、出奖位名字 ---------- */

const state = JSON.parse(window.localStorage.getItem(KEY));
assert.ok(state, '要落在 lottery3 自己的 key 上');
assert.equal(state.version, 3);
assert.equal(state.groups.length, 1);
assert.equal(state.groups[0].name, '2026 年会');
assert.equal(state.draws.length, 1);
assert.equal(state.draws[0].name, '三等奖');
assert.equal(state.draws[0].slots[0].label, '中奖人', '出奖位要自带名字');
assert.equal(state.draws[0].slots[0].scope, 'group', '默认整场活动不重复');
assert.equal(state.pools.length, 1);
assert.equal(state.pools[0].kind, 'people', '名单的用处要记下来');
assert.equal(state.pools[0].entries.length, 3);
assert.deepEqual(state.pools[0].entries.map((entry) => entry.label), ['张三', '李四', '王五']);

/* ---------- 侧栏与主区 ---------- */

assert.ok(app.querySelector('.sidebar .side-group'), '侧栏要有活动这一层');
assert.ok(app.querySelector('.side-branch .side-draw'), '环节挂在活动下面');
const tabs = [...app.querySelectorAll('.tabbar .tab')].map((tab) => tab.textContent);
assert.deepEqual(tabs, ['活动', '清单', '亮/暗'], 'tabbar 是活动与清单两页');

assert.ok(app.textContent.includes('上台开奖'), '环节页要有上台开奖');
assert.ok(app.textContent.includes('出奖位'), '环节页要有出奖位卡片');
assert.ok(app.textContent.includes('中奖记录'), '环节页要有记录');

/* ---------- 界面不说模型的话 ---------- */

for (const word of ['槽位', '作用域', '放回', '权重', '种子', '名额', '折合概率']) {
  assert.ok(!app.textContent.includes(word), `界面上不该出现「${word}」`);
}

/* ---------- 演出层：一个可编辑控件都没有 ---------- */

click('上台开奖');
assert.equal(show.hidden, false, '演出层要盖上来');
assert.ok(show.textContent.includes('三等奖'), '演出层要写当前环节名');
assert.equal(show.querySelectorAll('input').length, 0, '演出层不该有输入框');
assert.equal(show.querySelectorAll('select').length, 0, '演出层不该有下拉');
assert.equal(show.querySelectorAll('textarea').length, 0, '演出层不该有文本框');
assert.ok(!show.textContent.includes('种子'), '演出层不摆种子');
assert.ok(!show.textContent.includes('撤销'), '撤销不放在观众面前');
assert.ok(show.textContent.includes('单屏模式'), '开不出大屏时要说清楚在单屏');

document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
assert.equal(show.hidden, true, '空闲时 Esc 能退出演出');

/* ---------- 清单页：表格态能加一行 ---------- */

const poolTab = [...app.querySelectorAll('.tab')].find((tab) => tab.textContent === '清单');
poolTab.click();
assert.ok(app.querySelector('.entry-table'), '清单页默认给表格');

click('＋ 加一行');
const rows = [...app.querySelectorAll('.entry-row')];
const last = rows[rows.length - 1];
const nameInput = last.querySelector('.entry-name');
nameInput.value = '赵六';
nameInput.dispatchEvent(new window.Event('change'));

const after = JSON.parse(window.localStorage.getItem(KEY));
assert.equal(after.pools[0].entries.length, 4, '加的行要落盘');
assert.equal(after.pools[0].entries[3].extKey, '赵六', '没填身份时用名字兜底');

console.log('冒烟通过：向导建活动 → 环节页 → 演出层只读 → 清单表格落盘');
