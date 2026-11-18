/**
 * 页面状态机：idle → dirty → encoding → loading → shown | failed，另有一条 tooLong。
 *
 * 视图状态：view = { mode, scale }，mode 四选一：
 *   fit-width（适应宽度）/ fit-page（适应页面）/ actual（100%）/ manual（滚轮与 ＋− 之后）。
 * scale 只在 manual 下由用户改写；其余三种由 applyView() 从图与视口的尺寸算出来。
 *
 * 这里只做 DOM 与状态；编码和地址拼装全在 encoding.js（纯函数，node 里能单测）。
 * 设计依据：docs/design/plantuml-viewer-v2.md §5（界面与状态）、§7（失败面）。
 */
import { MAX_URL_LENGTH, compressionAvailable, renderPlan } from "./encoding.js";
import { DEFAULT_EXAMPLE, EXAMPLES } from "./examples.js";

const STORAGE_KEY = "toolbox.plantuml-viewer.source";
/** 视图模式记一个键；**不记 scale**——换图时 scale 必须按新图的尺寸重算。 */
const MODE_KEY = "toolbox.plantuml-viewer.mode";
const FOCUS_KEY = "toolbox.plantuml-viewer.focus";
const DEBOUNCE_MS = 700;
/** 取图超时：没有它，网络黑洞时界面会永久停在「渲染中…」（按钮禁用、失败卡片出不来）。 */
const LOAD_TIMEOUT_MS = 20000;
/** .stage 的 CSS 内边距（viewer.css 的 16px），算可用宽高要减两遍。 */
const STAGE_PADDING = 16;
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
/** 按钮一档 ×1.25；滚轮一档 ×1.1，累积到 100 像素才算一档。 */
const BUTTON_STEP = 1.25;
const WHEEL_STEP = 1.1;
const WHEEL_DELTA_PER_STEP = 100;
/** 一次事件最多走几档，避免触控板一甩数十档。 */
const WHEEL_MAX_STEPS = 5;
const WHEEL_MERGE_MS = 120;
const ANNOUNCE_MS = 300;
/** 临时状态提示（复制结果、缩放边界）显示多久；「取图超时」那条是粘性的，不受这个影响。 */
const STATUS_TTL_MS = 2000;

const MODE_LABELS = {
  "fit-width": "适应宽度",
  "fit-page": "适应页面",
  actual: "100%",
  manual: "手动",
};

/** 读数行里的模式名：actual 写「原尺寸」而不是「100%」，免得读成「100% 100%」。 */
const MODE_READOUT = {
  "fit-width": "适应宽度",
  "fit-page": "适应页面",
  actual: "原尺寸",
  manual: "手动",
};

const el = {
  app: document.querySelector(".app"),
  top: document.querySelector(".top"),
  editor: document.querySelector(".editor"),
  actions: document.querySelector(".actions"),
  source: document.querySelector("#source"),
  render: document.querySelector("#render"),
  clear: document.querySelector("#clear"),
  examples: document.querySelector("#examples"),
  autofill: document.querySelector("#autofill"),
  zoomOut: document.querySelector("#zoom-out"),
  zoomLevel: document.querySelector("#zoom-level"),
  zoomIn: document.querySelector("#zoom-in"),
  fitWidth: document.querySelector("#mode-fit-width"),
  fitPage: document.querySelector("#mode-fit-page"),
  actual: document.querySelector("#mode-actual"),
  focusToggle: document.querySelector("#focus-toggle"),
  openOriginal: document.querySelector("#open-original"),
  copy: document.querySelector("#copy-url"),
  stage: document.querySelector("#stage"),
  image: document.querySelector("#diagram"),
  empty: document.querySelector("#empty"),
  loading: document.querySelector("#loading"),
  elapsed: document.querySelector("#elapsed"),
  failure: document.querySelector("#failure"),
  failureText: document.querySelector("#failure-text"),
  failureHint: document.querySelector("#failure-hint"),
  retry: document.querySelector("#retry"),
  openTab: document.querySelector("#open-tab"),
  readout: document.querySelector("#readout"),
  size: document.querySelector("#size"),
  status: document.querySelector("#status"),
  note: document.querySelector("#note"),
  live: document.querySelector("#live"),
};

