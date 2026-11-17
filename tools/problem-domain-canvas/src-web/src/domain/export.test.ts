/**
 * 导出与实例化自测（01 §8.3 六条 / 04 §2.3–2.5）。运行：`node src/domain/export.test.ts`。
 * 关键一条：B + C 产物写进 os.tmpdir() 后用 `ts.createProgram`（noEmit, strict）编译，
 * 等价 `tsc --noEmit --strict`——不起子进程（受限沙箱禁管道 stdio）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import type { Workspace } from './types.ts';
import { SCHEMA_VERSION } from './types.ts';
import { buildIndex, withDefaults } from './normalize.ts';
import { getDocState } from '../store/docStore.ts';
import { toJson, toMarkdown, toTs, toSeed, fromJson, describeModel } from './export/index.ts';

function fixture(): Workspace {
  const raw = {
    schemaVersion: SCHEMA_VERSION,
    name: '选课问题域',
    goal: '如何正确处理选课？',
    coreQuestionId: 'q0',
    nodes: [
      {
        id: 'q0',
        type: 'question',
        title: '如何正确处理选课？',
        notes: '',
        data: {
          status: '分析中',
          statement: '三条约束一起满足',
          knowns: ['容量/先修/时间冲突'],
          criteria: ['三条全过'],
        },
        pos: { x: 0, y: 0 },
      },
      {
        id: 'q1',
        type: 'question',
        title: '选课资格如何判定？',
        notes: '',
        data: { status: '已回答', positiveCases: ['三条全过 → 成功'], negativeCases: ['已选满仍提交 → 拒绝'] },
        pos: { x: 0, y: 120 },
      },
      {
        id: 'q2',
        type: 'question',
        title: '暂未挂到核心问题',
        notes: '',
        data: { status: '未澄清' },
        pos: { x: 220, y: 0 },
      },
      {
        id: 'e1',
        type: 'entity',
        title: '选课记录',
        notes: '',
        data: {
          identity: '选课ID',
          fields: [
            { name: '状态', type: 'enum' },
            { name: '容量', type: 'number', required: true },
            { name: '备注', type: '自由文本' },
          ],
          states: ['待确认', '已选上', '候补'],
        },
        pos: { x: 0, y: 480 },
      },
      {
        id: 'e2',
        type: 'entity',
        title: '学生',
        notes: '',
        data: { identity: '学号', fields: [{ name: '姓名', type: 'string' }] },
        pos: { x: 220, y: 480 },
      },
      {
        id: 'b1',
        type: 'behavior',
        title: '提交选课',
        notes: '',
        data: { inputs: ['课程ID'], output: '选课结果', effects: ['生成一条待确认记录'] },
        pos: { x: -180, y: 560 },
      },
      {
        id: 'c1',
        type: 'constraint',
        title: '容量不超限',
        notes: '',
        data: { expr: '已选人数 < 容量', kind: '必须', enforcementPoint: '提交时' },
        pos: { x: 180, y: 560 },
      },
    ],
    edges: [
      { type: 'decomposesTo', source: 'q0', target: 'q1' },
      { type: 'entityRelation', source: 'e1', target: 'e2', cardinality: '1:1', label: '持有' },
      { type: 'behaviorOnEntity', source: 'b1', target: 'e1' },
      { type: 'constraintOnEntity', source: 'c1', target: 'e1' },
      { type: 'supportsQuestion', source: 'e1', target: 'q1' },
      { type: 'supportsQuestion', source: 'b1', target: 'q1' },
      { type: 'supportsQuestion', source: 'c1', target: 'q1' },
    ],
    viewports: { problem: { x: 10, y: 20, zoom: 1.5 }, solve: { x: 0, y: 0, zoom: 1 } },
    meta: { createdAt: '2026-11-17T00:00:00.000Z', updatedAt: '2026-11-17T00:00:00.000Z' },
  };
  return withDefaults(raw as unknown as Workspace);
}

function questionIds(ws: Workspace): string[] {
  return ws.nodes
    .filter((node) => node.type === 'question')
    .map((node) => node.id)
    .sort();
}

test('toJson：完整工作区、2 空格缩进、末尾换行、含 pos 与 viewports、两次逐字节一致', () => {
  const ws = fixture();
  const first = toJson(ws);
  const second = toJson(ws);
  assert.equal(first.text, second.text);
  assert.ok(first.text.endsWith('\n'));
  assert.match(first.text, /\n {2}"nodes": /);
  const parsed = JSON.parse(first.text) as Record<string, any>;
  assert.equal(parsed['schemaVersion'], 2);
  assert.deepEqual(parsed['nodes'][0]['pos'], { x: 0, y: 0 });
  assert.deepEqual(parsed['viewports']['problem'], { x: 10, y: 20, zoom: 1.5 });
  assert.ok(!('meta' in parsed), 'meta 按 04 §2.6 剥离');
  assert.equal(first.fileName, '选课问题域.json');
});

test('toMarkdown：两次逐字节一致；问题 id 集合与 JSON 的 question 集合相等', () => {
  const ws = fixture();
  const index = buildIndex(ws);
  const first = toMarkdown(ws, index);
  const second = toMarkdown(ws, index);
  assert.equal(first.text, second.text);
  const fromMarkdown = [...first.text.matchAll(/^- id：(\S+)$/gm)].map((match) => match[1]).sort();
  const parsed = JSON.parse(toJson(ws).text) as { nodes: Array<{ id: string; type: string }> };
  const fromJsonIds = parsed.nodes
    .filter((node) => node.type === 'question')
    .map((node) => node.id)
    .sort();
  assert.deepEqual(fromMarkdown, fromJsonIds);
  assert.equal(first.text.split('\n').length > 20, true);
  assert.match(first.text, /## 问题结构/);
  assert.match(first.text, /## 领域模型/);
  assert.match(first.text, /## 未完成项/);
});

test('toTs：interface 个数 = entity 个数，每个上方一行 // 支撑：，未支撑写无（C6）', () => {
  const ws = fixture();
  const index = buildIndex(ws);
  const artifact = toTs(ws, index);
  const lines = artifact.text.split('\n');
  const interfaces = lines.map((line, at) => ({ line, at })).filter((entry) => entry.line.startsWith('export interface '));
  const entityCount = ws.nodes.filter((node) => node.type === 'entity').length;
  assert.equal(interfaces.length, entityCount);
  for (const entry of interfaces) {
    assert.ok(
      (lines[entry.at - 1] ?? '').startsWith('// 支撑：'),
      `interface 上一行必须是 // 支撑：，实际是「${lines[entry.at - 1] ?? ''}」`,
    );
  }
  assert.match(artifact.text, /\/\/ 支撑：无（C6）/);
  assert.match(artifact.text, /^export type 选课记录State = "待确认" \| "已选上" \| "候补";$/m);
  assert.match(artifact.text, /\/\*\* 约束（必须）：已选人数 < 容量 @提交时 \*\//);
  assert.match(artifact.text, /提交选课\?: \(input: Record<string, unknown>, ctx\?: unknown\) => void;/);
  assert.match(artifact.text, /学生Id\?: string;/);
  assert.match(artifact.text, /\/\*\* 原类型：自由文本 \*\//);
  assert.equal(artifact.fileName, '选课问题域-model.ts');
});

test('toSeed：每实体恰好 3 条实例，第 3 条带 // 期望：拒绝', () => {
  const ws = fixture();
  const index = buildIndex(ws);
  const plan = describeModel(ws, index);
  const artifact = toSeed(ws, index);
  assert.equal(artifact.text.split('// 期望：拒绝').length - 1, plan.entities.length);
  for (const entity of plan.entities) {
    const start = artifact.text.indexOf(`export const ${entity.name}Seed = [`);
    assert.ok(start >= 0, `缺 ${entity.name}Seed`);
    const end = artifact.text.indexOf('] as const satisfies', start);
    const block = artifact.text.slice(start, end);
    const instances = block.split('\n').filter((line) => line === '  {').length;
    assert.equal(instances, 3, `${entity.name} 的实例数应为 3`);
    const rejects = block.match(/\/\/ 期望：拒绝/g) ?? [];
    assert.equal(rejects.length, 1, `${entity.name} 的第 3 条应带 // 期望：拒绝：\n${block}`);
  }
  assert.equal(artifact.fileName, '选课问题域-seed.ts');
});

test('toTs + toSeed：写进临时目录后 tsc（noEmit / strict）零诊断', () => {
  const ws = fixture();
  const index = buildIndex(ws);
  const model = toTs(ws, index);
  const seed = toSeed(ws, index);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdc-export-'));
  try {
    const modelPath = path.join(dir, model.fileName);
    const seedPath = path.join(dir, seed.fileName);
    fs.writeFileSync(modelPath, model.text, 'utf8');
    fs.writeFileSync(seedPath, seed.text, 'utf8');
    const program = ts.createProgram([modelPath, seedPath], {
      strict: true,
      noEmit: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      skipLibCheck: true,
      isolatedModules: true,
      noUnusedLocals: false,
    });
    const diagnostics = ts.getPreEmitDiagnostics(program).filter((item) => item.category === ts.DiagnosticCategory.Error);
    const formatted = ts.formatDiagnostics(diagnostics, {
      getCanonicalFileName: (name) => name,
      getCurrentDirectory: () => dir,
      getNewLine: () => '\n',
    });
    assert.equal(diagnostics.length, 0, formatted);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('fromJson：坏 JSON / 缺 schemaVersion / 未知节点类型各给一条错误，且不改当前文档', () => {
  const before = getDocState();
  const revBefore = before.rev;
  const fingerprintBefore = before.index.fingerprint;
  const nodesBefore = before.ws.nodes.length;

  const badJson = fromJson('{ not json ');
  const missingVersion = fromJson(JSON.stringify({ nodes: [], edges: [] }));
  const unknownType = fromJson(
    JSON.stringify({
      schemaVersion: 2,
      nodes: [{ id: 'x1', type: 'note', title: '备注', notes: '', data: {}, pos: { x: 0, y: 0 } }],
      edges: [],
    }),
  );

  assert.equal(badJson.ok, false);
  assert.equal(missingVersion.ok, false);
  assert.equal(unknownType.ok, false);
  if (!badJson.ok) assert.match(badJson.error, /不是合法的 JSON/);
  if (!missingVersion.ok) assert.match(missingVersion.error, /缺少 schemaVersion/);
  if (!unknownType.ok) assert.match(unknownType.error, /不在 9 类之内/);

  const after = getDocState();
  assert.equal(after.rev, revBefore);
  assert.equal(after.index.fingerprint, fingerprintBefore);
  assert.equal(after.ws.nodes.length, nodesBefore);
});

test('fromJson：能读回 toJson 的产物（JSON 往返）', () => {
  const ws = fixture();
  const result = fromJson(toJson(ws).text);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.ws.nodes.length, ws.nodes.length);
  assert.equal(result.ws.edges.length, ws.edges.length);
  assert.deepEqual(questionIds(result.ws), questionIds(ws));
  assert.deepEqual(result.ws.viewports.problem, ws.viewports.problem);
});
