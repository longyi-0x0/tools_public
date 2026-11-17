/** 状态圆点的类名映射（02 §2.2）：画布卡片与顶部状态行共用，只有三档色的语义不变。 */
import type { AnyNode, QuestionStatus } from '../domain/types.ts';

const STATUS_CLASS: Record<QuestionStatus, string> = {
  未澄清: 'dot s-unclear',
  分析中: 'dot s-analyzing',
  已澄清: 'dot s-clarified',
  已回答: 'dot s-answered',
  暂缓: 'dot s-deferred',
};

export function statusOf(node: AnyNode): QuestionStatus {
  return node.type === 'question' ? node.data.status ?? '未澄清' : '未澄清';
}

export function statusClassOf(node: AnyNode): string {
  return STATUS_CLASS[statusOf(node)];
}
