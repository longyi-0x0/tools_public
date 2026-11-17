/**
 * 边形状与渲染回归（FIX3）：用户反馈「现在似乎没有直线?」。
 *
 * 两种读法都断死：
 *   读法 A（线在、但不是直线）——原来 PdcEdge 一律 getSmoothStepPath，d 里带 Q 圆角直角；
 *   读法 B（线根本没出现）——映射层有没有丢边、渲染层有没有真的产出 <path d> 和 marker-end。
 *
 * 为什么单独一个 .mjs：src/ui/flow/edges.tsx 是 TSX，`node src/...test.ts` 跑不了 JSX
 * （Node 的类型剥离不支持 tsx），所以这里用 TypeScript 编译器 API 在进程内编到
 * node_modules/.pdc-edges（git 忽略），再动态 import——和 scripts/render.test.mjs 同一套做法，不起子进程。
 *
 * 为什么逐条渲染 PdcEdge 而不是整块画布：
 *   React Flow 的 EdgeRenderer 要等浏览器里量到节点的 handle bounds（useEffect 之后）才画边，
 *   renderToStaticMarkup 只跑同步渲染，整块画布渲染出来只会有节点、没有边（断言就成了空转）。
 *   所以边数从 toProblemFlow(种子) 取，路径与 marker 由 PdcEdge 真实渲染产出。
 *
 * 运行：`npm test`（或 `node scripts/edges.test.mjs`）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReactFlowProvider } from '@xyflow/react';
import ts from 'typescript';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const outDir = path.join(webRoot, 'node_modules', '.pdc-edges');
const formatHost = {
  getCanonicalFileName: (name) => name,
  getCurrentDirectory: () => webRoot,
  getNewLine: () => '\n',
};

/** 进程内编译 src/ → node_modules/.pdc-edges（tsconfig.build.json 的口径）。 */
function compile() {
  fs.rmSync(outDir, { recursive: true, force: true });
  const read = ts.readConfigFile(path.join(webRoot, 'tsconfig.build.json'), ts.sys.readFile);
  if (read.error) throw new Error(ts.formatDiagnostics([read.error], formatHost));
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, webRoot);
  const program = ts.createProgram(parsed.fileNames, { ...parsed.options, outDir });
  const emit = program.emit();
  const errors = ts
    .getPreEmitDiagnostics(program)
    .concat(emit.diagnostics)
    .filter((item) => item.category === ts.DiagnosticCategory.Error);
  if (errors.length > 0) throw new Error(ts.formatDiagnostics(errors, formatHost));
}

compile();
const load = (relative) => import(pathToFileURL(path.join(outDir, relative)).href);
const seedMod = await load(path.join('domain', 'seed.js'));
const docMod = await load(path.join('store', 'docStore.js'));
const toFlowMod = await load(path.join('ui', 'flow', 'toFlow.js'));
const edgesMod = await load(path.join('ui', 'flow', 'edges.js'));

const NOW = '2026-11-17T00:00:00.000Z';
docMod.initDoc(seedMod.createSeedWorkspace(NOW));
const doc = docMod.getDocState();

const problem = toFlowMod.toProblemFlow({
  ws: doc.ws,
  index: doc.index,
  checksByNode: doc.checks.byNode,
  selectedId: null,
});
const solve = toFlowMod.toSolveFlow({
  ws: doc.ws,
  index: doc.index,
  selectedId: null,
  selectedEdgeKey: null,
  connectSourceId: null,
});

const byKind = (edges, kind) => edges.filter((edge) => (edge.data ?? {}).kind === kind);

/** 用真实的 EdgeProps 渲染一条边（PdcEdge 在 ReactFlowProvider 内，标签走 EdgeLabelRenderer）。 */
function renderEdge(edge) {
  return renderToStaticMarkup(
    createElement(
      ReactFlowProvider,
      null,
      createElement(edgesMod.PdcEdge, {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceX: 100,
        sourceY: 80,
        targetX: 180,
        targetY: 200,
        sourcePosition: 'bottom',
        targetPosition: 'top',
        style: edge.style,
        markerEnd: edge.markerEnd,
        data: edge.data,
        selected: false,
        animated: false,
        selectable: true,
        deletable: true,
        label: undefined,
        labelStyle: undefined,
        labelShowBg: undefined,
        labelBgStyle: undefined,
        labelBgPadding: undefined,
        labelBgBorderRadius: undefined,
        sourceHandleId: null,
        targetHandleId: null,
        type: 'pdc',
        interactionWidth: 20,
      }),
    ),
  );
}

/** 从标记里取第一条 path 的 d（BaseEdge 先渲染可视路径，再渲染 interaction 热区）。 */
function pathD(html) {
  const match = html.match(/<path[^>]*\sd="([^"]*)"/);
  return match ? match[1] : '';
}

const DISALLOWED_CURVE = /[CQAScqas]/;

