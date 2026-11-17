import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type {
  AnyNode,
  AnyNodeOf,
  Cardinality,
  DocIndex,
  Edge,
  EdgeKey,
  NodeId,
} from '../domain/types.ts';
import { CARDINALITIES, NODE_LABEL, QUESTION_STATUSES, edgeKey, isSolveNodeType } from '../domain/schema.ts';
import {
  ELEMENT_EDGE,
  ELEMENT_FIELDS,
  PROBLEM_ELEMENT_TYPES,
  isProblemElementType,
  type ProblemElementType,
} from '../domain/elementFields.ts';
import type { Finding } from '../domain/checks/index.ts';
import {
  addEntityFieldRow,
  applyStatus,
  clearWorkspaceNow,
  commitRename,
  createBehavior,
  createConstraint,
  createElementLink,
  deleteElement,
  deleteRelation,
  deleteSolveNode,
  gotoQuestion,
  removeEntityFieldRow,
  renameWorkspaceTo,
  select,
  setBehaviorList,
  setBehaviorText,
  setConstraintKind,
  setConstraintText,
  setDetailOpen,
  setElementList,
  setElementText,
  setEntityFieldValue,
  setEntityIdentity,
  setQuestionList,
  setQuestionText,
  setRelationCardinality,
  setRelationLabel,
  setWorkspaceGoal,
  toggleSupport,
} from '../store/commands.ts';
import { useDoc, useUi } from './useStores.ts';
import { statusClassOf, statusOf } from './nodeStyle.ts';
import { InlineInput } from './InlineInput.tsx';

const TEXT_FIELDS = [
  ['statement', '陈述'],
  ['goal', '目标'],
  ['boundary', '边界'],
  ['answerForm', '答案形式'],
] as const;

const LIST_FIELDS = [
  ['knowns', '已知'],
  ['assumptions', '假设'],
  ['positiveCases', '正例'],
  ['negativeCases', '反例'],
  ['criteria', '判定标准'],
] as const;

function questionParents(index: DocIndex, id: NodeId): readonly NodeId[] {
  return index.parentsOf.get(id) ?? [];
}

/** 详情栏（03 §2.4.4）：两域共用一块；按选中对象的类型换内容。 */
export function DetailPanel() {
  const doc = useDoc();
  const ui = useUi();
  const checksRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (ui.detailSection === 'checks') checksRef.current?.scrollIntoView({ block: 'nearest' });
  }, [ui.detailSection, ui.selectedId]);

  if (!ui.detailOpen) return null;
  const node = ui.selectedId ? doc.index.byId.get(ui.selectedId) : undefined;
  const compatible = node
    ? ui.domain === 'solve'
      ? isSolveNodeType(node.type)
      : !isSolveNodeType(node.type)
    : false;
  const edge = ui.selectedEdgeKey ? doc.index.edgeByKey.get(ui.selectedEdgeKey) : undefined;
  const selectedEdgeKey = ui.selectedEdgeKey;

  return (
    <aside className="detail" data-open={ui.detailOpen} aria-label="详情">
      <div className="detail-hd">
        <span>详情</span>
        <button
          type="button"
          className="handle hd"
          title="收起详情（]）"
          onClick={() => setDetailOpen(false)}
        >
          ›
        </button>
      </div>
      <div className="detail-body">
        {node && compatible ? (
          <NodeDetail node={node} checksRef={checksRef} />
        ) : edge && selectedEdgeKey ? (
          <RelationDetail edge={edge} edgeKey={selectedEdgeKey} />
        ) : (
          <Overview />
        )}
      </div>
    </aside>
  );
}

/* ---------- 未选中：工作区概览（含「清空工作区」入口，二次确认） ---------- */

