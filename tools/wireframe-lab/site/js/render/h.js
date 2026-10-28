/**
 * 页面是免打包的原生 ESM，没有 JSX 编译，React 侧一律走 createElement。
 * 这里把全局 UMD 取出来，避免每个模块自己伸手。
 */
export function h(type, props, ...children) {
  return globalThis.React.createElement(type, props, ...children);
}

export function react() {
  if (!globalThis.React) throw new Error("React 尚未加载");
  return globalThis.React;
}
