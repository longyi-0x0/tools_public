/**
 * 管线 A：Markdown 说明书（01 §8.1 / 04 §2.3）。
 * 结构 = 文件头「未完成项」+ 两节（问题结构 / 领域模型）；
 * 问题按树序、元素按创建序、表格列固定；两次调用逐字节一致（幂等）。
 */
import type { AnyNode, DocIndex, NodeId, QuestionStatus, Workspace } from '../types.ts';
import type { ExportArtifact } from './types.ts';
import { unfinishedMarkdownLines } from './header.ts';
import { workspaceBase } from './names.ts';

function filled(text: string | undefined): string {
  const value = (text ?? '').trim();
  return value === '' ? '（未填）' : value;
}

function listOf(items: readonly string[] | undefined): string[] {
  const values = (items ?? []).map((item) => item.trim()).filter((item) => item !== '');
  return values.length === 0 ? ['- （无）'] : values.map((item) => `- ${item}`);
}

function questionBlock(node: AnyNode & { type: 'question' }): string[] {
  const status: QuestionStatus = node.data.status ?? '未澄清';
  const lines: string[] = [];
  lines.push(`### ${node.title || '未命名'} · ${status}`);
  lines.push('');
  lines.push(`- id：${node.id}`);
  lines.push(`- 陈述：${filled(node.data.statement)}`);
  lines.push('- 判定标准：', ...listOf(node.data.criteria));
  lines.push('- 正例：', ...listOf(node.data.positiveCases));
  lines.push('- 反例：', ...listOf(node.data.negativeCases));
  lines.push('- 已知：', ...listOf(node.data.knowns));
  lines.push('- 假设：', ...listOf(node.data.assumptions));
  lines.push('');
  return lines;
}

function entitySection(ws: Workspace, id: NodeId): string[] {
  const node = ws.nodes.find((entry) => entry.id === id);
  if (!node || node.type !== 'entity') return [];
  const fields = (node.data.fields ?? []).filter((field) => (field.name ?? '').trim() !== '');
  const states = (node.data.states ?? []).filter((state) => state.trim() !== '');
  const lines: string[] = [];
  lines.push(`### 实体：${node.title || '未命名'}`);
  lines.push('');
  lines.push(`- 主键：${filled(node.data.identity)}`);
  lines.push(`- 状态：${states.length === 0 ? '（无）' : states.join(' / ')}`);
  lines.push('');
  lines.push('| 字段 | 类型 | 必填 | 说明 |');
  lines.push('| --- | --- | --- | --- |');
  if (fields.length === 0) {
    lines.push('| （无） | — | — | — |');
  } else {
    for (const field of fields) {
      const note = (field.note ?? '').trim();
      lines.push(
        `| ${field.name} | ${(field.type ?? '').trim() || '（未填）'} | ${field.required === true ? '是' : '否'} | ${note === '' ? '—' : note} |`,
      );
    }
  }
  lines.push('');
  return lines;
}

/** 问题树序：根 = coreQuestionId，沿 decomposesTo 走；无父问题按标题码点序垫在最后。 */
function orderedQuestions(ws: Workspace, index: DocIndex): AnyNode[] {
  const questions = ws.nodes.filter((node) => node.type === 'question');
  const position = new Map<NodeId, number>();
  questions.forEach((node, at) => position.set(node.id, at));

  const treeOrder = index.questionsInTreeOrder
    .map((id) => index.byId.get(id))
    .filter((node): node is AnyNode => node !== undefined && node.type === 'question');

  const inTree = new Set(treeOrder.map((node) => node.id));
  const orphans = questions
    .filter((node) => !inTree.has(node.id))
    .sort((left, right) => {
      if (left.title !== right.title) return left.title < right.title ? -1 : 1;
      return (position.get(left.id) ?? 0) - (position.get(right.id) ?? 0);
    });
  return [...treeOrder, ...orphans];
}

export function toMarkdown(ws: Workspace, index: DocIndex): ExportArtifact {
  const lines: string[] = [];
  lines.push(`# ${ws.name} · 说明书`);
  lines.push('');
  lines.push(`> 目标：${filled(ws.goal)}`);
  lines.push('> 由「问题域画板」导出：只含结构与证据，不含坐标、选中态与缩放。');
  lines.push('');
  lines.push('## 未完成项');
  lines.push('');
  lines.push(...unfinishedMarkdownLines(ws, index));
  lines.push('');

  lines.push('## 问题结构');
  lines.push('');
  const questions = orderedQuestions(ws, index);
  if (questions.length === 0) {
    lines.push('（无）');
    lines.push('');
  } else {
    const inTree = new Set(index.questionsInTreeOrder);
    let orphanHeading = false;
    for (const node of questions) {
      if (!inTree.has(node.id) && !orphanHeading) {
        lines.push('### 未挂到核心问题');
        lines.push('');
        orphanHeading = true;
      }
      if (node.type === 'question') lines.push(...questionBlock(node));
    }
  }

  lines.push('## 领域模型');
  lines.push('');
  const entities = ws.nodes.filter((node) => node.type === 'entity');
  if (entities.length === 0) {
    lines.push('（无）');
    lines.push('');
  } else {
    for (const entity of entities) lines.push(...entitySection(ws, entity.id));
  }

  lines.push('### 行为');
  lines.push('');
  const behaviors = ws.nodes.filter((node) => node.type === 'behavior');
  if (behaviors.length === 0) {
    lines.push('- （无）');
  } else {
    for (const behavior of behaviors) {
      if (behavior.type !== 'behavior') continue;
      const owners = ws.edges
        .filter((edge) => edge.type === 'behaviorOnEntity' && edge.source === behavior.id)
        .map((edge) => index.byId.get(edge.target)?.title || '未命名');
      const output = (behavior.data.output ?? '').trim();
      lines.push(
        `- ${behavior.title || '未命名'}（实体：${owners.length === 0 ? '未挂实体' : owners.join(' / ')}）${output === '' ? '' : ` → ${output}`}`,
      );
    }
  }
  lines.push('');

  lines.push('### 约束');
  lines.push('');
  const constraints = ws.nodes.filter((node) => node.type === 'constraint');
  if (constraints.length === 0) {
    lines.push('- （无）');
  } else {
    for (const constraint of constraints) {
      if (constraint.type !== 'constraint') continue;
      const expr = (constraint.data.expr ?? '').trim() || '（未填）';
      lines.push(
        `- ${constraint.title || '未命名'}（${constraint.data.kind === '禁止' ? '禁止' : '必须'}）：${expr}`,
      );
    }
  }
  lines.push('');

  lines.push('### 支撑关系');
  lines.push('');
  const supports = ws.edges.filter((edge) => edge.type === 'supportsQuestion');
  if (supports.length === 0) {
    lines.push('- （无）');
  } else {
    for (const edge of supports) {
      const source = index.byId.get(edge.source);
      const target = index.byId.get(edge.target);
      lines.push(
        `- ${source ? `${edge.source} ${source.title || '未命名'}` : `${edge.source}（缺失）`} → ${target ? `${edge.target} ${target.title || '未命名'}` : `${edge.target}（缺失）`}`,
      );
    }
  }
  lines.push('');

  return {
    text: `${lines.join('\n')}\n`,
    fileName: `${workspaceBase(ws.name)}-说明书.md`,
    warnings: [],
  };
}
