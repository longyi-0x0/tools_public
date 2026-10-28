import { react } from "./h.js";

/**
 * 目标组件靠这个上下文把插槽交还给宿主的线框渲染器。
 * 值是 { nodeId, slots, children }，都是已经渲染好的 React 节点。
 */
export const SlotContext = react().createContext(null);