let state = "idle";
let timer = 0;
let ticker = 0;
let startedAt = 0;
/** 每次渲染的令牌：晚到的图片回调、晚到的编码结果都按这个丢掉。 */
let seq = 0;
/** 屏幕上的图是否还在（决定缩放控件能不能点）。 */
let hasImage = false;
/** 当前图在 100% 时的自然尺寸（从 probe.naturalWidth/Height 取）。 */
let dims = { width: 0, height: 0 };
/** 最近一次成功渲染的、补齐后的源码；相同就不重复请求。 */
let lastText = "";
/** 源码边界提示："" | "auto" | "misplaced"，取值见 encoding.js 的 withBoundaries。 */
let boundary = "";
/** 当前成功渲染的图地址（失败/超长时也记着，供「原图」「复制地址」用）。 */
let currentUrl = "";
/** 成功渲染时的编码长度，读数行要显示。 */
let encodedLength = 0;
/** 图下那行「来自官方服务器」的说明：成功时显示，空态/失败/专注模式收起。 */
let noteVisible = false;
/**
 * `#status` 那行的当前内容与优先级：
 *   ""          收起；
 *   "sticky"    取图超时（旧图还在）——不能被 2 秒临时提示顶掉；
 *   "transient" 复制结果 / 缩放边界——2 秒后自己收起，后到的顶掉先到的。
 */
let statusKind = "";
let statusText = "";
let statusTimer = 0;
/** 临时提示的令牌：过期的计时器不许清掉后来者的消息。 */
let statusToken = 0;
/** 视图：mode 是用户意图，scale 是算出来的结果。 */
let view = { mode: "fit-width", scale: 1 };
let focusMode = false;
let drag = null;
let wheelAccum = 0;
let wheelResetTimer = 0;
let announceTimer = 0;
let announceDirection = "放大";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const announce = (text) => {
  el.live.textContent = text;
};

/**
 * 图下那行非阻塞说明。三种调用：
 *   setStatus("")                      显式收起（状态切换一律用它，连粘性一起收）；
 *   setStatus(text, { sticky: true })   粘性：取图超时，2 秒临时提示不能覆盖、也不会把它提前清掉；
 *   setStatus(text)                    临时：2 秒后自己收起，同一时刻只有一条，后到的顶掉先到的。
 *
 * 与 `announce()` 的分工：这里只管「眼睛看得见」，读屏仍走 `#live`，同一句话不会播两遍。
 */
function setStatus(text, options = {}) {
  const sticky = options.sticky === true;
  window.clearTimeout(statusTimer);
  statusTimer = 0;
  if (text === "") {
    statusToken += 1;
    statusKind = "";
    statusText = "";
    paint();
    return;
  }
  if (!sticky && statusKind === "sticky") {
    // 取图超时还挂在图上：这条更急，临时提示直接丢掉，不排队也不延后。
    return;
  }
  const token = ++statusToken;
  statusKind = sticky ? "sticky" : "transient";
  statusText = text;
  if (!sticky) {
    statusTimer = window.setTimeout(() => {
      statusTimer = 0;
      if (token !== statusToken || statusKind !== "transient") {
        return;
      }
      statusKind = "";
      statusText = "";
      paint();
    }, STATUS_TTL_MS);
  }
  paint();
}

/** 收起临时的 2 秒提示（换了缩放/模式时用）；粘性的「取图超时」不动。 */
function clearTransientStatus() {
  if (statusKind !== "transient") {
    return;
  }
  window.clearTimeout(statusTimer);
  statusTimer = 0;
  statusToken += 1;
  statusKind = "";
  statusText = "";
  paint();
}

