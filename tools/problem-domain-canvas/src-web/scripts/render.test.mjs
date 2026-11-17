/**
 * 渲染层回归（IMPFIX3）：问题卡的句柄。
 *
 * 用户报的「问题域里没有线」：React Flow 的边必须锚在节点里的 <Handle> 上，自定义节点不写 Handle
 * 就没有锚点，边静默不画（不报错）——解域有线、问题域没线，正是 EntityNode 有句柄、QuestionNode 没有。
 *
 * 为什么单独一个文件、且要在这里现编一遍：
 *   - src/ui/flow/nodes.tsx 是 .tsx，`node src/...test.ts` 直接跑不了 JSX（Node 的类型剥离不支持 tsx），
 *     所以用 TypeScript 编译器 API 在进程内编成 ESM（和 scripts/build.mjs 同一套做法，不起子进程），
 *     产物落在 node_modules/.pdc-render（git 忽略），再动态 import；
 *   - 断言取两层：① QuestionNode 返回的 React 元素树里必须有 target/source 两个 Handle（渲染前结构，
 *     与 @xyflow/react 是同一个模块实例，identity 可比）；② 包进 ReactFlowProvider 用
 *     renderToStaticMarkup 渲一遍，标记里必须出现 react-flow__handle —— 这是浏览器里真正会被画出来的东西。
 * 运行：`npm test`（或 `node scripts/render.test.mjs`）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Handle, ReactFlowProvider } from '@xyflow/react';
import ts from 'typescript';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const outDir = path.join(webRoot, 'node_modules', '.pdc-render');
const formatHost = {
  getCanonicalFileName: (name) => name,
  getCurrentDirectory: () => webRoot,
  getNewLine: () => '\n',
};

/** 进程内编译 src/ → node_modules/.pdc-render（tsconfig.build.json 的口径，与发布构建一致）。 */
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
const nodesMod = await import(pathToFileURL(path.join(outDir, 'ui', 'flow', 'nodes.js')).href);

const QUESTION_DATA = {
  title: '选课资格如何判定？',
  code: '1.1',
  status: '未澄清',
  statusClass: 'dot s-unclear',
  core: false,
  selected: false,
  links: [],
  linkMore: 0,
  checks: [],
};

/** 深度遍历 React 元素树里的 Handle。 */
function collectHandles(element) {
  const found = [];
  const walk = (node) => {
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (!isValidElement(node)) return;
    if (node.type === Handle) found.push(node);
    walk(node.props?.children);
  };
  walk(element);
  return found;
}

test('问题卡元素树里必须有 target/source 两个 Handle（没有就不是锚点，边静默不画）', () => {
  const tree = nodesMod.QuestionNode({ id: 'q1', data: QUESTION_DATA });
  const handles = collectHandles(tree);
  const types = handles.map((element) => element.props.type);
  assert.equal(handles.length, 2, `问题卡应有 2 个 Handle，实际 ${handles.length}`);
  assert.deepEqual([...types].sort(), ['source', 'target'], '一进一出：target 在上、source 在下');
  for (const element of handles) {
    assert.equal(element.props.isConnectable, false, '问题域不手动拉线（连线走左树）');
    assert.match(String(element.props.className), /pdc-handle-ghost/, '句柄走透明样式类');
  }
});

test('对照：实体卡本来就有左右两个 Handle（证明上面的断言方法不是空转）', () => {
  const tree = nodesMod.EntityNode({
    id: 'e1',
    data: {
      title: '选课记录',
      identity: '# 学号',
      fields: [],
      tags: [],
      supportCodes: [],
      unsupported: true,
      selected: false,
      connectSource: false,
    },
  });
  const handles = collectHandles(tree);
  assert.equal(handles.length, 2, '实体卡左右各一个可拖的句柄');
  assert.deepEqual(handles.map((element) => element.props.position).sort(), ['left', 'right'].sort());
});

test('问题卡渲染成标记后带 react-flow__handle（Service 端渲染，ReactFlowProvider 上下文内）', () => {
  const html = renderToStaticMarkup(
    createElement(ReactFlowProvider, null, createElement(nodesMod.QuestionNode, { id: 'q1', data: QUESTION_DATA })),
  );
  const count = (html.match(/react-flow__handle/g) ?? []).length;
  assert.ok(count >= 2, `期望标记里至少 2 个 react-flow__handle，实际 ${count}；标记：${html.slice(0, 400)}`);
});
