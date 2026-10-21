/**
 * 池详情页：名字 + 条目 + 导入。
 *
 * 池不区分人员与奖品，份数写几就能被抽中几次；权重写 0 表示不参与。
 * 条目按名字保住 id，账本里记着的旧记录才对得上。
 */

import { el, button, section, actions, textInput } from './dom.js';
import { createEntry } from '../domain/pool.js';
import { readXlsx } from '../xlsx.js';

export function poolPage({ store, pool, refresh, onDeleted }) {
  const head = el('div', 'detail-head');
  head.append(textInput(pool.name, (name) => {
    store.update((state) => ({
      ...state,
      pools: state.pools.map((item) => (item.id === pool.id ? { ...item, name } : item)),
    }));
    refresh();
  }, 'detail-title'));

  const total = pool.entries.reduce((sum, entry) => sum + (entry.stock ?? 1), 0);
  head.append(el('p', 'detail-sub', `${pool.entries.length} 条 · 份数合计 ${total}`));

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
    '一行一条：名字,权重,份数。权重与份数可省略，缺省都是 1。',
    text,
    actions(
      button('导入 xlsx 第一张表', () => importXlsx(store, pool, refresh)),
      button('删除这个池', () => {
        store.update((state) => ({ ...state, pools: state.pools.filter((item) => item.id !== pool.id) }));
        onDeleted();
      }, 'danger'),
    ),
  ));

  const detail = el('div', 'detail');
  detail.append(head, body);
  return detail;
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
      const entries = rows
        .flat()
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
        .map((label) => createEntry({ label }));
      store.update((state) => ({
        ...state,
        pools: state.pools.map((item) => (
          item.id === pool.id ? { ...item, entries: [...item.entries, ...entries] } : item
        )),
      }));
      refresh();
    } catch (error) {
      window.alert(`读不出来：${error.message}`);
    }
  };
  input.click();
}

function lineOf(entry) {
  return [entry.label, entry.weight ?? 1, entry.stock ?? 1].join(',');
}

function entriesFrom(text, previous = []) {
  const byLabel = new Map(previous.map((entry) => [entry.label, entry]));
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, weight, stock] = line.split(',').map((part) => part.trim());
      if (!label) return null;
      const kept = byLabel.get(label);
      return createEntry({
        id: kept?.id,
        label,
        weight: weight === undefined || weight === '' ? (kept?.weight ?? 1) : Number(weight),
        stock: stock === undefined || stock === '' ? (kept?.stock ?? 1) : Number(stock),
      });
    })
    .filter(Boolean);
}
