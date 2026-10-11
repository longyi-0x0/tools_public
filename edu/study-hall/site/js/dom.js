/**
 * DOM 小工具与浮层壳。
 *
 * 没有框架：`h` 拼节点，`modalFrame` 搭一层浮层的壳。关窗那一手由调用方给
 * （`options.onClose`）—— 点名层的「关」是撤销这一趟，与别的浮层不是一件事，
 * 所以这一层不认识任何具体浮层。
 */
export const root = document.getElementById('root');

export function h(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === false || value === null) {
      continue;
    }
    if (key === 'class') {
      node.className = value;
    } else if (key === 'text') {
      // 与 children 同时给时，文字当第一个孩子 —— 直接写 textContent 会把后面追加的
      // 子节点（图标之类）挤到字后面去
      node.append(document.createTextNode(value));
    } else if (key === 'html') {
      node.innerHTML = value;
    } else if (key === 'value') {
      // 一定要设**属性值**：textarea 的 value 不是 HTML 属性，按属性写进去不显示
      node.value = value;
    } else if (key === 'checked') {
      node.checked = value;
    } else if (key === 'selected') {
      node.selected = value;
    } else if (key === 'dataset') {
      // dataset 不是 HTML 属性，得逐项写到元素上；走 setAttribute 只会得到
      // "[object Object]" 这样的垃圾属性，之后再 querySelector('[data-x]') 就找不着
      for (const [name, item] of Object.entries(value)) {
        if (item !== undefined && item !== null) {
          node.dataset[name] = String(item);
        }
      }
    } else if (key.startsWith('on')) {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) {
      node.setAttribute(key, '');
    } else {
      node.setAttribute(key, value);
    }
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === undefined || child === null || child === false) {
      continue;
    }
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function uid(prefix) {
  const random = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

/**
 * 内联 SVG 图标。
 *
 * 用 SVG 而不是 emoji：emoji 的画法各家系统不一样（同一个 🎙️ 在 Mac、Windows、
 * 投影仪上三个样子），而这块屏常常是教室前面的投影。SVG 跟着 `currentColor` 走，
 * 换主题、换深浅底都不必另配一套。
 */
const ICON_PATHS = {
  close: 'M6 6l12 12M18 6L6 18',
  fullscreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  'mic-off': 'M9 9V6a3 3 0 0 1 5.9-.8M15 12v0a3 3 0 0 1-4.5 2.6M5 11a7 7 0 0 0 10.9 5.8M12 18v3M4 4l16 16',
  volume: 'M4 9v6h4l5 4V5L8 9H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  'volume-off': 'M4 9v6h4l5 4V5L8 9H4zM17 9.5l4 5M21 9.5l-4 5',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z',
  sun: 'M12 5V3M12 21v-2M5 12H3M21 12h-2M6.3 6.3L4.9 4.9M19.1 19.1l-1.4-1.4M17.7 6.3l1.4-1.4M4.9 19.1l1.4-1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2',
  'chevron-left': 'M14 6l-6 6 6 6',
  'chevron-right': 'M10 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  download: 'M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14',
  upload: 'M12 16V5M7.5 9.5L12 5l4.5 4.5M5 19h14',
  check: 'M5 12.5l4.5 4.5L19 7',
  pause: 'M9 5v14M15 5v14',
  play: 'M7 4l12 8-12 8V4z',
  history: 'M12 21a9 9 0 1 0-9-9M3 12h0M12 7v5l3.5 2M3 4v5h5',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.4-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  users: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 20v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 4.2a3.5 3.5 0 0 1 0 6.6',
  restart: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
  'log-out': 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11',
};

/** 一颗图标。`aria-hidden` 默认给上 —— 图标旁边的字已经把话说清了。 */
export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICON_PATHS[name] ?? ICON_PATHS.close);
  svg.append(path);
  return svg;
}

/**
 * 一颗图标 + 一行字，给按钮当内容用。
 *
 * 图标在字前面：那一排钮里，图标是辨认形状的第一眼，字是确认第二眼。反过来写，
 * 眼睛每次都得先读完字才看出那是「返回」还是「记录」。
 */
export function withIcon(name, text) {
  return [icon(name), document.createTextNode(text)];
}

/**
 * 浮层一出来就把焦点送进去。
 *
 * 键盘老师按下的那一刻焦点在触发它的那颗钮上，浮层一出来整棵树重画、焦点掉回 body，
 * 再按 Tab 会从班级列表开头走一圈。所以浮层刚出现时把焦点送进去，顺序是：
 * `data-autofocus`（备注要打字、设置要改名字）→ 第一个输入类控件 → 浮层本身。
 *
 * 一轮按钮排在最后是有意的：浮层头上的第一颗钮是「✕」，焦点若落在它上面，老师顺手
 * 一个回车就把刚打开的窗又关了。点名层的 ✕ 也是这个道理 —— 那里一次点空就是撤销一整趟，
 * 更不该让一个回车碰上。
 *
 * 只做「进来」不做「出去」：关闭时那颗触发它的钮已经是新节点了，硬要还原得给每颗钮
 * 编个号，不值当 —— Esc 与 Tab 能走通就够用了。
 */
export function focusIntoOverlay() {
  const modal = root.querySelector('.modal');
  if (modal === null) {
    return;
  }
  const target =
    modal.querySelector('[data-autofocus]') ??
    modal.querySelector('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])');
  (target ?? modal).focus?.();
}

/**
 * 一块浮层的壳：标题栏 + 内容 + 底下一排钮。
 *
 * `options.onClose` 是**关这一层的那一手**，由调用方给：多数浮层就是收窗，点名层却是
 * 「撤销这一趟」。`options.closeLabel` 改那颗 ✕ 的说法 —— 光写「关闭」会让人以为跟
 * 脚上的「完成」是一回事。
 */
export function modalFrame(title, bodyNodes, footNodes, options = {}) {
  // tabindex：浮层里一个输入控件都没有时（比如自习记录），焦点落在浮层本身，
  // 既算「进来了」，回车也不会误触里面任何一颗钮
  const modal = h('div', {
    class: `modal ${options.class ?? ''}`.trim(),
    role: 'dialog',
    'aria-modal': 'true',
    tabindex: '-1',
  });
  const head = h('div', { class: 'modal__head' });
  head.append(h('h2', { class: 'modal__title', text: title }));
  head.append(
    h('button', {
      class: 'btn btn--icon',
      'aria-label': options.closeLabel ?? '关闭',
      onClick: options.onClose,
    }, [icon('close')]),
  );
  modal.append(head);
  const body = h('div', { class: 'modal__body' });
  for (const node of bodyNodes) {
    body.append(node);
  }
  modal.append(body);
  if (footNodes !== undefined) {
    const foot = h('div', { class: 'modal__foot' });
    for (const node of footNodes) {
      foot.append(node);
    }
    modal.append(foot);
  }
  const scrim = h('div', { class: 'scrim', onClick: options.onClose });
  return h('div', { class: 'overlay' }, [scrim, modal]);
}

export function toggleFullscreen() {
  if (document.fullscreenElement === null) {
    void document.documentElement.requestFullscreen?.();
  } else {
    void document.exitFullscreen?.();
  }
}

/** 进自习那一下顺手要一次浏览器全屏：教室前面的屏，不该留着地址栏。 */
export function requestFullscreen() {
  try {
    void document.documentElement.requestFullscreen?.();
  } catch {
    /* 浏览器不给就算了，蒙版本身已经盖满视口 */
  }
}
