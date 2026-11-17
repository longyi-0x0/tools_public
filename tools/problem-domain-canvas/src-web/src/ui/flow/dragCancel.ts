/**
 * 拖动中 Esc 的取消语义（IMPFIX2），框架无关的纯逻辑。
 *
 * 为什么单拎出来：xyflow 的拖动位置活在库自己的内部 store 里，松手才回调 onNodeDragStop；
 * 拖动中按 Esc 时库既不回退位置，松手还照常回调 —— 直接在回调里 beginDrag/dragTo/endDrag，
 * 就等于「按了 Esc 反而落库」。这套状态机（按下记起点 → Esc 转取消 → 松手不提交）抽成纯函数后，
 * 画布只负责把结果交给 `useReactFlow().setNodes`，所以能被 node:test 直接断死（npm test）。
 */
import type { NodeId, Point } from '../../domain/types.ts';

export interface DragStart {
  readonly id: NodeId;
  /** 按下那一刻的 flow 坐标（节点左上角）。 */
  readonly pos: Point;
}

export interface DragGuard {
  /** 按下：记起点，顺带清掉上一轮的「已取消」。 */
  begin(id: NodeId, pos: Point): void;
  /** Esc：有拖动在飞就返回起点并转为「已取消」；没有则返回 null（不抢别的 Esc 语义）。 */
  cancel(): DragStart | null;
  /** 松手：未被取消返回起点（调用方据此提交），已取消返回 null（不写文档、不进撤销栈）。 */
  settle(): DragStart | null;
  /** 是否有拖动在飞（含 Esc 后尚未松手）。 */
  active(): boolean;
}

export function createDragGuard(): DragGuard {
  let start: DragStart | null = null;
  let cancelled = false;
  return {
    begin(id, pos) {
      start = { id, pos: { x: pos.x, y: pos.y } };
      cancelled = false;
    },
    cancel() {
      if (!start) return null;
      cancelled = true;
      return start;
    },
    settle() {
      const settled = cancelled ? null : start;
      start = null;
      cancelled = false;
      return settled;
    },
    active() {
      return start !== null;
    },
  };
}

/**
 * 把被拖节点放回起点（其余节点原样返回）：Esc 时喂给 `setNodes`。
 * 位置的 x/y 拷贝一份，避免和库内部对象共享引用。
 */
export function restoreDragged<T extends { id: string; position: Point }>(
  nodes: readonly T[],
  start: DragStart,
): T[] {
  return nodes.map((node) =>
    node.id === start.id ? { ...node, position: { x: start.pos.x, y: start.pos.y } } : node,
  );
}
