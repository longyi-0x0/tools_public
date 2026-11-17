import { focusChecks } from '../store/commands.ts';
import { useDoc, useUi } from './useStores.ts';

/**
 * 左列底部检查行（02 §3 组件 11 / 03 §2.2）：不是卡片，无底色无阴影无边框；点它切详情「检查」分组。
 * 解域下计数只算 C6 相关（03 §2.2 / 任务书）。
 */
export function CheckFooter() {
  const doc = useDoc();
  const ui = useUi();
  const findings =
    ui.domain === 'solve'
      ? doc.checks.findings.filter((finding) => finding.code === 'C6')
      : doc.checks.findings;
  const error = findings.filter((finding) => finding.severity === 'error').length;
  const warning = findings.filter((finding) => finding.severity === 'warning').length;
  const text = `检查 ${error + warning} 条 · ${error} 错误 ${warning} 提示`;

  return (
    <button
      type="button"
      className="check-footer"
      title="检查摘要，点击查看检查分组"
      onClick={focusChecks}
    >
      <span
        className={`dot ${error > 0 ? 's-error' : 's-warning'}`}
        aria-hidden="true"
      />
      <span>{text}</span>
      <span className="check-arrow" aria-hidden="true">
        ›
      </span>
    </button>
  );
}