/** 源码头尾那一行小字（v1 方案 §5.3），只在需要说的时候出现。 */
const BOUNDARY_NOTES = {
  auto: "已自动补 @startuml/@enduml",
  misplaced: "@startuml 不在首行——服务器会把前面的行当图内容",
};

/* ── 本地存储：源码 / 模式 / 专注，三个键 ─────────────────── */

function storageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // 隐私模式写不进去就算了：页面照样能用，只是重载后会丢。
  }
}

/* ── 读数与控件状态 ─────────────────────────────────────── */

function percent() {
  return hasImage ? `${Math.round(view.scale * 100)}%` : "—";
}

function readoutText() {
  if (!hasImage) {
    return "没取到尺寸";
  }
  // 模式名进读数行：manual 下三个模式按钮都不高亮，没有这行用户不知道自己在哪。
  const parts = [`${dims.width} × ${dims.height}`, `${MODE_READOUT[view.mode]} ${percent()}`];
  if (encodedLength > 0) {
    parts.push(`编码 ${encodedLength} 字符`);
  }
  return parts.join(" · ");
}

function paint() {
  const busy = state === "loading";
  el.render.disabled = busy;
  el.render.textContent = busy ? "渲染中…" : "渲染";
  el.clear.disabled = el.source.value === "";
  el.autofill.hidden = boundary === "";
  if (boundary !== "") {
    el.autofill.textContent = BOUNDARY_NOTES[boundary];
  }
  const canZoom = hasImage && dims.width > 0;
  el.zoomOut.disabled = !canZoom;
  el.zoomIn.disabled = !canZoom;
  el.zoomLevel.disabled = !canZoom;
  el.fitWidth.disabled = !canZoom;
  el.fitPage.disabled = !canZoom;
  el.actual.disabled = !canZoom;
  el.copy.disabled = currentUrl === "";

  el.fitWidth.setAttribute("aria-pressed", String(view.mode === "fit-width"));
  el.fitPage.setAttribute("aria-pressed", String(view.mode === "fit-page"));
  el.actual.setAttribute("aria-pressed", String(view.mode === "actual"));

  el.openOriginal.setAttribute("aria-disabled", String(currentUrl === ""));
  if (currentUrl === "") {
    el.openOriginal.removeAttribute("href");
  } else {
    el.openOriginal.href = currentUrl;
  }

  el.focusToggle.textContent = focusMode ? "⤢ 退出专注（Esc）" : "⤢ 专注（Esc）";
  el.focusToggle.setAttribute("aria-pressed", String(focusMode));

  el.size.textContent = readoutText();
  el.zoomLevel.textContent = hasImage ? percent() : "—";
  el.readout.hidden = focusMode;
  el.status.hidden = statusKind === "";
  if (statusKind !== "") {
    el.status.textContent = statusText;
    // 临时提示（复制成功/边界）是信息，不是错误；粘性的取图超时才用错误色。
    el.status.dataset.tone = statusKind === "sticky" ? "alert" : "info";
  }
  el.note.hidden = !noteVisible || focusMode;

  el.stage.dataset.draggable = String(canZoom && overflows());
  el.stage.setAttribute("aria-busy", busy ? "true" : "false");
}

function setState(next) {
  state = next;
  paint();
}

function stopTicker() {
  if (ticker !== 0) {
    window.clearInterval(ticker);
    ticker = 0;
  }
}

/* ── 视图：几何、缩放、平移 ─────────────────────────────── */

function geometry() {
  const pad = STAGE_PADDING;
  const viewW = Math.max(0, el.stage.clientWidth - pad * 2);
  const viewH = Math.max(0, el.stage.clientHeight - pad * 2);
  const width = dims.width * view.scale;
  const height = dims.height * view.scale;
  const left = pad + Math.max(0, (viewW - width) / 2);
  const top = pad;
  return { pad, viewW, viewH, width, height, left, top, scale: view.scale };
}

function overflows() {
  if (!hasImage || dims.width <= 0) {
    return false;
  }
  const geo = geometry();
  return geo.width > geo.viewW + 1 || geo.height > geo.viewH + 1;
}

