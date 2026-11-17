import { useEffect } from 'react';
import {
  redo,
  setCanvasOpen,
  setDetailOpen,
  toggleCanvas,
  toggleDetail,
  undo,
} from './store/commands.ts';
import { useUi } from './ui/useStores.ts';
import { WsHead } from './ui/WsHead.tsx';
import { Tree } from './ui/Tree.tsx';
import { CheckFooter } from './ui/CheckFooter.tsx';
import { StatusBar } from './ui/StatusBar.tsx';
import { ProblemCanvas } from './ui/ProblemCanvas.tsx';
import { SolveFlowCanvas } from './ui/SolveFlowCanvas.tsx';
import { DetailPanel } from './ui/DetailPanel.tsx';

/**
 * 两列壳（03 §2）：左列 264 固定（头 + 树 + 检查行），右列弹性（状态行 + 画板 + 详情）。
 * 画布只有 @xyflow/react 一套：问题域 ProblemCanvas、解域 SolveFlowCanvas（不再有回退引擎）。
 * 面板收起（03 §2.4.2 / 02 §109）：`[` 收画板、`]` 收详情，两者互斥（收一块时把另一块放回来），
 * 把手与快捷键走同一对命令（commands.ts 的 setCanvasOpen / setDetailOpen）。
 */
export default function App() {
  const ui = useUi();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const typing =
        target !== null &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (typing) return;
      // 撤销 / 重做：Ctrl+Z、Ctrl+Shift+Z、Ctrl+Y（输入框内不抢键，上一行已返回）。
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mod && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && key === 'y') {
        event.preventDefault();
        redo();
        return;
      }
      if (event.key === ']') {
        event.preventDefault();
        toggleDetail();
        return;
      }
      // `[` 收画板（03 §2.4.2）：与 `]` 互斥，收画板时详情自动放回。
      if (event.key === '[') {
        event.preventDefault();
        toggleCanvas();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div
      className="app"
      data-right={ui.detailOpen ? 'on' : 'off'}
      data-canvas={ui.canvasOpen ? 'on' : 'off'}
    >
      <aside className="col left">
        <WsHead />
        <Tree />
        <CheckFooter />
      </aside>
      <section className="col right">
        <StatusBar />
        <div className="content">
          {ui.domain === 'solve' ? <SolveFlowCanvas /> : <ProblemCanvas />}
          <DetailPanel />
          {/* 窄屏详情是覆盖式抽屉：点遮罩关掉（宽屏这条规则是 display:none） */}
          {ui.detailOpen && (
            <div
              className="detail-scrim"
              role="presentation"
              onClick={() => setDetailOpen(false)}
            />
          )}
          {/* 画板 / 详情边界上的 24px 把手：收起态留在边界左侧，图标随状态翻转 */}
          {ui.canvasOpen ? (
            <button
              type="button"
              className="handle hc"
              title="收起画板（[）"
              aria-label="收起画板"
              onClick={() => setCanvasOpen(false)}
            >
              ‹
            </button>
          ) : (
            <button
              type="button"
              className="handle hc"
              title="展开画板（[）"
              aria-label="展开画板"
              onClick={() => setCanvasOpen(true)}
            >
              ›
            </button>
          )}
          {!ui.detailOpen && (
            <button
              type="button"
              className="handle reopen-detail"
              title="展开详情（]）"
              onClick={() => setDetailOpen(true)}
            >
              ‹
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
