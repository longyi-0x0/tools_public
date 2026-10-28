const React = globalThis.React;
const { useState } = React;

function BuyButton({ label = "加入购物车", disabled = false }) {
  const [count, setCount] = useState(0);
  return React.createElement(
    "button",
    {
      type: "button",
      disabled,
      onClick: () => setCount((value) => value + 1),
      style: {
        width: "100%",
        height: "100%",
        minHeight: 40,
        border: 0,
        borderRadius: 999,
        background: disabled ? "#c9c7c2" : "#1f5eff",
        color: "#fff",
        font: "600 14px/1 -apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif",
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled ? "none" : "0 6px 16px rgba(31,94,255,.22)",
        padding: "0 8px",
        whiteSpace: "nowrap",
        transition: "transform .12s ease, box-shadow .12s ease",
      },
      onMouseDown: (event) => {
        if (!disabled) event.currentTarget.style.transform = "scale(.96)";
      },
      onMouseUp: (event) => {
        event.currentTarget.style.transform = "";
      },
      onMouseLeave: (event) => {
        event.currentTarget.style.transform = "";
      },
    },
    count > 0 ? `${label} · ${count}` : label,
  );
}

export default {
  id: "buy-button",
  name: "购买按钮",
  description: "带点击反馈的真实按钮，用来验证接管区域的可交互性。",
  defaultSize: { w: 58, h: 58 },
  propsSchema: [
    { key: "label", label: "按钮文字", type: "string", default: "加购" },
    { key: "disabled", label: "禁用", type: "boolean", default: false },
  ],
  mount(element, props) {
    const root = globalThis.ReactDOM.createRoot(element);
    root.render(React.createElement(BuyButton, props));
    return () => root.unmount();
  },
};
