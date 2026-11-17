/**
 * 状态行右端的落盘三态（03 §112）：已保存 / 保存中 / 保存失败（点击重试）。
 * 纯函数：StatusBar 与 uiReview.test.ts 用同一份措辞，避免测试断言另一份字。
 */
export type SaveTone = 'muted' | 'error';

export interface SaveLabel {
  text: string;
  tone: SaveTone;
}

export function saveLabel(state: { saveError: string | null; dirty: boolean }): SaveLabel {
  if (state.saveError !== null) return { text: '⚠ 保存失败（点击重试）', tone: 'error' };
  if (state.dirty) return { text: '保存中…', tone: 'muted' };
  return { text: '✓ 已保存', tone: 'muted' };
}
