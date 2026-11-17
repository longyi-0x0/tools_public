/**
 * 自定义边（IMP7）：直角折线（smoothstep）+ 箭头 + EdgeLabelRenderer 放标签。
 * 为什么不用库自带的 `smoothstep`：自带边把标签塞在 EdgeText 里，字体/底色只能在 style 上硬编码；
 * 自绘边能直接吃 02 的令牌（关系名 11px 600、基数 10px 弱字、标签底色 = 面板色），并保证随主题变。
 */
import type { ReactElement } from 'react';
import type { EdgeProps } from '@xyflow/react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';
import type { PdcEdgeData } from './toFlow.ts';

export function PdcEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
}: EdgeProps): ReactElement {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
    offset: 24,
  });
  const edge = (data ?? {}) as unknown as PdcEdgeData;
  const hasLabel = typeof edge.label === 'string' && edge.label.length > 0;
  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      {hasLabel && (
        <EdgeLabelRenderer>
          <div
            className="pdc-edge-label nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            <span className="pdc-edge-label-name">{edge.label}</span>
            {edge.cardinality && (
              <span className="pdc-edge-label-cardinality">{edge.cardinality}</span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const edgeTypes = { pdc: PdcEdge };

/**
 * 箭头 defs：实心（decomposesTo）/ 空心（dependsOn）。
 * 放在画板里而不是每条边各一份——颜色用令牌，换个主题箭头自己跟着变。
 */
export function FlowEdgeMarkers(): ReactElement {
  return (
    <svg className="pdc-markers" aria-hidden="true" focusable="false">
      <defs>
        <marker
          id="pdc-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="var(--pd-accent)" />
        </marker>
        <marker
          id="pdc-arrow-hollow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path
            d="M0 0 L10 5 L0 10 z"
            fill="none"
            stroke="var(--pd-accent)"
            strokeWidth="1.5"
          />
        </marker>
      </defs>
    </svg>
  );
}
