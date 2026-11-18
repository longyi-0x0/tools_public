/**
 * 页面状态机：idle → dirty → encoding → loading → shown | failed，另有一条 tooLong。
 *
 * 这里只做 DOM 与状态；编码和地址拼装全在 encoding.js（纯函数，node 里能单测）。
 * 设计依据见 docs/design/plantuml-viewer.md 的 §5.4 与 §6。
 */
import { MAX_URL_LENGTH, compressionAvailable, renderPlan } from "./encoding.js";
import { DEFAULT_EXAMPLE, EXAMPLES } from "./examples.js";

/** 最后一次输入的源码：一个键，无列表、无命名（方案 M8）。 */
const STORAGE_KEY = "toolbox.plantuml-viewer.source";
const DEBOUNCE_MS = 700;
/** 取图超时：没有它，网络黑洞时界面会永久停在「渲染中…」（按钮禁用、失败卡片出不来）。 */
const LOAD_TIMEOUT_MS = 20000;

const el = {
  source: document.querySelector("#source"),
  render: document.querySelector("#render"),
  clear: document.querySelector("#clear"),
  examples: document.querySelector("#examples"),
  autofill: document.querySelector("#autofill"),
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
  size: document.querySelector("#size"),
  mode: document.querySelector("#mode"),
  fit: document.querySelector("#fit"),
  note: document.querySelector("#note"),
  live: document.querySelector("#live"),
};

let state = "idle";
let timer = 0;
let ticker = 0;
let startedAt = 0;
/** 每次渲染的令牌：晚到的图片回调、晚到的编码结果都按这个丢掉。 */
let seq = 0;
/** 屏幕上的图是否还在（决定二态开关能不能点）。 */
let hasImage = false;
let fit = true;
/** 最近一次成功渲染的、补齐后的源码；相同就不重复请求。 */
let lastText = "";
/** 源码边界提示："" | "auto" | "misplaced"，取值见 encoding.js 的 withBoundaries。 */
let boundary = "";

const announce = (text) => {
  el.live.textContent = text;
};

/** 源码头尾那一行小字（方案 §5.3），只在需要说的时候出现。 */
const BOUNDARY_NOTES = {
  auto: "已自动补 @startuml/@enduml",
  misplaced: "@startuml 不在首行——服务器会把前面的行当图内容",
};

function paint() {
  const busy = state === "loading";
  el.render.disabled = busy;
  el.render.textContent = busy ? "渲染中…" : "渲染";
  el.clear.disabled = el.source.value === "";
  el.fit.disabled = !hasImage;
  el.fit.textContent = fit ? "原尺寸" : "适应宽度";
  el.mode.textContent = fit ? "适应宽度" : "原尺寸";
  el.autofill.hidden = boundary === "";
  if (boundary !== "") {
    el.autofill.textContent = BOUNDARY_NOTES[boundary];
  }
  el.stage.dataset.fit = fit ? "fit" : "actual";
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

/* ── 预览的三个面：空态、图、失败卡片 ─────────────────────── */

function showEmpty() {
  seq += 1;
  hasImage = false;
  stopTicker();
  el.loading.hidden = true;
  el.failure.hidden = true;
  el.note.hidden = true;
  el.image.hidden = true;
  el.image.removeAttribute("src");
  el.empty.hidden = false;
  el.size.textContent = "没取到尺寸";
  el.openTab.hidden = true;
  el.openTab.removeAttribute("href");
  lastText = "";
  paint();
}

function showFailure(text, hint, url) {
  hasImage = false;
  stopTicker();
  el.loading.hidden = true;
  el.empty.hidden = true;
  el.image.hidden = true;
  el.note.hidden = true;
  el.failure.hidden = false;
  el.failureText.textContent = text;
  el.failureHint.textContent = hint;
  el.size.textContent = "没取到尺寸";
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
    el.image.src = plan.url;
    el.image.hidden = false;
    el.empty.hidden = true;
    el.failure.hidden = true;
    el.note.hidden = false;
    el.size.textContent = `${probe.naturalWidth} × ${probe.naturalHeight} · 编码 ${plan.encoded.length} 字符`;
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
    setState("shown");
    return;
  }

  startLoad(plan, id);
}

/* ── 源码本地保存（一个键） ──────────────────────────────── */

function readStored() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function persist() {
  try {
    if (el.source.value === "") {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, el.source.value);
    }
  } catch {
    // 隐私模式写不进去就算了：页面照样能用，只是重载后会丢。
  }
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
    // 旧图 / 旧卡片留在屏幕上，直到新结果到达（方案 §5.4，不闪黑）。
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

el.fit.addEventListener("click", () => {
  fit = !fit;
  paint();
  announce(fit ? "适应宽度" : "原尺寸");
});

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

/* ── 首次进入：恢复上次输入，没有就预填示例并直接出一张 ───── */

const stored = readStored();
el.source.value = stored === null ? DEFAULT_EXAMPLE.source : stored;
if (stored === null) {
  persist();
}
paint();
if (el.source.value.trim() !== "") {
  run();
}
