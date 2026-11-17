import { useEffect } from 'react';
import type { AnyNode, Edge, NodeId, QuestionStatus } from '../domain/types.ts';
import { QUESTION_STATUSES, edgeKey } from '../domain/schema.ts';
import {
  applyStatus,
  beginDraft,
  beginEntityDraft,
  beginRename,
  cancelConnect,
  cancelDepends,
  cancelDraft,
  cancelEntityDraft,
  cancelRelationRename,
  closeRowMenu,
  commitRelationRename,
  commitRename,
  deleteQuestion,
  deleteRelation,
  endRename,
  openEdgeMenu,
  openRowMenu,
  pickConnectEntity,
  pickDependsTarget,
  select,
  selectEdge,
  shortcutNewQuestion,
  startConnect,
  submitDraft,
  submitEntityDraft,
} from '../store/commands.ts';
import { useDoc, useUi } from './useStores.ts';
import { InlineInput } from './InlineInput.tsx';
import { ENTITY_ROW_MENU, QUESTION_ROW_MENU, RELATION_ROW_MENU } from './treeMenus.ts';

/** 02 §2.2：状态 5 态只取既有令牌，不新造色。 */
const STATUS_CLASS: Record<QuestionStatus, string> = {
  未澄清: 'dot s-unclear',
  分析中: 'dot s-analyzing',
  已澄清: 'dot s-clarified',
  已回答: 'dot s-answered',
  暂缓: 'dot s-deferred',
};

function statusOf(node: AnyNode): QuestionStatus {
  return node.type === 'question' ? node.data.status ?? '未澄清' : '未澄清';
}

