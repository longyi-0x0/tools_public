/** 管线 A 的 JSON 工作区：`stableStringify(ws)` 的可读版（01 §8.1 / 04 §2.6）。 */
import type { Workspace } from '../types.ts';
import { SCHEMA_VERSION } from '../types.ts';
import type { ExportArtifact } from './types.ts';
import { workspaceBase } from './names.ts';

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) out[key] = sortValue(record[key]);
    return out;
  }
  return value;
}

/**
 * 完整工作区，2 空格缩进、键序稳定、末尾换行；**含 `pos` 与 `viewports`**（01 §8.3 第 6 条），
 * `meta` 按 04 §2.6 剥离（时间戳会让同一份文档两次导出不同字节）。
 */
export function toJson(ws: Workspace): ExportArtifact {
  const payload = {
    schemaVersion: ws.schemaVersion ?? SCHEMA_VERSION,
    name: ws.name,
    goal: ws.goal,
    coreQuestionId: ws.coreQuestionId,
    nodes: ws.nodes,
    edges: ws.edges,
    viewports: ws.viewports,
  };
  return {
    text: `${JSON.stringify(sortValue(payload), null, 2)}\n`,
    fileName: `${workspaceBase(ws.name)}.json`,
    warnings: [],
  };
}