function maxScrollLeft() {
  return Math.max(0, STAGE_PADDING * 2 + dims.width * view.scale - el.stage.clientWidth);
}

function maxScrollTop() {
  return Math.max(0, STAGE_PADDING * 2 + dims.height * view.scale - el.stage.clientHeight);
}

function clampScroll() {
  el.stage.scrollLeft = clamp(el.stage.scrollLeft, 0, maxScrollLeft());
  el.stage.scrollTop = clamp(el.stage.scrollTop, 0, maxScrollTop());
}

function computeScale(mode, geo) {
  if (mode === "actual") {
    return 1;
  }
  if (dims.width <= 0 || dims.height <= 0) {
    return 1;
  }
  if (mode === "fit-page") {
    // 小图不放大（缩进窗口反而模糊），大图整张塞进视口。
    return clamp(Math.min(geo.viewW / dims.width, geo.viewH / dims.height, 1), 0.01, MAX_SCALE);
  }
  if (mode === "fit-width") {
    return clamp(geo.viewW / dims.width, 0.01, MAX_SCALE);
  }
  return clamp(view.scale, MIN_SCALE, MAX_SCALE);
}

/**
 * 按当前 mode 重算 scale、把宽度写到 <img> 上；给了 anchor 就把锚点下的内容按住不动。
 * 缩放只改 CSS 宽度，不碰 src——不会触发重新请求。
 */
function applyView(anchor, beforeGeometry) {
  if (!hasImage || dims.width <= 0) {
    el.image.style.width = "";
    paint();
    return;
  }
  // 手动缩放时调用方已经改过 view.scale：几何必须用改之前的那份，锚点换算才对得上。
  const before = beforeGeometry ?? geometry();
  view.scale = computeScale(view.mode, before);
  el.image.style.width = `${Math.max(1, Math.round(dims.width * view.scale))}px`;
  if (anchor) {
    keepAnchor(anchor, before);
  }
  paint();
}

function keepAnchor(anchor, before) {
  const rect = el.stage.getBoundingClientRect();
  const offsetX = anchor.clientX - rect.left;
  const offsetY = anchor.clientY - rect.top;
  const contentX = offsetX + el.stage.scrollLeft;
  const contentY = offsetY + el.stage.scrollTop;
  const imageX = before.scale > 0 ? (contentX - before.left) / before.scale : 0;
  const imageY = before.scale > 0 ? (contentY - before.top) / before.scale : 0;
  const after = geometry();
  const desiredX = after.left + imageX * view.scale;
  const desiredY = after.top + imageY * view.scale;
  el.stage.scrollLeft = clamp(desiredX - offsetX, 0, maxScrollLeft());
  el.stage.scrollTop = clamp(desiredY - offsetY, 0, maxScrollTop());
}

function resetTransform() {
  view.scale = 1;
  el.image.style.width = "";
  el.stage.scrollLeft = 0;
  el.stage.scrollTop = 0;
}

function stageCenterAnchor() {
  const rect = el.stage.getBoundingClientRect();
  return {
    clientX: rect.left + el.stage.clientWidth / 2,
    clientY: rect.top + el.stage.clientHeight / 2,
  };
}

function announceZoom(direction) {
  announceDirection = direction;
  window.clearTimeout(announceTimer);
  announceTimer = window.setTimeout(() => {
    announceTimer = 0;
    announce(`${announceDirection}到 ${percent()}`);
  }, ANNOUNCE_MS);
}

function announceEdge() {
  window.clearTimeout(announceTimer);
  announceTimer = 0;
  const text = view.scale >= MAX_SCALE ? "已到最大 400%" : "已到最小 25%";
  // 读屏走 #live，视觉上用图下那行状态提示，两边同一句话。
  announce(text);
  setStatus(text);
}