function Overview() {
  const doc = useDoc();
  const [confirming, setConfirming] = useState(false);
  const questions = doc.ws.nodes.filter((node) => node.type === 'question');
  const core = doc.ws.coreQuestionId ? doc.index.byId.get(doc.ws.coreQuestionId) : undefined;
  const coreBoundary = core && core.type === 'question' ? core.data.boundary : '';
  const unattached = questions.filter((node) => {
    if (node.id === doc.ws.coreQuestionId) return false;
    return questionParents(doc.index, node.id).length === 0;
  });
  const total = doc.checks.counts.error + doc.checks.counts.warning;

  return (
    <>
      <div className="dgroup">
        <div className="dgroup-title">工作区概览</div>
        <label className="prop-row">
          <span className="prop-label">名称</span>
          <input
            key="ws:name"
            defaultValue={doc.ws.name}
            placeholder="工作区名"
            onBlur={(event) => renameWorkspaceTo(event.target.value)}
          />
        </label>
        <label className="prop-row">
          <span className="prop-label">目标</span>
          <input
            key="ws:goal"
            defaultValue={doc.ws.goal}
            placeholder="（未填）"
            onBlur={(event) => setWorkspaceGoal(event.target.value)}
          />
        </label>
        <div className="prop-row">
          <span className="prop-label">范围内</span>
          <span className="prop-value">{coreBoundary || '全部问题'}</span>
        </div>
        <div className="prop-row">
          <span className="prop-label">范围外</span>
          <span className="prop-value">
            {unattached.length > 0 ? `${unattached.length} 个问题未挂到核心问题` : '无'}
          </span>
        </div>
        {confirming ? (
          <div className="confirm-row">
            <span className="detail-note">清空后节点与边全部删除（可撤销）。</span>
            <div className="confirm-actions">
              <button
                type="button"
                className="danger-btn"
                onClick={() => {
                  clearWorkspaceNow();
                  setConfirming(false);
                }}
              >
                确定清空
              </button>
              <button type="button" className="ghost-btn" onClick={() => setConfirming(false)}>
                取消
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="ghost-btn" onClick={() => setConfirming(true)}>
            清空工作区
          </button>
        )}
      </div>

      <div className="dgroup">
        <div className="dgroup-title">检查摘要</div>
        <p className="detail-note">
          检查 {total} 条 · {doc.checks.counts.error} 错误 {doc.checks.counts.warning} 提示
        </p>
        {doc.checks.findings.length === 0 ? (
          <p className="detail-note">6 项检查全部通过</p>
        ) : (
          doc.checks.findings.map((finding, position) => (
            <div
              key={`${finding.code}-${finding.nodeIds.join(',')}-${position}`}
              className="check-item"
              onClick={() => select(finding.nodeIds[0] ?? null)}
            >
              <span
                className={`dot ${finding.severity === 'error' ? 's-error' : 's-warning'}`}
                aria-hidden="true"
              />
              <span className="check-code">{finding.code}</span>
              <span className="check-text">{finding.message}</span>
            </div>
          ))
        )}
      </div>
    </>
  );
}

/* ---------- 选中：按类型分派 ---------- */

function NodeDetail({
  node,
  checksRef,
}: {
  node: AnyNode;
  checksRef: RefObject<HTMLDivElement | null>;
}) {
  const doc = useDoc();
  const findings = doc.checks.findings.filter((finding) => finding.nodeIds.includes(node.id));

  if (node.type === 'entity') {
    return <EntityDetail node={node} findings={findings} checksRef={checksRef} />;
  }
  if (node.type === 'behavior' || node.type === 'constraint') {
    return <SolveUnitDetail node={node} findings={findings} checksRef={checksRef} />;
  }
  if (isProblemElementType(node.type)) {
    return <ElementDetail node={node} findings={findings} checksRef={checksRef} />;
  }
  return <QuestionDetail node={node} findings={findings} checksRef={checksRef} />;
}

function FindingsBlock({
  findings,
  checksRef,
  emptyText,
}: {
  findings: readonly Finding[];
  checksRef: RefObject<HTMLDivElement | null>;
  emptyText: string;
}) {
  const ui = useUi();
  return (
    <div
      className="dgroup"
      data-focus={ui.detailSection === 'checks'}
      ref={checksRef}
      id="detail-checks"
    >
      <div className="dgroup-title">检查</div>
      {findings.length === 0 ? (
        <p className="detail-note">{emptyText}</p>
      ) : (
        findings.map((finding, position) => (
          <div
            key={`${finding.code}-${position}`}
            className="check-item"
            onClick={() => select(finding.nodeIds[0] ?? null)}
          >
            <span
              className={`dot ${finding.severity === 'error' ? 's-error' : 's-warning'}`}
              aria-hidden="true"
            />
            <span className="check-code">{finding.code}</span>
            <span className="check-text">{finding.message}</span>
          </div>
        ))
      )}
    </div>
  );
}

