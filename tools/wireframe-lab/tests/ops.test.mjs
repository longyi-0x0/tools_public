import test from "node:test";
import assert from "node:assert/strict";
import {
  childrenOf,
  createContainer,
  createDocument,
  createLeaf,
  createPattern,
} from "../site/js/core/ast.js";
import {
  applySnapshot,
  bindNode,
  cloneDocument,
  insertNode,
  moveNode,
  removeNode,
  setLayout,
  snapshotDiff,
} from "../site/js/core/ops.js";
import { validateDocument } from "../site/js/core/validate.js";
import { createSampleDocument } from "../site/js/sample.js";

test("示例文档通过校验", () => {
  assert.deepEqual(validateDocument(createSampleDocument()), []);
});

test("插入与同级排序只改新节点的 parent 和 pos", () => {
  const doc = createDocument();
  const first = createLeaf("text");
  const second = createLeaf("button");
  insertNode(doc, doc.root, first);
  insertNode(doc, doc.root, second, { index: 0 });
  assert.deepEqual(
    childrenOf(doc, doc.root).map((node) => node.id),
    [second.id, first.id],
  );
  assert.ok(doc.nodes[second.id].pos < doc.nodes[first.id].pos);
  assert.equal(doc.nodes[first.id].parent, doc.root);
});

test("跨容器移动保留子树，并拒绝拖进自己的后代", () => {
  const doc = createDocument();
  const left = createContainer("column");
  const right = createContainer("column");
  insertNode(doc, doc.root, left);
  insertNode(doc, doc.root, right);
  const leaf = createLeaf("text");
  insertNode(doc, left.id, leaf);

  moveNode(doc, leaf.id, right.id);
  assert.equal(doc.nodes[leaf.id].parent, right.id);
  assert.equal(childrenOf(doc, left.id).length, 0);
  assert.equal(childrenOf(doc, right.id).length, 1);
  assert.throws(() => moveNode(doc, left.id, left.id), /自己的子树/);

  const inner = createContainer("row");
  insertNode(doc, left.id, inner);
  assert.throws(() => moveNode(doc, left.id, inner.id), /自己的子树/);
});

test("删除容器会把整棵子树一起删掉", () => {
  const doc = createDocument();
  const group = createContainer("row");
  insertNode(doc, doc.root, group);
  const leaf = createLeaf("text");
  insertNode(doc, group.id, leaf);
  const removed = removeNode(doc, group.id);
  assert.deepEqual(new Set(removed), new Set([group.id, leaf.id]));
  assert.equal(doc.nodes[group.id], undefined);
  assert.equal(doc.nodes[leaf.id], undefined);
});

test("切到自由布局会物化 frame，切回时清掉", () => {
  const doc = createDocument();
  const a = createLeaf("button");
  const b = createLeaf("text");
  insertNode(doc, doc.root, a);
  insertNode(doc, doc.root, b);
  setLayout(doc, doc.root, "free", {
    [a.id]: { x: 10, y: 20, w: 100, h: 40 },
    [b.id]: { x: 30, y: 80, w: 120, h: 24 },
  });
  assert.equal(doc.nodes[a.id].frame.x, 10);
  assert.deepEqual(validateDocument(doc), []);
  setLayout(doc, doc.root, "column");
  assert.equal("frame" in doc.nodes[a.id], false);
  assert.deepEqual(validateDocument(doc), []);
});

test("结构件只接受具名槽位，容量由校验器拦住", () => {
  const doc = createDocument();
  const nav = createPattern("navbar");
  insertNode(doc, doc.root, nav);
  assert.throws(() => insertNode(doc, nav.id, createLeaf("button")), /具名槽位/);
  const first = createLeaf("button");
  const second = createLeaf("text");
  insertNode(doc, nav.id, first, { slot: "right" });
  insertNode(doc, nav.id, second, { slot: "right" });
  assert.ok(validateDocument(doc).some((error) => error.includes("最多 1 个")));
});

test("绑定组件不改变节点位置与类型", () => {
  const doc = createDocument();
  const leaf = createLeaf("button");
  insertNode(doc, doc.root, leaf);
  const pos = doc.nodes[leaf.id].pos;
  bindNode(doc, leaf.id, "buy-button", { label: "购买" });
  assert.equal(doc.nodes[leaf.id].pos, pos);
  assert.equal(doc.nodes[leaf.id].type, "leaf");
  assert.equal(doc.nodes[leaf.id].binding.component, "buy-button");
});

test("快照 diff 只记录变化节点，撤销与重做可往返", () => {
  const original = createDocument();
  const after = cloneDocument(original);
  const leaf = createLeaf("text");
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
