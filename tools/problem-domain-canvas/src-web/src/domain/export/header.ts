/**
 * 文件头「未完成项」（01 §8.2 / 04 §2.2）：A/B/C 共用一处生成，不许各自拼。
 * 计数口径：C6 未支撑解域元素、C5 未澄清问题与引用已不存在规则；另附 C1–C6 命中计数。
 */
import type { DocIndex, Workspace } from '../types.ts';
import { runChecks, type CheckCode } from '../checks/index.ts';

export interface UnfinishedSummary {
  /** 全部计数为 0 时为 true，文件头写「无」。 */
  clean: boolean;
  /** 非空时逐条列「未支撑实体 N 个（C6）」等。 */
  items: readonly string[];
  byCode: Readonly<Record<CheckCode, number>>;
}

const CODES: readonly CheckCode[] = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'];

export function unfinished(ws: Workspace, index: DocIndex): UnfinishedSummary {
  const counts: Record<CheckCode, number> = { C1: 0, C2: 0, C3: 0, C4: 0, C5: 0, C6: 0 };
  for (const finding of runChecks(ws, index).findings) counts[finding.code] += 1;

  let unsupported = 0;
  let unclear = 0;
  for (const node of ws.nodes) {
    if (node.type === 'entity' || node.type === 'behavior' || node.type === 'constraint') {
      const targets = index.supportsByNode.get(node.id) ?? [];
      const supported = targets.some((id) => index.byId.get(id)?.type === 'question');
      if (!supported) unsupported += 1;
    }
    if (node.type === 'question' && node.data.status === '未澄清') unclear += 1;
  }
  let missingRules = 0;
  for (const edge of ws.edges) {
    if (edge.type === 'constrainedByRule' && !index.byId.has(edge.target)) missingRules += 1;
  }

  const items: string[] = [];
  if (unsupported > 0) items.push(`未支撑实体 ${unsupported} 个（C6）`);
  if (unclear > 0) items.push(`未澄清问题 ${unclear} 个（C5）`);
  if (missingRules > 0) items.push(`引用了已不存在规则 ${missingRules} 处（C5）`);
  const clean = items.length === 0;
  if (!clean) {
    items.push(`检查计数：${CODES.map((code) => `${code} ${counts[code]}`).join(' · ')}`);
  }
  return { clean, items, byCode: counts };
}

/** TS 用的注释版：`// 未完成项：无` 或 `// 未完成项：` + 缩进条目。 */
export function unfinishedCommentLines(ws: Workspace, index: DocIndex): string[] {
  const summary = unfinished(ws, index);
  if (summary.clean) return ['// 未完成项：无'];
  return ['// 未完成项：', ...summary.items.map((item) => `// - ${item}`)];
}

/** Markdown 用的列表版（调用方自己写 `## 未完成项` 标题）。 */
export function unfinishedMarkdownLines(ws: Workspace, index: DocIndex): string[] {
  const summary = unfinished(ws, index);
  if (summary.clean) return ['- 无'];
  return summary.items.map((item) => `- ${item}`);
}
