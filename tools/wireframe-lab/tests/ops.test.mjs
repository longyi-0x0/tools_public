import test from "node:test";
import assert from "node:assert/strict";
import { childrenOf, createDocument, createNode } from "../site/js/core/ast.js";
import {
  applySnapshot,
  cloneDocument,
  insertNode,
  moveNode,
  removeNode,
  setLayout,
  setPosition,
  setSize,
  setUse,
  snapshotDiff,
} from "../site/js/core/ops.js";
import { validateDocument } from "../site/js/core/validate.js";
import { createSampleDocument } from "../site/js/sample.js";

test("示例文档通过校验", () => {
  assert.deepEqual(validateDocument(createSampleDocument()), []);
});

test("插入与同级排序只改新节点的 parent 和 pos", () => {
  const doc = createDocument();
  const first = createNode({ use: ["text"] });
  const second = createNode({ use: ["button"] });
  insertNode(doc, doc.root, first);
  insertNode(doc, doc.root, second, { index: 0 });
  assert.deepEqual(
    childrenOf(doc, doc.root).map((node) => node.id),
    [second.id, first.id],
  );
  assert.ok(doc.nodes[second.id].pos < doc.nodes[first.id].pos);
  assert.equal(doc.nodes[first.id].parent, doc.root);
});

test("任何节点都能装子节点，元素也不例外", () => {
  const doc = createDocument();
  const button = createNode({ use: ["button"], props: { label: "带图标" } });
  insertNode(doc, doc.root, button);
  const icon = createNode({ use: ["text"], props: { content: "★" } });
  insertNode(doc, button.id, icon);
  assert.equal(doc.nodes[icon.id].parent, button.id);
  assert.deepEqual(validateDocument(doc), []);
});

test("跨容器移动保留子树，并拒绝拖进自己的后代", () => {
  const doc = createDocument();
  const left = createNode({ layout: "column", layoutProps: { gap: "md", align: "start", distribute: "start" } });
  const right = createNode({ layout: "column", layoutProps: { gap: "md", align: "start", distribute: "start" } });
  insertNode(doc, doc.root, left);
  insertNode(doc, doc.root, right);
  const leaf = createNode({ use: ["text"] });
  insertNode(doc, left.id, leaf);

  moveNode(doc, leaf.id, right.id);
  assert.equal(doc.nodes[leaf.id].parent, right.id);
  assert.equal(childrenOf(doc, left.id).length, 0);
  assert.equal(childrenOf(doc, right.id).length, 1);
  assert.throws(() => moveNode(doc, left.id, left.id), /自己的子树/);

  const inner = createNode({ layout: "row", layoutProps: { gap: "md", align: "start", distribute: "start" } });
  insertNode(doc, left.id, inner);
  assert.throws(() => moveNode(doc, left.id, inner.id), /自己的子树/);
});

test("删除节点会把整棵子树一起删掉", () => {
  const doc = createDocument();
  const group = createNode({ layout: "row", layoutProps: { gap: "md", align: "start", distribute: "start" } });
  insertNode(doc, doc.root, group);
  const leaf = createNode({ use: ["text"] });
  insertNode(doc, group.id, leaf);
  const removed = removeNode(doc, group.id);
  assert.deepEqual(new Set(removed), new Set([group.id, leaf.id]));
  assert.equal(doc.nodes[group.id], undefined);
  assert.equal(doc.nodes[leaf.id], undefined);
});

test("切到自由布局物化绝对定位，切回流体布局清掉", () => {
  const doc = createDocument();
  const a = createNode({ use: ["button"] });
  const b = createNode({ use: ["text"] });
  insertNode(doc, doc.root, a);
  insertNode(doc, doc.root, b);
  setLayout(doc, doc.root, "free", {
    [a.id]: { x: 10, y: 20, w: 100, h: 40 },
    [b.id]: { x: 30, y: 80, w: 120, h: 24 },
  });
  assert.deepEqual(doc.nodes[a.id].position, { mode: "absolute", x: 10, y: 20, w: 100, h: 40 });
  assert.deepEqual(validateDocument(doc), []);
  setLayout(doc, doc.root, "column");
  assert.equal("position" in doc.nodes[a.id], false);
  assert.deepEqual(validateDocument(doc), []);
});

test("切布局会丢掉不属于新布局的参数", () => {
  const doc = createDocument();
  setLayout(doc, doc.root, "grid");
  assert.equal(doc.nodes[doc.root].layoutProps.columns, 2);
  assert.equal("distribute" in doc.nodes[doc.root].layoutProps, false);
  assert.deepEqual(validateDocument(doc), []);
});

test("具名槽位：父节点没声明就拒绝落子", () => {
  const doc = createDocument();
  const card = createNode({ use: ["navbar"], slots: ["left", "right"] });
  insertNode(doc, doc.root, card);
  assert.throws(() => insertNode(doc, card.id, createNode({ use: ["text"] }), { slot: "content" }), /没有槽位/);
  insertNode(doc, card.id, createNode({ use: ["button"] }), { slot: "right" });
  insertNode(doc, card.id, createNode({ use: ["text"] }), { slot: "right" });
  assert.equal(childrenOf(doc, card.id, "right").length, 2);
  assert.deepEqual(validateDocument(doc), []);
});

test("改候选链不改变位置，也不留类型字段", () => {
  const doc = createDocument();
  const node = createNode({ use: ["button"] });
  insertNode(doc, doc.root, node);
  const pos = doc.nodes[node.id].pos;
  setUse(doc, node.id, ["local:buy-button", "button"]);
  assert.equal(doc.nodes[node.id].pos, pos);
  assert.equal("type" in doc.nodes[node.id], false);
  assert.deepEqual(doc.nodes[node.id].use, ["local:buy-button", "button"]);
  assert.deepEqual(validateDocument(doc), []);
});

test("锚点定位与尺寸可以同时存在，根节点不行", () => {
  const doc = createDocument();
  const node = createNode({ use: ["button"] });
  insertNode(doc, doc.root, node);
  setPosition(doc, node.id, { mode: "anchor", anchor: "br", inset: { x: "md", y: "md" } });
  setSize(doc, node.id, { width: 58, height: 58 });
  assert.equal(doc.nodes[node.id].size.width, 58);
  assert.deepEqual(validateDocument(doc), []);
  assert.throws(() => setPosition(doc, doc.root, { mode: "anchor", anchor: "c" }), /不能改定位/);
});

test("快照 diff 只记录变化节点，撤销与重做可往返", () => {
  const original = createDocument();
  const after = cloneDocument(original);
  const leaf = createNode({ use: ["text"] });
  insertNode(after, after.root, leaf);
  const diff = snapshotDiff(original, after);
  assert.ok(diff);
  assert.deepEqual(Object.keys(diff.before.nodes), [leaf.id]);

  const undone = applySnapshot(cloneDocument(after), diff.before);
  assert.equal(undone.nodes[leaf.id], undefined);
  assert.equal(JSON.stringify(undone), JSON.stringify(original));

  const redone = applySnapshot(cloneDocument(undone), diff.after);
  assert.equal(redone.nodes[leaf.id].id, leaf.id);
});
