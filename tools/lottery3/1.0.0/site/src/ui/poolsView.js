/**
 * 清单详情页：名字 + 用处 + 条目 + 导入。
 *
 * 默认是一张能直接改的表格：一行一个人，改名字、改能中几次都在行内。
 * 批量编辑（整段文本）收进折叠里，它适合一次粘几百行，但不该是唯一入口。
 * 条目靠外部主键认身份：改了名字还是同一个人，历史占额不断。
 */

import {
  el, button, section, actions, textInput, collapsible, select,
} from './dom.js';
import { createEntry, mergeEntries } from '../domain/pool.js';
import { usageOf } from '../domain/ledger.js';
import { readXlsx, writeXlsx } from '../xlsx.js';
import { poolKindLabel, stockTextOf, stockValueOf } from './labels.js';
import { nameOf } from './naming.js';

const HEADER_WORDS = ['姓名', '名字', '名称', '奖品', '奖项', '条目', '参与人'];

export function poolPage({ store, pool, refresh, onDeleted }) {
  const head = el('div', 'detail-head');
  head.append(textInput(pool.name, (name) => {
    patch(store, pool.id, () => ({ name }), refresh);
  }, 'detail-title'));

  const total = pool.entries.reduce((sum, entry) => sum + (entry.stock === Infinity ? 0 : entry.stock), 0);
  const unlimited = pool.entries.some((entry) => entry.stock === Infinity);
  head.append(el('p', 'detail-sub', [
    `${pool.entries.length} 项`,
    Number.isFinite(total) && total > 0 ? `能中合计 ${total} 次` : null,
    unlimited ? '含不限量' : null,
  ].filter(Boolean).join(' · ')));

  const kindRow = el('div', 'inline');
  kindRow.append(el('span', 'field-caption', '这张清单装的是'));
  kindRow.append(select(
    ['people', 'prize', 'generic'].map((kind) => ({ value: kind, label: poolKindLabel(kind) })),
    pool.kind,
    (kind) => patch(store, pool.id, () => ({ kind }), refresh),
  ));
  head.append(kindRow);

  const body = el('div', 'detail-body');

  const list = section(
    '条目',
    pool.kind === 'people'
      ? '一行一个人。能中几次默认 1，中过就不再进候选。'
      : '一行一份奖品。能中几次填份数，留空表示不限。',
  );
  list.append(entryTable({ store, pool, refresh }));
  list.append(actions(button('＋ 加一行', () => addEntry(store, pool, refresh), 'quiet')));
  body.append(list);

  body.append(bulkEditor({ store, pool, refresh }));

  const io = actions(
    button('导入 xlsx 第一张表', () => importXlsx(store, pool, refresh)),
    button('导出 xlsx', () => exportXlsx(pool), 'quiet'),
    button('删除这张清单', () => {
      if (!window.confirm('删除这张清单？已经中过的人不会受影响，记录里照常显示名字。')) return;
      store.update((s) => ({ ...s, pools: s.pools.filter((item) => item.id !== pool.id) }));
      onDeleted();
    }, 'danger'),
  );
  body.append(io);

  body.append(usageSection({ store, pool }));

  const detail = el('div', 'detail');
  detail.append(head, body);
  return detail;
}

/* ---------- 表格态 ---------- */

function entryTable({ store, pool, refresh }) {
  const wrap = el('div', 'entry-table');
  const usage = usageOf({ rounds: store.state.rounds });

  const header = el('div', 'entry-row entry-head');
  header.append(el('span', undefined, pool.kind === 'people' ? '名字' : '奖品'));
  header.append(el('span', undefined, '能中几次'));
  header.append(el('span', undefined, ''));
  wrap.append(header);

  pool.entries.forEach((entry, index) => {
    wrap.append(entryRow({ store, pool, entry, index, usage, refresh }));
  });

  if (pool.entries.length === 0) {
    wrap.append(el('p', 'empty', '还没有条目。点下面「加一行」，或导入 xlsx。'));
  }
  return wrap;
}

/**
 * 一行条目。改名字时：这一项还没被抽中过，就用新名字重算身份（导入同一份名单
 * 不会多出一份）；已经中过了则只改显示的名字，保住历史占额不断。
 */
function entryRow({ store, pool, entry, index, usage, refresh }) {
  const row = el('div', 'entry-row');

  const name = textInput(entry.label, (label) => {
    patchEntries(store, pool.id, (entries) => entries.map((item, i) => {
      if (i !== index) return item;
      if ((usage.get(item.id) ?? 0) > 0) return { ...item, label };
      return createEntry({ ...item, id: undefined, label, extKey: label || item.extKey, source: 'manual' });
    }), refresh);
  }, 'entry-name');
  row.append(name);

  const stock = document.createElement('input');
  stock.type = 'text';
  stock.className = 'entry-stock';
  stock.value = stockValueOf(entry.stock);
  stock.placeholder = '不限';
  stock.addEventListener('change', () => {
    const raw = stock.value.trim();
    const value = raw === '' || raw === '不限' ? Infinity : Math.max(1, Math.floor(Number(raw)) || 1);
    patchEntries(store, pool.id, (entries) => entries.map((item, i) => (
      i === index ? { ...item, stock: value } : item
    )), refresh);
  });
  row.append(stock);

  row.append(button('✕', () => {
    patchEntries(store, pool.id, (entries) => entries.filter((_, i) => i !== index), refresh);
  }, 'icon-button danger'));

  return row;
}

