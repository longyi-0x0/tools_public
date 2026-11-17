/**
 * 层级布局（03 §2.4 / 02 §7 / 04 §1.3）。
 *
 * 规则：父在上、子在下（用户已确认参考图里的「父下子上」不是有意设计），同级水平排布，
 * 父节点居子节点中点；叶节点按文档顺序占槽；间距按 02 §7 的最小值（横 32 / 纵 40）。
 * 纯函数：不读 DOM / 时钟 / 随机；环输入靠 visited 收敛（显式栈，不递归，长链不爆栈）。
 *
 * 坐标约定：`positions` 存**卡片中心**；渲染与拖动用左上角，由 `resolvePositions()` 换算。
 * 节点 `pos` 非 (0,0) 视为用户手动摆过（拖动 / 画布双击新建），优先于布局。
 */
import type { AnyNodeOf, DocIndex, NodeId, Point, Workspace } from './types.ts';

export const QUESTION_W = 176;
export const QUESTION_H = 48;
export const CORE_W = 208;
export const CORE_H = 56;
/** 02 §7：画布节点最小间距 32px（横向）/ 40px（纵向）。 */
export const GAP_X = 32;
export const GAP_Y = 40;
/** 槽宽 = 最宽的问题卡（核心 208）+ 横向间距 32。 */
export const SLOT_W = CORE_W + GAP_X;
/** 行高 = 高的问题卡（核心 56）+ 纵向间距 40。 */
export const ROW_H = CORE_H + GAP_Y;

const ORIGIN_X = 40;
const ORIGIN_Y = 40;

export interface LayoutResult {
  /** 卡片中心坐标。 */
  readonly positions: ReadonlyMap<NodeId, Point>;
  readonly depthOf: ReadonlyMap<NodeId, number>;
  readonly bounds: { x: number; y: number; width: number; height: number };
}

export function cardSizeOf(coreId: NodeId | null, id: NodeId): { width: number; height: number } {
  return id === coreId ? { width: CORE_W, height: CORE_H } : { width: QUESTION_W, height: QUESTION_H };
}

interface Frame {
  id: NodeId;
  kids: readonly NodeId[];
  index: number;
  firstSlot: number;
  lastSlot: number;
  depth: number;
}

/**
 * 问题树布局：根 = 核心问题，无父问题与环岛依次补在根序列后面。
 * 每个叶节点占一个槽；父节点的槽 = 首末子节点槽的中点，因此父卡恒在子卡上方且水平居中。
 */
export function layoutProblemTree(ws: Workspace, index: DocIndex): LayoutResult {
  const questionIds = ws.nodes.filter((node) => node.type === 'question').map((node) => node.id);
  const questionSet = new Set(questionIds);

  const children = new Map<NodeId, NodeId[]>();
  for (const id of questionIds) children.set(id, []);
  for (const [parent, kids] of index.childrenOf) {
    if (!questionSet.has(parent)) continue;
    const onlyQuestions = kids.filter((kid) => questionSet.has(kid));
    if (onlyQuestions.length === 0) continue;
    children.set(parent, [...(children.get(parent) ?? []), ...onlyQuestions]);
  }

  const roots: NodeId[] = [];
  const core = ws.coreQuestionId;
  if (core && questionSet.has(core)) roots.push(core);
  for (const id of questionIds) {
    if (id === core) continue;
    const parents = (index.parentsOf.get(id) ?? []).filter((parent) => questionSet.has(parent));
    if (parents.length === 0) roots.push(id);
  }

  const positions = new Map<NodeId, Point>();
  const depthOf = new Map<NodeId, number>();
  const visited = new Set<NodeId>();
  let nextSlot = 0;

  const subtree = (root: NodeId, depth: number): void => {
    if (visited.has(root)) return;
    visited.add(root);
    depthOf.set(root, depth);
    const stack: Frame[] = [
      { id: root, kids: children.get(root) ?? [], index: 0, firstSlot: -1, lastSlot: -1, depth },
    ];

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      if (!frame) break;

      if (frame.index < frame.kids.length) {
        const kid = frame.kids[frame.index];
        frame.index += 1;
        if (kid === undefined || visited.has(kid)) continue;
        visited.add(kid);
        depthOf.set(kid, frame.depth + 1);
        stack.push({
          id: kid,
          kids: children.get(kid) ?? [],
          index: 0,
          firstSlot: -1,
          lastSlot: -1,
          depth: frame.depth + 1,
        });
        continue;
      }

      // 子节点全部落位：叶节点占槽，父节点取子节点槽的中点。
      const slot = frame.firstSlot < 0 ? nextSlot : (frame.firstSlot + frame.lastSlot) / 2;
      if (frame.firstSlot < 0) nextSlot += 1;

      positions.set(frame.id, {
        x: ORIGIN_X + slot * SLOT_W + SLOT_W / 2,
        y: ORIGIN_Y + frame.depth * ROW_H + CORE_H / 2,
      });
      stack.pop();

      const parent = stack[stack.length - 1];
      if (!parent) continue;
      if (parent.firstSlot < 0) {
        parent.firstSlot = slot;
        parent.lastSlot = slot;
      } else {
        parent.firstSlot = Math.min(parent.firstSlot, slot);
        parent.lastSlot = Math.max(parent.lastSlot, slot);
      }
    }
  };

  for (const root of roots) {
    if (!visited.has(root)) subtree(root, 0);
  }
  // 环岛（没有核心问题、也没有无父节点可达的问题）也要有位置，否则画布上会凭空消失。
  for (const id of questionIds) {
    if (!visited.has(id)) subtree(id, 0);
  }

  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  let first = true;
  for (const [id, point] of positions) {
    const size = cardSizeOf(ws.coreQuestionId, id);
    const left = point.x - size.width / 2;
    const top = point.y - size.height / 2;
    if (first) {
      minX = left;
      minY = top;
      maxX = left + size.width;
      maxY = top + size.height;
      first = false;
    } else {
      minX = Math.min(minX, left);
      minY = Math.min(minY, top);
      maxX = Math.max(maxX, left + size.width);
      maxY = Math.max(maxY, top + size.height);
    }
  }

  return {
    positions,
    depthOf,
    bounds: { x: minX, y: minY, width: Math.max(maxX - minX, 0), height: Math.max(maxY - minY, 0) },
  };
}