function zoomBy(factor, anchor) {
  if (!hasImage) {
    return;
  }
  const before = geometry();
  const target = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
  if (Math.abs(target - view.scale) < 0.0001) {
    announceEdge();
    return;
  }
  const direction = target > view.scale ? "放大" : "缩小";
  view.mode = "manual";
  view.scale = target;
  // 只记预设模式：manual 没有可恢复的 scale，别把「手动」写进存储。
  applyView(anchor, before);
  clearTransientStatus();
  announceZoom(direction);
}

function setMode(mode) {
  if (!hasImage) {
    return;
  }
  view.mode = mode;
  storageSet(MODE_KEY, mode);
  applyView(null);
  el.stage.scrollLeft = 0;
  el.stage.scrollTop = 0;
  clearTransientStatus();
  paint();
  announce(`${MODE_LABELS[mode]} ${percent()}`);
}

function resetZoom() {
  if (!hasImage) {
    return;
  }
  if (view.mode === "manual") {
    // manual 没有「按模式重算」可言，点百分比当作回到适应宽度（一个说得通的“重置”）。
    view.mode = "fit-width";
    storageSet(MODE_KEY, view.mode);
  }
  applyView(null);
  el.stage.scrollLeft = 0;
  el.stage.scrollTop = 0;
  clearTransientStatus();
  paint();
  announce(`${MODE_LABELS[view.mode]} ${percent()}`);
}

/* ── 滚轮：指针锚定，不按 Ctrl 直接缩放 ─────────────────── */

function normalizeDelta(event) {
  if (event.deltaMode === 1) {
    return event.deltaY * 16;
  }
  if (event.deltaMode === 2) {
    return event.deltaY * 400;
  }
  return event.deltaY;
}

function onWheel(event) {
  if (!hasImage) {
    return;
  }
  event.preventDefault();
  wheelAccum += normalizeDelta(event);
  window.clearTimeout(wheelResetTimer);
  wheelResetTimer = window.setTimeout(() => {
    wheelAccum = 0;
  }, WHEEL_MERGE_MS);
  const raw = Math.trunc(wheelAccum / WHEEL_DELTA_PER_STEP);
  if (raw === 0) {
    return;
  }
  const steps = clamp(raw, -WHEEL_MAX_STEPS, WHEEL_MAX_STEPS);
  wheelAccum -= steps * WHEEL_DELTA_PER_STEP;
  // 滚轮向上（deltaY 为负）= 放大，所以指数取反。
  zoomBy(WHEEL_STEP ** -steps, { clientX: event.clientX, clientY: event.clientY });
}

/* ── 拖拽平移：只在图溢出视口时接管 ─────────────────────── */

function onPointerDown(event) {
  if (!hasImage || !overflows()) {
    return;
  }
  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }
  drag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    scrollLeft: el.stage.scrollLeft,
    scrollTop: el.stage.scrollTop,
  };
  el.stage.dataset.dragging = "true";
  if (typeof el.stage.setPointerCapture === "function" && event.pointerId !== undefined) {
    try {
      el.stage.setPointerCapture(event.pointerId);
    } catch {
      // 指针已经抬起之类的情况，忽略。
    }
  }
  event.preventDefault();
}

function onPointerMove(event) {
  if (drag === null) {
    return;
  }
  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  el.stage.scrollLeft = clamp(drag.scrollLeft - dx, 0, maxScrollLeft());
  el.stage.scrollTop = clamp(drag.scrollTop - dy, 0, maxScrollTop());
  event.preventDefault();
}

function endDrag() {
  if (drag === null) {
    return;
  }
  drag = null;
  el.stage.dataset.dragging = "false";
}

/* ── 专注模式：页面内铺满，不依赖壳的全屏授权 ───────────── */

function layoutSettled() {
  if (!hasImage) {
    paint();
    return;
  }
  applyView(null);
  clampScroll();
  paint();
}

