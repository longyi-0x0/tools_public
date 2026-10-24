/**
 * 控制台与观众屏之间的那根线：单向推指令，观众屏只画不说话。
 *
 * 用 `window.open` + `postMessage` 而不是 BroadcastChannel：后者在 `file://` 下
 * origin 是 null，直接失效；前者拿 '*' 当目标，两种协议下都能跑。
 * 开不出窗口（被浏览器拦了、或这是内嵌壳）就降级成单屏，控制台自己全屏演。
 */

export function createLink() {
  let win = null;
  let degraded = false;
  /** 观众屏刚打开时可能还没 ready，把最后一条状态留着给它补发。 */
  let last = null;

  function open() {
    degraded = false;
    try {
      win = window.open('audience.html', 'lottery3-audience', 'width=1280,height=720');
    } catch (error) {
      win = null;
    }
    if (!win) {
      degraded = true;
      return false;
    }
    return true;
  }

  function send(message) {
    last = message;
    if (!win || win.closed) return false;
    try {
      win.postMessage({ source: 'lottery3-console', ...message }, '*');
      return true;
    } catch (error) {
      return false;
    }
  }

  /** 观众屏说「我好了」时把当前状态补给它，省得它开在半路错过一条。 */
  function replay() {
    if (last) send(last);
  }

  function close() {
    try {
      win?.close();
    } catch (error) {
      // 关不掉无所谓，控制台这边的状态已经清了。
    }
    win = null;
    last = null;
  }

  return {
    open,
    send,
    replay,
    close,
    isOpen: () => Boolean(win && !win.closed),
    isDegraded: () => degraded || !win || win.closed,
  };
}

/** 控制台收观众屏的招呼。返回取消监听的函数。 */
export function onAudienceHello(handler) {
  const listener = (event) => {
    const data = event.data;
    if (!data || data.source !== 'lottery3-audience') return;
    if (data.type === 'hello') handler();
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}
