import test from "node:test";
import assert from "node:assert/strict";
import { createDocument, createNode } from "../site/js/core/ast.js";
import { stableStringify } from "../site/js/core/serialize.js";
import { validateDocument } from "../site/js/core/validate.js";
import {
  PROJECT_SCHEMA_VERSION,
  absorbPageSets,
  addPage,
  clonePage,
  createPage,
  createProject,
  movePage,
  normalizeSets,
  pageIndexOf,
  removePage,
  renamePage,
  renameProject,
  validateProject,
} from "../site/js/core/project.js";
import { createSampleProject } from "../site/js/sample-project.js";

test("新建项目自带一页，组件集缺省就是内置 default", () => {
  const project = createProject({ name: "好物铺" });
  assert.equal(project.schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.equal(project.pages.length, 1);
  assert.deepEqual(project.sets, [{ id: "default", version: "1" }]);
  assert.deepEqual(validateProject(project), []);
  assert.deepEqual(validateDocument(project.pages[0].doc), []);
});

test("组件集归一：脏条目丢掉，重复 id 只留第一条", () => {
  assert.deepEqual(normalizeSets(null), [{ id: "default", version: "1" }]);
  assert.deepEqual(
    normalizeSets([{ id: "ios", version: "1.4" }, { id: "ios", version: "2" }, { junk: true }]),
    [{ id: "ios", version: "1.4" }],
  );
});

test("加页、改名、复制、移动都在项目上，页面顺序跟着动", () => {
  const project = createProject({ name: "P" });
  const second = addPage(project, createPage({ title: "第二页" }));
  assert.deepEqual(project.pages.map((page) => page.title), ["首页", "第二页"]);

  renamePage(project, second.id, "详情页");
  assert.equal(second.doc.title, "详情页");

  const copy = clonePage(project, second.id);
  assert.equal(copy.title, "详情页 副本");
  assert.notEqual(copy.doc.id, second.doc.id);
  assert.deepEqual(project.pages.map((page) => page.title), ["首页", "详情页", "详情页 副本"]);

  movePage(project, copy.id, 0);
  assert.equal(pageIndexOf(project, copy.id), 0);
});

test("删到最后一页会被挡住", () => {
  const project = createProject({ name: "P" });
  assert.throws(() => removePage(project, project.pages[0].id), /至少要留一页/);
  addPage(project, createPage({ title: "第二页" }));
  removePage(project, project.pages[0].id);
  assert.equal(project.pages.length, 1);
});

test("项目改名后索引摘要跟着走", () => {
  const project = createProject({ name: "旧名" });
  renameProject(project, "新名");
  assert.equal(project.name, "新名");
  assert.deepEqual(validateProject(project), []);
});

test("页面还带着 sets 时并进项目，页面字段随即删除", () => {
  const project = createProject({ name: "P" });
  const doc = createDocument();
  const node = createNode({ use: ["text"] });
  doc.nodes[node.id] = node;
  node.parent = doc.root;
  node.pos = "a";
  doc.sets = [{ id: "ios", version: "1.4" }];

  assert.equal(absorbPageSets(project, doc), 1);
  assert.equal(doc.sets, undefined);
  assert.deepEqual(project.sets.map((entry) => entry.id), ["default", "ios"]);
  assert.deepEqual(validateDocument(doc), []);
});

test("组件集上移后，页面带 sets 会被校验拒绝", () => {
  const doc = createDocument();
  doc.sets = [{ id: "default", version: "1" }];
  assert.ok(validateDocument(doc).some((error) => error.includes("组件集属于项目")));
});

test("项目校验：缺名称、没有页、页面 id 重复都算错", () => {
  const empty = createProject({ name: "P" });
  empty.pages = [];
  assert.ok(validateProject(empty).some((error) => error.includes("至少有一页")));

  const noName = createProject({ name: "P" });
  noName.name = "  ";
  assert.ok(validateProject(noName).some((error) => error.includes("缺少名称")));

  const dup = createProject({ name: "P" });
  dup.pages.push({ ...dup.pages[0] });
  assert.ok(validateProject(dup).some((error) => error.includes("重复")));
});

test("示例项目三页，组件集只在项目上，每页都过结构校验", () => {
  const project = createSampleProject();
  assert.deepEqual(project.pages.map((page) => page.title), ["商品列表", "商品详情", "购物车"]);
  assert.deepEqual(validateProject(project), []);
  for (const page of project.pages) {
    assert.deepEqual(validateDocument(page.doc), []);
    assert.equal(page.doc.sets, undefined);
  }
});

test("项目序列化固定 key 顺序，往返不变", () => {
  const project = createSampleProject();
  const text = stableStringify(project);
  assert.equal(stableStringify(JSON.parse(text)), text);
});