function setFocus(on, silent = false) {
  const next = Boolean(on);
  if (next === focusMode) {
    return;
  }
  focusMode = next;
  el.app.classList.toggle("is-focus", focusMode);
  el.top.hidden = focusMode;
  el.editor.hidden = focusMode;
  el.actions.hidden = focusMode;
  storageSet(FOCUS_KEY, focusMode ? "1" : null);
  paint();
  // 版式变了才有新尺寸：等一帧再按新视口重算，别拿旧 clientWidth 算完就停。
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(layoutSettled);
  } else {
    window.setTimeout(layoutSettled, 0);
  }
  if (!silent) {
    el.focusToggle.focus();
    announce(focusMode ? "已进入专注模式，按 Esc 或按钮退出" : "已退出专注模式");
  }
}

/* ── 复制地址 ───────────────────────────────────────────── */

function fallbackCopy(text) {
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) {
    throw new Error("execCommand copy 失败");
  }
}

async function copyUrl() {
  if (currentUrl === "") {
    return;
  }
  try {
    const clipboard = typeof navigator === "undefined" ? null : navigator.clipboard;
    if (clipboard && typeof clipboard.writeText === "function") {
      await clipboard.writeText(currentUrl);
    } else {
      fallbackCopy(currentUrl);
    }
    announce("地址已复制");
    setStatus("地址已复制");
  } catch {
    try {
      fallbackCopy(currentUrl);
      announce("地址已复制");
      setStatus("地址已复制");
    } catch {
      // 同一句话两边都写：读屏听 #live、眼睛看 #status，不各说一套。
      const message = "复制被拦住了：地址就在工具条的「↗ 原图」里，点它即可打开。";
      announce(message);
      setStatus(message);
    }
  }
}

/* ── 预览的三个面：空态、图、失败卡片 ─────────────────────── */

function showEmpty() {
  seq += 1;
  hasImage = false;
  noteVisible = false;
  encodedLength = 0;
  currentUrl = "";
  stopTicker();
  setStatus("");
  resetTransform();
  el.loading.hidden = true;
  el.failure.hidden = true;
  el.image.hidden = true;
  el.image.removeAttribute("src");
  el.empty.hidden = false;
  el.openTab.hidden = true;
  el.openTab.removeAttribute("href");
  lastText = "";
  paint();
}

function showFailure(text, hint, url) {
  hasImage = false;
  noteVisible = false;
  encodedLength = 0;
  setStatus("");
  resetTransform();
  currentUrl = url || "";
  stopTicker();
  el.loading.hidden = true;
  el.empty.hidden = true;
  el.image.hidden = true;
  el.failure.hidden = false;
  el.failureText.textContent = text;
  el.failureHint.textContent = hint;
  el.openTab.hidden = !url;
  if (url) {
    el.openTab.href = url;
  } else {
    el.openTab.removeAttribute("href");
  }
  paint();
}

/* ── 一次真正的取图 ──────────────────────────────────────── */

