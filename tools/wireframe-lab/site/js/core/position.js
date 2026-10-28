/**
 * 分数位置键。所有顺序都存成字符串，任意两个已有键之间还能再插一个。
 * 字符表按 UTF-16 顺序排列，所以字符串比较就是键的大小比较。
 */
const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const MID = "V";

export function positionBetween(after, before) {
  if (after != null && before != null && after >= before) {
    throw new Error(`位置键顺序不成立：${after} >= ${before}`);
  }
  if (after == null && before == null) return MID;
  if (after == null) return keyBefore(before);
  if (before == null) return keyAfter(after);

  let prefix = "";
  let index = 0;
  while (
    index < after.length &&
    index < before.length &&
    after[index] === before[index]
  ) {
    prefix += after[index];
    index += 1;
  }

  const low = index < after.length ? DIGITS.indexOf(after[index]) : -1;
  const high = index < before.length ? DIGITS.indexOf(before[index]) : DIGITS.length;

  if (high - low > 1) {
    const middle = (low + high) >> 1;
    if (middle === 0) {
      // 不生成以 0 结尾的键，给“比自己更小”的操作留空间。
      return prefix + DIGITS[0] + MID;
    }
    return prefix + DIGITS[middle];
  }

  if (low === -1) {
    // after 是 before 的前缀。补一位 0 再往 before 的剩余部分之前找。
    const rest = before.slice(index + 1);
    return prefix + DIGITS[0] + (rest ? keyBefore(rest) : "");
  }

  // 两位相邻，沿低位那一支往下延伸，结果一定落在两者之间。
  return prefix + after[index] + keyAfter(after.slice(index + 1));
}

export function positionAfter(last) {
  return last == null ? MID : keyAfter(last);
}

function keyAfter(value) {
  return `${value}${MID}`;
}

function keyBefore(value) {
  if (!value) return MID;
  const first = DIGITS.indexOf(value[0]);
  if (first > 0) {
    const middle = first >> 1;
    // 单个 0 比任何非空键都小，没法再接在它前面；带一位 V 才留出继续插的空隙。
    return middle === 0 ? `${DIGITS[0]}${MID}` : DIGITS[middle];
  }
  const rest = value.slice(1);
  return DIGITS[0] + (rest ? keyBefore(rest) : MID);
}

export function sortByPosition(left, right) {
  if (left.pos < right.pos) return -1;
  if (left.pos > right.pos) return 1;
  return left.id.localeCompare(right.id);
}
