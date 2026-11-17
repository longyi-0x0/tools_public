/**
 * 导入：`fromJson(raw)`（04 §3.5 四道闸的前三道，纯函数）。
 * 校验结构 + schemaVersion + 端点类型；坏数据给可读中文错误，**绝不半打开、不碰 store**。
 */
import type { Workspace } from '../types.ts';
import { SCHEMA_VERSION } from '../types.ts';
import { parseJson } from '../serialize.ts';
import { EDGE_RULES, NODE_TYPES } from '../schema.ts';
import { withDefaults } from '../normalize.ts';

export type ImportResult =
  | { ok: true; ws: Workspace; warnings: string[] }
  | { ok: false; error: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function fail(error: string): ImportResult {
  return { ok: false, error };
}

/** 结构 + 版本校验；通过则交给 withDefaults 补默认值（连同 warnings 一起返回）。 */
export function fromJson(raw: string): ImportResult {
  if (typeof raw !== 'string' || raw.trim() === '') return fail('导入内容为空：没有读到任何文本');
  const parsed = parseJson(raw);
  if (parsed === null) return fail('不是合法的 JSON：解析失败（检查是否缺逗号、引号或括号）');
  const record = asRecord(parsed);
  if (!record) return fail('JSON 顶层不是对象：工作区必须是一个 `{ … }` 对象');

  const versionRaw = record['schemaVersion'];
  if (versionRaw === undefined) {
    return fail('缺少 schemaVersion：不是本工具导出的工作区（01 §4.1 要求带版本号）');
  }
  const version = Number(versionRaw);
  if (!Number.isFinite(version)) return fail(`schemaVersion 不是数字（读到「${String(versionRaw)}」）`);
  if (version > SCHEMA_VERSION) {
    return fail(`文件版本（v${version}）比本工具支持的（v${SCHEMA_VERSION}）更高，拒绝载入`);
  }
  if (version < 1) return fail(`schemaVersion 非法（读到 v${version}）`);

  const nodesRaw = record['nodes'];
  const edgesRaw = record['edges'];
  if (!Array.isArray(nodesRaw) || !Array.isArray(edgesRaw)) {
    return fail('不是本工具的文档形态：缺 nodes / edges 数组');
  }

  const seen = new Set<string>();
  const types = new Map<string, string>();
  for (let position = 0; position < nodesRaw.length; position += 1) {
    const node = asRecord(nodesRaw[position]);
    if (!node) return fail(`第 ${position + 1} 个节点不是对象`);
    const id = node['id'];
    if (typeof id !== 'string' || id.trim() === '') {
      return fail(`第 ${position + 1} 个节点没有 id`);
    }
    const type = node['type'];
    if (typeof type !== 'string' || !(NODE_TYPES as readonly string[]).includes(type)) {
      return fail(`第 ${position + 1} 个节点的 type「${String(type)}」不在 9 类之内（01 §4.1）`);
    }
    if (seen.has(id)) return fail(`节点 id 重复：${id}（同一工作区内 id 必须唯一）`);
    seen.add(id);
    types.set(id, type);
  }

  for (let position = 0; position < edgesRaw.length; position += 1) {
    const edge = asRecord(edgesRaw[position]);
    if (!edge) return fail(`第 ${position + 1} 条边不是对象`);
    const type = edge['type'];
    if (typeof type !== 'string' || !(type in EDGE_RULES)) {
      return fail(`第 ${position + 1} 条边的 type「${String(type)}」不在 11 条之内（01 §4.3）`);
    }
    const source = edge['source'];
    const target = edge['target'];
    if (typeof source !== 'string' || typeof target !== 'string') {
      return fail(`第 ${position + 1} 条边缺 source / target`);
    }
    const sourceType = types.get(source);
    const targetType = types.get(target);
    if (!sourceType || !targetType) {
      return fail(`第 ${position + 1} 条边（${type}）悬空：端点 ${!sourceType ? source : target} 不存在`);
    }
    const rule = EDGE_RULES[type as keyof typeof EDGE_RULES];
    if (!rule.source.includes(sourceType as never) || !rule.target.includes(targetType as never)) {
      return fail(
        `第 ${position + 1} 条边（${type}）端点类型不合法：${sourceType} → ${targetType}（01 §4.3）`,
      );
    }
  }

  const core = record['coreQuestionId'];
  if (core !== undefined && core !== null && typeof core !== 'string') {
    return fail('coreQuestionId 必须是字符串或 null');
  }
  if (typeof core === 'string' && !seen.has(core)) {
    return fail(`coreQuestionId 指向不存在的节点：${core}`);
  }

  const ws = withDefaults(record as unknown as Workspace);
  return { ok: true, ws, warnings: ['已按 v2 结构校验并补齐默认字段'] };
}
