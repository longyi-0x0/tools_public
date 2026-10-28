/**
 * 可复现的随机源。
 *
 * 全工具只有这里取随机数，不直接用 Math.random：Round 上记着 seed，
 * 同一个 seed 重放必得同一组结果，撤销、重播与事后核对都靠这一条。
 */

/** 把任意字符串折成 32 位无符号整数，用来把 seed 统一成数字。 */
export function hashSeed(text) {
  let h = 2166136261;
  const s = String(text);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32：小而够用的一支伪随机，返回 [0, 1) 的取数函数。 */
export function createRandom(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed);
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** [0, maxExclusive) 的整数。 */
export function randomInt(rand, maxExclusive) {
  if (maxExclusive <= 0) return -1;
  return Math.floor(rand() * maxExclusive);
}

/**
 * 按权重取一个条目。权重为正才参与，全为非正时返回 null。
 */
export function pickWeighted(entries, rand, weightOf = (entry) => entry.weight ?? 1) {
  let total = 0;
  for (const entry of entries) {
    const w = weightOf(entry);
    if (Number.isFinite(w) && w > 0) total += w;
  }
  if (total <= 0) return null;

  let ticket = rand() * total;
  for (const entry of entries) {
    const w = weightOf(entry);
    if (!Number.isFinite(w) || w <= 0) continue;
    ticket -= w;
    if (ticket < 0) return entry;
  }
  return entries[entries.length - 1] ?? null;
}

/**
 * 取 n 个互不相同的条目，不足时返回能取到的全部。
 * 用在老虎机未中奖的拼接上：库要求各列索引不全相同才算失败。
 */
export function sampleDistinct(entries, rand, n) {
  const rest = [...entries];
  const out = [];
  while (out.length < n && rest.length > 0) {
    out.push(rest.splice(randomInt(rand, rest.length), 1)[0]);
  }
  return out;
}
