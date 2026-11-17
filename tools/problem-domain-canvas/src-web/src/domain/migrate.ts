/**
 * 迁移链（04 §3.4）：只写相邻两级、纯函数、先深拷贝；只在读路径跑，写永远写当前版本。
 * 本轮只需要 v2 能读能写，v1 → v2 是骨架：每条「丢弃」进 warnings，不抛错。
 */
import { SCHEMA_VERSION } from './types.ts';

export const CURRENT: number = SCHEMA_VERSION;

export interface MigrationOutcome {
  ws: unknown;
  warnings: string[];
}

type Migration = (raw: unknown) => MigrationOutcome;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** v1 的 entities[] → v2 的 nodes[]；v2 信封没有 order/flags/size/tags/createdAt，丢弃并进 warnings。 */
function v1_to_v2(raw: unknown): MigrationOutcome {
  const warnings: string[] = [];
  const source = asRecord(clone(raw));
  if (!source) return { ws: raw, warnings: ['v1 文档不是对象，原样交给校验闸'] };

  const entities = Array.isArray(source['entities']) ? (source['entities'] as unknown[]) : null;
  if (!entities) return { ws: source, warnings: ['v1 文档没有 entities[]，按原样交给校验闸'] };

  const nodes: unknown[] = [];
  for (const entry of entities) {
    const node = asRecord(entry);
    if (!node) continue;
    for (const dropped of ['order', 'flags', 'size', 'tags', 'createdAt']) {
      if (dropped in node) {
        delete node[dropped];
        warnings.push(`丢弃 v1 字段 ${dropped}`);
      }
    }
    nodes.push(node);
  }
  warnings.push('v1 的 viewport.deps 已丢弃，只留 problem / solve 两域视口');

  const vp = asRecord(source['viewport']);
  return {
    ws: {
      schemaVersion: 2,
      name: typeof source['name'] === 'string' ? source['name'] : '未命名工作区',
      goal: typeof source['goal'] === 'string' ? source['goal'] : '',
      coreQuestionId: typeof source['coreQuestionId'] === 'string' ? source['coreQuestionId'] : null,
      nodes,
      edges: Array.isArray(source['edges']) ? source['edges'] : [],
      viewports: {
        problem: asRecord(vp?.['overview']) ?? { x: 0, y: 0, zoom: 1 },
        solve: asRecord(vp?.['model']) ?? { x: 0, y: 0, zoom: 1 },
      },
      meta: { createdAt: '', updatedAt: '' },
    },
    warnings,
  };
}

export const MIGRATIONS: Record<number, Migration> = { 1: v1_to_v2 };

export function migrate(raw: unknown): MigrationOutcome | { error: string } {
  const record = asRecord(raw);
  if (!record) return { error: '不是合法的 JSON 对象' };

  const version = Number(record['schemaVersion']);
  if (!Number.isFinite(version)) {
    // 缺 schemaVersion：按当前版本交给校验闸，坏数据在那里被挡住（04 §3.5）。
    return { ws: raw, warnings: ['缺少 schemaVersion，按当前版本继续校验'] };
  }
  if (version > CURRENT) {
    return {
      error: `文件版本（v${version}）比本工具支持的（v${CURRENT}）更高，拒绝载入。`,
    };
  }

  let cur: unknown = clone(raw);
  const warnings: string[] = [];
  let at = version;
  while (at < CURRENT) {
    const step = MIGRATIONS[at];
    if (!step) return { error: `缺少 v${at} → v${at + 1} 的迁移函数` };
    const outcome = step(cur);
    cur = outcome.ws;
    warnings.push(...outcome.warnings);
    at += 1;
  }
  return { ws: cur, warnings };
}
