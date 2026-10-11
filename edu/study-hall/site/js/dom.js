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
      node.textContent = value;
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
 * 「撤销这一趟」。`options.closeLabel` / `closeTitle` 改那颗 ✕ 的说法 —— 光写「关闭」
 * 会让人以为跟脚上的「完成」是一回事。
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
      text: '✕',
      'aria-label': options.closeLabel ?? '关闭',
      title: options.closeTitle,
      onClick: options.onClose,
    }),
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
