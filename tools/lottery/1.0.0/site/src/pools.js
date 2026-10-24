/**
 * 池与条目：人、奖品、通用条目都是同一种东西。
 *
 * 条目只有五个字段：名字、数量、权重、图片、`meta`。`capacity` 是这一条能被抽中
 * 几次 —— 奖品 5 个名额就是 `5`，人是 `1`（人手一条，所以默认就是 1），
 * 不限量（放回抽样、无限量奖品）是 `null`：JSON 存不下 Infinity，用 null 记。
 *
 * `kind` **只在编辑时有用**：决定「添加一条」时问哪几个字段（人问部门与工号，
 * 奖品问等级），以及新条目的默认数量。引擎、抽法、槽、绑定一概不看它 ——
 * 运行时只有 `capacity` 说话，所以名单池绑到奖项槽上也照样能抽。
 * 池在抽奖里担什么角色，是绑定（`lottery.slots`）的事，不是池自己的属性。
 */

export const KINDS = ['people', 'prizes', 'items'];

export const KIND_LABELS = { people: '人', prizes: '奖品', items: '条目' };

export const KIND_NAMES = { people: '名单', prizes: '奖品', items: '条目' };

const ID_PREFIX = { people: 'p', prizes: 'a', items: 'i' };

export function kindOf(value) {
  return KINDS.includes(value) ? value : 'items';
}

export function cleanText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text === '' ? fallback : text;
}

/** `null` 表示不限；其余收成正整数。 */
export function cleanCapacity(value) {
  if (value === null || value === Infinity) {
    return null;
  }
  if (value === undefined) {
    return 1;
  }
  const count = Math.floor(Number(value));
  return Number.isFinite(count) && count > 0 ? count : 1;
}

/** 读回容量：`null` 当无尽大，其余至少 1。 */
export function capacityOf(entry) {
  return entry?.capacity === null ? Infinity : Math.max(1, Math.floor(Number(entry?.capacity ?? 1)));
}

/** 按 `kind` 留字段：这是编辑表单的形状，不是运行时类型。 */
function cleanMeta(meta, kind) {
  const source = meta !== null && typeof meta === 'object' ? meta : {};
  if (kind === 'people') {
    return { dept: cleanText(source.dept), employeeId: cleanText(source.employeeId) };
  }
  if (kind === 'prizes') {
    return { level: cleanText(source.level) };
  }
  return {};
}

/** 一条候选；没名字的返回 null，由调用方滤掉。 */
export function cleanEntry(entry, index, kind = 'items') {
  const name = cleanText(entry?.name);
  if (name === '') {
    return null;
  }
  const type = kindOf(kind);
  const weight = Number(entry?.weight);
  return {
    id: cleanText(entry?.id, `${ID_PREFIX[type]}${index + 1}`),
    name,
    weight: Number.isFinite(weight) && weight > 0 ? weight : 1,
    capacity: cleanCapacity(entry?.capacity),
    /** 图片：先留字段，界面与 xlsx 都还不用，导入导出时原样带着。 */
    image: cleanText(entry?.image),
    meta: cleanMeta(entry?.meta, type),
  };
}

export function cleanEntries(entries, kind = 'items') {
  return (Array.isArray(entries) ? entries : [])
    .map((entry, index) => cleanEntry(entry, index, kind))
    .filter((entry) => entry !== null);
}

/** 一份池。字段固定五个，没有 `role`。 */
export function cleanPool(pool, index) {
  const kind = kindOf(pool?.kind);
  return {
    id: cleanText(pool?.id, `k${index + 1}`),
    name: cleanText(pool?.name, `${KIND_NAMES[kind]} ${index + 1}`),
    kind,
    entries: cleanEntries(pool?.entries, kind),
    updatedAt: Number.isFinite(Number(pool?.updatedAt)) ? Number(pool.updatedAt) : Date.now(),
  };
}

/** 池的条数、名额总数，以及有没有不限量的条目。 */
export function poolSummary(pool) {
  const entries = pool?.entries ?? [];
  let slots = 0;
  let unlimited = false;
  for (const entry of entries) {
    const capacity = capacityOf(entry);
    if (capacity === Infinity) {
      unlimited = true;
    } else {
      slots += capacity;
    }
  }
  return { entries: entries.length, slots, unlimited };
}

/** 池里下一个可用的条目 id：同前缀里最大的编号 + 1。 */
export function nextEntryId(pool) {
  const prefix = ID_PREFIX[kindOf(pool?.kind)];
  let max = 0;
  for (const entry of pool?.entries ?? []) {
    const matched = new RegExp(`^${prefix}(\\d+)$`).exec(String(entry.id ?? ''));
    if (matched !== null) {
      max = Math.max(max, Number(matched[1]));
    }
  }
  return `${prefix}${max + 1}`;
}
