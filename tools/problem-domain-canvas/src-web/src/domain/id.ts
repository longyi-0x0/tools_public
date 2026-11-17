/** 短、稳定、可读的 id：`q1` / `b2` …；按该前缀已有最大序号 +1，纯函数（同输入同输出）。 */
import type { AnyNode, NodeId, NodeType } from './types.ts';

const PREFIX: Record<NodeType, string> = {
  question: 'q',
  actor: 'a',
  scene: 'sc',
  concept: 'cp',
  rule: 'r',
  event: 'ev',
  entity: 'en',
  behavior: 'b',
  constraint: 'ct',
};

export function idPrefix(type: NodeType): string {
  return PREFIX[type];
}

export function newId(type: NodeType, existing: readonly AnyNode[]): NodeId {
  const prefix = PREFIX[type];
  let max = 0;
  for (const node of existing) {
    if (!node.id.startsWith(prefix)) continue;
    const rest = node.id.slice(prefix.length);
    if (!/^\d+$/.test(rest)) continue;
    const value = Number(rest);
    if (Number.isFinite(value) && value > max) max = value;
  }
  return `${prefix}${max + 1}`;
}
