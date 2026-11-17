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

/** 深度遍历 React 元素树里的 Handle；遇到自定义组件（NodePorts 这类无状态包装）展开它的返回值。 */
function collectHandles(element) {
  const found = [];
  const walk = (node) => {
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (!isValidElement(node)) return;
    if (node.type === Handle) {
      found.push(node);
      return;
    }
    if (typeof node.type === 'function') {
      walk(node.type(node.props));
      return;
    }
    walk(node.props?.children);
  };
  walk(element);
  return found;
}

test('问题卡元素树里必须有四个端口 Handle（上/右/下/左，各带 data-port）', () => {
  const tree = nodesMod.QuestionNode({ id: 'q1', data: QUESTION_DATA });
  const handles = collectHandles(tree);
  assert.equal(handles.length, 4, `问题卡应有 4 个端口，实际 ${handles.length}`);
  assert.deepEqual(
    handles.map((element) => element.props['data-port']),
    ['top', 'right', 'bottom', 'left'],
    '四边各一个端口，顺序 = PORT_IDS',
  );
  assert.deepEqual(
    handles.map((element) => element.props.position).sort(),
    ['bottom', 'left', 'right', 'top'],
    'Handle 的方位覆盖四边',
  );
  for (const element of handles) {
    assert.equal(element.props.isConnectable, true, '端口要能拖出、也能接住');
    assert.match(String(element.props.className), /pdc-port/, '端口走 .pdc-port 样式类');
  }
});

test('实体卡同样是四个端口（证明上面的断言方法不是空转）', () => {
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
  assert.equal(handles.length, 4, '实体卡四边各一个端口');
  assert.deepEqual(
    handles.map((element) => element.props['data-port']),
    ['top', 'right', 'bottom', 'left'],
  );
});

test('问题卡渲染成标记后带 4 个带 data-port 的 react-flow__handle（Service 端渲染）', () => {
  const html = renderToStaticMarkup(
    createElement(ReactFlowProvider, null, createElement(nodesMod.QuestionNode, { id: 'q1', data: QUESTION_DATA })),
  );
  const count = (html.match(/react-flow__handle/g) ?? []).length;
  assert.ok(count >= 4, `期望标记里至少 4 个 react-flow__handle，实际 ${count}；标记：${html.slice(0, 400)}`);
  for (const port of ['top', 'right', 'bottom', 'left']) {
    assert.ok(html.includes(`data-port="${port}"`), `标记里缺 data-port="${port}"：${html.slice(0, 600)}`);
  }
  console.log('  端口 DOM :', (html.match(/<div class="react-flow__handle[^>]*>/g) ?? []).join('\n            '));
});

/**
 * FIX6「点节点后看不出它被选中」的静态 DOM 锚点：选中态与未选中态只差 data-selected。
 * 之前的写法是 data-selected={false} → DOM 里留下 "false"，而 CSS 用裸属性选择器 [data-selected]，
 * 连 "false" 也命中，于是每张卡都挂 1.5px 主色环。这里把两种态的开标签原样打出来当证据。
 */
function openingTag(html) {
  return html.match(/<div class="node-card[^>]*>/)?.[0] ?? '';
}

test('选中态 / 未选中态的静态 DOM 只差 data-selected（FIX6）', () => {
  const render = (selected) =>
    renderToStaticMarkup(
      createElement(
        ReactFlowProvider,
        null,
        createElement(nodesMod.QuestionNode, { id: 'q1', data: { ...QUESTION_DATA, selected } }),
      ),
    );
  const on = render(true);
  const off = render(false);
  const onTag = openingTag(on);
  const offTag = openingTag(off);
  console.log('  选中   :', onTag);
  console.log('  未选中 :', offTag);

  assert.match(onTag, /class="node-card pdc-card"/, '选中态 class 与未选中态一致（环由 CSS 按 data-selected 画）');
  assert.match(offTag, /class="node-card pdc-card"/);
  assert.match(onTag, /data-selected="true"/, '选中态必须带 data-selected="true"');
  assert.doesNotMatch(offTag, /data-selected/, '未选中态不许留 data-selected="false"（裸属性选择器会误命中）');
  // 除去 data-selected 这一项，两种态的标记必须逐字相同：不允许选中态偷偷换 class
  assert.equal(onTag.replace(' data-selected="true"', ''), offTag, '两种态除 data-selected 外完全相同');
});
