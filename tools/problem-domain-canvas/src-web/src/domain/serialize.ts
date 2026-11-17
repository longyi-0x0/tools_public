/** stableStringify / fingerprint / parseJson：落盘与比对都靠这里（04 §3.2）。 */
import type { Workspace } from './types.ts';

/** 键排序的 JSON：同一份文档两次序列化逐字节一致。 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      out[key] = sortValue(record[key]);
    }
    return out;
  }
  return value;
}

/** 结构指纹：只看结构（coreQuestionId / nodes / edges），不含 name / goal / meta 时间戳。 */
export function fingerprint(ws: Workspace): string {
  const text = stableStringify({
    coreQuestionId: ws.coreQuestionId,
    nodes: ws.nodes,
    edges: ws.edges,
  });
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
