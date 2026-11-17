/**
 * 解域模型计划：B（类型骨架）与 C（种子数据）**共用同一次识别**（04 §2.4 / §2.5）。
 * 接口名、状态类型名、字段名、方法名都只在这里定一次，两条管线只负责渲染。
 */
import type { DocIndex, NodeId, Workspace } from '../types.ts';
import { identify, uniqueIn } from './names.ts';

export type ModelFieldKind = 'plain' | 'enum' | 'relation';

export interface ModelField {
  /** 规范化后的字段名 */
  name: string;
  /** 原始字段名（被改写时写 `// 原值：`） */
  original: string;
  type: string;
  /** 未识别的原类型词（写 `// 原类型：`） */
  originalType?: string;
  required: boolean;
  kind: ModelFieldKind;
  /** enum 的样例值（取 states[0]） */
  sample?: string;
  /** enum 是否有状态可枚举 */
  hasStates?: boolean;
  cardinality?: string;
  relationLabel?: string;
  duplicate?: boolean;
}

export interface ModelConstraint {
  id: NodeId;
  title: string;
  expr: string;
  kind: '必须' | '禁止';
  enforcementPoint: string;
}

export interface ModelBehavior {
  id: NodeId;
  title: string;
  name: string;
  inputs: string[];
  output: string;
  effects: string[];
  preconditions: string[];
  duplicate?: boolean;
}

export interface ModelSupport {
  id: NodeId;
  title: string;
}

export interface ModelEntity {
  id: NodeId;
  title: string;
  /** 接口名（也是状态类型名的前缀） */
  name: string;
  stateTypeName: string;
  identity: string;
  identityMissing: boolean;
  states: string[];
  fields: ModelField[];
  constraints: ModelConstraint[];
  behaviors: ModelBehavior[];
  supports: ModelSupport[];
}

export interface ModelPlan {
  entities: ModelEntity[];
  orphanBehaviors: ModelBehavior[];
  orphanConstraints: ModelConstraint[];
  warnings: string[];
}

function mapFieldType(
  raw: string,
  stateTypeName: string,
  hasStates: boolean,
): { type: string; originalType?: string } {
  const word = raw.trim();
  const lower = word.toLowerCase();
  if (word === '') return { type: 'unknown', originalType: '（空）' };
  if (lower === 'string' || lower === 'date') return { type: 'string' };
  if (lower === 'number') return { type: 'number' };
  if (lower === 'boolean') return { type: 'boolean' };
  if (lower === 'enum') return { type: hasStates ? stateTypeName : 'string' };
  return { type: 'unknown', originalType: word };
}

function constraintOf(node: Extract<Workspace['nodes'][number], { type: 'constraint' }>): ModelConstraint {
  return {
    id: node.id,
    title: node.title,
    expr: (node.data.expr ?? '').trim() || '（未填）',
    kind: node.data.kind === '禁止' ? '禁止' : '必须',
    enforcementPoint: node.data.enforcementPoint ?? '',
  };
}

function behaviorOf(
  node: Extract<Workspace['nodes'][number], { type: 'behavior' }>,
  used: Set<string>,
  index: number,
): ModelBehavior {
  const ident = uniqueIn(identify(node.title, `behavior_${index + 1}`).name, used);
  return {
    id: node.id,
    title: node.title,
    name: ident.name,
    inputs: (node.data.inputs ?? []).filter((item) => item.trim().length > 0),
    output: (node.data.output ?? '').trim(),
    effects: (node.data.effects ?? []).filter((item) => item.trim().length > 0),
    preconditions: (node.data.preconditions ?? []).filter((item) => item.trim().length > 0),
    duplicate: ident.duplicate,
  };
}

