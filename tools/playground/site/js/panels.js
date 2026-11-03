// 面板池。四个面板，各自只管画自己，不知道自己在布局树的哪个位置。
// 面板在整个会话里只有一份实例：切条目、切变体都只搬根元素，不重建。
//
// 约定接口：
//   root                     面板根元素，由布局引擎搬进槽位
//   mount(ctx)               启动时调一次，绑事件
//   attach(slotId)           每次被挂进某个槽位时调，用来决定是否显示面板头
//   load(entry, ctx, slotId) 换条目时调

import { buildDoc } from "./runner.js";
import { loadMonaco, languageOf, labelOf, THEME } from "./monaco.js";

const ICON = {
  play: '<svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true"><path d="M2.6 1.8 L9 5.5 L2.6 9.2 Z" fill="currentColor"/></svg>',
  refresh: '<svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"><path d="M10.2 6.5a3.7 3.7 0 1 1-1.1-2.6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M9.4 1.6v2.6H6.8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  external: '<svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"><path d="M7.4 2.2h3.4v3.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.8 2.2 6.6 6.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M9.6 7.8v2.6H2.6V3.4h2.6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function icon(name) {
  const span = el("span");
  span.innerHTML = ICON[name];
  return span.firstElementChild;
}

function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function inline(src) {
  return escapeHtml(src)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

// 最小 Markdown：标题、列表、围栏代码、段落。占位够用，不引第三方解析器。
function renderMarkdown(src) {
  const out = [];
  let inFence = false;
  for (const line of src.split("\n")) {
    if (line.startsWith("```")) {
      inFence = !inFence;
      out.push(inFence ? "<pre><code>" : "</code></pre>");
      continue;
    }
    if (inFence) { out.push(escapeHtml(line)); continue; }
    if (/^###\s/.test(line)) out.push(`<h3>${inline(line.slice(4))}</h3>`);
    else if (/^##\s/.test(line)) out.push(`<h2>${inline(line.slice(3))}</h2>`);
    else if (/^#\s/.test(line)) out.push(`<h1>${inline(line.slice(2))}</h1>`);
    else if (/^[-*]\s/.test(line)) out.push(`<li>${inline(line.slice(2))}</li>`);
    else if (/^\d+\.\s/.test(line)) out.push(`<li>${inline(line.replace(/^\d+\.\s/, ""))}</li>`);
    else if (line.trim() === "") out.push("");
    else out.push(`<p>${inline(line)}</p>`);
  }
  return out.join("\n");
}

// ---------------------------------------------------------------- 编辑区
// 成卡。面板头左侧是文件标签（单文件时不显示），右侧是运行与重置。
// 底下压一条状态条：光标位置 / 语言 / 编码换行 / 草稿状态。
function createEditor() {
  const root = el("div", "pane pane-editor");
  const head = el("div", "pane-head");
  const tabs = el("div", "tabs");
  const actions = el("div", "pane-actions");
  const resetBtn = el("button", "btn", "重置");
  resetBtn.type = "button";
  const runBtn = el("button", "btn btn-primary");
  runBtn.type = "button";
  runBtn.append(icon("play"), el("span", undefined, "运行"));
  actions.append(resetBtn, runBtn);
  head.append(tabs, actions);

  const body = el("div", "editor-body");
  const host = el("div", "editor-host");
  body.append(host);

  const status = el("div", "status");
  const posText = el("span", undefined, "Ln 1, Col 1");
  const langText = el("span");
  const encoding = el("span", "status-grow", "UTF-8 / LF");
  const save = el("span", "status-save");
  save.append(el("span", "dot"), el("span", undefined, "本地草稿已保存"));
  status.append(posText, langText, encoding, save);

  root.append(head, body, status);

  let ctx = null;
  let entry = null;
  let fileId = null;
  let monaco = null;
  let editor = null;
  let writing = false;
  const models = new Map();

  const currentFile = () => (entry?.files ?? []).find((f) => f.id === fileId) ?? entry?.files?.[0];

  function renderTabs() {
    const files = entry?.files ?? [];
    tabs.replaceChildren();
    // 单文件不给 tabs 留空位
    tabs.hidden = files.length <= 1;
    for (const file of files) {
      const tab = el("button", "tab", file.name);
      tab.type = "button";
      tab.setAttribute("aria-selected", String(file.id === fileId));
      tab.addEventListener("click", () => {
        fileId = file.id;
        ctx.state.fileIds[entry.id] = fileId;
        ctx.state.persist();
        renderTabs();
        showFile();
      });
      tabs.append(tab);
    }
  }

  function rebuildModels() {
    for (const model of models.values()) model.dispose();
    models.clear();
    for (const file of entry.files) {
      models.set(file.id, monaco.editor.createModel(
        ctx.state.readFile(entry, file),
        languageOf(file.name),
        monaco.Uri.parse(`inmemory://playground/${entry.id}/${file.id}`),
      ));
    }
  }

  function showFile() {
    const file = currentFile();
    if (!editor || !file) return;
    const model = models.get(file.id);
    if (!model) return;
    writing = true;
    editor.setModel(model);
    writing = false;
    editor.layout();
    langText.textContent = labelOf(model.getLanguageId());
    moveCursorReport();
  }

  function moveCursorReport() {
    const position = editor?.getPosition();
    posText.textContent = `Ln ${position?.lineNumber ?? 1}, Col ${position?.column ?? 1}`;
  }

  async function ensureEditor() {
    if (editor) return;
    try {
      monaco = await loadMonaco();
    } catch (error) {
      body.replaceChildren(el("div", "editor-fail", `编辑器加载失败：${error?.message ?? error}`));
      return;
    }
    editor = monaco.editor.create(host, {
      theme: THEME,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
      fontSize: 13,
      lineHeight: 22,
      fontLigatures: false,
      lineNumbersMinChars: 2,
      lineDecorationsWidth: 10,
      glyphMargin: false,
      folding: false,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      padding: { top: 14, bottom: 14 },
      renderLineHighlight: "line",
      renderLineHighlightOnlyWhenFocus: false,
      cursorBlinking: "smooth",
      bracketPairColorization: { enabled: false },
      guides: { indentation: false, bracketPairs: false },
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      overviewRulerBorder: false,
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
      stickyScroll: { enabled: false },
      tabSize: 2,
      wordWrap: "off",
      fixedOverflowWidgets: true,
      ariaLabel: "代码编辑区",
    });
    editor.onDidChangeCursorPosition(moveCursorReport);
    editor.onDidChangeModelContent(() => {
      const file = currentFile();
      if (!file || writing) return;
      ctx.writeFile(entry, file, editor.getValue());
    });
    if (entry) {
      rebuildModels();
      showFile();
    }
  }

  runBtn.addEventListener("click", () => ctx.run());
  resetBtn.addEventListener("click", () => ctx.resetEntry());

  return {
    id: "editor",
    root,
    mount(c) { ctx = c; },
    attach() { editor?.layout(); },
    load(next) {
      entry = next;
      fileId = ctx.state.fileIds[entry.id] ?? entry.files[0]?.id;
      renderTabs();
      if (!editor) {
        ensureEditor();
        return;
      }
      rebuildModels();
      showFile();
    },
  };
}

// ---------------------------------------------------------------- 日志
// 成卡。接预览 iframe 通过 postMessage 发回来的 console 输出与运行时错误。
// 一行一条：时间 / 级别 / 消息，计数挂在面板头的胶囊里。
function createConsole() {
  const root = el("div", "pane pane-console");
  const head = el("div", "pane-head");
  const count = el("span", "chip chip-accent", "0 条");
  const actions = el("div", "pane-actions");
  const clear = el("button", "btn", "清空");
  clear.type = "button";
  actions.append(clear);
  head.append(el("span", "pane-title", "日志"), count, actions);

  const body = el("div", "log-body");
  root.append(head, body);

  const LEVEL = {
    head: ["INFO", "info"],
    log: ["LOG", "log"],
    warn: ["WARN", "warn"],
    error: ["ERROR", "error"],
  };

  function stamp() {
    return new Date().toLocaleTimeString("zh-CN", { hour12: false });
  }

  function push(level, text) {
    const [label, kind] = LEVEL[level] ?? LEVEL.log;
    const row = el("div", "log-row");
    row.append(
      el("span", "log-time", stamp()),
      el("span", `log-level log-level-${kind}`, label),
      el("span", "log-text", text),
    );
    body.append(row);
    count.textContent = `${body.childElementCount} 条`;
    body.scrollTop = body.scrollHeight;
  }

  clear.addEventListener("click", () => {
    body.replaceChildren();
    count.textContent = "0 条";
  });
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || data.source !== "playground-preview") return;
    push(data.level, data.text);
  });

  return {
    id: "console",
    root,
    mount() {},
    attach() {},
    load() {
      body.replaceChildren();
      count.textContent = "0 条";
    },
    append: push,
  };
}

// ---------------------------------------------------------------- 预览
// 成卡。画布是浅色，iframe 铺满：跑出来的东西不是本工具的界面，得有自己的边界。
function createPreview() {
  const root = el("div", "pane pane-preview");
  const head = el("div", "pane-head");
  const actions = el("div", "pane-actions");
  const refresh = el("button", "btn btn-icon");
  refresh.type = "button";
  refresh.title = "重新运行";
  refresh.append(icon("refresh"));
  const external = el("button", "btn btn-icon");
  external.type = "button";
  external.title = "在新窗口打开";
  external.append(icon("external"));
  actions.append(refresh, external);
  head.append(
    el("span", "pane-title", "预览"),
    el("span", "chip", "iframe / sandbox"),
    actions,
  );

  const body = el("div", "preview-body");
  root.append(head, body);

  let ctx = null;
  let doc = null;

  refresh.addEventListener("click", () => ctx.run());
  external.addEventListener("click", () => {
    if (!doc) return;
    const url = URL.createObjectURL(new Blob([doc], { type: "text/html" }));
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  });

  function notice(text, title) {
    const box = el("div", "notice");
    if (title) box.append(el("div", "notice-title", title));
    box.append(el("div", "notice-text", text));
    body.replaceChildren(box);
  }

  return {
    id: "preview",
    root,
    mount(c) { ctx = c; },
    attach() {},
    load(entry, c) {
      ctx = c;
      doc = null;
      const result = buildDoc(entry.files ?? [], c.language);
      // 跑不了就当场说明，不留空壳
      if (result.status === "unsupported") notice(result.reason, "无法运行");
      else notice("按编辑区面板头的「运行」查看结果", "尚未运行");
    },
    setDoc(next) {
      doc = next;
      const frame = document.createElement("iframe");
      frame.setAttribute("sandbox", "allow-scripts");
      frame.title = "预览";
      frame.srcdoc = next;
      body.replaceChildren(frame);
    },
    notice,
  };
}

// ---------------------------------------------------------------- 文档 / 题面
// 同一个面板服务两个槽位：doc 无面板头，problem 有面板头（题面标题）。
function createDocRender() {
  const root = el("div", "pane pane-doc");
  const head = el("div", "pane-head");
  head.append(el("span", "pane-title", "题目"));
  const body = el("div", "doc");
  const inner = el("div", "doc-inner");
  body.append(inner);
  root.append(head, body);

  return {
    id: "doc-render",
    root,
    mount() {},
    attach(slotId) {
      head.hidden = slotId !== "problem";
    },
    load(entry, ctx, slotId) {
      inner.innerHTML = renderMarkdown(slotId === "problem" ? entry.problem ?? "" : entry.body ?? "");
      body.scrollTop = 0;
    },
  };
}

export const PANELS = {
  editor: createEditor(),
  preview: createPreview(),
  console: createConsole(),
  "doc-render": createDocRender(),
};