test('decomposesTo：d 只含 M/L（纯直线，无 C/Q/A）', () => {
  const edges = byKind(problem.edges, 'decomposes');
  assert.ok(edges.length >= 1, '种子里应有 decomposesTo 边');
  for (const edge of edges) {
    const html = renderEdge(edge);
    const d = pathD(html);
    assert.ok(d.length > 0, `边 ${edge.id} 渲染后 d 为空：${html.slice(0, 300)}`);
    assert.ok(/^[ML0-9.,\s-]+$/i.test(d), `边 ${edge.id} 的 d 不应含曲线/圆弧命令：${d}`);
    assert.ok(!DISALLOWED_CURVE.test(d), `边 ${edge.id} 的 d 含曲线命令：${d}`);
  }
});

test('dependsOn：d 只含 M/L，虚线样式仍保留', () => {
  const edges = byKind(problem.edges, 'depends');
  assert.ok(edges.length >= 1, '种子里应有 dependsOn 边');
  for (const edge of edges) {
    const d = pathD(renderEdge(edge));
    assert.ok(d.length > 0, `边 ${edge.id} 渲染后 d 为空`);
    assert.ok(/^[ML0-9.,\s-]+$/i.test(d), `边 ${edge.id} 的 d 不应含曲线/圆弧命令：${d}`);
    assert.ok(!DISALLOWED_CURVE.test(d), `边 ${edge.id} 的 d 含曲线命令：${d}`);
    assert.equal(edge.style?.strokeDasharray, '6 4', 'dependsOn 保留 6/4 虚线');
  }
});

test('entityRelation：走正交折线（含 L 段、无 C 弧线），带关系名与基数', () => {
  const edges = byKind(solve.edges, 'relation');
  assert.ok(edges.length >= 1, '种子里应有 entityRelation 边');
  const edge = edges[0];
  const d = pathD(renderEdge(edge));
  assert.ok(d.length > 0, `关系边渲染后 d 为空：${d}`);
  assert.ok(/L/i.test(d), `正交折线应含 L 段：${d}`);
  assert.ok(!/C/i.test(d), `正交折线不应有 C 三次贝塞尔：${d}`);
  assert.ok(!/A/i.test(d), `正交折线不应有 A 圆弧：${d}`);
  assert.equal(edge.data?.label, '持有', '关系名进边 data，由 EdgeLabelRenderer 画标签');
  assert.equal(edge.data?.cardinality, '1:N', '基数进边 data');
});

test('渲染层：种子里 5 个问题、decomposesTo 边 ≥ 4，条条有非空 d 与 marker-end 箭头', () => {
  const questions = problem.nodes.filter((node) => node.type === 'question');
  assert.equal(questions.length, 5, `种子应落 5 张问题卡，实际 ${questions.length}`);
  const edges = byKind(problem.edges, 'decomposes');
  assert.ok(edges.length >= 4, `decomposesTo 边应 ≥ 4 条（种子 5 个问题），实际 ${edges.length}`);
  for (const edge of edges) {
    const html = renderEdge(edge);
    assert.match(html, /react-flow__edge-path/, `边 ${edge.id} 没被渲染成边路径：${html.slice(0, 200)}`);
    assert.ok(pathD(html).length > 0, `边 ${edge.id} 的 d 为空`);
    assert.match(html, /marker-end="url\(#pdc-arrow\)"/, `边 ${edge.id} 的实心箭头没接上`);
  }
  const depends = byKind(problem.edges, 'depends');
  for (const edge of depends) {
    assert.match(renderEdge(edge), /marker-end="url\(#pdc-arrow-hollow\)"/, 'dependsOn 空心箭头没接上');
  }
});

test('箭头 defs：实心/空心两个 marker 都在，颜色走主色令牌', () => {
  const html = renderToStaticMarkup(createElement(edgesMod.FlowEdgeMarkers));
  assert.match(html, /id="pdc-arrow"/, '实心箭头 def 缺失');
  assert.match(html, /id="pdc-arrow-hollow"/, '空心箭头 def 缺失');
  assert.match(html, /fill="var\(--pd-accent\)"/, '箭头颜色应吃 --pd-accent 令牌');
});

test('真实 d 样本（写进报告用，截断 80 字符内）', () => {
  const decomposes = byKind(problem.edges, 'decomposes')[0];
  const depends = byKind(problem.edges, 'depends')[0];
  const relation = byKind(solve.edges, 'relation')[0];
  const sample = {
    decomposes: pathD(renderEdge(decomposes)),
    depends: pathD(renderEdge(depends)),
    relation: pathD(renderEdge(relation)),
  };
  for (const [kind, d] of Object.entries(sample)) {
    assert.ok(d.length > 0, `${kind} 的 d 为空`);
    console.log(`REAL_D ${kind} = ${d.slice(0, 80)}`);
  }
});