/** 布局结果 + 手动 pos 合成渲染用的左上角坐标。 */
export function resolvePositions(
  ws: Workspace,
  index: DocIndex,
  layout: LayoutResult = layoutProblemTree(ws, index),
): Map<NodeId, Point> {
  const out = new Map<NodeId, Point>();
  for (const node of ws.nodes) {
    if (node.type !== 'question') continue;
    if (node.pos.x !== 0 || node.pos.y !== 0) {
      out.set(node.id, { x: node.pos.x, y: node.pos.y });
      continue;
    }
    const center = layout.positions.get(node.id);
    if (!center) continue;
    const size = cardSizeOf(ws.coreQuestionId, node.id);
    out.set(node.id, {
      x: Math.round(center.x - size.width / 2),
      y: Math.round(center.y - size.height / 2),
    });
  }
  return out;
}

export function boundsOf(
  ws: Workspace,
  positions: ReadonlyMap<NodeId, Point>,
): { x: number; y: number; width: number; height: number } {
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  let first = true;
  for (const node of ws.nodes) {
    if (node.type !== 'question') continue;
    const point = positions.get(node.id);
    if (!point) continue;
    const size = cardSizeOf(ws.coreQuestionId, node.id);
    if (first) {
      minX = point.x;
      minY = point.y;
      maxX = point.x + size.width;
      maxY = point.y + size.height;
      first = false;
    } else {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x + size.width);
      maxY = Math.max(maxY, point.y + size.height);
    }
  }
  return { x: minX, y: minY, width: Math.max(maxX - minX, 0), height: Math.max(maxY - minY, 0) };
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * 正交连线（选正交不选贝塞尔）：卡片都是轴对齐矩形，树边只落在层间空隙里，
 * 折线在空隙带内走横段，**必然不穿节点**；贝塞尔要在两端之外再绕控制点，反而更容易切到邻卡。
 */
export function orthogonalEdgePath(
  from: Point,
  to: Point,
  fromSize: { width: number; height: number },
  toSize: { width: number; height: number },
): string {
  const fromBottom = from.y + fromSize.height / 2;
  const toTop = to.y - toSize.height / 2;
  if (toTop > fromBottom + 8) {
    const midY = round1((fromBottom + toTop) / 2);
    return `M ${round1(from.x)} ${round1(fromBottom)} L ${round1(from.x)} ${midY} L ${round1(to.x)} ${midY} L ${round1(to.x)} ${round1(toTop)}`;
  }
  // 反向 / 同层（dependsOn 常见）：从右侧绕出去，避开来去两个卡片本体。
  const fromRight = from.x + fromSize.width / 2;
  const toLeft = to.x - toSize.width / 2;
  const midX = round1(Math.max(fromRight, toLeft) + GAP_X);
  return `M ${round1(fromRight)} ${round1(from.y)} L ${midX} ${round1(from.y)} L ${midX} ${round1(to.y)} L ${round1(toLeft)} ${round1(to.y)}`;
}

/* ---------- 解域领域模型布局（IMP3） ---------- */

/** 实体卡片宽度 / 内距 / 行高：卡片内容随字段与挂着的标签变高，尺寸只有一个来源。 */
export const ENTITY_W = 216;
const ENTITY_PAD = 20;
const ENTITY_HEAD_H = 26;
const ENTITY_LINE_H = 18;
const ENTITY_ORIGIN = 48;

