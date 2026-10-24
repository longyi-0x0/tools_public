/** 建 DOM 的小工具。页面一律是「小节 + 行」，这里给的就是那几个形状。 */

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** 卡片：准备态的环节卡片、出奖位卡片都用它。 */
export function card(title, sub, ...children) {
  const node = el('div', 'card');
  const head = el('div', 'card-head');
  head.append(el('h3', 'card-title', title));
  if (sub) head.append(el('span', 'card-sub', sub));
  node.append(head);
  for (const child of children) {
    if (child) node.append(child);
  }
  return node;
}

/** 进度条。名额不限时给一条走满的浅色，表示「没有终点」而不是「已完成」。 */
export function progressBar(used, quota) {
  const wrap = el('div', 'progress');
  const bar = el('div', 'progress-bar');
  const loose = !Number.isFinite(quota);
  const ratio = loose ? 1 : Math.max(0, Math.min(1, quota > 0 ? used / quota : 0));
  bar.style.width = `${Math.round(ratio * 100)}%`;
  if (loose) bar.classList.add('loose');
  wrap.append(bar);
  return wrap;
}

/** 折叠块：默认收起的高级设置。用 details 是为了键盘可达。 */
export function collapsible(summaryText, ...children) {
  const node = document.createElement('details');
  node.className = 'fold';
  const summary = document.createElement('summary');
  summary.textContent = summaryText;
  node.append(summary);
  for (const child of children) {
    if (child) node.append(child);
  }
  return node;
}

/** 开关：不限量、封箱这类二选一，比写 0 当魔法值清楚。 */
export function toggle(labelText, value, onChange) {
  const wrap = el('label', 'switch');
  const node = document.createElement('input');
  node.type = 'checkbox';
  node.checked = Boolean(value);
  node.addEventListener('change', () => onChange(node.checked));
  wrap.append(node, el('span', undefined, labelText));
  return wrap;
}

export function button(label, onClick, variant = '') {
  const node = el('button', variant ? `button ${variant}` : 'button', label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

/** 一节：小标题 + 可选说明 + 内容。 */
export function section(title, note, ...children) {
  const node = el('section', 'section');
  node.append(el('h2', 'section-title', title));
  if (note) node.append(el('p', 'section-note', note));
  for (const child of children) {
    if (child) node.append(child);
  }
  return node;
}

/** 一行：左边主文本，右边值或控件。 */
export function row(main, value, { sub } = {}) {
  const node = el('div', 'row');
  const left = el('div', 'row-main');
  left.append(el('span', 'row-label', main));
  if (sub) left.append(el('span', 'row-sub', sub));
  node.append(left);
  if (value !== undefined) {
    const right = el('div', 'row-value');
    if (value instanceof Node) right.append(value);
    else right.textContent = String(value);
    node.append(right);
  }
  return node;
}

/** 设置行：左边说明，右边控件，可带一小句提示。 */
export function fieldRow(labelText, control, hint) {
  const node = el('div', 'field-row');
  node.append(el('span', undefined, labelText));
  if (hint) node.append(el('span', 'hint', hint));
  node.append(control);
  return node;
}

export function actions(...children) {
  const node = el('div', 'actions');
  for (const child of children) {
    if (child) node.append(child);
  }
  return node;
}

export function select(options, value, onChange) {
  const node = document.createElement('select');
  for (const option of options) {
    const item = document.createElement('option');
    item.value = option.value;
    item.textContent = option.label;
    node.appendChild(item);
  }
  node.value = value ?? '';
  node.addEventListener('change', () => onChange(node.value));
  return node;
}

export function numberInput(value, onChange, { min = 1, step = 1, max } = {}) {
  const node = document.createElement('input');
  node.type = 'number';
  node.min = String(min);
  node.step = String(step);
  if (max !== undefined) node.max = String(max);
  node.value = String(value ?? min);
  node.addEventListener('change', () => onChange(Number(node.value)));
  return node;
}

export function textInput(value, onChange, className = '') {
  const node = document.createElement('input');
  node.type = 'text';
  if (className) node.className = className;
  node.value = value ?? '';
  node.addEventListener('change', () => onChange(node.value));
  return node;
}

export function checkbox(labelText, value, onChange) {
  const wrap = el('label', 'switch');
  const node = document.createElement('input');
  node.type = 'checkbox';
  node.checked = Boolean(value);
  node.addEventListener('change', () => onChange(node.checked));
  wrap.append(node, el('span', undefined, labelText));
  return wrap;
}