/* ---------- 问题详情（问题域） ---------- */

function QuestionDetail({
  node,
  findings,
  checksRef,
}: {
  node: AnyNode;
  findings: readonly Finding[];
  checksRef: RefObject<HTMLDivElement | null>;
}) {
  const doc = useDoc();
  if (node.type !== 'question') return null;
  const parents = questionParents(doc.index, node.id);
  const parent = parents[0] ? doc.index.byId.get(parents[0]) : undefined;

  return (
    <>
      <div className="dgroup">
        <div className="dgroup-title">属性 · 问题</div>
        <div className="prop-row">
          <span className="prop-label">编号</span>
          <span className="prop-value">{doc.index.codes.get(node.id) || '（未编号）'}</span>
        </div>
        <div className="prop-row">
          <span className="prop-label">上级</span>
          <span className="prop-value">
            {parent ? `${doc.index.codes.get(parent.id) ?? ''} ${parent.title}` : '（无）'}
          </span>
        </div>
        {TEXT_FIELDS.map(([field, label]) => (
          <label className="prop-row" key={field}>
            <span className="prop-label">{label}</span>
            <input
              key={`${node.id}:${field}`}
              defaultValue={node.data[field] ?? ''}
              placeholder="（未填）"
              onBlur={(event) => setQuestionText(node.id, field, event.target.value)}
            />
          </label>
        ))}
        {LIST_FIELDS.map(([field, label]) => (
          <label className="prop-row prop-row-list" key={field}>
            <span className="prop-label">{label}</span>
            <textarea
              key={`${node.id}:${field}`}
              rows={2}
              defaultValue={(node.data[field] ?? []).join('\n')}
              placeholder="一行一条"
              onBlur={(event) => setQuestionList(node.id, field, event.target.value)}
            />
          </label>
        ))}
      </div>

      <RelationSection questionId={node.id} />

      <FindingsBlock findings={findings} checksRef={checksRef} emptyText="这个问题没有命中检查" />

      <div className="dgroup">
        <div className="dgroup-title">状态</div>
        <div className="status-picks">
          {QUESTION_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              className="status-pick"
              data-on={statusOf(node) === status}
              onClick={() => applyStatus(node.id, status)}
            >
              {status}
            </button>
          ))}
        </div>
        <div className="prop-row">
          <span className="prop-label">当前</span>
          <span className="prop-value">
            <span className={statusClassOf(node)} aria-hidden="true" /> {statusOf(node)}
          </span>
        </div>
      </div>
    </>
  );
}

/* ---------- 问题域：关联五类元素（01 §4.3 的五条边，方向恒为 question → 元素） ---------- */