export function solveCardSize(
  fieldCount: number,
  tagCount: number,
  hasIdentity: boolean,
): { width: number; height: number } {
  const tagRows = Math.ceil(tagCount / 2);
  const height =
    ENTITY_PAD + ENTITY_HEAD_H + (hasIdentity ? ENTITY_LINE_H : 0) + fieldCount * ENTITY_LINE_H + tagRows * ENTITY_LINE_H;
  return { width: ENTITY_W, height: Math.max(88, Math.round(height)) };
}

export interface SolveLayoutResult {
  /** 卡片左上角坐标（与问题域 resolvePositions 的渲染坐标一致）。 */
  readonly positions: ReadonlyMap<NodeId, Point>;
  readonly sizes: ReadonlyMap<NodeId, { width: number; height: number }>;
  readonly bounds: { x: number; y: number; width: number; height: number };
}

/** 实体网格：文档顺序 → 每行 ceil(sqrt(n)) 个；手动拖过的 pos 优先于网格。 */
export function layoutSolveModel(ws: Workspace, index: DocIndex): SolveLayoutResult {
  const entities = ws.nodes.filter(
    (node): node is AnyNodeOf<'entity'> => node.type === 'entity',
  );
  const sizes = new Map<NodeId, { width: number; height: number }>();
  for (const node of entities) {
    const tagCount = (index.edgesByNode.get(node.id) ?? []).filter((key) => {
      const edge = index.edgeByKey.get(key);
      return edge !== undefined && (edge.type === 'behaviorOnEntity' || edge.type === 'constraintOnEntity');
    }).length;
    sizes.set(
      node.id,
      solveCardSize(
        (node.data.fields ?? []).length,
        tagCount,
        Boolean(node.data.identity && node.data.identity.length > 0),
      ),
    );
  }

  const columns = Math.max(1, Math.ceil(Math.sqrt(entities.length)));
  const positions = new Map<NodeId, Point>();
  const rowHeights: number[] = [];
  for (let i = 0; i < entities.length; i += 1) {
    const entity = entities[i];
    if (!entity) continue;
    const row = Math.floor(i / columns);
    const size = sizes.get(entity.id);
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, size ? size.height : 0);
  }
  const rowY: number[] = [];
  let cursor = ENTITY_ORIGIN;
  for (let row = 0; row < rowHeights.length; row += 1) {
    rowY[row] = cursor;
    cursor += (rowHeights[row] ?? 0) + GAP_Y * 1.5;
  }

  for (let i = 0; i < entities.length; i += 1) {
    const entity = entities[i];
    if (!entity) continue;
    const column = i % columns;
    const row = Math.floor(i / columns);
    const manual = entity.pos.x !== 0 || entity.pos.y !== 0;
    positions.set(
      entity.id,
      manual
        ? { x: entity.pos.x, y: entity.pos.y }
        : { x: ENTITY_ORIGIN + column * (ENTITY_W + GAP_X * 2), y: rowY[row] ?? ENTITY_ORIGIN },
    );
  }

  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  let first = true;
  for (const [id, point] of positions) {
    const size = sizes.get(id);
    if (!size) continue;
    if (first) {
      minX = point.x;
      minY = point.y;
      maxX = point.x + size.width;
      maxY = point.y + size.height;
      first = false;
      continue;
    }
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x + size.width);
    maxY = Math.max(maxY, point.y + size.height);
  }

  return {
    positions,
    sizes,
    bounds: {
      x: minX,
      y: minY,
      width: Math.max(maxX - minX, 0),
      height: Math.max(maxY - minY, 0),
    },
  };
}

/** 实体间连线：沿两卡中心的连线裁到各自边界，标签落在中点。 */
export function solveEdgeLine(
  from: { x: number; y: number; width: number; height: number },
  to: { x: number; y: number; width: number; height: number },
): { x1: number; y1: number; x2: number; y2: number; midX: number; midY: number } {
  const fromX = from.x + from.width / 2;
  const fromY = from.y + from.height / 2;
  const toX = to.x + to.width / 2;
  const toY = to.y + to.height / 2;
  const dx = toX - fromX;
  const dy = toY - fromY;
  const exitScale = (width: number, height: number): number => {
    const tx = dx === 0 ? Number.POSITIVE_INFINITY : width / 2 / Math.abs(dx);
    const ty = dy === 0 ? Number.POSITIVE_INFINITY : height / 2 / Math.abs(dy);
    const scale = Math.min(tx, ty);
    return Number.isFinite(scale) ? scale : 0;
  };
  const fromScale = exitScale(from.width, from.height);
  const toScale = exitScale(to.width, to.height);
  const x1 = fromX + dx * fromScale;
  const y1 = fromY + dy * fromScale;
  const x2 = toX - dx * toScale;
  const y2 = toY - dy * toScale;
  return {
    x1: round1(x1),
    y1: round1(y1),
    x2: round1(x2),
    y2: round1(y2),
    midX: round1((x1 + x2) / 2),
    midY: round1((y1 + y2) / 2),
  };
}