function startLoad(plan, id) {
  setState("loading");
  setStatus("");
  el.empty.hidden = true;
  el.failure.hidden = true;
  el.loading.hidden = false;
  startedAt = Date.now();
  el.elapsed.textContent = "（已等 0 秒）";
  stopTicker();
  ticker = window.setInterval(() => {
    el.elapsed.textContent = `（已等 ${Math.floor((Date.now() - startedAt) / 1000)} 秒）`;
  }, 1000);
  announce("正在取图");

  // 先用一张离屏图判断成败：旧图留在屏幕上，成功才换，失败才换卡片。
  const probe = new Image();
  let settled = false;
  let watchdog = 0;
  /** 认领这一次取图：只有第一个到的回调（load / error / 超时）能改界面，其余全部丢掉。 */
  const settle = () => {
    if (settled || id !== seq) {
      return false;
    }
    settled = true;
    window.clearTimeout(watchdog);
    probe.onload = null;
    probe.onerror = null;
    return true;
  };
  probe.onload = () => {
    if (!settle()) {
      return;
    }
    stopTicker();
    el.loading.hidden = true;
    hasImage = true;
    noteVisible = true;
    setStatus("");
    dims = { width: probe.naturalWidth || 0, height: probe.naturalHeight || 0 };
    encodedLength = plan.encoded.length;
    currentUrl = plan.url;
    if (view.mode === "manual") {
      // manual 没有可重算的公式；换图不沿用上一张图的 scale，用新图的适应宽度作起点，mode 仍是手动。
      view.scale = computeScale("fit-width", geometry());
    }
    el.image.src = plan.url;
    el.image.hidden = false;
    el.empty.hidden = true;
    el.failure.hidden = true;
    applyView(null);
    el.stage.scrollLeft = 0;
    el.stage.scrollTop = 0;
    lastText = plan.text;
    setState("shown");
    announce("图已更新");
  };
  probe.onerror = () => {
    if (!settle()) {
      return;
    }
    setState("failed");
    showFailure(
      "没取到图。可能是网络不通、官方服务器忙，或者这个地址被拒了——这个页面拿不到状态码，说不清是哪一种。",
      "重试一次；还不行就点「在新标签打开这张图」，那里能看到服务器的真实回应。",
      plan.url,
    );
    announce("没取到图");
  };
  watchdog = window.setTimeout(() => {
    if (!settle()) {
      return;
    }
    if (hasImage) {
      // 旧图还在：不清屏幕、不锁缩放，只在图下贴一条非阻塞说明（v2 方案 §7.2 的超时行）。
      // 这条是粘性的：2 秒复制/边界提示不能覆盖它，也不会把它提前清掉。
      stopTicker();
      el.loading.hidden = true;
      setStatus(
        `这次等了 ${LOAD_TIMEOUT_MS / 1000} 秒没等到新图——屏幕上还是上一张。点「渲染」重试；缩放和拖动照常可用。`,
        { sticky: true },
      );
      setState("failed");
      announce("取图超时，屏幕上还是上一张");
      return;
    }
    setState("failed");
    showFailure(
      `等了 ${LOAD_TIMEOUT_MS / 1000} 秒没回音。可能是网络不通，也可能是官方服务器一直没答复。`,
      "重试一次；还不行就点「在新标签打开这张图」，那里能看到服务器的真实回应。",
      plan.url,
    );
    announce("取图超时");
  }, LOAD_TIMEOUT_MS);
  probe.src = plan.url;
}

/* ── 一次渲染流程（防抖与按钮共用） ──────────────────────── */

async function run(force = false) {
  window.clearTimeout(timer);
  timer = 0;
  const id = ++seq;
  const source = el.source.value;
  // 落盘跟着渲染节奏走（防抖 700ms 一次），不再每次按键同步写一遍：20 万字符的源码一次写约 400KB。
  persist();

  if (source.trim() === "") {
    showEmpty();
    setState("idle");
    return;
  }

  if (!compressionAvailable()) {
    setState("failed");
    showFailure(
      "这个浏览器用不了原生 DEFLATE（CompressionStream 的 deflate-raw），算不出图地址。",
      "换 Chrome 103+ / Edge 103+ / Safari 16.4+ / Firefox 113+ 再打开。这一段不会发请求。",
      "",
    );
    announce("没取到图");
    return;
  }

  setState("encoding");
  let plan;
  try {
    plan = await renderPlan(source);
  } catch (error) {
    if (id !== seq) {
      return;
    }
    setState("failed");
    showFailure(
      `这段源码没编成图：${error instanceof Error ? error.message : String(error)}`,
      "重试一次；还不行就换一段源码。",
      "",
    );
    announce("没取到图");
    return;
  }
  if (id !== seq) {
    return;
  }

  boundary = plan.note;
  paint();

  if (plan.tooLong) {
    setState("tooLong");
    showFailure(
      `这段图太大，官方服务器不接这么长的地址（约 ${plan.url.length} 字符，上限按 ${MAX_URL_LENGTH} 算）。`,
      "把图拆小、删掉注释或示例行再试。这一条不会发请求。",
      plan.url,
    );
    announce("图太大，没有请求");
    return;
  }

  if (!force && hasImage && plan.text === lastText) {
    // 命中「源码没变」也可能发生在上一轮取图还没回来时（慢请求期间把文本改回上次成功的原文）：
    // 那次探针的回调已被 seq 守卫丢掉，这里不收尾就会留下永久遮罩与一直走的秒表。
    stopTicker();
    el.loading.hidden = true;
    setStatus("");
    setState("shown");
    return;
  }

  startLoad(plan, id);
}

