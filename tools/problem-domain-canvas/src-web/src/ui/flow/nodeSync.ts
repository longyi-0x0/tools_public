/**
 * 文档 → 库内节点的同步闸门（IMPFIX3）。
 *
 * 拖动位置活在 @xyflow/react 的内部 store：库在拖动中每帧按指针改它，松手才回调 onNodeDragStop。
 * 若这时候把「文档算出来的节点数组」整份灌回去，正在拖的节点会被打回原位——用户看到的就是
 * 「拖着不走 / 一下子跳回去」。闸门只做一件事：有节点在拖动（dragging）就不接管；松手后再按文档同步。
 * 纯函数、不碰 React，所以能被 node:test 直接断死（npm test）。
 */
import type { Node } from '@xyflow/react';
import type { NodeId, Point } from '../../domain/types.ts';

/** 有节点在拖动（含 Esc 已取消、尚未松手）：此期间文档不许接管节点数组。 */
export function isDragging(nodes: readonly Node[]): boolean {
  return nodes.some((node) => node.dragging === true);
}

/** 外部改动（改名/新建/撤销/换选中）同步进库节点；返回 null = 这一步不接管（拖动中）。 */
export function syncNodes(current: readonly Node[], derived: readonly Node[]): Node[] | null {
  if (isDragging(current)) return null;
  return [...derived];
}

/** 松手：落点定到最终坐标（已吸附取整）并清掉 dragging，让下一次文档同步能接管。 */
export function settleNode(nodes: readonly Node[], id: NodeId, pos: Point): Node[] {
  return nodes.map((node) =>
    node.id === id ? { ...node, position: { x: pos.x, y: pos.y }, dragging: false } : node,
  );
}
