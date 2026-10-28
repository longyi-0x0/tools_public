import { h, react } from "./h.js";
import { SlotContext } from "./slot-context.js";

/**
 * 真组件内部开窗：这块区域交还给线框渲染器，里面照旧能拖、能切布局、能再绑组件。
 * name 省略时取该节点的匿名子节点。
 */
export function WireSlot({ name = "default", fallback = null, className = "" }) {
  const context = react().useContext(SlotContext);
  if (!context) return fallback;
  const content = name === "default" ? context.children : context.slots[name];
  const empty = !content || content.length === 0;
  const classes = `wf-slot wf-slot-${name}${className ? ` ${className}` : ""}`;
  return h(
    "div",
    {
      className: classes,
      "data-slot-parent": context.nodeId,
      "data-slot-name": name,
    },
    empty
      ? context.editMode
        ? h("span", { className: "wf-slot-empty" }, `+ ${name}`)
        : null
      : content,
  );
}

export { SlotContext };
