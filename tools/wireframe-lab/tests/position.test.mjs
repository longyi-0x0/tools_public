import test from "node:test";
import assert from "node:assert/strict";
import {
  positionAfter,
  positionBetween,
  sortByPosition,
} from "../site/js/core/position.js";

test("首个位置键稳定，之后可以持续在末尾插入", () => {
  const keys = [positionBetween(null, null)];
  assert.equal(keys[0], "V");
  for (let index = 0; index < 300; index += 1) {
    keys.push(positionAfter(keys.at(-1)));
  }
  const sorted = [...keys].sort();
  assert.deepEqual(keys, sorted);
  assert.equal(new Set(keys).size, keys.length);
});

test("可以持续在开头插入", () => {
  const keys = ["V"];
  for (let index = 0; index < 300; index += 1) {
    keys.unshift(positionBetween(null, keys[0]));
  }
  const sorted = [...keys].sort();
  assert.deepEqual(keys, sorted);
  assert.equal(new Set(keys).size, keys.length);
});

test("任意两个键之间都能插入，并且顺序稳定", () => {
  const keys = ["a", "b"];
  let seed = 17;
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  for (let index = 0; index < 500; index += 1) {
    const at = Math.floor(random() * (keys.length + 1));
    const left = at === 0 ? null : keys[at - 1];
    const right = at === keys.length ? null : keys[at];
    keys.splice(at, 0, positionBetween(left, right));
  }

  assert.deepEqual(keys, [...keys].sort());
  assert.equal(new Set(keys).size, keys.length);
});

test("重复位置的节点按 id 得到确定顺序", () => {
  const family = [
    { id: "nb", pos: "a" },
    { id: "na", pos: "a" },
    { id: "nc", pos: "b" },
  ];
  assert.deepEqual(
    family.sort(sortByPosition).map((node) => node.id),
    ["na", "nb", "nc"],
  );
});

test("非法区间直接报错，不静默生成错位键", () => {
  assert.throws(() => positionBetween("b", "a"));
  assert.throws(() => positionBetween("a", "a"));
});
