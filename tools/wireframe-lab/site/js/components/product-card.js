const React = globalThis.React;
const { useState } = React;

function ProductCard({
  name = "商品名称",
  price = 99,
  tag = "今日好价",
  sold = 0,
}) {
  const [liked, setLiked] = useState(false);
  return React.createElement(
    "article",
    {
      style: {
        width: "100%",
        display: "flex",
        gap: 12,
        padding: 12,
        boxSizing: "border-box",
        border: "1px solid #e7e2d8",
        borderRadius: 14,
        background: "linear-gradient(135deg,#fffdf8,#f7f4ec)",
        boxShadow: "0 4px 14px rgba(61,56,48,.05)",
        font: "400 13px/1.5 -apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif",
        color: "#2f2c27",
      },
    },
    React.createElement(
      "div",
      {
        style: {
          position: "relative",
          width: 84,
          height: 84,
          flex: "0 0 84px",
          borderRadius: 10,
          overflow: "hidden",
          background: "linear-gradient(145deg,#dbe7ff,#b8c9f2)",
        },
      },
      React.createElement("div", {
        style: {
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 30% 25%,rgba(255,255,255,.9),transparent 34%),linear-gradient(145deg,#dbe7ff,#b8c9f2)",
        },
      }),
      React.createElement(
        "div",
        {
          style: {
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 32,
            height: 27,
            transform: "translate(-50%,-42%)",
            border: "2px solid rgba(58,82,132,.55)",
            borderRadius: 6,
            background: "rgba(255,255,255,.26)",
          },
        },
        React.createElement("span", {
          style: {
            position: "absolute",
            left: "50%",
            top: -8,
            width: 15,
            height: 10,
            transform: "translateX(-50%)",
            border: "2px solid rgba(58,82,132,.55)",
            borderBottom: 0,
            borderRadius: "7px 7px 0 0",
          },
        }),
      ),
    ),
    React.createElement(
      "div",
      { style: { flex: "1 1 auto", minWidth: 0 } },
      React.createElement(
        "div",
        { style: { display: "flex", alignItems: "center", gap: 6 } },
        React.createElement(
          "span",
          {
            style: {
              flex: "0 0 auto",
              border: "1px solid #e35142",
              color: "#d94435",
              background: "#fff4f1",
              borderRadius: 4,
              padding: "0 5px",
              fontSize: 10,
              lineHeight: "17px",
            },
          },
          tag,
        ),
        React.createElement(
          "strong",
          {
            style: {
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: 14,
              fontWeight: 600,
            },
          },
          name,
        ),
      ),
      React.createElement(
        "div",
        { style: { marginTop: 4, color: "#8b8477", fontSize: 11 } },
        `已售 ${sold} · 顺丰包邮`,
      ),
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            marginTop: 7,
          },
        },
        React.createElement(
          "div",
          { style: { color: "#d94435", fontWeight: 700, fontSize: 20 } },
          React.createElement("small", { style: { fontSize: 12 } }, "¥ "),
          String(price),
        ),
        React.createElement(
          "button",
          {
            type: "button",
            onClick: () => setLiked((value) => !value),
            "aria-pressed": liked,
            style: {
              border: liked ? "1px solid #1f5eff" : "1px solid #d8d3c8",
              background: liked ? "#edf3ff" : "#fff",
              color: liked ? "#1f5eff" : "#777064",
              borderRadius: 999,
              padding: "3px 9px",
              font: "500 11px/1.4 inherit",
              cursor: "pointer",
            },
          },
          liked ? "♥ 已收藏" : "♡ 收藏",
        ),
      ),
    ),
  );
}

export default {
  id: "product-card",
  name: "商品卡",
  description: "带真实排版的复杂组件，用来验证组件撑开布局时的边界。",
  honorsStructure: false,
  slots: [],
  defaultSize: { w: 300, h: 108 },
  propsSchema: [
    { key: "name", label: "商品名", type: "string", default: "商品名称" },
    { key: "price", label: "价格", type: "number", default: 99 },
    { key: "tag", label: "角标", type: "string", default: "今日好价" },
    { key: "sold", label: "已售", type: "number", default: 0 },
  ],
  Component: ProductCard,
};
