import test from "node:test";
import assert from "node:assert/strict";
import {
  createRegistry,
  installDefaultSet,
  registerLocal,
  registerScheme,
  localLoader,
} from "../site/js/resolve/registry.js";
import { buildDocumentIR, buildIR } from "../site/js/ir/build-ir.js";
import { describeDocument, describeIntent } from "../site/js/ir/describe.js";
import { createSampleDocument } from "../site/js/sample.js";
import { createDocument, createNode } from "../site/js/core/ast.js";
import { stableStringify } from "../site/js/core/serialize.js";

function buildRegistry() {
  const registry = createRegistry();
  installDefaultSet(registry);
  registerLocal(registry, {
    id: "product-card",
    name: "商品卡",
    honorsStructure: false,
    Component: () => null,
  });
  registerLocal(registry, {
    id: "buy-button",
    name: "购买按钮",
    honorsStructure: false,
    Component: () => null,
  });
  registerScheme(registry, "local", localLoader(registry));
  return registry;
}

test("布局 token 在 IR 里已经换成像素", () => {
  const doc = createSampleDocument();
  const { ir } = buildDocumentIR(doc, buildRegistry());
  assert.deepEqual(ir.layout, {
    kind: "column",
    gap: 12,
    align: "fill",
    distribute: "start",
  });
});

test("锚点定位的 inset 换成像素，模式保留", () => {
  const doc = createSampleDocument();
  const { ir } = buildDocumentIR(doc, buildRegistry());
  const fab = ir.children.find((child) => child.id === "nFab");
  assert.deepEqual(fab.position, { mode: "anchor", anchor: "br", inset: { x: 12, y: 12 } });
  assert.deepEqual(fab.size, { width: { kind: "px", value: 58 }, height: { kind: "px", value: 58 } });
});

test("具名槽位的子节点不再出现在匿名序列里", () => {
  const doc = createSampleDocument();
  const { ir } = buildDocumentIR(doc, buildRegistry());
  const nav = ir.children.find((child) => child.id === "nNav");
  assert.deepEqual(Object.keys(nav.slots), ["left", "right"]);
  assert.deepEqual(nav.slots.right.map((child) => child.id), ["nBell"]);
  assert.deepEqual(nav.children, []);
});

test("候选链首位命中真实组件时 kind 是 component", () => {
  const doc = createSampleDocument();
  const { ir } = buildDocumentIR(doc, buildRegistry());
  const fab = ir.children.find((child) => child.id === "nFab");
  assert.equal(fab.render.kind, "component");
  assert.equal(fab.render.targetId, "buy-button");
  assert.equal(fab.render.honorsStructure, false);
});

test("解析不到的节点 render 为空，并留下带节点 id 的告警", () => {
  const doc = createDocument();
  const node = createNode({ use: ["ios.button.filled"] });
  node.parent = doc.root;
  node.pos = "a";
  doc.nodes[node.id] = node;
  const warnings = [];
  const ir = buildIR(doc, doc.root, buildRegistry(), warnings);
  const child = ir.children[0];
  assert.equal(child.render, null);
  assert.ok(warnings.some((warning) => warning.startsWith(node.id)));
});

test("同一份文档两次构建出的 IR 完全一致", () => {
  const doc = createSampleDocument();
  const registry = buildRegistry();
  const first = buildDocumentIR(doc, registry);
  const second = buildDocumentIR(doc, registry);
  assert.equal(stableStringify(first.ir), stableStringify(second.ir));
});

test("构建 IR 不改动文档", () => {
  const doc = createSampleDocument();
  const before = stableStringify(doc);
  buildDocumentIR(doc, buildRegistry());
  assert.equal(stableStringify(doc), before);
});

test("单节点描述带语义名、间距与尺寸", () => {
  const doc = createSampleDocument();
  const text = describeIntent(doc.nodes.nThumb2);
  assert.ok(text.includes("image"));
  assert.ok(text.includes("宽 72px"));
});

test("整页描述保留槽位标记与语义名", () => {
  const text = describeDocument(createSampleDocument());
  assert.ok(text.startsWith("# 商品列表"));
  assert.ok(text.includes("[right]"));
  assert.ok(text.includes("navbar"));
  assert.ok(text.includes("button.ghost"));
});
