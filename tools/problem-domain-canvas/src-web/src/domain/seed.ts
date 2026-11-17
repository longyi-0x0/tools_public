/**
 * 种子数据（01 §4.4 的选课问题域，按 03 §1 屏 1 的 5 行问题树裁开）：
 * 问题域 P0 如何正确处理选课？/ P1 选课资格如何判定？/ P1.1 容量检查 / P1.2 冲突检查 / P2 状态更新；
 * 解域按 01 §4.4 的实体/行为/约束样例补学生、选课记录、课程班次与 `entityRelation 持有 1:N`。
 *
 * 首次打开（本机还没有文档）时由 bootstrap 载入，用来验证画布、检查与详情栏；
 * 节点 `pos` 全是 (0,0)，交给布局落位（拖过之后才写 pos）。
 * 课程班次故意不挂 `supportsQuestion`：首次打开解域即可看到 C6 与红点/红标。
 */
import type { AnyNode, AnyNodeOf, Edge, Workspace } from './types.ts';
import { SCHEMA_VERSION } from './types.ts';
import { DEFAULT_VIEWPORT } from './schema.ts';

function question(
  id: string,
  title: string,
  data: AnyNodeOf<'question'>['data'],
): AnyNodeOf<'question'> {
  return { id, type: 'question', title, notes: '', data, pos: { x: 0, y: 0 } };
}

function entity(
  id: string,
  title: string,
  data: AnyNodeOf<'entity'>['data'],
): AnyNodeOf<'entity'> {
  return { id, type: 'entity', title, notes: '', data, pos: { x: 0, y: 0 } };
}

function behavior(
  id: string,
  title: string,
  data: AnyNodeOf<'behavior'>['data'],
): AnyNodeOf<'behavior'> {
  return { id, type: 'behavior', title, notes: '', data, pos: { x: 0, y: 0 } };
}

function constraint(
  id: string,
  title: string,
  data: AnyNodeOf<'constraint'>['data'],
): AnyNodeOf<'constraint'> {
  return { id, type: 'constraint', title, notes: '', data, pos: { x: 0, y: 0 } };
}

export function createSeedWorkspace(now = ''): Workspace {
  const nodes: AnyNode[] = [
    question('q0', '如何正确处理选课？', {
      status: '分析中',
      statement: '学生在选课窗口内提交选课，系统要给出可解释的结果。',
      goal: '选课请求都能被正确受理或拒绝，并说明原因。',
      boundary: '只处理本科生、常规学期选课。',
      knowns: ['容量 / 先修 / 时间冲突三条约束'],
      assumptions: [],
      positiveCases: ['三条约束全过 → 选课成功'],
      negativeCases: ['已选满仍提交 → 拒绝并说明'],
      criteria: ['同级问题都能回答「为什么通过 / 为什么拒绝」'],
    }),
    question('q1', '选课资格如何判定？', {
      status: '已回答',
      statement: '提交选课时，按容量、先修、时间冲突三条规则判定资格。',
      goal: '判定结果与规则一致。',
      knowns: ['三条约束的判定顺序由教务规定'],
      assumptions: [],
      positiveCases: ['三条约束全过 → 可提交'],
      negativeCases: [],
      criteria: ['三条约束全过才可提交'],
    }),
    question('q11', '容量检查', {
      status: '分析中',
      statement: '已选人数达到容量时不得再选。',
      knowns: ['容量由课程班次给出'],
      assumptions: [],
      positiveCases: ['已选人数 = 容量 → 拒绝'],
      negativeCases: ['已选人数 < 容量 → 放行'],
      criteria: ['拒绝时提示「已选满」'],
    }),
    question('q12', '冲突检查', {
      status: '未澄清',
      statement: '同一时间段的课程不能同时选。',
      knowns: [],
      assumptions: ['假设时间冲突只按周次与节次判定'],
      positiveCases: [],
      negativeCases: [],
      criteria: [],
    }),
    question('q2', '状态更新', {
      status: '暂缓',
      statement: '选课成功后写入选课记录状态。',
      knowns: ['状态有 待确认 / 已选上 / 候补'],
      assumptions: [],
      positiveCases: [],
      negativeCases: [],
      criteria: [],
    }),
    entity('e0', '学生', {
      identity: '学号',
      fields: [
        { name: '学号', type: 'string', required: true },
        { name: '姓名', type: 'string', required: true },
      ],
      states: [],
    }),
    entity('e1', '选课记录', {
      identity: '选课ID',
      fields: [{ name: '状态', type: 'enum', note: '待确认 / 已选上 / 候补' }],
      states: ['待确认', '已选上', '候补'],
    }),
    entity('e2', '课程班次', {
      identity: '班次ID',
      fields: [
        { name: '容量', type: 'number', required: true },
        { name: '已选人数', type: 'number', required: true },
      ],
      states: [],
    }),
    behavior('b1', '提交选课', { effects: ['生成一条待确认记录'] }),
    constraint('c1', '容量不超限', { expr: '已选人数 < 容量', kind: '必须' }),
  ];

  const edges: Edge[] = [
    { type: 'decomposesTo', source: 'q0', target: 'q1' },
    { type: 'decomposesTo', source: 'q0', target: 'q2' },
    { type: 'decomposesTo', source: 'q1', target: 'q11' },
    { type: 'decomposesTo', source: 'q1', target: 'q12' },
    { type: 'dependsOn', source: 'q12', target: 'q11' },
    { type: 'entityRelation', source: 'e0', target: 'e1', cardinality: '1:N', label: '持有' },
    { type: 'behaviorOnEntity', source: 'b1', target: 'e1' },
    { type: 'constraintOnEntity', source: 'c1', target: 'e1' },
    { type: 'supportsQuestion', source: 'e0', target: 'q0' },
    { type: 'supportsQuestion', source: 'e1', target: 'q1' },
    { type: 'supportsQuestion', source: 'b1', target: 'q1' },
    { type: 'supportsQuestion', source: 'c1', target: 'q1' },
  ];

  return {
    schemaVersion: SCHEMA_VERSION,
    name: '选课问题域',
    goal: '如何正确处理选课？',
    coreQuestionId: 'q0',
    nodes,
    edges,
    viewports: {
      problem: { ...DEFAULT_VIEWPORT.problem },
      solve: { ...DEFAULT_VIEWPORT.solve },
    },
    meta: { createdAt: now, updatedAt: now },
  };
}
