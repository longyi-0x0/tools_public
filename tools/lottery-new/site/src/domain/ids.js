/**
 * id 生成。
 *
 * 只用来给新建的池、条目、抽奖、轮次发号；不参与抽取，因此不需要可复现。
 */

let counter = 0;

export function makeId(prefix = 'id') {
  counter += 1;
  const rand = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID().slice(0, 8)
    : Math.floor(Math.random() * 0xffffffff).toString(36);
  return `${prefix}-${rand}${counter.toString(36)}`;
}
