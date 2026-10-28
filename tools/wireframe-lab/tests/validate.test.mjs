import test from "node:test";
import assert from "node:assert/strict";
import {
  createContainer,
  createDocument,
  createLeaf,
} from "../site/js/core/ast.js";
import { insertNode } from "../site/js/core/ops.js";
import { parseDocument, serializeDocument } from "../site/js/core/serialize.js";
import { validateDocument } from "../site/js/core/validate.js";
import { createSampleDocument } from "../site/js/sample.js";
import { cloneDocument } from "../site/js/core/ops.js";

test("悬空 parent 会被拒绝", () => {
  const doc = createDocument();
  const leaf = createLeaf("text");
  leaf.parent = "nMissing";
  leaf.pos = "a";
  doc.nodes[leaf.id] = leaf;
  assert.ok(validateDocument(doc).some((error) => error.includes("parent 不存在")));
});

test("父子成环会被拒绝", () => {
  const doc = createDocument();
  const a = createContainer("column");
  const b = createContainer("column");
  a.parent = b.id;
  a.pos = "a";
  b.parent = a.id;
  b.pos = "a";
  doc.nodes[a.id] = a;
  doc.nodes[b.id] = b;
  assert.ok(validateDocument(doc).some((error) => error.includes("成环")));
});

test("自由容器的流式子节点缺 frame 会被拒绝", () => {
  const doc = createDocument();
  const free = createContainer("free");
  insertNode(doc, doc.root, free);
  const child = createLeaf("text");
  insertNode(doc, free.id, child);
  assert.ok(validateDocument(doc).some((error) => error.includes("缺少 frame")));
});

test("普通容器里出现 frame 会被拒绝", () => {
  const doc = createDocument();
  const child = createLeaf("text");
  insertNode(doc, doc.root, child);
  doc.nodes[child.id].frame = { x: 0, y: 0, w: 10, h: 10 };
  assert.ok(validateDocument(doc).some((error) => error.includes("只属于自由容器")));
});

test("序列化固定 key 顺序，导入导出无损", () => {
  const doc = createSampleDocument();
  const first = serializeDocument(doc);
  const second = serializeDocument(createSampleDocument());
  assert.equal(first, second);
  const parsed = parseDocument(first);
  assert.deepEqual(parsed, doc);
  assert.ok(first.endsWith("\n"));
});

test("meta 变化也能被校验和往返", () => {
  const doc = cloneDocument(createSampleDocument());
  doc.title = "另一个页面";
  const roundtrip = parseDocument(serializeDocument(doc));
  assert.equal(roundtrip.title, "另一个页面");
  assert.deepEqual(validateDocument(roundtrip), []);
});
