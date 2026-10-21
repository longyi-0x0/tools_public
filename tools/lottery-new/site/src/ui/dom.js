/** 建 DOM 的小工具。页面一律是「小节 + 行」，这里给的就是那几个形状。 */

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
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
