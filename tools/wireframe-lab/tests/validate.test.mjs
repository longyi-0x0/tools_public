import test from "node:test";
import assert from "node:assert/strict";
import { createDocument, createNode } from "../site/js/core/ast.js";
import { insertNode } from "../site/js/core/ops.js";
import {
  collectContractWarnings,
  validateDocument,
} from "../site/js/core/validate.js";
import { parseDocument, serializeDocument } from "../site/js/core/serialize.js";
import { createSampleDocument } from "../site/js/sample.js";

test("悬空 parent 会被拒绝", () => {
  const doc = createDocument();
  const node = createNode({ use: ["text"] });
  node.parent = "nMissing";
  node.pos = "a";
  doc.nodes[node.id] = node;
  assert.ok(validateDocument(doc).some((error) => error.includes("parent 不存在")));
});

test("schemaVersion 必须是 2", () => {
  const doc = createDocument();
  doc.schemaVersion = 1;
  assert.ok(validateDocument(doc).some((error) => error.includes("schemaVersion")));
});

test("根节点不能有 parent，也不能脱离文档流", () => {
  const doc = createDocument();
  doc.nodes[doc.root].parent = "nX";
  doc.nodes[doc.root].position = { mode: "anchor", anchor: "c", inset: { x: "md", y: "md" } };
  const errors = validateDocument(doc);
  assert.ok(errors.some((error) => error.includes("根节点不能有 parent")));
  assert.ok(errors.some((error) => error.includes("根节点不能脱离文档流")));
});

test("layoutProps 里不属于该布局的键会报错", () => {
  const doc = createDocument();
  doc.nodes[doc.root].layout = "grid";
  doc.nodes[doc.root].layoutProps = { gap: "md", align: "start", columns: 2, distribute: "start" };
  assert.ok(validateDocument(doc).some((error) => error.includes("layoutProps.distribute")));
});

test("网格列数必须是 1 到 6 的整数", () => {
  const doc = createDocument();
  doc.nodes[doc.root].layout = "grid";
  doc.nodes[doc.root].layoutProps = { gap: "md", align: "start", columns: 9 };
  assert.ok(validateDocument(doc).some((error) => error.includes("columns")));
});

test("尺寸只接受关键字、数值与百分比，下界不接受 auto", () => {
  const doc = createDocument();
  const node = createNode({ use: ["text"], size: { width: "huge", minWidth: "auto" } });
  insertNode(doc, doc.root, node);
  const errors = validateDocument(doc);
  assert.ok(errors.some((error) => error.includes("size.width 无效")));
  assert.ok(errors.some((error) => error.includes("size.minWidth")));
});

test("绝对定位只属于自由布局父节点的直接子节点", () => {
  const doc = createDocument();
  const node = createNode({ use: ["text"] });
  insertNode(doc, doc.root, node);
  doc.nodes[node.id].position = { mode: "absolute", x: 0, y: 0, w: 10, h: 10 };
  assert.ok(validateDocument(doc).some((error) => error.includes("absolute")));
});

test("子节点落进未声明的槽位会报错", () => {
  const doc = createDocument();
  const card = createNode({ use: ["navbar"], slots: ["left", "right"] });
  insertNode(doc, doc.root, card);
  const child = createNode({ use: ["text"] });
  insertNode(doc, card.id, child);
  doc.nodes[child.id].slot = "content";
  assert.ok(validateDocument(doc).some((error) => error.includes("没有槽位 content")));
});

test("候选条目缺 src 会报错", () => {
  const doc = createDocument();
  const node = createNode({ use: [{ props: { label: "无来源" } }] });
  insertNode(doc, doc.root, node);
  assert.ok(validateDocument(doc).some((error) => error.includes("缺少 src")));
});

test("集合 id 不能含点，也不允许重复声明", () => {
  const doc = createDocument();
  doc.sets = [{ id: "ios.skin" }, { id: "ios" }, { id: "ios" }];
  const errors = validateDocument(doc);
  assert.ok(errors.some((error) => error.includes("不能含点")));
  assert.ok(errors.some((error) => error.includes("重复声明")));
});

test("候选全部解析不到只是告警，文档仍然有效", () => {
  const doc = createDocument();
  const node = createNode({ use: ["ios.button.filled"] });
  insertNode(doc, doc.root, node);
  assert.deepEqual(validateDocument(doc), []);
  const warnings = collectContractWarnings(doc, { resolve: () => null });
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0].includes("ios.button.filled"));
});

test("序列化固定 key 顺序，导入导出无损", () => {
  const doc = createSampleDocument();
  const text = serializeDocument(doc);
  const round = parseDocument(text);
  assert.deepEqual(validateDocument(round), []);
  assert.equal(serializeDocument(round), text);
});

test("meta 变化也能被校验和往返", () => {
  const doc = createSampleDocument();
  doc.title = "改过的标题";
  doc.sets = [{ id: "default", version: "1" }];
  const text = serializeDocument(doc);
  assert.equal(serializeDocument(parseDocument(text)), text);
  assert.deepEqual(validateDocument(parseDocument(text)), []);
});
