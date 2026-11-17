/**
 * 自定义节点（IMP7 / IMP10）：长相按 02 §3 组件 3 / 03 §1 屏 2 ——
 * 问题卡：状态点（5 态色）+ 编号 + 标题 + 关联胶囊（≤3 + `+N`）+ 检查角标；
 * 实体卡：标题 + 支撑徽标 / C6 角标 + 主键 + 字段 + 挂着的约束/行为贴条。
 * 没有 1px 边框：底色 + 阴影表达，选中是 1.5px 主色环（box-shadow），与 02 的线条预算一致。
 * FIX6：选中属性只在选中时出现（`data-selected={node.selected || undefined}`）——写成
 * `data-selected={false}` 会在 DOM 里留下 `data-selected="false"`，属性选择器照样命中，
 * 结果每张卡都挂环、点谁都看不出选中。
 *
 * 端口（IMP10）：每张卡四边各一个可见连接点（上/右/下/左），一共 4 个 `<Handle>`，
 * 带 `data-port` 便于测试与 CSS 定锚。四种端口都能当起点、也能当落点——
 * 画布开 `ConnectionMode.Loose`，句柄一律 `type="source"`，库就不再拦「source 连 source」。
 * 端口 id 与 flow/ports.ts 的 PortId 同值（'top' | 'right' | 'bottom' | 'left'）。
 * 语义不在这里判：松手后按「起点侧 → 终点侧」走 flow/ports.ts 的 inferConnection。
 */
import type { ReactElement } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import type { EntityNodeData, EntityTagData, QuestionNodeData, SupportCode } from './toFlow.ts';
import { PORT_IDS } from './ports.ts';
import type { PortId } from '../../domain/types.ts';
import { select } from '../../store/commands.ts';
import { gotoQuestion } from '../../store/commands.ts';

/** 端口 → React Flow 的方位枚举（值同字符串，与 PortId 一一对应）。 */
const POSITION_OF: Record<PortId, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

/**
 * 四边端口：同一份 4 个句柄给问题卡和实体卡用。
 * 不设 `isConnectable={false}`：端口要能拖出、也要能接住（落点由库的 ConnectionMode.Loose 放行）。
 */
function NodePorts(): ReactElement {
  return (
    <>
      {PORT_IDS.map((port) => (
        <Handle
          key={port}
          id={port}
          type="source"
          position={POSITION_OF[port]}
          data-port={port}
          className="pdc-port"
          isConnectable
        />
      ))}
    </>
  );
}

/** 问题卡：结构是 `.node-card` + `.node-head` + `.node-links`，皮肤在 canvas.css。 */
export function QuestionNode({ data, dragging }: NodeProps): ReactElement {
  const node = data as unknown as QuestionNodeData;
  return (
    <div
      className="node-card pdc-card"
      data-selected={node.selected || undefined}
      data-dragging={dragging || undefined}
      data-core={node.core || undefined}
      title={node.title}
    >
      <NodePorts />
      <span className="node-head">
        <span className={node.statusClass} aria-hidden="true" />
        <span className="node-code">{node.code}</span>
        <span className="node-title">{node.title}</span>
        {node.checks.length > 0 && (
          <span className="check-mark" title={node.checks.join(' / ')}>
            {node.checks[0]}
          </span>
        )}
      </span>
      {node.links.length > 0 && (
        <span className="node-links">
          {node.links.map((link) => (
            <button
              key={link.id}
              type="button"
              className="node-link nodrag"
              title={`关联元素：${link.title}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                select(link.id);
              }}
            >
              {link.title}
            </button>
          ))}
          {node.linkMore > 0 && <span className="node-link-more">+{node.linkMore}</span>}
        </span>
      )}
    </div>
  );
}

/** 实体卡：四边端口同问题卡，拖出来落在另一端实体上就是 entityRelation（onConnect）。 */
export function EntityNode({ data }: NodeProps): ReactElement {
  const node = data as unknown as EntityNodeData;
  return (
    <div
      className="node-card entity-card pdc-card"
      data-selected={node.selected || undefined}
      data-connect-source={node.connectSource || undefined}
      data-unsupported={node.unsupported || undefined}
    >
      <NodePorts />
      <div className="entity-head">
        <span className="node-title">{node.title}</span>
        {node.supportCodes.length > 0 ? (
          node.supportCodes.map((entry: SupportCode) => (
            <button
              key={entry.questionId}
              type="button"
              className="support-badge nodrag"
              title={`跳到问题 ${entry.code}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                gotoQuestion(entry.questionId);
              }}
            >
              {entry.code}
            </button>
          ))
        ) : (
          <span className="check-mark" title="C6：这个实体不支撑任何问题">
            C6
          </span>
        )}
      </div>
      <div className="entity-identity">{node.identity}</div>
      {node.fields.length > 0 && (
        <ul className="entity-fields">
          {node.fields.map((field, index) => (
            <li key={`${field.name}:${index}`}>
              <span className="field-name">{field.name || '未命名字段'}</span>
              {field.type && <span className="field-type">{field.type}</span>}
              {field.required && <span className="field-req">必填</span>}
            </li>
          ))}
        </ul>
      )}
      {node.tags.length > 0 && (
        <div className="entity-tags">
          {node.tags.map((tag: EntityTagData) => (
            <button
              key={tag.id}
              type="button"
              className={`tag tag-${tag.kind} nodrag`}
              data-unsupported={tag.unsupported || undefined}
              title={`${tag.kind === 'behavior' ? '行为' : '约束'}：${tag.title}${
                tag.supportCode ? ` · 支撑 ${tag.supportCode}` : ' · 未支撑（C6）'
              }`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                select(tag.id);
              }}
            >
              {tag.title}
              {tag.supportCode && <span className="tag-support">{tag.supportCode}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** nodeTypes 必须是模块级常量：每次渲染新建对象会让 React Flow 重挂全部节点。 */
export const nodeTypes = { question: QuestionNode, entity: EntityNode };
