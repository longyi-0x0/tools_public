/**
 * 解域画布（IMP7，默认引擎）：实体卡 + entityRelation 带标签的边。
 * 连线改成 React Flow 的 onConnect（从实体左右两侧的圆点拖到目标实体），
 * 左树的「关系 ＋」模式仍然能连（点起点再点终点），两条路径都落到 createRelation。
 * 节点同样走 useNodesState（非受控，IMPFIX3），拖动中不灌文档、松手才取整并 commit 一条记录。
 * Esc：退出连线模式 + 取消拖动（位置回起点、松手不写文档，见 flow/dragCancel.ts）。
 * 选中（FIX6）：ui.selectedId 是唯一真相，节点外观读 toFlow 派生的 data.selected；库那份只作输入。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import type { Node } from '@xyflow/react';
import {
  beginDrag,
  beginEntityDraft,
  cancelConnect,
  createEntityAt,
  createRelation,
  dragTo,
  endDrag,
  pickConnectEntity,
  selectEdge,
  setView,
} from '../store/commands.ts';
import { getUiState } from '../store/uiStore.ts';
import { useDoc, useUi } from './useStores.ts';
import { snapPoint, toSolveFlow } from './flow/toFlow.ts';
import { createDragGuard, restoreDragged } from './flow/dragCancel.ts';
import { settleNode, syncNodes } from './flow/nodeSync.ts';
import { FlowEdgeMarkers, edgeTypes } from './flow/edges.tsx';
import { nodeTypes } from './flow/nodes.tsx';
import { pickFromLibrary, pickNode } from './flow/selection.ts';

function SolveFlow() {
  const doc = useDoc();
  const ui = useUi();
  const flow = useReactFlow();
  const [minimap, setMinimap] = useState(false);
  const dragGuard = useRef(createDragGuard());

  const derived = useMemo(
    () =>
      toSolveFlow({
        ws: doc.ws,
        index: doc.index,
        selectedId: ui.selectedId,
        selectedEdgeKey: ui.selectedEdgeKey,
        connectSourceId: ui.connect?.sourceId ?? null,
      }),
    [doc.ws, doc.index, ui.selectedId, ui.selectedEdgeKey, ui.connect],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(derived.nodes);

  // 外部改动同步进库节点；有拖动在飞时让路（同 ProblemCanvas）。
  // FIX4：函数式更新 + 去掉 nodes 依赖，内容没变时 syncNodes 返回 null → 返回 current 不再 setState。
  useEffect(() => {
    setNodes((current) => syncNodes(current, derived.nodes) ?? current);
  }, [derived.nodes, setNodes]);

  // Esc：退出连线模式 + 取消拖动（两条互不冲突：没有拖动时 cancel() 返回 null，只关连线）。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      const start = dragGuard.current.cancel();
      if (start) setNodes((current) => restoreDragged(current, start));
      cancelConnect();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setNodes]);

  const onDoubleClick = (event: ReactMouseEvent<HTMLElement>): void => {
    const target = event.target as HTMLElement;
    if (target.closest('.react-flow__node') || target.closest('.stage-tools') || target.closest('.emptycard')) {
      return;
    }
    const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    createEntityAt({ x: Math.round(point.x), y: Math.round(point.y) });
  };

  const entityCount = nodes.length;

  return (
    <section
      className="stage"
      data-flow="on"
      data-canvas={ui.canvasOpen ? 'on' : 'off'}
      data-domain="solve"
      aria-label="领域模型画板"
      onDoubleClick={onDoubleClick}
    >
      <FlowEdgeMarkers />
      <div className="flow-stage">
        <ReactFlow
          nodes={nodes}
          edges={derived.edges}
          onNodesChange={onNodesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultViewport={ui.views.solve}
          onMove={(_, viewport) => setView(viewport)}
          minZoom={0.3}
          maxZoom={2.5}
          selectionOnDrag={false}
          selectionMode={SelectionMode.Partial}
          selectionKeyCode="Shift"
          panOnDrag
          panActivationKeyCode={null}
          zoomOnScroll
          zoomOnDoubleClick={false}
          deleteKeyCode={null}
          connectionMode={ConnectionMode.Loose}
          isValidConnection={(connection) => connection.source !== connection.target}
          onConnect={(connection) => {
            const { source, target } = connection;
            if (source && target && source !== target) createRelation(source, target);
            cancelConnect();
          }}
          onNodeClick={(_, node) => {
            if (getUiState().connect) pickConnectEntity(node.id);
            else pickNode(node.id);
          }}
          onSelectionChange={({ nodes: chosen }) => pickFromLibrary(chosen)}
          onEdgeClick={(_, edge) => {
            selectEdge(edge.id);
            pickNode(null);
          }}
          onPaneClick={() => {
            pickNode(null);
            selectEdge(null);
          }}
          onNodeDragStart={(_, node) => dragGuard.current.begin(node.id, node.position)}
          onNodeDragStop={(_, node) => {
            // Esc 取消过：位置已回起点，这一下不落库（撤销栈零增长）。
            if (!dragGuard.current.settle()) return;
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

      {entityCount === 0 && (
        <div className="emptycard">
          <p className="detail-line">解域还是空的</p>
          <p className="detail-note">先从问题树挑一个已回答的问题，再建它的第一个实体。</p>
          <button type="button" className="ghost-btn" onClick={() => beginEntityDraft()}>
            ＋ 新建第一个实体
          </button>
        </div>
      )}

      <div className="stage-tools" role="toolbar" aria-label="画布缩放">
        <button type="button" onClick={() => void flow.fitView({ padding: 0.15 })}>
          适配
        </button>
        <button type="button" onClick={() => void flow.zoomOut({ duration: 120 })} title="缩小">
          −
        </button>
        <button type="button" onClick={() => void flow.zoomTo(1, { duration: 120 })} title="100%">
          {Math.round(ui.views.solve.zoom * 100)}%
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

      {ui.connect ? (
        <div className="modebar" role="status">
          先点起点实体，再点终点实体 · Esc 取消
        </div>
      ) : (
        <div className="canvas-hint">拖拽平移 · Shift+拖拽框选 · 双击空白新建实体 · 或按 N</div>
      )}
    </section>
  );
}

/** ReactFlowProvider 只包住画布：库的 store 不往 App 层漏。 */
export function SolveFlowCanvas() {
  return (
    <ReactFlowProvider>
      <SolveFlow />
    </ReactFlowProvider>
  );
}
