/**
 * id 生成与条目身份。
 *
 * 条目 id 有两种来路：导入的取外部主键 `(source, extKey)`，手工新建的才发随机号。
 * 导入必须走外部主键——同一份名单导两次是更新，不是新建两份，历史占额才不断。
 */

let counter = 0;

export function makeId(prefix = 'id') {
  counter += 1;
  const rand = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID().slice(0, 8)
    : Math.floor(Math.random() * 0xffffffff).toString(36);
  return `${prefix}-${rand}${counter.toString(36)}`;
}

/** 外部主键折成 id。跨池「是同一个人」的判据就是它。 */
export function entryKey(source, extKey) {
  return `${source}/${extKey}`;
}
