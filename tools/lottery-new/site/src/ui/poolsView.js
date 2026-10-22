/**
 * 池详情页：名字 + 条目 + 导入。
 *
 * 池不区分人员与奖品，份数写几就能被抽中几次；权重写 0 表示不参与。
 * 条目靠外部主键认身份：改了名字还是同一个人，历史占额不断；主键变了才是另一个人。
 */

import { el, button, section, actions, textInput } from './dom.js';
import { createEntry, mergeEntries } from '../domain/pool.js';
import { usageOf } from '../domain/ledger.js';
import { readXlsx, writeXlsx } from '../xlsx.js';

const HEADER_WORDS = ['姓名', '名字', '名称', '奖品', '奖项', '条目', '参与人'];

export function poolPage({ store, pool, refresh, onDeleted }) {
  const head = el('div', 'detail-head');
  head.append(textInput(pool.name, (name) => {
    store.update((state) => ({
      ...state,
      pools: state.pools.map((item) => (item.id === pool.id ? { ...item, name } : item)),
    }));
    refresh();
  }, 'detail-title'));

  const total = pool.entries.reduce((sum, entry) => sum + (entry.stock === Infinity ? 0 : entry.stock), 0);
  const unlimited = pool.entries.some((entry) => entry.stock === Infinity);
  head.append(el('p', 'detail-sub', `${pool.entries.length} 条 · 份数合计 ${total}${unlimited ? ' · 含不限量' : ''}`));

  const body = el('div', 'detail-body');

  const text = document.createElement('textarea');
  text.rows = 14;
  text.value = pool.entries.map(lineOf).join('\n');
  text.addEventListener('change', () => {
    store.update((state) => ({
      ...state,
      pools: state.pools.map((item) => (
        item.id === pool.id ? { ...item, entries: entriesFrom(text.value, pool.entries) } : item
      )),
    }));
    refresh();
  });

  body.append(section(
    '条目',
    '一行一条：名字,权重,份数,工号。后三列可省；工号是身份，改名字不会换成另一个人。',
    text,
    actions(
      button('导入 xlsx 第一张表', () => importXlsx(store, pool, refresh)),
      button('导出 xlsx', () => exportXlsx(pool), 'quiet'),
      button('删除这个池', () => {
        store.update((state) => ({ ...state, pools: state.pools.filter((item) => item.id !== pool.id) }));
        onDeleted();
      }, 'danger'),
    ),
  ));

  body.append(usageSection({ store, pool }));

  const detail = el('div', 'detail');
  detail.append(head, body);
  return detail;
}

/** 已中次数只读：它由账本算出来，界面上不提供任何手改入口。 */
function usageSection({ store, pool }) {
  const usage = usageOf({ rounds: store.state.rounds });
  const hit = pool.entries
    .map((entry) => ({ entry, used: usage.get(entry.id) ?? 0 }))
    .filter((item) => item.used > 0)
    .sort((a, b) => b.used - a.used);

  if (hit.length === 0) {
    return section('已中次数', '账本里还没有这个池的占额。', el('p', 'empty', '一条都没有。'));
  }

  const node = section('已中次数', '从已入账的轮次算出来，撤销一轮就跟着回滚；这里改不了。');
  for (const { entry, used } of hit) {
    const line = el('div', 'row');
    const left = el('div', 'row-main');
    left.append(el('span', 'row-label', entry.label || '（未命名）'));
    if (entry.extKey) left.append(el('span', 'row-sub', entry.extKey));
    line.append(left);
    const right = el('div', 'row-value', `${used} / ${entry.stock === Infinity ? '不限' : entry.stock}`);
    line.append(right);
    node.append(line);
  }
  return node;
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
      store.update((state) => ({
        ...state,
        pools: state.pools.map((item) => (item.id === pool.id ? { ...item, entries } : item)),
      }));
      refresh();
      if (rejected.length > 0) window.alert(`有 ${rejected.length} 行没有主键，已跳过。`);
    } catch (error) {
      window.alert(`读不出来：${error.message}`);
    }
  };
  input.click();
}

async function exportXlsx(pool) {
  const rows = [['名字', '权重', '份数', '工号']];
  for (const entry of pool.entries) {
    rows.push([entry.label, entry.weight, entry.stock === Infinity ? '不限' : entry.stock, entry.extKey]);
  }
  const { writeXlsx } = await import('../xlsx.js');
  const blob = await writeXlsx(rows, '池');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${pool.name || '池'}.xlsx`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function lineOf(entry) {
  const stock = entry.stock === Infinity ? '不限' : entry.stock;
  return [entry.label, entry.weight ?? 1, stock, entry.extKey ?? ''].join(',');
}

/**
 * 从文本重建条目：文本框里出现的行才算这个池的成员，删掉的行就真的删了；
 * 重复导入撞上同一个主键时更新而不是新建（R-20）。
 */
function entriesFrom(text, previous = []) {
  const byLabel = new Map(previous.map((entry) => [entry.label, entry]));
  const incoming = [];
  const keptLabels = new Set();

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [label, weight, stock, extKey] = trimmed.split(',').map((part) => part.trim());
    if (!label) continue;
    keptLabels.add(label);
    const kept = byLabel.get(label);
    incoming.push(createEntry({
      id: kept?.id,
      source: kept?.source ?? 'manual',
      extKey: extKey || kept?.extKey || label,
      label,
      weight: weight === undefined || weight === '' ? (kept?.weight ?? 1) : weight,
      stock: stock === undefined || stock === '' ? (kept?.stock ?? 1) : stock,
      tags: kept?.tags ?? [],
      meta: kept?.meta ?? {},
    }));
  }

  const kept = previous.filter((entry) => keptLabels.has(entry.label));
  return mergeEntries(kept, incoming).entries;
}
