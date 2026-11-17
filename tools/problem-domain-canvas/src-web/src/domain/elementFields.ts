/**
 * 问题域五类元素（actor / scene / concept / rule / event）的唯一一张表：
 * 建边类型取 01-product.md §4.3，字段名逐字取 §4.2，**不许自创字段**。
 * 详情栏、命令层与测试都读这张表，不各自抄一份。
 */
import type { EdgeType, NodeType } from './types.ts';

export const PROBLEM_ELEMENT_TYPES = ['actor', 'scene', 'concept', 'rule', 'event'] as const;

export type ProblemElementType = (typeof PROBLEM_ELEMENT_TYPES)[number];

/** 01 §4.3：方向恒为 question → 元素。 */
export const ELEMENT_EDGE: Record<ProblemElementType, EdgeType> = {
  actor: 'involvesActor',
  scene: 'occursInScene',
  concept: 'concernsConcept',
  rule: 'constrainedByRule',
  event: 'triggeredByEvent',
};

export interface ElementField {
  /** 01 §4.2 的字段名，原样写入 data。 */
  field: string;
  label: string;
  kind: 'text' | 'list';
  placeholder?: string;
}

/**
 * 每类的可编辑字段。01 §4.2 里没有的字段这里一个都不加：
 * 例如「规则是否必守」（那是 constraint 的 `kind`）、actor 没有单独的角色关注清单。
 */
export const ELEMENT_FIELDS: Record<ProblemElementType, readonly ElementField[]> = {
  actor: [
    { field: 'role', label: '角色', kind: 'text', placeholder: '（谁参与）' },
    // 01 只给 actor 一个自由描述字段，用它承载「关注什么」
    { field: 'description', label: '关注什么', kind: 'text', placeholder: '（他在意什么）' },
  ],
  scene: [
    { field: 'trigger', label: '何时 / 何地', kind: 'text', placeholder: '（什么时候、在哪儿发生）' },
    { field: 'steps', label: '步骤', kind: 'list', placeholder: '一行一步' },
  ],
  concept: [
    { field: 'definition', label: '定义', kind: 'text', placeholder: '（一句话说清）' },
    { field: 'aliases', label: '同义词', kind: 'list', placeholder: '一行一个' },
  ],
  rule: [
    { field: 'statement', label: '陈述', kind: 'text', placeholder: '（必须能独立成句）' },
    { field: 'source', label: '来源', kind: 'text', placeholder: '（谁定的）' },
  ],
  event: [
    { field: 'trigger', label: '触发条件', kind: 'text', placeholder: '（什么发生时才触发）' },
    { field: 'effect', label: '影响哪个概念状态', kind: 'text', placeholder: '（哪个概念、变成什么）' },
  ],
};

export function isProblemElementType(type: NodeType): type is ProblemElementType {
  return (PROBLEM_ELEMENT_TYPES as readonly NodeType[]).includes(type);
}

export function isElementField(type: ProblemElementType, field: string): boolean {
  return ELEMENT_FIELDS[type].some((spec) => spec.field === field);
}
