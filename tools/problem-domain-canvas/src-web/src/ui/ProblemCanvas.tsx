/**
 * 问题域画布（IMP7，默认引擎）：@xyflow/react 承载视口与交互，节点长相由 flow/nodes.tsx 保住。
 *
 * 开着的交互：滚轮缩放（zoomOnScroll）、左键拖空白平移（panOnDrag，不用先按空格）、
 * 按住 Shift 再拖框选（selectionKeyCode="Shift"，selectionOnDrag=false）、fitView（工具条「适配」）、minimap（默认关）。
 * 节点走 useNodesState（非受控，IMPFIX3）：拖动中库按指针自己改位置，松手才 commit 一条「移动节点」；
 * 文档只在「没人在拖」时灌回节点（flow/nodeSync.ts 的闸门），否则正在拖的节点会被打回原位。
 * 网格吸附只在松手时做（snapToGrid=false + snapPoint），拖动中全程跟手、不按 8px 一拍一跳。
 * 视口写 uiStore、不进撤销栈；拖动中 Esc = 取消（按下记起点，Esc 把节点放回起点，松手不落库）。
 * 选中（FIX6）：ui.selectedId 是唯一真相，节点外观读 toFlow 派生的 data.selected；
 * 库那份 selected 只作输入（onSelectionChange 收敛成单选），并按 ui 回灌，免得库把选中清掉。
 *
 * IMP8 裁定（按 02 收敛）：画布只渲染 question / entity 两类卡片；其余 5 类元素（actor/scene/
 * concept/rule/constraint）不上画布，以问题卡底部的关联胶囊呈现（node-links，见 canvas.css 的 .node-link）。
 * 网格保持 24px 点阵（BackgroundVariant.Dots），不改成 02 §6.7 的 4/5 虚线。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, MouseEvent as ReactMouseEvent } from 'react';
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
import {
  beginDraft,
  beginDrag,
  cancelDepends,
  createQuestionAt,
  dragTo,
  endDrag,
  pickDependsTarget,
  setView,
} from '../store/commands.ts';
import { getDocState, initDoc } from '../store/docStore.ts';
import { loadWorkspaceText } from '../store/persistence.ts';
import { useDoc, useUi } from './useStores.ts';
import { pickFromLibrary, pickNode } from './flow/selection.ts';
import { snapPoint, toProblemFlow } from './flow/toFlow.ts';
import { createDragGuard, restoreDragged } from './flow/dragCancel.ts';
import { settleNode, syncNodes } from './flow/nodeSync.ts';
import { FlowEdgeMarkers, edgeTypes } from './flow/edges.tsx';
import { nodeTypes } from './flow/nodes.tsx';

function ProblemFlow() {
  const doc = useDoc();
  const ui = useUi();
  const flow = useReactFlow();
  const [minimap, setMinimap] = useState(false);
  const dragGuard = useRef(createDragGuard());
  const fileInput = useRef<HTMLInputElement | null>(null);

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
  // FIX4：依赖里去掉 nodes，改用函数式更新。syncNodes 内容没变时返回 null → 原样返回 current，
  // React 直接 bail out；否则「setNodes → nodes 变 → effect 再跑」会自己转圈，落子看起来像整板刷新。
  useEffect(() => {
    setNodes((current) => syncNodes(current, derived.nodes) ?? current);
  }, [derived.nodes, setNodes]);

  // Esc 取消拖动：位置回起点（库内节点），松手时 onNodeDragStop 不再回写文档（零撤销记录）。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      cancelDepends();
      const start = dragGuard.current.cancel();
      if (!start) return;
      setNodes((current) => restoreDragged(current, start));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setNodes]);

  const onDoubleClick = (event: ReactMouseEvent<HTMLElement>): void => {
    const target = event.target as HTMLElement;
    if (target.closest('.react-flow__node') || target.closest('.stage-tools') || target.closest('.emptycard')) {
      return;
    }
    // 坐标走 React Flow 的视口换算（screenToFlowPosition），不是手算 raw client 坐标。
    const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    createQuestionAt({ x: Math.round(point.x), y: Math.round(point.y) });
  };

  /** 空态卡「导入 JSON」：读本地文件 → 过 loadWorkspaceText 的四道闸 → 整份热载。 */
  const onFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const loaded = loadWorkspaceText(typeof reader.result === 'string' ? reader.result : null);
      if ('error' in loaded) {
        initDoc(getDocState().ws, `导入失败：${loaded.error}`);
        return;
      }
      initDoc(
        loaded.ws,
        `已导入：${loaded.ws.nodes.length} 个节点、${loaded.ws.edges.length} 条边`,
      );
    };
    reader.readAsText(file);
  };

  const questionCount = doc.ws.nodes.filter((node) => node.type === 'question').length;

  return (
    <section
      className="stage"
      data-flow="on"
      data-canvas={ui.canvasOpen ? 'on' : 'off'}
      aria-label="画板"
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
          defaultViewport={ui.views.problem}
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
          proOptions={{ hideAttribution: false }}
          onNodeClick={(_, node) => {
            // 建立依赖的选目标模式：点另一个问题 = 建边；点自己 / 非问题由命令拒绝并给提示。
            if (ui.dependsSourceId) pickDependsTarget(node.id);
            else pickNode(node.id);
          }}
          onSelectionChange={({ nodes: chosen }) => pickFromLibrary(chosen)}
          onPaneClick={() => pickNode(null)}
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

      {/* 空态引导卡（02 §130 / 03 §85 / UI-REVIEW M7）：树与画布同时为空才出现，复用解域的 .emptycard */}
      {questionCount === 0 && (
        <div className="emptycard">
          <p className="detail-line">还没有核心问题</p>
          <p className="detail-note">先写一句「要解决什么」，再把它拆成子问题。</p>
          <button type="button" className="primary-btn" onClick={() => beginDraft(null)}>
            ＋ 新建核心问题
          </button>
          <button type="button" className="ghost-btn" onClick={() => fileInput.current?.click()}>
            导入 JSON
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={onFile}
          />
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
          {Math.round(ui.views.problem.zoom * 100)}%
        </button>
        <button type="button" onClick={() => void flow.zoomIn({ duration: 120 })} title="放大">
          +
        </button>
        <button
          type="button"
          className="minimap-toggle"
          onClick={() => setMinimap((on) => !on)}
          title="缩略图（默认关）"
          aria-pressed={minimap}
        >
          图
        </button>
      </div>

      {/* 建立依赖的选目标模式：复用解域连线模式的 .modebar（底部引导条） */}
      {ui.dependsSourceId ? (
        <div className="modebar" role="status">
          已选起点：{doc.index.codes.get(ui.dependsSourceId) ?? ''}{' '}
          {doc.index.byId.get(ui.dependsSourceId)?.title || '未命名'} · 点另一个问题完成 · Esc 取消
          {ui.dependsTip && <span className="modebar-tip"> · {ui.dependsTip}</span>}
        </div>
      ) : (
        <div className="canvas-hint">拖拽平移 · Shift+拖拽框选 · 双击空白新建问题 · 或按 N</div>
      )}
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
