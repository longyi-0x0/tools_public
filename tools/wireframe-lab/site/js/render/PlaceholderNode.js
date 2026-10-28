import { h } from "./h.js";

/**
 * 所有候选都解析不到时的形态：虚线框 + 多行 desc + 角标写第一个候选原文。
 * desc 为空就显示候选的最后一段，避免出现空白块。
 */
export function PlaceholderNode({ node, source, editMode }) {
  const text = (node.desc && node.desc.trim()) || shortName(source) || "未命名区域";
  return h(
    "div",
    { className: "wf-placeholder wf-placeholder--unresolved" },
    [
      h("span", { className: "wf-placeholder-text", key: "text" }, text),
      source
        ? h(
            "span",
            {
              className: `wf-bound-badge is-danger${editMode ? "" : " is-quiet"}`,
              key: "badge",
              "aria-hidden": "true",
            },
            `解析不到：${source}`,
          )
        : null,
    ],
  );
}

function shortName(source) {
  if (typeof source !== "string" || !source) return "";
  const bare = source.includes(":") ? source.slice(source.indexOf(":") + 1) : source;
  const parts = bare.split(".");
  return parts[parts.length - 1] || bare;
}
