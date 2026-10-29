import test from "node:test";
import assert from "node:assert/strict";
import { createDocument, createNode } from "../site/js/core/ast.js";
import { serializeDocument } from "../site/js/core/serialize.js";
import { validateDocument } from "../site/js/core/validate.js";
import { projectFromLegacyPage } from "../site/js/persistence.js";
import { detectKind, parseImport, serializeProject } from "../site/js/io.js";
import { createSampleProject } from "../site/js/sample-project.js";

function legacyDoc() {
  const doc = createDocument("旧草稿页");
  const node = createNode({ use: ["button"], props: { label: "老按钮" } });
  doc.nodes[node.id] = node;
  node.parent = doc.root;
  node.pos = "a";
  doc.sets = [{ id: "default", version: "1" }];
  return doc;
}

test("旧的单页草稿变成项目，组件集上移到项目上", () => {
  const doc = legacyDoc();
  const sets = doc.sets;
  delete doc.sets;
  const project = projectFromLegacyPage(doc, sets);
  assert.equal(project.pages[0].title, "旧草稿页");
  assert.equal(project.pages[0].doc.sets, undefined);
  assert.deepEqual(project.sets, [{ id: "default", version: "1" }]);
  assert.deepEqual(validateDocument(project.pages[0].doc), []);
});

test("导入判别：有 pages 是项目，有 nodes 是页面", () => {
  const project = createSampleProject();
  assert.equal(detectKind(JSON.parse(serializeProject(project))), "project");
  assert.equal(detectKind(JSON.parse(serializeDocument(project.pages[0].doc))), "page");
  assert.equal(detectKind({ hello: 1 }), null);
});

test("导入页面 JSON：得到一份能过校验的页面", () => {
  const project = createSampleProject();
  const page = project.pages[1];
  const imported = parseImport(serializeDocument(page.doc));
  assert.equal(imported.kind, "page");
  assert.equal(imported.doc.title, page.title);
  assert.deepEqual(validateDocument(imported.doc), []);
});

test("导入项目 JSON：整套来回不变，页面里没有 sets 残留", () => {
  const project = createSampleProject();
  const imported = parseImport(serializeProject(project));
  assert.equal(imported.kind, "project");
  assert.equal(imported.project.pages.length, 3);
  assert.equal(serializeProject(imported.project), serializeProject(project));
  for (const page of imported.project.pages) {
    assert.equal(page.doc.sets, undefined);
  }
});

test("带着脏 sets 的页面导入后仍然打得开", () => {
  const doc = legacyDoc();
  const wrapped = JSON.stringify(doc);
  const imported = parseImport(wrapped);
  assert.equal(imported.kind, "page");
  assert.equal(imported.doc.sets, undefined);
  assert.deepEqual(validateDocument(imported.doc), []);
});
