import test from "node:test";
import assert from "node:assert/strict";
import {
  createRegistry,
  installDefaultSet,
  installSet,
  registerLocal,
  registerScheme,
} from "../site/js/resolve/registry.js";
import { localLoader } from "../site/js/resolve/registry.js";
import { npmLoader } from "../site/js/resolve/schemes.js";
import { inspectUse, resolveEntry, resolveNode } from "../site/js/resolve/resolve.js";
import { createNode } from "../site/js/core/ast.js";

function buildRegistry() {
  const registry = createRegistry();
  installDefaultSet(registry);
  installSet(registry, {
    id: "ios",
    version: "1.4",
    targets: [{ name: "button", honorsStructure: true, slots: [] }],
  });
  registerLocal(registry, { id: "buy-button", name: "购买按钮", honorsStructure: false });
  registerScheme(registry, "local", localLoader(registry));
  registerScheme(registry, "npm", npmLoader);
  return registry;
}

test("短名在默认集合里命中，并带出该集合的 id", () => {
  const result = resolveNode(buildRegistry(), createNode({ use: ["button"] }), null);
  assert.equal(result.target.setId, "default");
  assert.equal(result.source, "button");
});

test("用户集合排在前面时覆盖默认集合", () => {
  const node = createNode({ use: ["button"] });
  const result = resolveNode(buildRegistry(), node, [{ id: "ios", version: "1.4" }]);
  assert.equal(result.target.setId, "ios");
});

test("default 被显式关掉后，短名解析不到", () => {
  const node = createNode({ use: ["button"] });
  const result = resolveNode(buildRegistry(), node, [{ id: "default", enabled: false }]);
  assert.equal(result.target, null);
});

test("全限定 id 直接找该集合，不看顺序", () => {
  const node = createNode({ use: ["default.button"] });
  const result = resolveNode(buildRegistry(), node, [{ id: "ios", version: "1.4" }]);
  assert.equal(result.target.setId, "default");
});

test("全限定但集合没装会告警，不抛错", () => {
  const node = createNode({ use: ["android.button"] });
  const result = resolveNode(buildRegistry(), node, null);
  assert.equal(result.target, null);
  assert.ok(result.warnings.some((warning) => warning.includes("全部解析不到")));
});

test("全限定到已装集合但名字不存在会告警", () => {
  const node = createNode({ use: ["ios.button.filled"] });
  const result = resolveNode(buildRegistry(), node, [{ id: "ios", version: "1.4" }]);
  assert.equal(result.target, null);
  assert.ok(result.warnings.some((warning) => warning.includes("ios")));
});

test("local: 命中本地注册的组件", () => {
  const node = createNode({ use: ["local:buy-button", "button"] });
  const result = resolveNode(buildRegistry(), node, null);
  assert.equal(result.target.id, "buy-button");
  assert.equal(result.target.honorsStructure, false);
});

test("local: 未注册只告警，候选链继续往下走", () => {
  const node = createNode({ use: ["local:missing", "button"] });
  const result = resolveNode(buildRegistry(), node, null);
  assert.equal(result.target.setId, "default");
  assert.ok(result.warnings.some((warning) => warning.includes("local")));
});

test("npm: 明确不支持，被记成告警而不是异常", () => {
  const warnings = [];
  assert.equal(resolveEntry(buildRegistry(), null, "npm:@acme/ui#Button", warnings), null);
  assert.ok(warnings[0].includes("npm"));
});

test("未知 scheme 告警并跳过", () => {
  const warnings = [];
  assert.equal(resolveEntry(buildRegistry(), null, "chrome://x", warnings), null);
  assert.ok(warnings[0].includes("不认识的 scheme"));
});

test("props 合并：节点是底座，候选条目覆盖同名键", () => {
  const node = createNode({
    props: { label: "底座", disabled: true },
    use: [{ src: "button", props: { label: "覆盖" } }],
  });
  const result = resolveNode(buildRegistry(), node, null);
  assert.deepEqual(result.props, { label: "覆盖", disabled: true });
});

test("inspectUse 逐条报告命中情况", () => {
  const node = createNode({ use: ["local:missing", "local:buy-button", "button"] });
  const rows = inspectUse(buildRegistry(), node, null);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].target, null);
  assert.equal(rows[1].target.id, "buy-button");
  assert.equal(rows[2].target.setId, "default");
});