function RelationSection({ questionId }: { questionId: NodeId }) {
  const doc = useDoc();
  const [adding, setAdding] = useState<ProblemElementType | null>(null);
  const rows = PROBLEM_ELEMENT_TYPES.map((type) => {
    const ids = (doc.index.edgesByNode.get(questionId) ?? [])
      .map((key) => doc.index.edgeByKey.get(key))
      .filter(
        (edge): edge is Edge =>
          edge !== undefined && edge.type === ELEMENT_EDGE[type] && edge.source === questionId,
      )
      .map((edge) => edge.target)
      .filter((id) => doc.index.byId.has(id));
    return { type, ids };
  });
  const empty = rows.every((row) => row.ids.length === 0);

  return (
    <div className="dgroup">
      <div className="dgroup-title">关联</div>
      {empty && <p className="detail-note">没有关联任何元素</p>}
      {rows.map(({ type, ids }) => (
        <div className="link-row" data-kind={type} key={type}>
          <span className="link-label">{NODE_LABEL[type]}</span>
          <span className="link-pills">
            {ids.map((id) => (
              <button
                key={id}
                type="button"
                className="link-pill"
                title={`展开${NODE_LABEL[type]}：${doc.index.byId.get(id)?.title || '未命名'}`}
                onClick={() => select(id)}
              >
                {doc.index.byId.get(id)?.title || '未命名'}
              </button>
            ))}
            {adding === type ? (
              <InlineInput
                initial=""
                placeholder={`${NODE_LABEL[type]}名…`}
                onCommit={(text) => {
                  setAdding(null);
                  createElementLink(questionId, type, text);
                }}
                onCancel={() => setAdding(null)}
              />
            ) : (
              <button
                type="button"
                className="link-add"
                title={`新建${NODE_LABEL[type]}`}
                onClick={() => setAdding(type)}
              >
                ＋
              </button>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ---------- 问题域：元素自身（名称 / 01 §4.2 字段 / 归属问题 / 删除） ---------- */

function ElementDetail({
  node,
  findings,
  checksRef,
}: {
  node: AnyNode;
  findings: readonly Finding[];
  checksRef: RefObject<HTMLDivElement | null>;
}) {
  const doc = useDoc();
  if (!isProblemElementType(node.type)) return null;
  const type = node.type;
  const label = NODE_LABEL[type];
  const data = node.data as Record<string, unknown>;
  const stringOf = (field: string): string =>
    typeof data[field] === 'string' ? (data[field] as string) : '';
  const listOf = (field: string): string[] =>
    Array.isArray(data[field]) ? (data[field] as string[]) : [];
  const owners = (doc.index.edgesByNode.get(node.id) ?? [])
    .map((key) => doc.index.edgeByKey.get(key))
    .filter(
      (edge): edge is Edge =>
        edge !== undefined && edge.type === ELEMENT_EDGE[type] && edge.target === node.id,
    )
    .map((edge) => edge.source)
    .filter((id) => doc.index.byId.get(id)?.type === 'question');

  return (
    <>
      <div className="dgroup">
        <div className="dgroup-title">属性 · {label}</div>
        <label className="prop-row">
          <span className="prop-label">名称</span>
          <input
            key={`${node.id}:title`}
            defaultValue={node.title}
            placeholder="（未命名）"
            onBlur={(event) => commitRename(node.id, event.target.value)}
          />
        </label>
        {ELEMENT_FIELDS[type].map((spec) =>
          spec.kind === 'list' ? (
            <label className="prop-row prop-row-list" key={spec.field}>
              <span className="prop-label">{spec.label}</span>
              <textarea
                key={`${node.id}:${spec.field}`}
                rows={2}
                defaultValue={listOf(spec.field).join('\n')}
                placeholder={spec.placeholder ?? '一行一条'}
                onBlur={(event) => setElementList(node.id, spec.field, event.target.value)}
              />
            </label>
          ) : (
            <label className="prop-row" key={spec.field}>
              <span className="prop-label">{spec.label}</span>
              <input
                key={`${node.id}:${spec.field}`}
                defaultValue={stringOf(spec.field)}
                placeholder={spec.placeholder ?? '（未填）'}
                onBlur={(event) => setElementText(node.id, spec.field, event.target.value)}
              />
            </label>
          ),
        )}
      </div>

      <div className="dgroup">
        <div className="dgroup-title">关联的问题</div>
        {owners.length === 0 && <p className="detail-note">还没有问题关联这个{label}。</p>}
        {owners.map((sourceId) => {
          const code = doc.index.codes.get(sourceId) ?? '';
          const title = doc.index.byId.get(sourceId)?.title || '未命名';
          return (
            <div className="support-row" key={sourceId}>
              <button type="button" className="support-jump" onClick={() => select(sourceId)}>
                {code} {title}
              </button>
            </div>
          );
        })}
      </div>

      <FindingsBlock findings={findings} checksRef={checksRef} emptyText={`这个${label}没有命中检查`} />

      <div className="dgroup">
        <button type="button" className="danger-btn" onClick={() => deleteElement(node.id)}>
          删除{label}
        </button>
        <p className="detail-note">
          {owners.length} 条关联边一并删除，{label}节点本身也删除。整步可撤销。
        </p>
      </div>
    </>
  );
}

/* ---------- 解域：支撑的问题（多选写 supportsQuestion） ---------- */

function SupportSection({ elementId }: { elementId: NodeId }) {
  const doc = useDoc();
  const questions = doc.ws.nodes.filter((node) => node.type === 'question');
  const supported = new Set(
    (doc.index.supportsByNode.get(elementId) ?? []).filter(
      (questionId) => doc.index.byId.get(questionId)?.type === 'question',
    ),
  );

  return (
    <div className="dgroup">
      <div className="dgroup-title">支撑的问题</div>
      {questions.length === 0 && <p className="detail-note">问题域里还没有问题。</p>}
      {questions.map((question) => {
        const code = doc.index.codes.get(question.id) ?? '（未编号）';
        const on = supported.has(question.id);
        return (
          <div className="support-row" key={question.id}>
            <input
              type="checkbox"
              checked={on}
              aria-label={`支撑 ${code} ${question.title}`}
              onChange={(event) => toggleSupport(elementId, question.id, event.target.checked)}
            />
            <button
              type="button"
              className="support-jump"
              title="跳回这个问题"
              onClick={() => gotoQuestion(question.id)}
            >
              {code} {question.title || '未命名'}
            </button>
          </div>
        );
      })}
      {supported.size === 0 && (
        <p className="detail-note">未支撑任何问题 → C6。勾选上面的问题即可挂上 supportsQuestion。</p>
      )}
    </div>
  );
}

/* ---------- 解域：实体 / 行为 / 约束详情 ---------- */

function UnitList({
  title,
  kind,
  entityId,
  ids,
}: {
  title: string;
  kind: 'behavior' | 'constraint';
  entityId: NodeId;
  ids: readonly NodeId[];
}) {
  const doc = useDoc();
  const ui = useUi();
  const [adding, setAdding] = useState(false);

  return (
    <div className="dgroup">
      <div className="dgroup-title">{title}</div>
      {ids.length === 0 && <p className="detail-note">还没有{title}。</p>}
      {ids.map((id) => {
        const unit = doc.index.byId.get(id);
        if (!unit) return null;
        return (
          <div className="unit-row" data-selected={ui.selectedId === id} key={id}>
            <button type="button" className="unit-name" onClick={() => select(id)}>
              {unit.title || '未命名'}
            </button>
            {unit.type === 'constraint' && (
              <span className="detail-note">{unit.data.expr || '（无表达式）'}</span>
            )}
            <button
              type="button"
              className="ract"
              title={`删除${title}`}
              onClick={() => deleteSolveNode(id)}
            >
              ✕
            </button>
          </div>
        );
      })}
      {adding ? (
        <div className="unit-add">
          <InlineInput
            initial=""
            placeholder={kind === 'behavior' ? '行为名…' : '约束名…'}
            onCommit={(text) => {
              setAdding(false);
              if (kind === 'behavior') createBehavior(entityId, text);
              else createConstraint(entityId, text);
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        <button type="button" className="ghost-btn" onClick={() => setAdding(true)}>
          ＋ 新建{title}
        </button>
      )}
    </div>
  );
}

function EntityDetail({
  node,
  findings,
  checksRef,
}: {
  node: AnyNodeOf<'entity'>;
  findings: readonly Finding[];
  checksRef: RefObject<HTMLDivElement | null>;
}) {
  const doc = useDoc();
  const behaviors = (doc.index.edgesByNode.get(node.id) ?? [])
    .map((key) => doc.index.edgeByKey.get(key))
    .filter((edge): edge is Edge => edge !== undefined && edge.type === 'behaviorOnEntity')
    .map((edge) => edge.source);
  const constraints = (doc.index.edgesByNode.get(node.id) ?? [])
    .map((key) => doc.index.edgeByKey.get(key))
    .filter((edge): edge is Edge => edge !== undefined && edge.type === 'constraintOnEntity')
    .map((edge) => edge.source);
  const fields = node.data.fields ?? [];

  return (
    <>
      <div className="dgroup">
        <div className="dgroup-title">属性 · 实体</div>
        <label className="prop-row">
          <span className="prop-label">名称</span>
          <input
            key={`${node.id}:title`}
            defaultValue={node.title}
            placeholder="（未命名）"
            onBlur={(event) => commitRename(node.id, event.target.value)}
          />
        </label>
        <label className="prop-row">
          <span className="prop-label">主键</span>
          <input
            key={`${node.id}:identity`}
            defaultValue={node.data.identity ?? ''}
            placeholder="（缺主键）"
            onBlur={(event) => setEntityIdentity(node.id, event.target.value)}
          />
        </label>
      </div>

      <div className="dgroup">
        <div className="dgroup-title">字段</div>
        {fields.length === 0 && <p className="detail-note">还没有字段。</p>}
        {fields.map((field, index) => (
          <div className="field-row" key={`${node.id}:${index}:${field.name}`}>
            <input
              className="field-name"
              defaultValue={field.name}
              placeholder="字段名"
              aria-label="字段名"
              onBlur={(event) => setEntityFieldValue(node.id, index, { name: event.target.value })}
            />
            <input
              className="field-type"
              defaultValue={field.type ?? ''}
              placeholder="类型"
              aria-label="字段类型"
              onBlur={(event) => setEntityFieldValue(node.id, index, { type: event.target.value })}
            />
            <label className="field-req">
              <input
                type="checkbox"
                defaultChecked={field.required === true}
                onChange={(event) =>
                  setEntityFieldValue(node.id, index, { required: event.target.checked })
                }
              />
              必填
            </label>
            <button
              type="button"
              className="ract"
              title="删除字段"
              onClick={() => removeEntityFieldRow(node.id, index)}
            >
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="ghost-btn" onClick={() => addEntityFieldRow(node.id)}>
          ＋ 字段
        </button>
      </div>

      <UnitList title="行为" kind="behavior" entityId={node.id} ids={behaviors} />
      <UnitList title="约束" kind="constraint" entityId={node.id} ids={constraints} />
      <SupportSection elementId={node.id} />
      <FindingsBlock findings={findings} checksRef={checksRef} emptyText="这个实体没有命中检查" />

      <div className="dgroup">
        <button type="button" className="danger-btn" onClick={() => deleteSolveNode(node.id)}>
          删除实体
        </button>
        <p className="detail-note">
          {behaviors.length} 个行为、{constraints.length} 条约束将一并删除；关系与挂载边一并删除。整步可撤销。
        </p>
      </div>
    </>
  );
}

function SolveUnitDetail({
  node,
  findings,
  checksRef,
}: {
  node: AnyNodeOf<'behavior'> | AnyNodeOf<'constraint'>;
  findings: readonly Finding[];
  checksRef: RefObject<HTMLDivElement | null>;
}) {
  const doc = useDoc();
  const ownerEdge = (doc.index.edgesByNode.get(node.id) ?? [])
    .map((key) => doc.index.edgeByKey.get(key))
    .find(
      (edge) =>
        edge !== undefined &&
        (edge.type === 'behaviorOnEntity' || edge.type === 'constraintOnEntity'),
    );
  const owner = ownerEdge ? doc.index.byId.get(ownerEdge.target) : undefined;

  return (
    <>
      <div className="dgroup">
        <div className="dgroup-title">属性 · {node.type === 'behavior' ? '行为' : '约束'}</div>
        <label className="prop-row">
          <span className="prop-label">名称</span>
          <input
            key={`${node.id}:title`}
            defaultValue={node.title}
            placeholder="（未命名）"
            onBlur={(event) => commitRename(node.id, event.target.value)}
          />
        </label>
        <div className="prop-row">
          <span className="prop-label">所属实体</span>
          <span className="prop-value">
            {owner ? (
              <button type="button" className="support-jump" onClick={() => select(owner.id)}>
                {owner.title || '未命名'}
              </button>
            ) : (
              '（无）'
            )}
          </span>
        </div>

        {node.type === 'behavior' ? (
          <>
            <label className="prop-row">
              <span className="prop-label">输出</span>
              <input
                key={`${node.id}:output`}
                defaultValue={node.data.output ?? ''}
                placeholder="（未填）"
                onBlur={(event) => setBehaviorText(node.id, 'output', event.target.value)}
              />
            </label>
            <label className="prop-row prop-row-list">
              <span className="prop-label">输入</span>
              <textarea
                key={`${node.id}:inputs`}
                rows={2}
                defaultValue={(node.data.inputs ?? []).join('\n')}
                placeholder="一行一条"
                onBlur={(event) => setBehaviorList(node.id, 'inputs', event.target.value)}
              />
            </label>
            <label className="prop-row prop-row-list">
              <span className="prop-label">前置条件</span>
              <textarea
                key={`${node.id}:preconditions`}
                rows={2}
                defaultValue={(node.data.preconditions ?? []).join('\n')}
                placeholder="一行一条"
                onBlur={(event) => setBehaviorList(node.id, 'preconditions', event.target.value)}
              />
            </label>
            <label className="prop-row prop-row-list">
              <span className="prop-label">效果</span>
              <textarea
                key={`${node.id}:effects`}
                rows={2}
                defaultValue={(node.data.effects ?? []).join('\n')}
                placeholder="一行一条"
                onBlur={(event) => setBehaviorList(node.id, 'effects', event.target.value)}
              />
            </label>
          </>
        ) : (
          <>
            <label className="prop-row">
              <span className="prop-label">表达式</span>
              <input
                key={`${node.id}:expr`}
                defaultValue={node.data.expr ?? ''}
                placeholder="已选人数 < 容量"
                onBlur={(event) => setConstraintText(node.id, 'expr', event.target.value)}
              />
            </label>
            <label className="prop-row">
              <span className="prop-label">类型</span>
              <select
                value={node.data.kind ?? '必须'}
                onChange={(event) =>
                  setConstraintKind(node.id, event.target.value === '禁止' ? '禁止' : '必须')
                }
              >
                <option value="必须">必须</option>
                <option value="禁止">禁止</option>
              </select>
            </label>
            <label className="prop-row">
              <span className="prop-label">执行点</span>
              <input
                key={`${node.id}:enforcementPoint`}
                defaultValue={node.data.enforcementPoint ?? ''}
                placeholder="（未填）"
                onBlur={(event) =>
                  setConstraintText(node.id, 'enforcementPoint', event.target.value)
                }
              />
            </label>
          </>
        )}
      </div>

      <SupportSection elementId={node.id} />
      <FindingsBlock findings={findings} checksRef={checksRef} emptyText="这个元素没有命中检查" />

      <div className="dgroup">
        <button type="button" className="danger-btn" onClick={() => deleteSolveNode(node.id)}>
          删除{node.type === 'behavior' ? '行为' : '约束'}
        </button>
      </div>
    </>
  );
}

/* ---------- 解域：关系详情 ---------- */

function RelationDetail({ edge, edgeKey: key }: { edge: Edge; edgeKey: EdgeKey }) {
  const doc = useDoc();
  const from = doc.index.byId.get(edge.source);
  const to = doc.index.byId.get(edge.target);
  const label = edge.label ?? '关系';
  const cardinality = edge.cardinality ?? '1:N';

  return (
    <>
      <div className="dgroup">
        <div className="dgroup-title">属性 · 关系</div>
        <div className="prop-row">
          <span className="prop-label">起点</span>
          <span className="prop-value">{from?.title || '未命名'}</span>
        </div>
        <div className="prop-row">
          <span className="prop-label">终点</span>
          <span className="prop-value">{to?.title || '未命名'}</span>
        </div>
        <label className="prop-row">
          <span className="prop-label">关系名</span>
          <input
            key={`${key}:label`}
            defaultValue={label}
            placeholder="持有"
            onBlur={(event) => setRelationLabel(key, event.target.value)}
          />
        </label>
        <label className="prop-row">
          <span className="prop-label">基数</span>
          <select
            value={cardinality}
            onChange={(event) =>
              setRelationCardinality(key, event.target.value as Cardinality)
            }
          >
            {CARDINALITIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <div className="prop-row">
          <span className="prop-label">行内</span>
          <span className="prop-value">
            {from?.title || '未命名'} —{label}→ {to?.title || '未命名'} · {cardinality}
          </span>
        </div>
      </div>

      <div className="dgroup">
        <button type="button" className="danger-btn" onClick={() => deleteRelation(key)}>
          删除关系
        </button>
      </div>
    </>
  );
}

/** 供别的模块复用的边键（关系详情用）。 */
export const relationKeyOf = (edge: Edge): EdgeKey => edgeKey(edge);
