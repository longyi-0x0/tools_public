import type { DocIndex } from '../domain/types.ts';
import { isSolveNodeType } from '../domain/schema.ts';
import { canRedo, canUndo, redo, setTheme, undo } from '../store/commands.ts';
import { retrySave } from '../store/bootstrap.ts';
import { useDoc, useUi } from './useStores.ts';
import { statusClassOf } from './nodeStyle.ts';
import { saveLabel } from './saveLabel.ts';
import { ExportMenu } from './ExportMenu.tsx';

/** 父级路径（03 §2.3）：极小字，不做面包屑导航条。 */
function parentPath(index: DocIndex, id: string): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  let current = index.parentsOf.get(id)?.[0];
  while (current && !seen.has(current)) {
    seen.add(current);
    const code = index.codes.get(current);
    if (code) parts.unshift(code);
    current = index.parentsOf.get(current)?.[0];
  }
  return parts.join(' › ');
}

/** 右列顶部状态行（02 §3 组件 1 / 03 §2.3）：当前在看什么 + 已保存；无背景无圆角。 */
export function StatusBar() {
  const doc = useDoc();
  const ui = useUi();
  const node = ui.selectedId ? doc.index.byId.get(ui.selectedId) : undefined;
  const code = node ? doc.index.codes.get(node.id) : undefined;
  const path = node && node.type === 'question' ? parentPath(doc.index, node.id) : '';
  const edge = ui.selectedEdgeKey ? doc.index.edgeByKey.get(ui.selectedEdgeKey) : undefined;
  const save = saveLabel({ saveError: doc.saveError, dirty: doc.dirty });
  const solveNode = node && isSolveNodeType(node.type) ? node : undefined;
  const supportCodes = solveNode
    ? (doc.index.supportsByNode.get(solveNode.id) ?? [])
        .map((questionId) => doc.index.codes.get(questionId) ?? '')
        .filter((item) => item.length > 0)
    : [];

  return (
    <div className="statusbar">
      <div className="sb-left">
        {edge ? (
          <>
            <span className="dot s-clarified" aria-hidden="true" />
            <span className="sb-title">
              {doc.index.byId.get(edge.source)?.title || '未命名'} —{edge.label ?? '关系'}→{' '}
              {doc.index.byId.get(edge.target)?.title || '未命名'}
            </span>
            <span className="sb-path">{edge.cardinality ?? '1:N'}</span>
          </>
        ) : solveNode ? (
          <>
            <span className="dot s-clarified" aria-hidden="true" />
            <span className="sb-title">{solveNode.title || '未命名'}</span>
            <span className="sb-path">
              {supportCodes.length > 0 ? `支撑 ${supportCodes.join(' ')}` : '未支撑（C6）'}
            </span>
          </>
        ) : node ? (
          <>
            <span className={statusClassOf(node)} aria-hidden="true" />
            <span className="sb-title">
              {code ? `${code} ${node.title || '未命名'}` : node.title || '未命名'}
            </span>
            {path && <span className="sb-path">{path} ›</span>}
          </>
        ) : (
          <span className="sb-none">未选中</span>
        )}
      </div>
      <div className="sb-right">
        {/* 落盘三态（03 §112）：已保存 / 保存中 / 失败可点重试；失败原因走 title，不弹模态框 */}
        <span className="saved" data-tone={save.tone} title={doc.saveError ?? undefined}>
          <span className={`dot ${save.tone === 'error' ? 's-error' : 's-clarified'}`} aria-hidden="true" />
          {save.tone === 'error' ? (
            <button type="button" className="saved-retry" onClick={retrySave}>
              {save.text}
            </button>
          ) : (
            <span className="saved-text">{save.text}</span>
          )}
        </span>
        <span className="theme-toggle">
          <button type="button" data-on={ui.theme === 'light'} onClick={() => setTheme('light')}>
            浅
          </button>
          <button type="button" data-on={ui.theme === 'dark'} onClick={() => setTheme('dark')}>
            深
          </button>
        </span>
        <ExportMenu />
        <span className="hist-btns">
          <button
            type="button"
            className="handle"
            title="撤销（Ctrl+Z）"
            aria-label="撤销"
            disabled={!canUndo()}
            onClick={undo}
          >
            ↶
          </button>
          <button
            type="button"
            className="handle"
            title="重做（Ctrl+Shift+Z / Ctrl+Y）"
            aria-label="重做"
            disabled={!canRedo()}
            onClick={redo}
          >
            ↷
          </button>
        </span>
      </div>
    </div>
  );
}
