import test from "node:test";
import assert from "node:assert/strict";
import { migrateDocument, needsMigration } from "../site/js/core/migrate.js";
import { validateDocument } from "../site/js/core/validate.js";
import { serializeDocument } from "../site/js/core/serialize.js";

function v1Sample() {
  return {
    schemaVersion: 1,
    id: "p1",
    title: "旧页面",
    root: "nRoot",
    nodes: {
      nRoot: {
        id: "nRoot",
        type: "container",
        layout: "column",
        gap: "md",
        align: "fill",
        distribute: "start",
      },
      nNav: {
        id: "nNav",
        type: "pattern",
        pattern: "navbar",
        parent: "nRoot",
        pos: "a",
        props: { title: "标题" },
      },
      nBell: {
        id: "nBell",
        type: "leaf",
        shape: "button",
        label: "消息",
        parent: "nNav",
        slot: "right",
        pos: "a",
      },
      nCard: {
        id: "nCard",
        type: "leaf",
        shape: "placeholder",
        label: "卡片",
        parent: "nRoot",
        pos: "b",
        binding: { component: "product-card", props: { name: "通勤包" } },
      },
      nFab: {
        id: "nFab",
        type: "leaf",
        shape: "button",
        label: "加购",
        parent: "nRoot",
        pos: "c",
        escape: { anchor: "br", inset: { x: "md", y: "md" } },
        size: { w: 58, h: 58 },
      },
      nFree: {
        id: "nFree",
        type: "container",
        layout: "free",
        gap: "sm",
        parent: "nRoot",
        pos: "d",
      },
      nAbs: {
        id: "nAbs",
        type: "leaf",
        shape: "text",
        label: "绝对定位",
        parent: "nFree",
        pos: "a",
        frame: { x: 4, y: 5, w: 60, h: 20 },
      },
    },
  };
}

test("v1 能被识别为需要迁移", () => {
  assert.equal(needsMigration(v1Sample()), true);
});

test("迁移后节点数一致，且不再有类型字段", () => {
  const migrated = migrateDocument(v1Sample());
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(Object.keys(migrated.nodes).length, Object.keys(v1Sample().nodes).length);
  for (const node of Object.values(migrated.nodes)) {
    assert.equal("type" in node, false);
    assert.equal("shape" in node, false);
    assert.equal("pattern" in node, false);
    assert.equal("binding" in node, false);
  }
  assert.deepEqual(validateDocument(migrated), []);
});

test("容器把布局参数收进 layoutProps", () => {
  const { nRoot, nFree } = migrateDocument(v1Sample()).nodes;
  assert.equal(nRoot.layout, "column");
  assert.deepEqual(nRoot.layoutProps, { gap: "md", align: "fill", distribute: "start" });
  assert.deepEqual(nFree.layoutProps, { gap: "sm" });
});

test("结构件变成语义名加槽位声明", () => {
  const nav = migrateDocument(v1Sample()).nodes.nNav;
  assert.deepEqual(nav.use, ["navbar"]);
  assert.deepEqual(nav.slots, ["left", "right"]);
  assert.deepEqual(nav.props, { title: "标题" });
});

test("元素把 label 拆成 props 与 desc", () => {
  const bell = migrateDocument(v1Sample()).nodes.nBell;
  assert.deepEqual(bell.use, ["button"]);
  assert.deepEqual(bell.props, { label: "消息" });
  assert.equal(bell.desc, "消息");
  assert.equal(bell.slot, "right");
});

test("绑定的组件成为候选链首位，props 合并进节点", () => {
  const card = migrateDocument(v1Sample()).nodes.nCard;
  assert.deepEqual(card.use, ["local:product-card", "placeholder"]);
  assert.deepEqual(card.props, { label: "卡片", name: "通勤包" });
  assert.equal(card.desc, "卡片");
});

test("escape 变成锚点定位，尺寸并入 size", () => {
  const fab = migrateDocument(v1Sample()).nodes.nFab;
  assert.deepEqual(fab.position, { mode: "anchor", anchor: "br", inset: { x: "md", y: "md" } });
  assert.deepEqual(fab.size, { width: 58, height: 58 });
});

test("frame 变成绝对定位，宽高同时进 size", () => {
  const abs = migrateDocument(v1Sample()).nodes.nAbs;
  assert.deepEqual(abs.position, { mode: "absolute", x: 4, y: 5, w: 60, h: 20 });
  assert.deepEqual(abs.size, { width: 60, height: 20 });
});

test("迁移是幂等的，v2 输入原样返回", () => {
  const once = migrateDocument(v1Sample());
  const twice = migrateDocument(once);
  assert.equal(twice, once);
  assert.equal(serializeDocument(twice), serializeDocument(once));
  assert.equal(migrateDocument(twice), twice);
});

test("不认识的 schemaVersion 直接报错", () => {
  assert.throws(() => migrateDocument({ schemaVersion: 9, nodes: {}, root: "x" }), /不认识的/);
});
