export const SCHEMA_VERSION = 2;

export const LAYOUTS = ["row", "column", "grid", "free"];
export const LAYOUT_LABELS = {
  row: "横排",
  column: "纵向",
  grid: "网格",
  free: "自由",
};
export const LAYOUT_GLYPHS = {
  row: "→",
  column: "↓",
  grid: "▦",
  free: "✥",
};

/** 每种布局接受哪些参数，别的键写进来就是错的。 */
export const LAYOUT_PARAM_KEYS = {
  row: ["gap", "align", "distribute"],
  column: ["gap", "align", "distribute"],
  grid: ["gap", "align", "columns"],
  free: ["gap"],
};

export const GAP_TOKENS = ["xs", "sm", "md", "lg"];
export const GAP_VALUES = { xs: 4, sm: 8, md: 12, lg: 20 };
export const GAP_LABELS = { xs: "紧", sm: "正常", md: "松", lg: "很松" };

export const DISTRIBUTES = ["start", "center", "end", "between"];
export const DISTRIBUTE_LABELS = {
  start: "靠前",
  center: "居中",
  end: "靠后",
  between: "两端顶格",
};
export const ALIGNS = ["start", "center", "end", "fill"];
export const ALIGN_LABELS = {
  start: "顶",
  center: "中",
  end: "底",
  fill: "拉满",
};

export const ANCHORS = ["tl", "tc", "tr", "cl", "c", "cr", "bl", "bc", "br"];
export const ANCHOR_LABELS = {
  tl: "左上",
  tc: "上中",
  tr: "右上",
  cl: "左中",
  c: "居中",
  cr: "右中",
  bl: "左下",
  bc: "下中",
  br: "右下",
};

export const INSET_TOKENS = ["xs", "sm", "md", "lg"];
export const INSET_LABELS = { xs: "很近", sm: "近", md: "中", lg: "远" };

export const POSITION_MODES = ["flow", "anchor", "absolute"];

export const SIZE_KEYWORDS = ["auto", "fill"];
export const SIZE_LENGTH_KEYS = ["width", "height"];
export const SIZE_BOUND_KEYS = ["minWidth", "maxWidth", "minHeight", "maxHeight"];
export const SIZE_KEYS = [...SIZE_LENGTH_KEYS, ...SIZE_BOUND_KEYS, "aspect"];

/** 内置组件集的 id。永远排在解析链尾，可在文档的 sets 里关掉。 */
export const DEFAULT_SET_ID = "default";

export function isLayout(value) {
  return LAYOUTS.includes(value);
}

export function isGap(value) {
  return GAP_TOKENS.includes(value);
}

export function isAnchor(value) {
  return ANCHORS.includes(value);
}

export function isInset(value) {
  return INSET_TOKENS.includes(value);
}

export function isAlign(value) {
  return ALIGNS.includes(value);
}

export function isDistribute(value) {
  return DISTRIBUTES.includes(value);
}

export function isPositionMode(value) {
  return POSITION_MODES.includes(value);
}
