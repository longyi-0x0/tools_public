/**
 * 管线 C：种子数据（01 §8 表 / 04 §2.5）。复用同一次 B 的识别结果（名字、字段、类型），
 * 每个实体固定 3 条样例实例，第 3 条故意违反该实体的约束并写 `// 期望：拒绝`。
 * `expr` 是自由文本，不转译成真实校验逻辑——只给签名与样例。
 */
import type { DocIndex, Workspace } from '../types.ts';
import { SCHEMA_VERSION } from '../types.ts';
import type { ExportArtifact } from './types.ts';
import { unfinishedCommentLines } from './header.ts';
import { describeModel, type ModelEntity, type ModelField } from './model.ts';
import { workspaceBase } from './names.ts';

function literal(text: string): string {
  return JSON.stringify(text);
}

function seedValue(field: ModelField, bad: boolean): string {
  if (field.kind === 'relation') return field.type === 'string' ? literal('seed-1') : '[]';
  if (field.kind === 'enum') return literal(field.sample ?? '（无状态）');
  if (field.type === 'number') return bad ? '-1' : '0';
  if (field.type === 'boolean') return 'false';
  if (field.type === 'unknown') return 'null';
  return bad ? "''" : literal('（示例）');
}

function instanceLines(entity: ModelEntity, bad: boolean): string[] {
  const lines: string[] = [];
  if (bad) {
    const expr = entity.constraints[0]?.expr ?? '（该实体没有约束，用空值与负数占位）';
    lines.push(`  // 期望：拒绝（违反：${expr}）`);
  }
  lines.push('  {');
  for (const field of entity.fields) lines.push(`    ${field.name}: ${seedValue(field, bad)},`);
  lines.push('  },');
  return lines;
}

/** 每个实体 3 条 `as const` 样例；文件名与 B 的 model 同源，import 路径由此推出。 */
export function toSeed(ws: Workspace, index: DocIndex): ExportArtifact {
  const plan = describeModel(ws, index);
  const base = workspaceBase(ws.name);
  const lines: string[] = [];
  lines.push(`// 问题域画板 · 种子数据 · ${ws.name} · schemaVersion ${SCHEMA_VERSION}`);
  lines.push(...unfinishedCommentLines(ws, index));
  lines.push('');

  if (plan.entities.length === 0) {
    lines.push('export const seed = [] as const;');
    return { text: `${lines.join('\n')}\n`, fileName: `${base}-seed.ts`, warnings: plan.warnings };
  }

  lines.push(`import type { ${plan.entities.map((entity) => entity.name).join(', ')} } from './${base}-model';`);
  lines.push('');

  for (const entity of plan.entities) {
    lines.push(`/** ${entity.title || entity.name} 的 3 条样例实例（第 3 条故意违反约束）。 */`);
    lines.push(`export const ${entity.name}Seed = [`);
    lines.push(...instanceLines(entity, false));
    lines.push(...instanceLines(entity, false));
    lines.push(...instanceLines(entity, true));
    lines.push(`] as const satisfies readonly ${entity.name}[];`);
    lines.push('');
  }

  lines.push(
    `export const seed = [${plan.entities.map((entity) => `...${entity.name}Seed`).join(', ')}] as const;`,
  );

  return {
    text: `${lines.join('\n')}\n`,
    fileName: `${base}-seed.ts`,
    warnings: plan.warnings,
  };
}