/** 一次遍历出计划；实体按创建序（`ws.nodes` 顺序），事件顺序也照边表原序。 */
export function describeModel(ws: Workspace, index: DocIndex): ModelPlan {
  const entityNodes = ws.nodes.filter((node) => node.type === 'entity');
  const usedEntityNames = new Set<string>();
  const nameOf = new Map<NodeId, string>();
  const names: string[] = [];

  entityNodes.forEach((node, position) => {
    const base = identify(node.title, `Entity_${position + 1}`);
    const ident = uniqueIn(base.name, usedEntityNames);
    nameOf.set(node.id, ident.name);
    names.push(ident.name);
  });

  const warnings: string[] = [];
  const behaviorsByEntity = new Map<NodeId, ModelBehavior[]>();
  const constraintsByEntity = new Map<NodeId, ModelConstraint[]>();
  const usedBehaviorNames = new Map<NodeId, Set<string>>();
  const behaviorSeen = new Set<NodeId>();
  const constraintSeen = new Set<NodeId>();

  for (const edge of ws.edges) {
    if (edge.type === 'behaviorOnEntity') {
      const behavior = index.byId.get(edge.source);
      if (!behavior || behavior.type !== 'behavior') continue;
      const used = usedBehaviorNames.get(edge.target) ?? new Set<string>();
      usedBehaviorNames.set(edge.target, used);
      const list = behaviorsByEntity.get(edge.target) ?? [];
      if (!constraintSeen.has(behavior.id)) {
        /* 行为不按实体去重：同一行为挂多个实体时每个接口都拿到签名。 */
      }
      list.push(behaviorOf(behavior, used, list.length));
      behaviorsByEntity.set(edge.target, list);
    }
    if (edge.type === 'constraintOnEntity') {
      const constraint = index.byId.get(edge.source);
      if (!constraint || constraint.type !== 'constraint') continue;
      const list = constraintsByEntity.get(edge.target) ?? [];
      list.push(constraintOf(constraint));
      constraintsByEntity.set(edge.target, list);
    }
  }

  for (const edge of ws.edges) {
    if (edge.type === 'behaviorOnEntity') behaviorSeen.add(edge.source);
    if (edge.type === 'constraintOnEntity') constraintSeen.add(edge.source);
  }

  const entities: ModelEntity[] = entityNodes.map((node) => {
    const name = nameOf.get(node.id) ?? 'Entity';
    const stateTypeName = `${name}State`;
    const states = (node.data.states ?? []).filter((item) => item.trim().length > 0);
    const identity = (node.data.identity ?? '').trim();
    if (identity === '') warnings.push(`实体「${node.title || name}」没有 identity，导出降级（01 §4.2）`);

    const usedFields = new Set<string>(['主键']);
    const fields: ModelField[] = [];
    (node.data.fields ?? []).forEach((field, position) => {
      const rawName = (field.name ?? '').trim();
      const base = identify(rawName, `Field_${position + 1}`);
      const ident = uniqueIn(base.name, usedFields);
      const mapped = mapFieldType(field.type ?? '', stateTypeName, states.length > 0);
      if (mapped.originalType && mapped.originalType !== '（空）') {
        warnings.push(`实体「${node.title || name}」字段「${rawName}」类型未知，降级为 unknown`);
      }
      fields.push({
        name: ident.name,
        original: rawName,
        type: mapped.type,
        originalType: mapped.originalType,
        required: field.required === true,
        kind: mapped.type === stateTypeName && states.length > 0 ? 'enum' : 'plain',
        sample: mapped.type === stateTypeName && states.length > 0 ? states[0] : undefined,
        hasStates: states.length > 0,
        duplicate: ident.duplicate,
      });
    });

    for (const edge of ws.edges) {
      if (edge.type !== 'entityRelation' || edge.source !== node.id) continue;
      const targetName = nameOf.get(edge.target);
      if (!targetName) continue;
      const cardinality = edge.cardinality ?? '1:N';
      const base = cardinality === '1:1' ? `${targetName}Id` : `${targetName}Ids`;
      const ident = uniqueIn(base, usedFields);
      fields.push({
        name: ident.name,
        original: base,
        type: cardinality === '1:1' ? 'string' : 'readonly string[]',
        required: false,
        kind: 'relation',
        cardinality,
        relationLabel: edge.label,
        duplicate: ident.duplicate,
      });
    }

    const supports: ModelSupport[] = [];
    for (const edge of ws.edges) {
      if (edge.type !== 'supportsQuestion' || edge.source !== node.id) continue;
      const question = index.byId.get(edge.target);
      if (!question || question.type !== 'question') continue;
      if (supports.some((item) => item.id === question.id)) continue;
      supports.push({ id: question.id, title: question.title });
    }

    return {
      id: node.id,
      title: node.title,
      name,
      stateTypeName,
      identity,
      identityMissing: identity === '',
      states,
      fields,
      constraints: constraintsByEntity.get(node.id) ?? [],
      behaviors: behaviorsByEntity.get(node.id) ?? [],
      supports,
    };
  });

  const orphanBehaviors: ModelBehavior[] = [];
  const usedOrphanNames = new Set<string>();
  const orphanConstraints: ModelConstraint[] = [];
  let behaviorPosition = 0;
  for (const node of ws.nodes) {
    if (node.type === 'behavior' && !behaviorSeen.has(node.id)) {
      orphanBehaviors.push(behaviorOf(node, usedOrphanNames, behaviorPosition));
      behaviorPosition += 1;
    }
    if (node.type === 'constraint' && !constraintSeen.has(node.id)) {
      orphanConstraints.push(constraintOf(node));
    }
  }

  return { entities, orphanBehaviors, orphanConstraints, warnings };
}
