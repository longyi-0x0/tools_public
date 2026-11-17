/**
 * 检查行文案（02 §127 / 03 §51，IMP8 裁定两档）：只数 error / warning，其余严重度不参与。
 * 纯函数，CheckFooter 与 uiReview.test.ts 共用同一份措辞，避免文案与样式各写一遍。
 */
export function checkSummaryText(findings: readonly { severity: string }[]): string {
  const error = findings.filter((finding) => finding.severity === 'error').length;
  const warning = findings.filter((finding) => finding.severity === 'warning').length;
  return `检查 ${error + warning} 条 · ${error} 错误 ${warning} 警告`;
}
