/**
 * 固定的 key 顺序和两格缩进。运行时值永远不写进来，导出的文件只随内容变化。
 */
export function stableStringify(value, space = 2) {
  return JSON.stringify(sortValue(value), null, space);
}

export function serializeDocument(doc) {
  return `${stableStringify(doc)}\n`;
}

export function parseDocument(text) {
  return JSON.parse(text);
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      result[key] = sortValue(value[key]);
    }
    return result;
  }
  return value;
}
