/**
 * 问题域画布（IMP7，默认引擎）：@xyflow/react 承载视口与交互，节点长相由 flow/nodes.tsx 保住。
 *
 * 开着的交互：滚轮缩放（zoomOnScroll）、拖拽平移（中键/右键拖 + 按住空格左键拖）、
 * 框选多选（selectionOnDrag + SelectionMode.Partial）、fitView（工具条「适配」）、minimap（默认关）。
 * 节点走 useNodesState（非受控，IMPFIX3）：拖动中库按指针自己改位置，松手才 commit 一条「移动节点」；
 * 文档只在「没人在拖」时灌回节点（flow/nodeSync.ts 的闸门），否则正在拖的节点会被打回原位。
 * 网格吸附只在松手时做（snapToGrid=false + snapPoint），拖动中全程跟手、不按 8px 一拍一跳。
 * 视口写 uiStore、不进撤销栈；拖动中 Esc = 取消（按下记起点，Esc 把节点放回起点，松手不落库）。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import type { Node } from '@xyflow/react';
import { beginDrag, createQuestionAt, dragTo, endDrag, select, setView } from '../store/commands.ts';
import { getUiState } from '../store/uiStore.ts';
import { useDoc, useUi } from './useStores.ts';
import { snapPoint, toProblemFlow } from './flow/toFlow.ts';
import { createDragGuard, restoreDragged } from './flow/dragCancel.ts';
import { settleNode, syncNodes } from './flow/nodeSync.ts';
import { FlowEdgeMarkers, edgeTypes } from './flow/edges.tsx';
import { nodeTypes } from './flow/nodes.tsx';

function pick(id: string | null): void {
  if (getUiState().selectedId !== id) select(id);
}

function ProblemFlow() {
  const doc = useDoc();
  const ui = useUi();
  const flow = useReactFlow();
  const [minimap, setMinimap] = useState(false);
  const dragGuard = useRef(createDragGuard());

  const derived = useMemo(
    () =>
      toProblemFlow({
        ws: doc.ws,
        index: doc.index,
        checksByNode: doc.checks.byNode,
        selectedId: ui.selectedId,
      }),
    [doc.ws, doc.index, doc.checks, ui.selectedId],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(derived.nodes);

  // 外部改动（改名/新建/撤销/换选中）同步进库节点；有拖动在飞时让路，不打断正在拖的节点。
  useEffect(() => {
    const next = syncNodes(nodes, derived.nodes);
    if (next) setNodes(next);
  }, [nodes, derived.nodes, setNodes]);

  // Esc 取消拖动：位置回起点（库内节点），松手时 onNodeDragStop 不再回写文档（零撤销记录）。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      const start = dragGuard.current.cancel();
      if (!start) return;
      setNodes((current) => restoreDragged(current, start));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setNodes]);

  const onDoubleClick = (event: ReactMouseEvent<HTMLElement>): void => {
    const target = event.target as HTMLElement;
    if (target.closest('.react-flow__node') || target.closest('.stage-tools')) return;
    // 坐标走 React Flow 的视口换算（screenToFlowPosition），不是手算 raw client 坐标。
    const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    createQuestionAt({ x: Math.round(point.x), y: Math.round(point.y) });
  };

  return (
    <section className="stage" data-flow="on" data-canvas="on" aria-label="画板" onDoubleClick={onDoubleClick}>
      <FlowEdgeMarkers />
      <div className="flow-stage">
        <ReactFlow
          nodes={nodes}
          edges={derived.edges}
          onNodesChange={onNodesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultViewport={ui.views.problem}
          onMove={(_, viewport) => setView(viewport)}
          minZoom={0.3}
          maxZoom={2.5}
          selectionOnDrag
          selectionMode={SelectionMode.Partial}
          panOnDrag={[1, 2]}
          panActivationKeyCode="Space"
          zoomOnScroll
          zoomOnDoubleClick={false}
          deleteKeyCode={null}
          proOptions={{ hideAttribution: false }}
          onNodeClick={(_, node) => pick(node.id)}
          onSelectionChange={({ nodes: chosen }) => pick(chosen.at(-1)?.id ?? null)}
          onPaneClick={() => pick(null)}
          onNodeDragStart={(_, node) => dragGuard.current.begin(node.id, node.position)}
          onNodeDragStop={(_, node) => {
            // Esc 取消过：位置已回起点，这一下不落库（撤销栈零增长）。
            if (!dragGuard.current.settle()) return;
            // 拖动中不吸网格；落点在这里取整，再走「一次拖动一条记录」的三连。
            const pos = snapPoint(node.position);
            setNodes((current) => settleNode(current, node.id, pos));
            beginDrag(node.id);
            dragTo(pos);
            endDrag();
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--pd-line-1)" />
          {minimap && <MiniMap pannable zoomable ariaLabel="缩略图" />}
        </ReactFlow>
      </div>

      <div className="stage-tools" role="toolbar" aria-label="画布缩放">
        <button type="button" onClick={() => void flow.fitView({ padding: 0.15 })}>
          适配
        </button>
        <button type="button" onClick={() => void flow.zoomOut({ duration: 120 })} title="缩小">
          −
        </button>
        <button type="button" onClick={() => void flow.zoomTo(1, { duration: 120 })} title="100%">
          {Math.round(ui.views.problem.zoom * 100)}%
        </button>
        <button type="button" onClick={() => void flow.zoomIn({ duration: 120 })} title="放大">
          +
        </button>
        <button
          type="button"
          onClick={() => setMinimap((on) => !on)}
          title="缩略图（默认关）"
          aria-pressed={minimap}
        >
          图
        </button>
      </div>

      <div className="canvas-hint">双击空白新建问题 · 或按 N</div>
    </section>
  );
}

/** ReactFlowProvider 只包住画布：库的 store 不往 App 层漏。 */
export function ProblemCanvas() {
  return (
    <ReactFlowProvider>
      <ProblemFlow />
    </ReactFlowProvider>
  );
}
