/**
 * 导入对话框：把这张表摊开，让人指出哪一列是什么，再落条目。
 *
 * 导入在这条产品线上出过一次事：位置猜列，第二列「技术部」被当成机会倍数，
 * 归一成 0 就是「这个人永远抽不中」，界面上什么都不显示。所以这里不猜——
 * 猜只用来给建议值，四个下拉全摊开，预览跟着变，导入按钮上写着能导多少条。
 *
 * 份数与倍数读不出来就说明哪一行读不出来，按钮直接按不下去，不留「导进来再说」。
 */

import { el, button, fieldRow, select, checkbox } from './dom.js';
import { guessColumns, parseImport } from '../domain/import.js';

/** 预览只看前几行：这张表可能几千行，全铺出来没有意义。 */
const PREVIEW_ROWS = 6;
const PREVIEW_COLS = 6;

export function openImport({ rows = [], kind = 'people', name = '这份表', onApply }) {
  const guess = guessColumns(rows);
  let hasHeader = guess.header;
  let columns = { ...guess.columns };

  const modal = el('div', 'modal');
  const frame = el('div', 'modal-frame');
  modal.append(frame);
  document.body.append(modal);

  const onKey = (event) => {
    if (event.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);

  function close() {
    document.removeEventListener('keydown', onKey);
    modal.remove();
  }

  /** 列宽按最长的一行算，可能各行列数不齐。 */
  function width() {
    return rows.reduce((max, row) => Math.max(max, (row ?? []).length), 0);
  }

  function options() {
    const head = rows[0] ?? [];
    const list = [{ value: '', label: '没有这一列' }];
    for (let i = 0; i < Math.min(width(), PREVIEW_COLS); i += 1) {
      const text = hasHeader ? String(head[i] ?? '').trim() : '';
      list.push({ value: String(i), label: text ? `第 ${i + 1} 列 · ${text}` : `第 ${i + 1} 列` });
    }
    return list;
  }

  function columnPicker(labelText, key, hint) {
    return fieldRow(labelText, select(options(), Number.isInteger(columns[key]) && columns[key] >= 0 ? String(columns[key]) : '', (value) => {
      columns[key] = value === '' ? -1 : Number(value);
      render();
    }), hint);
  }

  function render() {
    const result = parseImport(rows, { hasHeader, columns, kind });
    const head = el('div', 'modal-head');
    head.append(el('h2', 'modal-title', `${name}：哪一列是什么`));
    head.append(button('✕', close, 'icon-button'));

    const body = el('div', 'modal-body');
    body.append(checkbox('第一行是表头', hasHeader, (on) => {
      hasHeader = on;
      render();
    }));
    body.append(columnPicker('名字', 'label', kind === 'people' ? '抽中的是这一列的名字' : '奖品名在这一列'));
    body.append(columnPicker('工号', 'extKey', '用来认人：改了名字还是同一个人。没有就按名字认'));
    body.append(columnPicker('能中几次', 'stock', '留空按清单用处给默认值'));
    body.append(columnPicker('机会倍数', 'weight', '留空就是人人等概率；填 0 表示不参与'));

    body.append(previewOf());
    body.append(summaryOf(result));

    const bar = el('div', 'modal-bar');
    bar.append(el('div', 'spacer'));
    bar.append(button('取消', close, 'quiet'));
    const go = button(`导入 ${result.entries.length} 项`, () => {
      onApply?.(result.entries);
      close();
    }, 'primary');
    if (result.entries.length === 0 || result.errors.length > 0) go.disabled = true;
    bar.append(go);

    frame.replaceChildren(head, body, bar);
  }

  /** 预览：前几行铺出来，列头标出这一列被当成什么，改了下拉立刻跟着变。 */
  function previewOf() {
    const wrap = el('div', 'import-preview');
    const count = Math.min(width(), PREVIEW_COLS);
    const usage = new Map();
    for (const [key, text] of [['label', '名字'], ['extKey', '工号'], ['stock', '能中几次'], ['weight', '倍数']]) {
      if (Number.isInteger(columns[key]) && columns[key] >= 0) usage.set(columns[key], text);
    }

    const headRow = el('div', 'import-row import-row-head');
    for (let i = 0; i < count; i += 1) {
      headRow.append(el('span', undefined, usage.get(i) ?? `第 ${i + 1} 列`));
    }
    wrap.append(headRow);

    const from = hasHeader ? 1 : 0;
    for (const row of rows.slice(from, from + PREVIEW_ROWS)) {
      const line = el('div', 'import-row');
      for (let i = 0; i < count; i += 1) {
        line.append(el('span', usage.has(i) ? 'is-used' : undefined, String(row?.[i] ?? '')));
      }
      wrap.append(line);
    }
    return wrap;
  }

  function summaryOf(result) {
    const wrap = el('div', 'import-summary');
    if (result.errors.length > 0) {
      for (const item of result.errors.slice(0, 3)) {
        wrap.append(el('p', 'import-error', item.why));
      }
      if (result.errors.length > 3) {
        wrap.append(el('p', 'import-error', `还有 ${result.errors.length - 3} 行读不出来`));
      }
      return wrap;
    }
    const parts = [`能导入 ${result.entries.length} 项`];
    if (result.skipped > 0) parts.push(`跳过 ${result.skipped} 空行`);
    parts.push(weightNoteOf(result));
    wrap.append(el('p', 'import-note', parts.filter(Boolean).join(' · ')));
    return wrap;
  }

  /** 权重列里出现 0 要明说：那是「不参与」，不是「概率低一点」。 */
  function weightNoteOf(result) {
    const zeros = result.entries.filter((entry) => entry.weight === 0).length;
    return zeros > 0 ? `其中 ${zeros} 项倍数是 0，不会中` : '';
  }

  render();
  return { close };
}
