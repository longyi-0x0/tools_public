export const SCHEMA_VERSION = 1;

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

export const SHAPES = ["text", "image", "button", "input", "placeholder"];
export const SHAPE_LABELS = {
  text: "文本",
  image: "图片",
  button: "按钮",
  input: "输入框",
  placeholder: "占位块",
};

export const PATTERNS = ["navbar", "tabs"];
export const PATTERN_LABELS = { navbar: "导航栏", tabs: "标签页" };
export const PATTERN_SLOTS = {
  navbar: {
    left: { label: "左侧", max: 1 },
    right: { label: "右侧", max: 1 },
  },
  tabs: {
    content: { label: "内容区", max: 1 },
  },
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

export const TYPE_LABELS = {
  container: "容器",
  pattern: "结构件",
  leaf: "元素",
};

export function isLayout(value) {
  return LAYOUTS.includes(value);
}

export function isGap(value) {
  return GAP_TOKENS.includes(value);
}
