/**
 * 选中（FIX6）：「点节点后看不出它被选中」的回归收口。
 *
 * 真相只有一个：`uiStore.selectedId`（A 方案）。左树、详情栏、画布都按单节点走，
 * React Flow 内部那份「选中集合」只是输入（点击 / Shift 框选），不能反过来当真相——
 * 否则库、ui 各记一份，两边谁清谁就成了先有鸡还是先有蛋。
 *
 * 链路：
 *   · 点节点 → onNodeClick → pickNode(id)
 *   · 点空白 → onPaneClick → pickNode(null)
 *   · 库的 onSelectionChange → pickFromLibrary(chosen)：只取最后点中的那个写回 ui（多选收敛成单选）
 *   · 节点外观读 toFlow 从 ui.selectedId 派生的 data.selected（见 flow/toFlow.ts）
 *
 * 这里只做「值没变就不写 store」的护栏：库在点击时会同时派发 select change 和 onSelectionChange，
 * 不去重就会多一次 setUi → 多一轮节点数组重建。
 */
import { select } from '../../store/commands.ts';
import { getUiState } from '../../store/uiStore.ts';

/** 画布上的选中入口：id 为 null = 取消选中（点空白）。 */
export function pickNode(id: string | null): void {
  if (getUiState().selectedId !== id) select(id);
}

/**
 * 库的选中集合 → ui：单选语义，取最后点中的那个。
 * 一个都没选中（点空白 / 框选落空）→ 清空选中。
 */
export function pickFromLibrary(chosen: readonly { id: string }[]): void {
  pickNode(chosen.at(-1)?.id ?? null);
}
