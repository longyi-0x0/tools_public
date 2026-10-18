/** 舞台之间共用的一点点东西。每个舞台都只认 `begin` / `reveal` / `reset` / `destroy` 四个方法。 */

/** 建一个带类名、可选文字的节点。 */
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

/** 从候选标签里随机取若干个，不重复；不够时循环补齐。 */
export function sampleLabels(labels, count, random = Math.random) {
  if (labels.length === 0) {
    return [];
  }
  const pool = labels.slice();
  const picked = [];
  while (picked.length < count) {
    if (pool.length === 0) {
      pool.push(...labels);
    }
    const at = Math.floor(Math.min(0.999999, Math.max(0, random())) * pool.length);
    picked.push(pool.splice(at, 1)[0]);
  }
  return picked;
}