/* ── 源码本地保存（一个键） ──────────────────────────────── */

function readStored() {
  return storageGet(STORAGE_KEY);
}

function persist() {
  storageSet(STORAGE_KEY, el.source.value === "" ? null : el.source.value);
}

/* ── 交互 ───────────────────────────────────────────────── */

function schedule() {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = 0;
    run();
  }, DEBOUNCE_MS);
}

el.source.addEventListener("input", () => {
  boundary = "";
  paint();
  if (el.source.value.trim() === "") {
    persist();
    showEmpty();
    setState("idle");
    return;
  }
  if (state === "shown" || state === "failed" || state === "tooLong") {
    // 旧图 / 旧卡片留在屏幕上，直到新结果到达（不闪黑）。
    setState("dirty");
  }
  schedule();
});

el.source.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    run(true);
  }
});

el.render.addEventListener("click", () => {
  run(true);
});

el.retry.addEventListener("click", () => {
  run(true);
});

el.clear.addEventListener("click", () => {
  el.source.value = "";
  persist();
  boundary = "";
  showEmpty();
  setState("idle");
  announce("已清空");
  el.source.focus();
});

el.zoomOut.addEventListener("click", () => {
  zoomBy(1 / BUTTON_STEP, stageCenterAnchor());
});

el.zoomIn.addEventListener("click", () => {
  zoomBy(BUTTON_STEP, stageCenterAnchor());
});

el.zoomLevel.addEventListener("click", () => {
  resetZoom();
});

el.fitWidth.addEventListener("click", () => {
  setMode("fit-width");
});

el.fitPage.addEventListener("click", () => {
  setMode("fit-page");
});

el.actual.addEventListener("click", () => {
  setMode("actual");
});

el.focusToggle.addEventListener("click", () => {
  setFocus(!focusMode);
});

el.copy.addEventListener("click", () => {
  copyUrl();
});

el.openOriginal.addEventListener("click", (event) => {
  if (currentUrl === "") {
    event.preventDefault();
  }
});

el.stage.addEventListener("wheel", onWheel, { passive: false });
el.stage.addEventListener("pointerdown", onPointerDown);
el.stage.addEventListener("pointermove", onPointerMove);
el.stage.addEventListener("pointerup", endDrag);
el.stage.addEventListener("pointercancel", endDrag);

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && focusMode) {
    event.preventDefault();
    setFocus(false);
  }
});

(function watchStageSize() {
  const onResize = () => {
    if (!hasImage) {
      paint();
      return;
    }
    if (view.mode === "fit-width" || view.mode === "fit-page") {
      applyView(null);
      clampScroll();
    } else {
      clampScroll();
      paint();
    }
  };
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(onResize);
    observer.observe(el.stage);
  }
  window.addEventListener("resize", onResize);
})();

for (const example of EXAMPLES) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "chip";
  button.textContent = example.label;
  button.addEventListener("click", () => {
    el.source.value = example.source;
    persist();
    boundary = "";
    paint();
    run(true);
    announce(`已填入示例：${example.label}`);
    el.source.focus();
  });
  el.examples.append(button);
}

/* ── 首次进入：恢复上次输入 / 视图模式 / 专注状态 ─────────── */

const storedSource = readStored();
el.source.value = storedSource === null ? DEFAULT_EXAMPLE.source : storedSource;
if (storedSource === null) {
  persist();
}

const storedMode = storageGet(MODE_KEY);
view.mode = storedMode && storedMode !== "manual" && MODE_LABELS[storedMode] ? storedMode : "fit-width";

paint();
if (storageGet(FOCUS_KEY) === "1") {
  setFocus(true, true);
}
if (el.source.value.trim() !== "") {
  run();
}
