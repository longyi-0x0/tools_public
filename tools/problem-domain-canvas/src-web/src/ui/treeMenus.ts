/**
 * 解域左树的行菜单（03 §83 / UI-REVIEW M6）：实体行「新建关系 / 重命名 / 删除实体」、
 * 关系行「重命名 / 删除」。菜单项与动作分开放，Tree 只负责画，uiReview.test.ts 直接调 run() 验行为。
 */
import type { EdgeKey, NodeId } from '../domain/types.ts';
import {
  beginDraft,
  beginRelationRename,
  beginRename,
  deleteQuestion,
  deleteRelation,
  deleteSolveNode,
  startConnect,
  startDepends,
} from '../store/commands.ts';

export interface EntityMenuItem {
  key: string;
  label: string;
  run(entityId: NodeId): void;
}

/** 实体行 `⋯`：新建关系进连线模式（01 §7.3：先点起点实体，再点终点实体）。 */
export const ENTITY_ROW_MENU: readonly EntityMenuItem[] = [
  {
    key: 'relation',
    label: '新建关系',
    run: () => {
      startConnect();
    },
  },
  {
    key: 'rename',
    label: '重命名',
    run: (entityId) => {
      beginRename(entityId);
    },
  },
  {
    key: 'delete',
    label: '删除实体',
    run: (entityId) => {
      deleteSolveNode(entityId);
    },
  },
];

export interface QuestionMenuItem {
  key: string;
  label: string;
  run(questionId: NodeId): void;
}

/**
 * 问题行 `⋯`（IMP9）：「建立依赖…」摆在「新建子问题」之后、「重命名」之前。
 * 它是 `dependsOn` 唯一的界面入口（原来的画布右键菜单已砍掉）。
 */
export const QUESTION_ROW_MENU: readonly QuestionMenuItem[] = [
  {
    key: 'child',
    label: '新建子问题',
    run: (id) => {
      beginDraft(id);
    },
  },
  {
    key: 'depends',
    label: '建立依赖…',
    run: (id) => {
      startDepends(id);
    },
  },
  {
    key: 'rename',
    label: '重命名',
    run: (id) => {
      beginRename(id);
    },
  },
  {
    key: 'delete',
    label: '删除（子问题保留）',
    run: (id) => {
      deleteQuestion(id);
    },
  },
];

export interface RelationMenuItem {
  key: string;
  label: string;
  run(edgeKey: EdgeKey): void;
}

export const RELATION_ROW_MENU: readonly RelationMenuItem[] = [
  {
    key: 'rename',
    label: '重命名',
    run: (edgeKey) => {
      beginRelationRename(edgeKey);
    },
  },
  {
    key: 'delete',
    label: '删除',
    run: (edgeKey) => {
      deleteRelation(edgeKey);
    },
  },
];
