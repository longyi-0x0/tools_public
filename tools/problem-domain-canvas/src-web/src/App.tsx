import { useEffect } from 'react';
import { redo, setDetailOpen, toggleDetail, undo } from './store/commands.ts';
import { getUiState } from './store/uiStore.ts';
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
      }
      // `[` 收画板本轮不做（03 §2.4.2 允许），data-canvas 属性已留好。
      if (event.key === '[' && !getUiState().canvasOpen) {
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="app" data-right={ui.detailOpen ? 'on' : 'off'} data-canvas="on">
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