/** 批量编辑：一次性粘几百行时比一行行加快得多，所以留着，只是不当默认。 */
function bulkEditor({ store, pool, refresh }) {
  const fold = collapsible('批量编辑（整段文本）');
  fold.append(el('p', 'section-note', '一行一条：名字,能中几次,工号。后两列可省；工号是身份，改名字不会换成另一个人。'));

  const text = document.createElement('textarea');
  text.rows = 12;
  text.value = pool.entries.map(lineOf).join('\n');
  text.addEventListener('change', () => {
    patchEntries(store, pool.id, () => entriesFrom(text.value, pool.entries), refresh);
  });
  fold.append(text);
  return fold;
}

/* ---------- 已中次数 ---------- */

function usageSection({ store, pool }) {
  const usage = usageOf({ rounds: store.state.rounds });
  const hit = pool.entries
    .map((entry) => ({ entry, used: usage.get(entry.id) ?? 0 }))
    .filter((item) => item.used > 0)
    .sort((a, b) => b.used - a.used);

  if (hit.length === 0) {
    return section('已中次数', '账本里还没有这张清单的占额。', el('p', 'empty', '一次都还没中过。'));
  }

  const node = section('已中次数', '从已入账的轮次算出来，撤销一轮就跟着回滚；这里改不了。');
  for (const { entry, used } of hit) {
    const line = el('div', 'row');
    const left = el('div', 'row-main');
    left.append(el('span', 'row-label', entry.label || '（未命名）'));
    if (entry.extKey) left.append(el('span', 'row-sub', entry.extKey));
    line.append(left);
    line.append(el('div', 'row-value', `${used} / ${stockTextOf(entry.stock)}`));
    node.append(line);
  }
  return node;
}

/* ---------- 增删改 ---------- */

function addEntry(store, pool, refresh) {
  patchEntries(store, pool.id, (entries) => [
    ...entries,
    createEntry({ label: '', stock: pool.kind === 'people' ? 1 : 1 }),
  ], refresh);
}

function patchEntries(store, poolId, patcher, refresh) {
  store.update((state) => ({
    ...state,
    pools: state.pools.map((pool) => (
      pool.id === poolId ? { ...pool, entries: patcher(pool.entries ?? []) } : pool
    )),
  }));
  refresh();
}

function patch(store, poolId, patcher, refresh) {
  store.update((state) => ({
    ...state,
    pools: state.pools.map((pool) => (
      pool.id === poolId ? { ...pool, ...patcher(pool) } : pool
    )),
  }));
  refresh();
}

async function importXlsx(store, pool, refresh) {
  const input = document.getElementById('file');
  if (!input) return;
  input.value = '';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const rows = await readXlsx(await file.arrayBuffer());
      const lines = rows
        .map((row) => (Array.isArray(row) ? row : [row]))
        .filter((row) => row.length > 0)
        .map((row) => row.map((cell) => String(cell ?? '').trim()));
      const start = lines.length > 0 && HEADER_WORDS.some((word) => (lines[0][0] ?? '').includes(word)) ? 1 : 0;
      const incoming = lines.slice(start)
        .map(([label, weight, stock, extKey]) => ({ label, weight, stock, extKey: extKey || label }))
        .filter((row) => row.label);

      const { entries, rejected } = mergeEntries(pool.entries, incoming);
      patchEntries(store, pool.id, () => entries, refresh);
      if (rejected.length > 0) window.alert(`有 ${rejected.length} 行没有身份列，已跳过。`);
    } catch (error) {
      window.alert(`读不出来：${error.message}`);
    }
  };
  input.click();
}

async function exportXlsx(pool) {
  const rows = [[pool.kind === 'people' ? '姓名' : '奖品', '能中几次', '工号']];
  for (const entry of pool.entries) {
    rows.push([entry.label, stockValueOf(entry.stock) || '不限', entry.extKey ?? '']);
  }
  const blob = await writeXlsx(rows, '清单');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${nameOf(pool)}.xlsx`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function lineOf(entry) {
  const stock = entry.stock === Infinity ? '不限' : entry.stock;
  return [entry.label, stock, entry.extKey ?? ''].join(',');
}

/** 从整段文本重建条目：出现在这段文本里的行才算成员，删掉的行就真的删了。 */
function entriesFrom(text, previous = []) {
  const byLabel = new Map(previous.map((entry) => [entry.label, entry]));
  const incoming = [];

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [label, stock, extKey] = trimmed.split(',').map((part) => part.trim());
    if (!label) continue;
    const kept = byLabel.get(label);
    incoming.push(createEntry({
      id: kept?.id,
      source: kept?.source ?? 'manual',
      extKey: extKey || kept?.extKey || label,
      label,
      weight: kept?.weight ?? 1,
      stock: stock === undefined || stock === '' || stock === '不限' ? Infinity : stock,
      tags: kept?.tags ?? [],
      meta: kept?.meta ?? {},
    }));
  }

  return mergeEntries([], incoming).entries;
}
