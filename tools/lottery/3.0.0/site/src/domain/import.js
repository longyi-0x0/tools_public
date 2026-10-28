/**
 * 导入：把一张表读成条目。
 *
 * 哪一列是什么由人指定，不靠位置猜。猜的代价在这条线上量过一次：表上第二列是
 * 「技术部」，被当成权重，权重归一成 0 就是「这个人永远抽不中」，而且界面上
 * 什么都不显示。所以猜只用来给建议值，界面摊开让人改，改完才落条目。
 *
 * 份数与机会倍数不是数字就报错并拒绝导入，不静默归一——静默归一是「名单看着
 * 导进来了，其实有几十个人被改了权重」的来源。
 */

import { createEntry } from './pool.js';

/** 表头关键词 → 这一列可能是干什么用的。只用来给建议值。 */
const HINTS = {
  label: ['姓名', '名字', '名称', '奖品', '奖项', '条目', '参与人', '人员', '员工'],
  extKey: ['工号', '编号', '学号', '身份证', 'id'],
  stock: ['份数', '数量', '库存', '能中', '次数'],
  weight: ['权重', '机会', '倍数', '概率'],
};

function cellOf(row, index) {
  if (!Number.isInteger(index) || index < 0) return '';
  return String(row?.[index] ?? '').trim();
}

function hit(head, key) {
  return head.findIndex((cell) => HINTS[key].some((word) => cell.toLowerCase().includes(word.toLowerCase())));
}

/**
 * 猜列。返回的是建议值：名字列猜不中就用第一列，其余猜不中就是「这一列没有」。
 * `header` 表示第一行像不像表头——只要有一格撞上关键词就当它是。
 */
export function guessColumns(rows = []) {
  const head = (rows[0] ?? []).map((cell) => String(cell ?? '').trim());
  const label = hit(head, 'label');
  return {
    header: ['label', 'extKey', 'stock', 'weight'].some((key) => hit(head, key) >= 0),
    columns: {
      label: label >= 0 ? label : 0,
      extKey: hit(head, 'extKey'),
      stock: hit(head, 'stock'),
      weight: hit(head, 'weight'),
    },
  };
}

/**
 * 份数：填了就必须是正整数，填「不限」就是不限，只有留空才按清单用处给默认值。
 * 「不限」要当真——导出的文件里写的就是它，导回来变成 1 次就对不上了。
 */
function stockOf(text, fallback) {
  const raw = String(text ?? '').trim();
  if (raw === '不限' || raw === '∞') return Infinity;
  if (raw === '') return fallback;
  const count = Number(raw);
  if (!Number.isFinite(count) || count <= 0) return null;
  return Math.floor(count);
}

/** 机会倍数：留空是 1，填了必须是非负数字。0 合法——它的意思就是「不参与」。 */
function weightOf(text) {
  const raw = String(text ?? '').trim();
  if (raw === '') return 1;
  const weight = Number(raw);
  if (!Number.isFinite(weight) || weight < 0) return null;
  return weight;
}

/**
 * 按给定的列读出条目。
 *
 * 名字是空的整行跳过（表尾的空行很常见，不算错）；份数与倍数读不出来就报错，
 * 由调用方决定要不要停下来。
 */
export function parseImport(rows = [], { hasHeader = false, columns = {}, kind = 'people' } = {}) {
  const lines = rows.map((row) => (Array.isArray(row) ? row : [row]).map((cell) => String(cell ?? '').trim()));
  const body = hasHeader ? lines.slice(1) : lines;
  const fallbackStock = kind === 'people' ? 1 : Infinity;

  const entries = [];
  const errors = [];
  let skipped = 0;

  body.forEach((row, index) => {
    const at = index + (hasHeader ? 2 : 1);
    const label = cellOf(row, columns.label);
    if (!label) {
      skipped += 1;
      return;
    }

    const stock = stockOf(cellOf(row, columns.stock), fallbackStock);
    if (stock === null) {
      errors.push({ row: at, why: `第 ${at} 行「${cellOf(row, columns.stock)}」不是份数（填数字或留空）` });
      return;
    }

    const weight = weightOf(cellOf(row, columns.weight));
    if (weight === null) {
      errors.push({ row: at, why: `第 ${at} 行「${cellOf(row, columns.weight)}」不是机会倍数（填数字或留空）` });
      return;
    }

    entries.push(createEntry({
      label,
      extKey: cellOf(row, columns.extKey) || label,
      stock,
      weight,
    }));
  });

  return { entries, errors, skipped };
}
