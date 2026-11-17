/**
 * 文档模型定稿 —— 照 04-architecture.md §1.1 抄，事实源是 01-product.md §4。
 * 这一层是纯函数层：不许 import React / store / components / views，也不许碰 DOM 与 localStorage。
 */
export const SCHEMA_VERSION = 2 as const;

export type NodeId = string;
/** `${type}|${source}>${target}`：01 的 edges 无 id，不新增字段 */
export type EdgeKey = string;
export type Domain = 'problem' | 'solve';
/** 严重度只有两档（Router 已裁决；04 里的 `hint` 不再产出）。 */
export type Severity = 'error' | 'warning';

export interface Point {
  x: number;
  y: number;
}
export interface Viewport extends Point {
  zoom: number;
}

export type QuestionStatus = '未澄清' | '分析中' | '已澄清' | '已回答' | '暂缓';

// 9 个 data 分支，字段全可选：01 §4.4 的样例自己就省略字段（q1 只有 status/criteria、b1 只有 effects），
// 类型不许比事实更严；默认值由 normalize.withDefaults() 一处补。
export interface QuestionData {
  status?: QuestionStatus;
  deferReason?: string;
  statement?: string;
  goal?: string;
  boundary?: string;
  knowns?: string[];
  assumptions?: string[];
  positiveCases?: string[];
  negativeCases?: string[];
  answerForm?: string;
  criteria?: string[];
}
export interface ActorData {
  role?: string;
  description?: string;
}
export interface SceneData {
  trigger?: string;
  steps?: string[];
}
export interface ConceptData {
  definition?: string;
  aliases?: string[];
}
export interface RuleData {
  statement?: string;
  source?: string;
}
export interface EventData {
  trigger?: string;
  effect?: string;
}
export interface EntityField {
  name: string;
  type?: string;
  required?: boolean;
  note?: string;
}
export interface EntityData {
  identity?: string;
  fields?: EntityField[];
  states?: string[];
}
export interface BehaviorData {
  inputs?: string[];
  output?: string;
  preconditions?: string[];
  effects?: string[];
}
export interface ConstraintData {
  expr?: string;
  kind?: '必须' | '禁止';
  enforcementPoint?: string;
}

interface NodeOf<T extends string, D> {
  id: NodeId;
  type: T;
  title: string;
  notes: string;
  data: D;
  pos: Point;
}
interface NodeDataMap {
  question: QuestionData;
  actor: ActorData;
  scene: SceneData;
  concept: ConceptData;
  rule: RuleData;
  event: EventData;
  entity: EntityData;
  behavior: BehaviorData;
  constraint: ConstraintData;
}
export type NodeType = keyof NodeDataMap;
export type AnyNode = { [K in NodeType]: NodeOf<K, NodeDataMap[K]> }[NodeType];
export type AnyNodeOf<T extends NodeType> = NodeOf<T, NodeDataMap[T]>;
export type NodeDataOf<T extends NodeType> = NodeDataMap[T];

export const SOLVE_TYPES = ['entity', 'behavior', 'constraint'] as const;

export type Cardinality = '1:1' | '1:N' | 'N:M';
export type EdgeType =
  | 'decomposesTo'
  | 'dependsOn'
  | 'involvesActor'
  | 'occursInScene'
  | 'concernsConcept'
  | 'constrainedByRule'
  | 'triggeredByEvent'
  | 'entityRelation'
  | 'behaviorOnEntity'
  | 'constraintOnEntity'
  | 'supportsQuestion';

/** 端口 id：节点四条边各一个连接点（IMP10），与 React Flow 的 Position 同值。 */
export type PortId = 'top' | 'right' | 'bottom' | 'left';

/**
 * 端点类型不进类型系统（04 §1.2 第 3 条），由 schema.ts 的 EDGE_RULES 在 validate 与连线交互里判。
 * `label` 只给 `entityRelation` 用（关系名，如「持有」）：01 §4.3 只定义了基数，
 * 而 03 §1/§2.2 的关系行与画布连线都要显示关系名，这里按最小增量补一个可选字段。
 *
 * IMP11：`sourcePort` / `targetPort` 是用户选的端点端口，**边上的字段是唯一真相**。
 * 两个字段都可选：老文档（含左树菜单建的两条边）没有它们，载入照常，
 * 渲染时按两卡几何推导（ui/flow/ports.ts 的 resolveEdgePorts），迁移链不补写。
 */
export interface Edge {
  type: EdgeType;
  source: NodeId;
  target: NodeId;
  cardinality?: Cardinality;
  label?: string;
  sourcePort?: PortId;
  targetPort?: PortId;
}

export interface Workspace {
  schemaVersion: typeof SCHEMA_VERSION;
  name: string;
  goal: string;
  coreQuestionId: NodeId | null;
  nodes: AnyNode[];
  edges: Edge[];
  viewports: Record<Domain, Viewport>;
  meta: { createdAt: string; updatedAt: string };
}

/** 04 §2.1：运行时索引，纯函数一次遍历建成。 */
export interface DocIndex {
  readonly byId: ReadonlyMap<NodeId, AnyNode>;
  readonly childrenOf: ReadonlyMap<NodeId, readonly NodeId[]>;
  readonly parentsOf: ReadonlyMap<NodeId, readonly NodeId[]>;
  readonly edgesByNode: ReadonlyMap<NodeId, readonly EdgeKey[]>;
  readonly edgeByKey: ReadonlyMap<EdgeKey, Edge>;
  readonly supportsByNode: ReadonlyMap<NodeId, readonly NodeId[]>;
  readonly supportedBy: ReadonlyMap<NodeId, readonly NodeId[]>;
  readonly questionsInTreeOrder: readonly NodeId[];
  readonly codes: ReadonlyMap<NodeId, string>;
  readonly fingerprint: string;
}
