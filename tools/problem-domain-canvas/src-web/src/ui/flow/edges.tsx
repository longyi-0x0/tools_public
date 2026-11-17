/**
 * 自定义边（IMP7 / FIX3）：按关系语法分两种几何。
 *
 * - decomposesTo（kind='decomposes'）/ dependsOn（kind='depends'）→ **纯直线** getStraightPath：
 *   从父卡底部句柄画到子卡顶部句柄，`d` 里只有 M/L，没有 C/Q/A。
 *   FIX3 之前的实现一律走 getSmoothStepPath，`d` 形如
 *   `M100 80L 100,132Q 100,140 108,140L 172,140Q 180,140 180,148L180 200`
 *   —— 绕两个直角还带圆角，用户看到的「不是直线」就是它。
 * - entityRelation（kind='relation'）→ getSmoothStepPath 正交折线：实体卡是左右句柄，
 *   横向连线走直角比斜线清楚，关系名/基数标签压在折线上。
 *
 * 标签仍用 EdgeLabelRenderer：能直接吃 02 的令牌（关系名 11px 600、基数 10px 弱字、标签底色 = 面板色），
 * 并保证随主题变。
 */
import type { ReactElement } from 'react';
import type { EdgeProps } from '@xyflow/react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  getStraightPath,
} from '@xyflow/react';
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
  const edge = (data ?? {}) as unknown as PdcEdgeData;
  // 问题域两种边走直线；解域实体关系走正交折线（带标签，需要 labelX/labelY）。
  const [path, labelX, labelY] =
    edge.kind === 'relation'
      ? getSmoothStepPath({
          sourceX,
          sourceY,
          sourcePosition,
          targetX,
          targetY,
          targetPosition,
          borderRadius: 6,
          offset: 20,
        })
      : getStraightPath({ sourceX, sourceY, targetX, targetY });
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
 * markerWidth 7（默认 markerUnits=strokeWidth）：2px 线 → 14px 箭头，3px 选中线 → 21px，比例跟得住。
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
