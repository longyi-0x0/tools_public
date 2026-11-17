/**
 * 文档 → 库内节点的同步闸门（IMPFIX3 / FIX4）。
 *
 * 拖动位置活在 @xyflow/react 的内部 store：库在拖动中每帧按指针改它，松手才回调 onNodeDragStop。
 * 若这时候把「文档算出来的节点数组」整份灌回去，正在拖的节点会被打回原位——用户看到的就是
 * 「拖着不走 / 一下子跳回去」。闸门只做一件事：有节点在拖动（dragging）就不接管；松手后再按文档同步。
 * 纯函数、不碰 React，所以能被 node:test 直接断死（npm test）。
 *
 * FIX4（「每次落子整个画板刷一下」）：映射层 toProblemFlow / toSolveFlow 每次重算都产出**全新对象**，
 * 之前这里原样返回 `[...derived]`，等于每次落子都把全部节点换成新引用 → React Flow 认为每条节点都变了
 * → 节点层整体重绘（检查角标、胶囊、尺寸测量全部重来）。现在改成**按 id 合并、内容没变就沿用旧对象**：
 *   · 位置/尺寸/类型/data 深比较，全都一样 → 返回 current 里那个旧对象（连库里量出来的 measured 也保住）；
 *   · 只有内容真的变了的节点才换成新对象；
 *   · 一条都没变（含顺序）→ 返回 null，调用方不 setState（否则 setNodes → effect → setNodes 转不停）。
 * 于是「拖一个节点」只会产生 1 个新引用，其余节点连渲染都不会进。
 */
import type { Node } from '@xyflow/react';
import type { NodeId, Point } from '../../domain/types.ts';

/** 有节点在拖动（含 Esc 已取消、尚未松手）：此期间文档不许接管节点数组。 */
export function isDragging(nodes: readonly Node[]): boolean {
  return nodes.some((node) => node.dragging === true);
}

/** 深比较：原始值（含 NaN）、数组、纯对象。只用来判断「这条节点的内容有没有变」。 */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const leftIsArray = Array.isArray(a);
  if (leftIsArray !== Array.isArray(b)) return false;
  if (leftIsArray) {
    const left = a as readonly unknown[];
    const right = b as readonly unknown[];
    return left.length === right.length && left.every((entry, index) => sameValue(entry, right[index]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => key in right && sameValue(left[key], right[key]));
}

/**
 * 库内节点与文档派生节点的内容是否等价。
 * 只比文档说了算的字段：type / position / style / data。
 * 不比顶层的 `selected`（FIX6）：它的值和 data.selected 永远同源、同时翻转，
 * 换选中时 data 已经不同、节点对象照样会换；单独再比一次只是多一次无谓的替换。
 */
function sameNode(current: Node, derived: Node): boolean {
  return (
    current.type === derived.type &&
    sameValue(current.position, derived.position) &&
    sameValue(current.style, derived.style) &&
    sameValue(current.data, derived.data)
  );
}

/**
 * 外部改动（改名/新建/撤销/换选中）同步进库节点；返回 null = 这一步不接管：
 * 拖动中（闸门），或所有节点内容与顺序都没变（不 setState）。
 */
export function syncNodes(current: readonly Node[], derived: readonly Node[]): Node[] | null {
  if (isDragging(current)) return null;
  const byId = new Map(current.map((node) => [node.id, node]));
  const next = derived.map((node) => {
    const prev = byId.get(node.id);
    // 内容没变：沿用旧对象引用（React Flow 据此跳过这条节点的更新与重绘）。
    return prev && sameNode(prev, node) ? prev : node;
  });
  const changed =
    next.length !== current.length || next.some((node, index) => node !== current[index]);
  return changed ? next : null;
}

/** 松手：落点定到最终坐标（已吸附取整）并清掉 dragging，让下一次文档同步能接管。 */
export function settleNode(nodes: readonly Node[], id: NodeId, pos: Point): Node[] {
  return nodes.map((node) =>
    node.id === id ? { ...node, position: { x: pos.x, y: pos.y }, dragging: false } : node,
  );
}