function QuestionRow({ id, depth }: { id: NodeId; depth: number }) {
  const doc = useDoc();
  const ui = useUi();
  const node = doc.index.byId.get(id);
  if (!node || node.type !== 'question') return null;

  const code = doc.index.codes.get(id) ?? '';
  const kids = doc.index.childrenOf.get(id) ?? [];
  const selected = ui.selectedId === id;
  const status = statusOf(node);
  const draftHere = ui.draft !== null && ui.draft.parentId === id;
  // 依赖关系不进树；有进出边时行尾只留一个极小的 ↗ 角标，告诉人「这条关系存在」（IMP9）。
  const depCount = doc.ws.edges.filter(
    (edge) => edge.type === 'dependsOn' && (edge.source === id || edge.target === id),
  ).length;

  return (
    <li className="row-wrap">
      <div
        className="row"
        data-selected={selected}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => (ui.dependsSourceId ? pickDependsTarget(id) : select(id))}
      >
        <span className="code">{code}</span>
        {ui.renamingId === id ? (
          <InlineInput
            initial={node.title}
            onCommit={(text) => {
              commitRename(id, text);
            }}
            onCancel={() => endRename()}
          />
        ) : (
          <span className="title">{node.title || '未命名'}</span>
        )}
        <span className={STATUS_CLASS[status]} aria-hidden="true" />
        <span className="status">{status}</span>
        {depCount > 0 && (
          <span className="dep-mark" title={`有 ${depCount} 条依赖`} aria-label={`有 ${depCount} 条依赖`}>
            ↗
          </span>
        )}
        <span className="row-actions">
          <button
            type="button"
            className="ract"
            title="新建子问题"
            onClick={(event) => {
              event.stopPropagation();
              beginDraft(id);
            }}
          >
            ＋
          </button>
          <button
            type="button"
            className="ract"
            title="更多"
            onClick={(event) => {
              event.stopPropagation();
              openRowMenu(id);
            }}
          >
            ⋯
          </button>
        </span>
      </div>

      {ui.menuFor === id && (
        <div className="rowmenu" role="menu">
          {/* 菜单项与动作在 ui/treeMenus.ts（IMP9：「建立依赖…」排在「新建子问题」之后） */}
          {QUESTION_ROW_MENU.map((item) => (
            <button key={item.key} type="button" onClick={() => item.run(id)}>
              {item.label}
            </button>
          ))}
          <div className="menu-label">标记状态</div>
          {QUESTION_STATUSES.map((status) => (
            <button key={status} type="button" onClick={() => applyStatus(id, status)}>
              {status}
            </button>
          ))}
        </div>
      )}

      {draftHere && <DraftRow parentId={id} depth={depth + 1} />}

      {kids.length > 0 && (
        <ul className="tree-kids">
          {kids.map((kid) => (
            <QuestionRow key={kid} id={kid} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** 未命名草稿行：只活在 UI，标题为空时不写文档（04 §5 的 draft）。 */
function DraftRow({ parentId, depth }: { parentId: NodeId | null; depth: number }) {
  return (
    <li className="row-wrap">
      <div className="row" style={{ paddingLeft: 8 + depth * 14 }}>
        <span className="code">{parentId ? '··' : ''}</span>
        <InlineInput
          initial=""
          onCommit={(text) => submitDraft(text)}
          onCancel={() => cancelDraft()}
        />
      </div>
    </li>
  );
}

/* ---------- 解域左树：实体 · 关系两段扁平列表（03 §2.2 / §3.1） ---------- */

/** 支撑徽标：`P1.1`；没有支撑时行尾给一个红点（C6）。 */
function SupportMark({ codes }: { codes: readonly string[] }) {
  if (codes.length === 0) {
    return <span className="dot s-error support-none" title="不支撑任何问题（C6）" aria-label="未支撑" />;
  }
  return (
    <span className="support-badge" title={`支撑 ${codes.join(' / ')}`}>
      {codes[0]}
    </span>
  );
}

function EntityRow({ id }: { id: NodeId }) {
  const doc = useDoc();
  const ui = useUi();
  const node = doc.index.byId.get(id);
  if (!node || node.type !== 'entity') return null;

  const codeList = (doc.index.supportsByNode.get(id) ?? [])
    .filter((questionId) => doc.index.byId.get(questionId)?.type === 'question')
    .map((questionId) => doc.index.codes.get(questionId) ?? '')
    .filter((code) => code.length > 0);

  return (
    <li className="row-wrap">
      <div
        className="row"
        data-selected={ui.selectedId === id}
        onClick={() => (ui.connect ? pickConnectEntity(id) : select(id))}
      >
        <span className="dot s-clarified" aria-hidden="true" />
        {ui.renamingId === id ? (
          <InlineInput
            initial={node.title}
            placeholder="实体名…"
            onCommit={(text) => {
              commitRename(id, text);
            }}
            onCancel={() => endRename()}
          />
        ) : (
          <span className="title">{node.title || '未命名'}</span>
        )}
        <SupportMark codes={codeList} />
        <span className="row-actions">
          {/* 03 §83：实体行 hover 给「＋」——新建同级实体（先出未命名草稿行，回车才落库） */}
          <button
            type="button"
            className="ract"
            title="新建同级实体"
            onClick={(event) => {
              event.stopPropagation();
              beginEntityDraft();
            }}
          >
            ＋
          </button>
          <button
            type="button"
            className="ract"
            title="更多"
            onClick={(event) => {
              event.stopPropagation();
              openRowMenu(id);
            }}
          >
            ⋯
          </button>
        </span>
      </div>

      {ui.menuFor === id && (
        <div className="rowmenu" role="menu">
          {/* 03 §83 行菜单：新建关系（进连线模式）/ 重命名 / 删除；菜单项与动作在 ui/treeMenus.ts */}
          {ENTITY_ROW_MENU.map((item) => (
            <button key={item.key} type="button" onClick={() => item.run(id)}>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

function RelationRow({ edge }: { edge: Edge }) {
  const doc = useDoc();
  const ui = useUi();
  const key = edgeKey(edge);
  const from = doc.index.byId.get(edge.source);
  const to = doc.index.byId.get(edge.target);
  if (!from || !to) return null;
  const label = edge.label ?? '关系';
  const cardinality = edge.cardinality ?? '1:N';

  return (
    <li className="row-wrap">
      <div
        className="row row-relation"
        data-selected={ui.selectedEdgeKey === key}
        onClick={() => selectEdge(key)}
        title={`${from.title || '未命名'} ${label} ${to.title || '未命名'} ${cardinality}`}
      >
        {ui.renamingEdgeKey === key ? (
          <InlineInput
            initial={label}
            placeholder="关系名…"
            onCommit={(text) => {
              commitRelationRename(key, text);
            }}
            onCancel={() => cancelRelationRename()}
          />
        ) : (
          <span className="title">
            {from.title || '未命名'} —{label}→ {to.title || '未命名'}
          </span>
        )}
        <span className="status">{cardinality}</span>
        <span className="row-actions">
          <button
            type="button"
            className="ract"
            title="删除关系"
            onClick={(event) => {
              event.stopPropagation();
              deleteRelation(key);
            }}
          >
            ✕
          </button>
          <button
            type="button"
            className="ract"
            title="更多"
            onClick={(event) => {
              event.stopPropagation();
              openEdgeMenu(key);
            }}
          >
            ⋯
          </button>
        </span>
      </div>

      {ui.menuForEdge === key && (
        <div className="rowmenu" role="menu">
          {/* 03 §83：关系行「重命名 / 删除」 */}
          {RELATION_ROW_MENU.map((item) => (
            <button key={item.key} type="button" onClick={() => item.run(key)}>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

function SolveTree() {
  const doc = useDoc();
  const ui = useUi();
  const entities = doc.ws.nodes.filter((node) => node.type === 'entity');
  const relations = doc.ws.edges.filter(
    (edge) =>
      edge.type === 'entityRelation' &&
      doc.index.byId.has(edge.source) &&
      doc.index.byId.has(edge.target),
  );

  return (
    <div className="tree tree-solve">
      <div className="tree-sec-head">
        <span className="tree-sec-title">实体</span>
        <span className="tree-sec-count">{entities.length}</span>
        <button
          type="button"
          className="tree-add"
          title="新建实体（N）"
          onClick={() => beginEntityDraft()}
        >
          ＋
        </button>
      </div>

      {entities.length === 0 && !ui.solveDraft && (
        <p className="tree-empty">
          解域是空的。从问题树挑一个已回答的问题，先建它的第一个实体。
        </p>
      )}

      <ul className="tree-list">
        {ui.solveDraft && (
          <li className="row-wrap">
            <div className="row">
              <span className="code">＋</span>
              <InlineInput
                initial=""
                placeholder="实体名…"
                onCommit={(text) => submitEntityDraft(text)}
                onCancel={() => cancelEntityDraft()}
              />
            </div>
          </li>
        )}
        {entities.map((entity) => (
          <EntityRow key={entity.id} id={entity.id} />
        ))}
      </ul>

      <div className="tree-sec-head">
        <span className="tree-sec-title">关系</span>
        <span className="tree-sec-count">{relations.length}</span>
        <button
          type="button"
          className="tree-add"
          title="新建关系：先点起点实体，再点终点实体"
          onClick={() => startConnect()}
        >
          ＋
        </button>
      </div>

      {relations.length === 0 ? (
        <p className="tree-empty">还没有关系。点 ＋ 后先点起点实体，再点终点实体。</p>
      ) : (
        <ul className="tree-list">
          {relations.map((edge) => (
            <RelationRow key={edgeKey(edge)} edge={edge} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function Tree() {
  const doc = useDoc();
  const ui = useUi();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const typing =
        target !== null &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (typing) return;
      if (event.key === 'n' || event.key === 'N') {
        event.preventDefault();
        shortcutNewQuestion(event.shiftKey);
      } else if (event.key === 'Escape') {
        cancelDraft();
        cancelEntityDraft();
        cancelConnect();
        cancelDepends();
        closeRowMenu();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (ui.domain === 'solve') return <SolveTree />;

  const questions = doc.ws.nodes.filter((node) => node.type === 'question');
  const coreQuestionId = doc.ws.coreQuestionId;
  const core = coreQuestionId ? doc.index.byId.get(coreQuestionId) : undefined;
  const unattached = questions.filter((node) => {
    if (coreQuestionId && node.id === coreQuestionId) return false;
    const parents = doc.index.parentsOf.get(node.id) ?? [];
    return parents.length === 0;
  });

  return (
    <div className="tree">
      <div className="tree-sec-head">
        <span className="tree-sec-title">问题</span>
        <span className="tree-sec-count">{questions.length}</span>
        <button
          type="button"
          className="tree-add"
          title="新建问题（N）"
          onClick={() => beginDraft(null)}
        >
          ＋
        </button>
      </div>

      {questions.length === 0 && ui.draft === null && (
        <p className="tree-empty">还没有核心问题。先写一句「要解决什么」。</p>
      )}

      <ul className="tree-list">
        {ui.draft !== null && ui.draft.parentId === null && (
          <DraftRow parentId={null} depth={0} />
        )}
        {core && <QuestionRow id={core.id} depth={0} />}
        {unattached.length > 0 && (
          <li className="tree-group">
            <div className="tree-group-head">未挂到核心问题</div>
            <ul className="tree-kids">
              {unattached.map((node) => (
                <QuestionRow key={node.id} id={node.id} depth={0} />
              ))}
            </ul>
          </li>
        )}
      </ul>
    </div>
  );
}
