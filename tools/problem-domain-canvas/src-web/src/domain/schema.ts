/** 9 类节点、11 条边与端点规则表（01 §4.3；04 §1.1/§1.2）。域归属与默认视口也在这里。 */
import type {
  Cardinality,
  Domain,
  Edge,
  EdgeKey,
  EdgeType,
  NodeType,
  QuestionStatus,
  Viewport,
} from './types.ts';

export const NODE_TYPES = [
  'question',
  'actor',
  'scene',
  'concept',
  'rule',
  'event',
  'entity',
  'behavior',
  'constraint',
] as const satisfies readonly NodeType[];

export const QUESTION_STATUSES: readonly QuestionStatus[] = [
  '未澄清',
  '分析中',
  '已澄清',
  '已回答',
  '暂缓',
];

export const NODE_LABEL: Record<NodeType, string> = {
  question: '问题',
  actor: '参与者',
  scene: '场景',
  concept: '概念',
  rule: '规则',
  event: '事件',
  entity: '实体',
  behavior: '行为',
  constraint: '约束',
};

export interface EdgeRule {
  domain: Domain;
  source: readonly NodeType[];
  target: readonly NodeType[];
  label: string;
}

/** 11 条边一张表：validate 与连线交互共用，不许各自判。 */
export const EDGE_RULES: Record<EdgeType, EdgeRule> = {
  decomposesTo: { domain: 'problem', source: ['question'], target: ['question'], label: '拆解' },
  dependsOn: { domain: 'problem', source: ['question'], target: ['question'], label: '依赖' },
  involvesActor: { domain: 'problem', source: ['question'], target: ['actor'], label: '涉及' },
  occursInScene: { domain: 'problem', source: ['question'], target: ['scene'], label: '发生在' },
  concernsConcept: { domain: 'problem', source: ['question'], target: ['concept'], label: '概念' },
  constrainedByRule: {
    domain: 'problem',
    source: ['question'],
    target: ['rule'],
    label: '受约束',
  },
  triggeredByEvent: { domain: 'problem', source: ['question'], target: ['event'], label: '触发' },
  entityRelation: { domain: 'solve', source: ['entity'], target: ['entity'], label: '关系' },
  behaviorOnEntity: { domain: 'solve', source: ['behavior'], target: ['entity'], label: '作用于' },
  constraintOnEntity: {
    domain: 'solve',
    source: ['constraint'],
    target: ['entity'],
    label: '守护',
  },
  supportsQuestion: {
    domain: 'solve',
    source: ['entity', 'behavior', 'constraint'],
    target: ['question'],
    label: '支撑',
  },
};

export function domainOf(type: NodeType): Domain {
  return type === 'entity' || type === 'behavior' || type === 'constraint' ? 'solve' : 'problem';
}

export function isEdgeAllowed(type: EdgeType, source: NodeType, target: NodeType): boolean {
  const rule: EdgeRule = EDGE_RULES[type];
  return rule.source.includes(source) && rule.target.includes(target);
}

export function edgeKey(edge: Edge): EdgeKey {
  return `${edge.type}|${edge.source}>${edge.target}`;
}

export const CARDINALITIES: readonly Cardinality[] = ['1:1', '1:N', 'N:M'];

/** 解域元素（C6 与支撑徽标只认这三类）。 */
export const SOLVE_NODE_TYPES: readonly NodeType[] = ['entity', 'behavior', 'constraint'];

export function isSolveNodeType(type: NodeType): boolean {
  return SOLVE_NODE_TYPES.includes(type);
}

export const DEFAULT_VIEWPORT: Record<Domain, Viewport> = {
  problem: { x: 0, y: 0, zoom: 1 },
  solve: { x: 0, y: 0, zoom: 1 },
};
