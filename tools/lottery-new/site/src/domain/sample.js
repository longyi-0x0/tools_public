/**
 * 展示取样。
 *
 * 转盘画不下三百个扇区，所以大池只展示一部分。取样只影响"你看到什么"，
 * 概率仍在全体候选上算；已定的结果必须在样本内，否则会演出一个没出现在
 * 盘面上的名字。
 */

import { sampleDistinct, randomInt } from '../random.js';

/**
 * 取展示样本：include 里的条目必在，其余从 entries 随机补齐到 capacity，最后打乱顺序。
 * capacity 小于 include 长度时以 include 为准，宁可挤也不丢结果。
 */
export function buildSample({ entries = [], include = [], capacity = 8, rand }) {
  const must = include.filter(Boolean);
  const mustIds = new Set(must.map((entry) => entry.id));
  const rest = entries.filter((entry) => !mustIds.has(entry.id));

  const need = Math.max(0, capacity - must.length);
  const filler = sampleDistinct(rest, rand, need);
  const all = [...must, ...filler];

  for (let i = all.length - 1; i > 0; i -= 1) {
    const j = randomInt(rand, i + 1);
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}
