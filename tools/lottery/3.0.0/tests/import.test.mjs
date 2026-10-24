/**
 * 导入：猜列只给建议值，落条目按指定的列，读不出来的行要报错。
 *
 * v3.0.0 是按位置吞列的：表上第二列是什么就当什么，于是「技术部」成了机会倍数、
 * 归一成 0，那个人永远抽不中，界面上什么都不显示。这组用例锁住的是「不猜」。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { guessColumns, parseImport } from '../site/src/domain/import.js';

const HR = [
  ['姓名', '部门', '工号'],
  ['张三', '技术部', 'E001'],
  ['李四', '市场部', 'E002'],
];

test('表头撞上关键词才算表头，列按关键词给建议值', () => {
  const guess = guessColumns(HR);
  assert.equal(guess.header, true);
  assert.deepEqual(guess.columns, { label: 0, extKey: 2, stock: -1, weight: -1 });
});

test('没有表头时不猜用途，名字退到第一列，其余都是「没有这一列」', () => {
  const guess = guessColumns([['张三', '技术部', 'E001']]);
  assert.equal(guess.header, false);
  assert.deepEqual(guess.columns, { label: 0, extKey: -1, stock: -1, weight: -1 });
});

test('指定了列就按指定的读，第二列是部门也不许当成倍数', () => {
  const { entries, errors } = parseImport(HR, {
    hasHeader: true,
    columns: { label: 0, extKey: 2, stock: -1, weight: -1 },
    kind: 'people',
  });
  assert.equal(errors.length, 0);
  assert.deepEqual(entries.map((entry) => entry.label), ['张三', '李四']);
  assert.deepEqual(entries.map((entry) => entry.weight), [1, 1]);
  assert.deepEqual(entries.map((entry) => entry.stock), [1, 1]);
});

test('份数读不出来就报错，不静默归一', () => {
  const { entries, errors } = parseImport(
    [['张三', '技术部'], ['李四', '2']],
    { hasHeader: false, columns: { label: 0, extKey: -1, stock: 1, weight: -1 }, kind: 'people' },
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0].why, /第 1 行/);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].label, '李四');
});

test('倍数读不出来就报错；填 0 是合法的，意思是这一项不参与', () => {
  const bad = parseImport(
    [['张三', '技术部']],
    { hasHeader: false, columns: { label: 0, extKey: -1, stock: -1, weight: 1 }, kind: 'people' },
  );
  assert.equal(bad.errors.length, 1);
  assert.equal(bad.entries.length, 0);

  const zero = parseImport(
    [['张三', '0']],
    { hasHeader: false, columns: { label: 0, extKey: -1, stock: -1, weight: 1 }, kind: 'people' },
  );
  assert.equal(zero.errors.length, 0);
  assert.equal(zero.entries[0].weight, 0);
});

test('名字是空的行整行跳过，不算错', () => {
  const { entries, errors, skipped } = parseImport(
    [['张三'], [''], ['李四']],
    { hasHeader: false, columns: { label: 0, extKey: -1, stock: -1, weight: -1 }, kind: 'people' },
  );
  assert.equal(errors.length, 0);
  assert.equal(skipped, 1);
  assert.deepEqual(entries.map((entry) => entry.label), ['张三', '李四']);
});

test('份数留空按清单用处给默认值：人 1 次，奖品不限', () => {
  const people = parseImport([['张三']], {
    hasHeader: false, columns: { label: 0, extKey: -1, stock: -1, weight: -1 }, kind: 'people',
  });
  assert.equal(people.entries[0].stock, 1);

  const prize = parseImport([['扫地机器人']], {
    hasHeader: false, columns: { label: 0, extKey: -1, stock: -1, weight: -1 }, kind: 'prize',
  });
  assert.equal(prize.entries[0].stock, Infinity);
});

test('导出的四列导回来还是同一批条目（往返闭合）', () => {
  const table = [
    ['姓名', '能中几次', '工号', '权重'],
    ['张三', '1', 'E001', '1'],
    ['李四', '不限', 'E002', '3'],
  ];
  const guess = guessColumns(table);
  assert.equal(guess.header, true);
  assert.deepEqual(guess.columns, { label: 0, extKey: 2, stock: 1, weight: 3 });

  const { entries, errors } = parseImport(table, { hasHeader: true, columns: guess.columns, kind: 'people' });
  assert.equal(errors.length, 0);
  assert.deepEqual(entries.map((entry) => [entry.label, entry.extKey, entry.stock, entry.weight]), [
    ['张三', 'E001', 1, 1],
    ['李四', 'E002', Infinity, 3],
  ]);
});
