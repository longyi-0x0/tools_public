/** 管线 B：TypeScript 类型骨架（01 §8 表 / 04 §2.4）。纯函数，幂等。 */
import type { DocIndex, Workspace } from '../types.ts';
import { SCHEMA_VERSION } from '../types.ts';
import type { ExportArtifact } from './types.ts';
import { unfinishedCommentLines } from './header.ts';
import { describeModel, type ModelEntity, type ModelField } from './model.ts';
import { workspaceBase } from './names.ts';

function fieldNotes(field: ModelField): string[] {
  const notes: string[] = [];
  if (field.original && field.original !== field.name) notes.push(`原值：${field.original}`);
  if (field.originalType) notes.push(`原类型：${field.originalType}`);
  if (field.kind === 'relation' && field.cardinality) {
    const label = field.relationLabel ? ` ${field.relationLabel}` : '';
    notes.push(`关系：${field.cardinality}${label}`);
  }
  if (field.duplicate) notes.push('重名');
  return notes;
}

function fieldLine(field: ModelField): string[] {
  const optional = field.required ? '' : '?';
  const lines: string[] = [];
  const notes = fieldNotes(field);
  if (notes.length > 0) lines.push(`  /** ${notes.join(' ')} */`);
  lines.push(`  ${field.name}${optional}: ${field.type};`);
  return lines;
}

function behaviorLines(entity: ModelEntity): string[] {
  const lines: string[] = [];
  for (const behavior of entity.behaviors) {
    const notes: string[] = [];
    if (behavior.inputs.length > 0) notes.push(`@inputs ${behavior.inputs.join('、')}`);
    if (behavior.preconditions.length > 0) notes.push(`@preconditions ${behavior.preconditions.join('、')}`);
    if (behavior.output) notes.push(`@output ${behavior.output}`);
    if (behavior.effects.length > 0) notes.push(`@effects ${behavior.effects.join('、')}`);
    lines.push(`  /** ${behavior.title || behavior.name}${notes.length > 0 ? ` ${notes.join(' ')}` : ''} */`);
    lines.push(`  ${behavior.name}?: (input: Record<string, unknown>, ctx?: unknown) => void;`);
  }
  return lines;
}

/**
 * 实体 → `interface`（字段名走 identify），值对象 → `type`（states），
 * 行为 → 方法签名，约束 → 注释块（形如 `约束（必须）：<expr> @<地点>`）；
 * 每个 interface 正上方一行 `// 支撑：<问题 id> <问题标题>`，未支撑写 `// 支撑：无（C6）`。
 */
export function toTs(ws: Workspace, index: DocIndex): ExportArtifact {
  const plan = describeModel(ws, index);
  const lines: string[] = [];
  lines.push(`// 问题域画板 · TypeScript 类型骨架 · ${ws.name} · schemaVersion ${SCHEMA_VERSION}`);
  lines.push(...unfinishedCommentLines(ws, index));
  lines.push('');

  if (plan.entities.length === 0) {
    lines.push('// 解域还没有实体：建一个实体再导出（01 §8.1）。');
    lines.push('');
  }

  for (const entity of plan.entities) {
    if (entity.states.length > 0) {
      const union = entity.states.map((state) => JSON.stringify(state)).join(' | ');
      lines.push(`export type ${entity.stateTypeName} = ${union};`);
    }
    for (const constraint of entity.constraints) {
      const point = constraint.enforcementPoint ? ` @${constraint.enforcementPoint}` : '';
      lines.push(`/** 约束（${constraint.kind}）：${constraint.expr}${point} */`);
    }
    if (entity.identityMissing) {
      lines.push('// 警告：identity 未填（01 §4.2 要求实体必须有主键），主键注释降级为占位');
    }
    lines.push(
      entity.supports.length === 0
        ? '// 支撑：无（C6）'
        : `// 支撑：${entity.supports
            .map((support) => `${support.id} ${support.title || '未命名'}`)
            .join('、')}`,
    );
    lines.push(`export interface ${entity.name} {`);
    lines.push(`  // 主键：${entity.identity || '（未填）'}`);
    for (const field of entity.fields) lines.push(...fieldLine(field));
    lines.push(...behaviorLines(entity));
    lines.push('}');
    lines.push('');
  }

  if (plan.orphanBehaviors.length > 0) {
    lines.push('// 未挂实体的行为（不进任何 interface，先挂实体再导出）：');
    for (const behavior of plan.orphanBehaviors) {
      lines.push(`// - ${behavior.title || behavior.name}${behavior.output ? ` → ${behavior.output}` : ''}`);
    }
    lines.push('');
  }
  if (plan.orphanConstraints.length > 0) {
    lines.push('// 未挂实体的约束：');
    for (const constraint of plan.orphanConstraints) {
      lines.push(`// - 约束（${constraint.kind}）：${constraint.expr}`);
    }
    lines.push('');
  }

  return {
    text: `${lines.join('\n')}\n`,
    fileName: `${workspaceBase(ws.name)}-model.ts`,
    warnings: plan.warnings,
  };
}
