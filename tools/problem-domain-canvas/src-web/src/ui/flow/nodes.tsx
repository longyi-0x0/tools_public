/**
 * 自定义节点（IMP7）：长相按 02 §3 组件 3 / 03 §1 屏 2 ——
 * 问题卡：状态点（5 态色）+ 编号 + 标题 + 关联胶囊（≤3 + `+N`）+ 检查角标；
 * 实体卡：标题 + 支撑徽标 / C6 角标 + 主键 + 字段 + 挂着的约束/行为贴条。
 * 没有 1px 边框：底色 + 阴影表达，选中是 1.5px 主色环（box-shadow），与 02 的线条预算一致。
 * FIX6：选中属性只在选中时出现（`data-selected={node.selected || undefined}`）——写成
 * `data-selected={false}` 会在 DOM 里留下 `data-selected="false"`，属性选择器照样命中，
 * 结果每张卡都挂环、点谁都看不出选中。
 *
 * 句柄（IMPFIX3）：React Flow 的边必须锚在节点里的 <Handle> 上，自定义节点不写 Handle 就没有锚点，
 * 边静默不画（不报错）。问题卡的两个句柄只当锚点用（不可连，连线走左树），样式在 flow.css 的
 * `.pdc-handle-ghost` 里做成透明；实体卡保留左右两个可拖的圆点。
 */
import type { ReactElement } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import type { EntityNodeData, EntityTagData, QuestionNodeData, SupportCode } from './toFlow.ts';
import { select } from '../../store/commands.ts';
import { gotoQuestion } from '../../store/commands.ts';

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
      <Handle type="target" position={Position.Top} isConnectable={false} className="pdc-handle-ghost" />
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
      <Handle type="source" position={Position.Bottom} isConnectable={false} className="pdc-handle-ghost" />
    </div>
  );
}

/** 实体卡：右侧/左侧各一个圆点，拖出来就是 entityRelation（onConnect 落在画布上）。 */
export function EntityNode({ data }: NodeProps): ReactElement {
  const node = data as unknown as EntityNodeData;
  return (
    <div
      className="node-card entity-card pdc-card"
      data-selected={node.selected || undefined}
      data-connect-source={node.connectSource || undefined}
      data-unsupported={node.unsupported || undefined}
    >
      <Handle type="target" position={Position.Left} />
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
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

/** nodeTypes 必须是模块级常量：每次渲染新建对象会让 React Flow 重挂全部节点。 */
export const nodeTypes = { question: QuestionNode, entity: EntityNode };
