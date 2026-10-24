/** 一点点 DOM 帮手：够这个页面用，不引框架。 */

/** 建元素。`props` 里的 `class` / `text` / `html` 单独处理，其余走属性或事件。 */
export function h(tag, props = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) {
      continue;
    }
    if (key === 'class') {
      element.className = value;
    } else if (key === 'text') {
      element.textContent = String(value);
    } else if (key === 'html') {
      element.innerHTML = value;
    } else if (key === 'dataset') {
      Object.assign(element.dataset, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key in element && key !== 'list') {
      element[key] = value;
    } else {
      element.setAttribute(key, String(value));
    }
  }
  append(element, children);
  return element;
}

function append(element, children) {
  for (const child of children.flat(4)) {
    if (child === undefined || child === null || child === false) {
      continue;
    }
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** 建一个带类名、可选文字的节点。 */
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

/** 清空一个节点。 */
export function clear(element) {
  while (element.firstChild !== null) {
    element.removeChild(element.firstChild);
  }
}

/** 把 24 小时制时间写成 `14:05`。 */
export function clockTime(ms) {
  const date = new Date(ms);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
