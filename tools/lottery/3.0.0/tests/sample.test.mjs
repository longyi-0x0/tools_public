import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSample } from '../site/src/domain/sample.js';
import { createRandom } from '../site/src/random.js';

function entriesOf(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `e${i}` }));
}

test('样本容量不超过 capacity', () => {
  const rand = createRandom('s1');
  const sample = buildSample({ entries: entriesOf(50), include: [], capacity: 8, rand });
  assert.equal(sample.length, 8);
  assert.equal(new Set(sample.map((e) => e.id)).size, 8);
});

test('已定结果必在样本内', () => {
  const entries = entriesOf(200);
  for (let i = 0; i < 30; i += 1) {
    const rand = createRandom(`s${i}`);
    const hit = entries[137];
    const sample = buildSample({ entries, include: [hit], capacity: 12, rand });
    assert.ok(sample.some((e) => e.id === hit.id), '命中条目必须出现在盘面上');
  }
});

test('容量小于结果数时以结果为准，不丢结果', () => {
  const rand = createRandom('s2');
  const entries = entriesOf(10);
  const sample = buildSample({ entries, include: [entries[1], entries[2], entries[3]], capacity: 2, rand });
  assert.deepEqual(sample.map((e) => e.id).sort(), ['e1', 'e2', 'e3']);
});

test('候选不足时返回能取到的全部，不重复', () => {
  const rand = createRandom('s3');
  const sample = buildSample({ entries: entriesOf(3), include: [], capacity: 10, rand });
  assert.equal(sample.length, 3);
  assert.equal(new Set(sample.map((e) => e.id)).size, 3);
});
