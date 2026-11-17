/**
 * 端口（IMP10）：节点四条边各一个可见连接点，用户从任意一点拖出、落到对面任意一点。
 * 这里只放纯函数（语义映射 + 几何 + 端口解析），不 import @xyflow/react 的运行时，
 * 所以能被 `node src/...test.ts` 直接跑（npm test 里跑）。
 *
 * 端口 id 与 React Flow 的 Position 同值（'top' | 'right' | 'bottom' | 'left'），
 * 节点里用 `<Handle id={port} data-port={port} position={Position[...]}>` 一一对应。
 *
 * 端口选择存哪（IMP11）：用户选的两个端口现在写进文档的 `Edge.sourcePort` / `Edge.targetPort`
 * ——边上的字段是唯一真相，刷新与导入后线不会自己跳回几何推导。
 * 老文档没有这两个字段（也包含左树菜单建的两条边），渲染时按两卡的相对位置推
 * （见 resolveEdgePorts：缺哪端补哪端）。
 */
import type { Domain, Edge, NodeType, Point, PortId } from '../../domain/types.ts';

/** 四边端口的顺序 = 渲染顺序（上/右/下/左），节点渲染与测试共用一份。 */
export const PORT_IDS: readonly PortId[] = ['top', 'right', 'bottom', 'left'];

/** 句柄 id → 端口：拿不到（没 id / 库给了别的）时退回 fallback。 */
export function portOf(handleId: string | null | undefined, fallback: PortId): PortId {
  return PORT_IDS.includes(handleId as PortId) ? (handleId as PortId) : fallback;
}

export interface EdgePorts {
  source: PortId;
  target: PortId;
}

/** 卡片在流坐标系里的框（toFlow 由节点位置 + 卡片尺寸给出）。 */
export interface PortRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ConnectionKind = 'decomposesTo' | 'dependsOn' | 'entityRelation';
export type ConnectionReject = 'self' | 'cross-type';
export type ConnectionPlan = { kind: ConnectionKind } | { rejected: ConnectionReject };

export interface ConnectionCandidate {
  domain: Domain;
  self: boolean;
  sourceType: NodeType;
  targetType: NodeType;
  sourcePort: PortId;
  targetPort: PortId;
}

/** 域里能连的节点类型：问题域只认问题、解域只认实体（其余一律算「跨类型」）。 */
export function domainAccepts(domain: Domain, type: NodeType): boolean {
  return domain === 'problem' ? type === 'question' : type === 'entity';
}

/**
 * 松手后的语义映射（判断顺序，别调换）：
 * ① 自环 → 拒；② 任一端不是本域的合法节点类型 → 跨类型，拒；
 * ③ 解域 → entityRelation；④ 问题域且「起点在下方端口、终点在上方端口」→ decomposesTo；
 * ⑤ 问题域其余任意端口组合 → dependsOn（方向 = 起点 → 终点）。
 */
export function inferConnection(candidate: ConnectionCandidate): ConnectionPlan {
  if (candidate.self) return { rejected: 'self' };
  if (!domainAccepts(candidate.domain, candidate.sourceType)) return { rejected: 'cross-type' };
  if (!domainAccepts(candidate.domain, candidate.targetType)) return { rejected: 'cross-type' };
  if (candidate.domain === 'solve') return { kind: 'entityRelation' };
  if (candidate.sourcePort === 'bottom' && candidate.targetPort === 'top') {
    return { kind: 'decomposesTo' };
  }
  return { kind: 'dependsOn' };
}

/** 端口在卡片上的锚点（卡片左上 + 宽高 → 该边中点）。 */
export function portAnchor(rect: PortRect, port: PortId): Point {
  const midX = rect.x + rect.w / 2;
  const midY = rect.y + rect.h / 2;
  switch (port) {
    case 'top':
      return { x: midX, y: rect.y };
    case 'bottom':
      return { x: midX, y: rect.y + rect.h };
    case 'left':
      return { x: rect.x, y: midY };
    default:
      return { x: rect.x + rect.w, y: midY };
  }
}

/**
 * 没有用户选择时的端口推导：两卡中心谁偏哪边就走哪边——
 * 左右挨着 → 右 → 左（水平直线）；上下叠着 → 下 → 上（竖直直线）。
 * 这样边不会全挤在顶部/底部（IMP10 验收 ⑤）。
 */
export function portsBetween(source: PortRect, target: PortRect): EdgePorts {
  const dx = target.x + target.w / 2 - (source.x + source.w / 2);
  const dy = target.y + target.h / 2 - (source.y + source.h / 2);
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { source: 'right', target: 'left' } : { source: 'left', target: 'right' };
  }
  return dy >= 0 ? { source: 'bottom', target: 'top' } : { source: 'top', target: 'bottom' };
}

/**
 * 一条边实际贴哪两个端口（IMP11）：边上的 `sourcePort` / `targetPort` 是唯一真相，
 * 缺哪端就用几何推导补哪端。老文档没有这两个字段 → 与 IMP10 的几何推导完全一致。
 */
export function resolveEdgePorts(
  edge: Pick<Edge, 'sourcePort' | 'targetPort'>,
  source: PortRect,
  target: PortRect,
): EdgePorts {
  const auto = portsBetween(source, target);
  return { source: edge.sourcePort ?? auto.source, target: edge.targetPort ?? auto.target };
}

/** 一条边的两个端点坐标：严格贴在两卡各自的所选端口上（不跳到默认点）。 */
export function edgeAnchors(
  source: PortRect,
  target: PortRect,
  ports: EdgePorts,
): { source: Point; target: Point } {
  return {
    source: portAnchor(source, ports.source),
    target: portAnchor(target, ports.target),
  };
}
