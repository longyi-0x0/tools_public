// 装配：左列渲染目录外壳，右列按变体渲染工作区。
//
// 切换规则（与 IA 一致）：
//   切语言 → 换整棵目录；当前条目在新语言里不存在就落到第一条
//   搜索   → 只过滤左列目录，不动右侧工作区
//   切条目 → 变体相同则栅格不动，只换内容；变体不同才重建布局树
//   面板   → 全程只搬根元素，不重建，内容、光标与 iframe 状态都活着

import { LANGUAGES, CATALOGS, findEntry, firstEntry } from "./catalog.js";
import { VARIANTS, variantOf } from "./variants.js";
import { renderLayout } from "./layout.js";
import { PANELS } from "./panels.js";
import { createState, draftKey } from "./state.js";
import { buildDoc } from "./runner.js";

// 条目类型图标：形状对应右侧形态，不靠颜色区分
const KIND_ICON = {
  code: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M5.2 3.6 1.9 7l3.3 3.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.8 3.6 12.1 7l-3.3 3.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  doc: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><rect x="3.1" y="1.6" width="7.8" height="10.8" rx="1.6" stroke="currentColor" stroke-width="1.2"/><path d="M5.4 5.3h3.2M5.4 7.7h3.9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  exercise: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3.2 10.8 3.9 8.1 8.9 3.1l2 2-5 5-2.7.7Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
};

const state = createState();
if (!CATALOGS[state.languageId]) state.languageId = LANGUAGES[0].id;

const ctx = { state, language: null, entry: null, run, resetEntry, writeFile };
for (const panel of Object.values(PANELS)) panel.mount(ctx);

const app = document.getElementById("app");
const rail = document.getElementById("rail");
const langSelect = document.getElementById("lang-select");
const railTree = document.getElementById("rail-tree");
const railSearch = document.getElementById("rail-search");
const workspace = document.getElementById("workspace");

let currentVariantId = null;

for (const language of LANGUAGES) {
  const option = document.createElement("option");
  option.value = language.id;
  option.textContent = language.label;
  langSelect.append(option);
}
langSelect.value = state.languageId;

langSelect.addEventListener("change", () => {
  state.languageId = langSelect.value;
  if (!findEntry(state.languageId, state.entryId)) {
    state.entryId = firstEntry(state.languageId)?.id ?? null;
  }
  render();
});

document.getElementById("rail-toggle").addEventListener("click", () => {
  app.classList.toggle("is-rail-open");
  rail.classList.toggle("is-open");
});

document.getElementById("reset-all").addEventListener("click", () => {
  state.clearDrafts();
  render();
});

railSearch.addEventListener("input", () => {
  renderRailTree(ctx.entry);
});

railSearch.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  railSearch.value = "";
  renderRailTree(ctx.entry);
});

window.addEventListener("keydown", (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") return;
  event.preventDefault();
  railSearch.focus();
  railSearch.select();
});

function matches(item, query) {
  if (!query) return true;
  return item.title.toLowerCase().includes(query)
    || (item.kind ?? "").toLowerCase().includes(query);
}

function kindIcon(kind) {
  const template = document.createElement("template");
  template.innerHTML = KIND_ICON[kind] ?? KIND_ICON.code;
  return template.content.firstElementChild;
}

function renderRailTree(entry) {
  const query = railSearch.value.trim().toLowerCase();
  railTree.replaceChildren();
  let hits = 0;

  for (const group of CATALOGS[state.languageId] ?? []) {
    const entries = group.entries.filter((item) => matches(item, query));
    if (entries.length === 0) continue;
    hits += entries.length;

    const box = document.createElement("div");
    box.className = "rail-group";
    box.append(Object.assign(document.createElement("div"), {
      className: "rail-group-title",
      textContent: group.title,
    }));

    for (const item of entries) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "rail-entry";
      button.append(
        kindIcon(item.kind),
        Object.assign(document.createElement("span"), { className: "rail-entry-name", textContent: item.title }),
        // 类型标签直接写 kind 值：doc / code / exercise 本身就是对外词汇
        Object.assign(document.createElement("span"), { className: "rail-kind", textContent: item.kind }),
      );
      if (item.id === entry?.id) button.setAttribute("aria-current", "true");
      button.addEventListener("click", () => {
        state.entryId = item.id;
        if (window.matchMedia("(max-width: 900px)").matches) {
          app.classList.remove("is-rail-open");
          rail.classList.remove("is-open");
        }
        render();
      });
      box.append(button);
    }
    railTree.append(box);
  }

  if (hits === 0) {
    railTree.append(Object.assign(document.createElement("div"), {
      className: "rail-empty",
      textContent: "没有匹配的条目",
    }));
  }
}

function render() {
  const language = LANGUAGES.find((l) => l.id === state.languageId);
  const entry = findEntry(state.languageId, state.entryId) ?? firstEntry(state.languageId);
  state.entryId = entry?.id ?? null;
  ctx.language = language;
  ctx.entry = entry;
  renderRailTree(entry);
  state.persist();

  if (!entry) {
    workspace.replaceChildren(Object.assign(document.createElement("div"), {
      className: "notice",
      textContent: "这门语言还没有条目",
    }));
    currentVariantId = null;
    return;
  }

  const variantId = variantOf(entry, language);
  const variant = VARIANTS[variantId];

  // 变体没变就不重建：面板实例留在原槽位，只有变体真的换了才换栅格
  if (variantId !== currentVariantId) {
    renderLayout(workspace, variant.tree, (slotId, host) => {
      const panel = PANELS[variant.panels[slotId]];
      host.append(panel.root);
      panel.attach(slotId);
    });
    currentVariantId = variantId;
  }

  for (const [slotId, panelId] of Object.entries(variant.panels)) {
    PANELS[panelId].load(entry, ctx, slotId);
  }
}

function writeFile(entry, file, text) {
  const key = draftKey(state.languageId, entry.id, file.id);
  if (text === file.content) delete state.drafts[key];
  else state.drafts[key] = text;
  state.persist();
}

function resetEntry() {
  const entry = ctx.entry;
  if (!entry) return;
  for (const file of entry.files ?? []) {
    delete state.drafts[draftKey(state.languageId, entry.id, file.id)];
  }
  state.persist();
  PANELS.editor.load(entry, ctx);
}

function run() {
  const entry = ctx.entry;
  if (!entry?.files?.length) return;
  const files = entry.files.map((f) => ({ ...f, content: state.readFile(entry, f) }));
  const result = buildDoc(files, ctx.language);

  PANELS.console.load(entry, ctx);
  PANELS.console.append("head", `运行 ${ctx.language.label} · ${files.length} 个文件`);
  if (result.status === "unsupported") {
    PANELS.console.append("warn", result.reason);
    PANELS.preview.notice(result.reason);
    return;
  }
  PANELS.preview.setDoc(result.doc);
}

render();
