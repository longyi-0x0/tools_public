/**
 * 冒烟：导入先摊开列，读不出来的行不让人导入。
 *
 * 按位置吞列那版把「部门」当成了机会倍数，归一化之后是 0，那些人永远抽不中，
 * 界面上看不出来。这条冒烟锁两件事：列由人指定、非数字倍数按不下去。
 *
 * 需要 jsdom：`node tests/smoke/import.mjs`（不进 `npm test`，不随工具发布）。
 */

import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
window.alert = () => {};

const { openImport } = await import('../../site/src/ui/importDialog.js');

const document = dom.window.document;
const rows = [
  ['姓名', '部门', '工号'],
  ['张三', '技术部', 'E001'],
  ['李四', '市场部', 'E002'],
];

let applied = null;
openImport({ rows, kind: 'people', name: '全员名单', onApply: (entries) => { applied = entries; } });

const modal = document.querySelector('.modal');
assert.ok(modal, '要弹出导入框');

/* ① 四个列下拉都在，预览把表铺出来 */
const picks = [...modal.querySelectorAll('select')];
assert.equal(picks.length, 4, '名字 / 工号 / 份数 / 倍数，四个都要能选');
assert.match(modal.textContent, /技术部/, '预览要看得见原表长什么样');

/* ② 默认把第二列当倍数时，必须报错且导入按不下去 */
const weightPick = picks[3];
weightPick.value = '1';
weightPick.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
assert.ok(document.querySelector('.import-error'), '倍数列是文本要指出来');
assert.ok(document.querySelector('.modal-bar .button.primary').disabled, '读不出来就不许导入');

/* ③ 改回「没有这一列」，导入按钮按得下去，条目按指定的列落 */
weightPick.value = '';
weightPick.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
assert.equal(document.querySelector('.import-error'), null);

const go = document.querySelector('.modal-bar .button.primary');
assert.equal(go.disabled, false);
assert.match(go.textContent, /导入 2 项/);
go.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

assert.equal(applied.length, 2);
assert.deepEqual(applied.map((entry) => entry.label), ['张三', '李四']);
assert.deepEqual(applied.map((entry) => entry.extKey), ['E001', 'E002']);
assert.deepEqual(applied.map((entry) => entry.weight), [1, 1], '没选倍数列就一律 1，不许拿别的列当倍数');
assert.equal(document.querySelector('.modal'), null, '导入完要收起来');

console.log('冒烟通过：列由人指定、非数字倍数拦下来、条目按指定的列落');
