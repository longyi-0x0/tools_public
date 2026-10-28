import {
  DEFAULT_SET_ID,
  GAP_TOKENS,
  LAYOUT_PARAM_KEYS,
  SIZE_BOUND_KEYS,
  SIZE_KEYWORDS,
  SIZE_LENGTH_KEYS,
} from "./constants.js";

const PERCENT = /^(\d+(?:\.\d+)?)%$/;

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * 串里含冒号就是句柄，交给 scheme loader；不含就是 id，交给组件集解析。
 * 一句规则，不留第二种判别方式。
 */
export function isHandle(src) {
  return typeof src === "string" && src.includes(":");
}

export function splitHandle(src) {
  const at = src.indexOf(":");
  return { scheme: src.slice(0, at), rest: src.slice(at + 1) };
}

export function splitId(src) {
  const parts = String(src).split(".");
  return { setId: parts[0], path: parts.slice(1), segments: parts };
}

/** 全限定 id 的首段命中已安装集合时按精确匹配处理。 */
export function isQualifiedId(src, installedSetIds) {
  if (isHandle(src) || typeof src !== "string") return false;
  const { setId, segments } = splitId(src);
  return segments.length > 1 && installedSetIds.has(setId);
}

export function normalizeUseEntry(entry) {
  if (typeof entry === "string") {
    const src = entry.trim();
    return src ? { src, props: null } : null;
  }
  if (isPlainObject(entry)) {
    const src = typeof entry.src === "string" ? entry.src.trim() : "";
    if (!src) return null;
    return { src, props: isPlainObject(entry.props) ? entry.props : null };
  }
  return null;
}

export function normalizeUse(use) {
  if (use == null) return [];
  const list = Array.isArray(use) ? use : [use];
  return list.map(normalizeUseEntry).filter(Boolean);
}

/** 合并规则同 JSX 展开：节点 props 是底座，候选条目覆盖同名键。 */
export function mergeProps(base, override) {
  return { ...(isPlainObject(base) ? base : {}), ...(isPlainObject(override) ? override : {}) };
}

export function parseLength(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? { kind: "px", value } : { kind: "invalid" };
  }
  if (typeof value !== "string") return { kind: "invalid" };
  if (SIZE_KEYWORDS.includes(value)) return { kind: value };
  const percent = PERCENT.exec(value.trim());
  if (percent) return { kind: "percent", value: Number(percent[1]) };
  return { kind: "invalid" };
}

export function parseAspect(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value === "string") {
    const match = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(value.trim());
    if (match) {
      const w = Number(match[1]);
      const h = Number(match[2]);
      return w > 0 && h > 0 ? w / h : null;
    }
  }
  return null;
}

/** 只保留已知键；越界或无法解析的值原样留着让校验器报错。 */
export function normalizeSize(size) {
  if (!isPlainObject(size)) return null;
  const result = {};
  for (const key of [...SIZE_LENGTH_KEYS, ...SIZE_BOUND_KEYS]) {
    if (size[key] === undefined) continue;
    result[key] = size[key];
  }
  if (size.aspect !== undefined) result.aspect = size.aspect;
  return Object.keys(result).length > 0 ? result : null;
}

export function defaultPosition() {
  return { mode: "flow" };
}

export function positionOf(node) {
  const position = node?.position;
  if (!isPlainObject(position)) return defaultPosition();
  if (position.mode === "anchor") {
    return { mode: "anchor", anchor: position.anchor, inset: { ...position.inset } };
  }
  if (position.mode === "absolute") {
    return {
      mode: "absolute",
      x: position.x,
      y: position.y,
      w: position.w,
      h: position.h,
    };
  }
  return defaultPosition();
}

export function normalizePosition(position) {
  if (!isPlainObject(position)) return null;
  if (position.mode === "anchor") {
    return {
      mode: "anchor",
      anchor: position.anchor,
      inset: {
        x: position.inset?.x ?? "md",
        y: position.inset?.y ?? "md",
      },
    };
  }
  if (position.mode === "absolute") {
    return {
      mode: "absolute",
      x: position.x,
      y: position.y,
      w: position.w,
      h: position.h,
    };
  }
  return defaultPosition();
}

export function defaultLayoutProps(layout) {
  if (layout === "grid") return { gap: "md", align: "start", columns: 2 };
  if (layout === "free") return { gap: "md" };
  return { gap: "md", align: "start", distribute: "start" };
}

/** 读布局参数时补齐缺省值，写文档时只写用户改过的。 */
export function layoutParamsOf(node) {
  const layout = node?.layout;
  if (!layout) return null;
  const defaults = defaultLayoutProps(layout);
  const stored = isPlainObject(node.layoutProps) ? node.layoutProps : {};
  const result = {};
  for (const key of LAYOUT_PARAM_KEYS[layout] ?? []) {
    const value = stored[key] ?? defaults[key];
    if (value !== undefined) result[key] = value;
  }
  return result;
}

export function slotNamesOf(node) {
  if (!Array.isArray(node?.slots)) return [];
  return node.slots.filter((name) => typeof name === "string" && name.length > 0);
}

export function setOf(document) {
  const sets = Array.isArray(document?.sets) ? document.sets : [];
  const installed = [];
  const declared = new Set();
  for (const entry of sets) {
    if (!isPlainObject(entry) || typeof entry.id !== "string" || !entry.id) continue;
    declared.add(entry.id);
    if (entry.enabled === false) continue;
    installed.push({ id: entry.id, version: entry.version ?? null });
  }
  // 没声明过 default 就自动垫在链尾；显式写了 enabled:false 就不再补。
  if (!declared.has(DEFAULT_SET_ID)) {
    installed.push({ id: DEFAULT_SET_ID, version: null });
  }
  return installed;
}

export function installedSetIds(document) {
  return new Set(setOf(document).map((entry) => entry.id));
}

export function hasGapToken(value) {
  return GAP_TOKENS.includes(value);
}

/** 短名去掉变体与集合前缀后的显示名。 */
export function displayNameOfUse(src) {
  if (typeof src !== "string") return "";
  const bare = isHandle(src) ? src.slice(src.indexOf(":") + 1) : src;
  const segments = bare.split("/").pop().split(".");
  return segments[segments.length - 1] || bare;
}
