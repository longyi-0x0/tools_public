import { focusChecks } from '../store/commands.ts';
import { useDoc, useUi } from './useStores.ts';
import { checkSummaryText } from './checkText.ts';

/**
 * 左列底部检查行（02 §3 组件 11 / 03 §2.2）：不是卡片，无底色无阴影无边框；点它切详情「检查」分组。
 * 解域下计数只算 C6 相关（03 §2.2 / 任务书）。
 * 严重度两档（IMP8 裁定）：文案「检查 N 条 · X 错误 Y 警告」，圆点 8px 走 --pd-red-3 / --pd-amber-3。
 */
export function CheckFooter() {
  const doc = useDoc();
  const ui = useUi();
  const findings =
    ui.domain === 'solve'
      ? doc.checks.findings.filter((finding) => finding.code === 'C6')
      : doc.checks.findings;
  const error = findings.filter((finding) => finding.severity === 'error').length;

  return (
    <button
      type="button"
      className="check-footer"
      title="检查摘要，点击查看检查分组"
      onClick={focusChecks}
    >
      <span className={`dot ${error > 0 ? 's-error' : 's-warning'}`} aria-hidden="true" />
      <span>{checkSummaryText(findings)}</span>
      <span className="check-arrow" aria-hidden="true">
        ›
      </span>
    </button>
  );
}
