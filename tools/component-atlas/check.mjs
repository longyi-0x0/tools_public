#!/usr/bin/env node
/**
 * 组件图册自查。不开浏览器、不联网，只看数据本身对不对。
 *
 *     node check.mjs
 *
 * 查的是那些「错了也不会报错，只会在页面上悄悄失真」的地方：params 与 css 里的
 * var(--…) 对不上、标签链断了落不到树上、状态写了 css 没接、图引用了个不存在的文件。
 * 有问题的以 1 退出；没问题就把每条的名字打出来，外加几句不阻断的提醒。
 *
 * 硬错误与提醒的分界：
 *   硬错误 —— 这条在页面上根本落不下去或会失真，必须改。
 *   提醒   —— 只是「还没归位」或「可能要收拾」，不拦你提交。
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));

/* ---------- 读两份东西：条目在 data.js，树在 index.html ---------- */

const CATALOG = await loadCatalog();
const TREE = await loadTree();

if (!Array.isArray(CATALOG.items)) fail(["data.js 里没有 CATALOG.items 数组"]);
if (!Array.isArray(TREE) || TREE.length === 0) fail(["index.html 里抠不出 TREE"]);

/* ---------- 树的辅助：id 表、每条链、父子关系 ---------- */

const idOf = new Map();          // 节点 id -> name
const pathOf = new Map();        // 节点 id -> 这条链（同名 id 以先到的为准）
const parentOf = new Map();      // 子节点 id -> 父节点 id
(function walk(nodes, parent) {
  for (const node of nodes) {
    if (!idOf.has(node.id)) {
      idOf.set(node.id, node.name ?? node.id);
      pathOf.set(node.id, parent ? [...pathOf.get(parent), node.id] : [node.id]);
    }
    if (parent) parentOf.set(node.id, parent);
    if (node.children) walk(node.children, node.id);
  }
})(TREE, null);

/* ---------- 查 ---------- */

const problems = [];
const notes = [];
const ID = /^[a-z0-9][a-z0-9-]*$/;
const seen = new Set();
const usedTags = new Set();

for (const [index, item] of CATALOG.items.entries()) {
  const at = `第 ${index + 1} 条（${item?.id ?? "无 id"}）`;

  if (typeof item?.id !== "string" || !ID.test(item.id)) {
    problems.push(`${at}：id 要是小写字母、数字或连字符，且以字母或数字开头`);
  } else if (seen.has(item.id)) {
    problems.push(`${at}：id 重复`);
  } else {
    seen.add(item.id);
  }

  if (typeof item?.name !== "string" || item.name.trim() === "") problems.push(`${at}：缺 name`);
  if (typeof item?.summary !== "string" || item.summary.trim() === "") problems.push(`${at}：缺 summary`);
  if (typeof item?.html !== "string" || item.html.trim() === "") problems.push(`${at}：缺 html`);
  if (typeof item?.css !== "string" || item.css.trim() === "") problems.push(`${at}：缺 css`);

  /* tags：非空、扁平；链要连得上 */
  const tags = item?.tags;
  if (!Array.isArray(tags) || tags.length === 0 || tags.some((t) => typeof t !== "string" || t.trim() === "")) {
    problems.push(`${at}：tags 要是非空字符串组成的数组`);
  } else {
    for (const tag of tags) {
      usedTags.add(tag);
      /* 链断了：打了子节点却没打它祖先 —— 这条在树上落不到任何位置 */
      const chain = pathOf.get(tag);
      if (chain) {
        for (const ancestor of chain.slice(0, -1)) {
          if (!tags.includes(ancestor)) {
            problems.push(`${at}：打了「${tag}」却没打它上级的「${ancestor}」—— 这条在树上落不下去`);
          }
        }
      } else {
        notes.push(`${at}：标签「${tag}」不在 TREE 上 —— 确认是新分类就往 TREE 里加节点，是笔误就改回来`);
      }
    }
    if (!tags.some((t) => idOf.has(t))) {
      problems.push(`${at}：tags 里一个树上的节点都没有 —— 会掉进「未归档」`);
    }
  }

  /* previewVw / previewVh：部件有确定的自身尺寸，两个都要给 */
  for (const key of ["previewVw", "previewVh"]) {
    if (!Number.isFinite(item?.[key]) || item[key] <= 0) {
      problems.push(`${at}：${key} 要是正数`);
    }
  }

  /* states：至少一条；css 要接得住 */
  const states = item?.states;
  if (!Array.isArray(states) || states.length === 0) {
    problems.push(`${at}：states 至少要有默认态`);
  } else {
    const stateIds = new Set();
    for (const s of states) {
      if (typeof s?.id !== "string" || s.id.trim() === "") {
        problems.push(`${at}：states 里有一项缺 id`);
        continue;
      }
      if (stateIds.has(s.id)) problems.push(`${at}：states 里 ${s.id} 重复`);
      stateIds.add(s.id);
      if (typeof s?.label !== "string" || s.label.trim() === "") {
        problems.push(`${at}：状态 ${s.id} 缺 label`);
      }
    }
    const css = item.css ?? "";
    const hooked = new Set([...css.matchAll(/data-state="([^"]+)"/g)].map((m) => m[1]));
    for (const id of stateIds) {
      if (id === "default") continue;               /* 默认态可以不写，BASE 那套就是它 */
      if (!hooked.has(id)) {
        notes.push(`${at}：声明了状态 ${id}，css 里没有 body[data-state="${id}"] 去接 —— 切过去看不出变化`);
      }
    }
  }

  /* metrics：最多 6 条 */
  if (item?.metrics !== undefined) {
    if (!Array.isArray(item.metrics)) {
      problems.push(`${at}：metrics 要是数组`);
    } else if (item.metrics.length > 6) {
      problems.push(`${at}：metrics 最多 6 条，现在 ${item.metrics.length} 条`);
    } else {
      for (const m of item.metrics) {
        if (typeof m?.label !== "string" || typeof m?.value !== "string") {
          problems.push(`${at}：metrics 里有一项缺 label 或 value`);
        }
      }
    }
  }

  /* ref：填了就得是真文件 */
  if (typeof item?.ref === "string" && item.ref.trim() !== "") {
    const file = here("./site/" + item.ref);
    try {
      const st = await stat(file);
      if (st.size > 300 * 1024) {
        problems.push(`${at}：参考图 ${item.ref} 有 ${(st.size / 1024).toFixed(0)} KB，超过 300 KB —— 压一下`);
      }
    } catch {
      problems.push(`${at}：参考图 ${item.ref} 不存在`);
    }
  }

  /* script：v1 的闸门。留着字段是为了将来开脚本预览时不用改数据结构 */
  if (typeof item?.script === "string" && item.script.trim() !== "") {
    problems.push(`${at}：script 非空 —— v1 的预览 iframe 不给脚本权限，这条跑不起来`);
  }

  /* params 与 var(--…) 严格一一对应 */
  const params = item?.params ?? [];
  if (!Array.isArray(params)) {
    problems.push(`${at}：params 要是数组`);
    continue;
  }
  const declared = new Set();
  for (const p of params) {
    if (typeof p?.name !== "string" || p.name.trim() === "") {
      problems.push(`${at}：params 里有一项缺 name`);
      continue;
    }
    if (declared.has(p.name)) problems.push(`${at}：params 里 --${p.name} 重复`);
    declared.add(p.name);
    if (typeof p.label !== "string" || p.label.trim() === "") {
      problems.push(`${at}：--${p.name} 缺 label`);
    }
    for (const key of ["min", "max", "step", "value"]) {
      if (!Number.isFinite(p[key])) problems.push(`${at}：--${p.name} 的 ${key} 不是数字`);
    }
    if (Number.isFinite(p.min) && Number.isFinite(p.max) && p.min > p.max) {
      problems.push(`${at}：--${p.name} 的 min 比 max 大`);
    }
    if (Number.isFinite(p.value) && Number.isFinite(p.min) && p.value < p.min) {
      problems.push(`${at}：--${p.name} 的默认值小于 min`);
    }
    if (Number.isFinite(p.value) && Number.isFinite(p.max) && p.value > p.max) {
      problems.push(`${at}：--${p.name} 的默认值大于 max`);
    }
  }
  const used = new Set(
    [...(item?.css ?? "").matchAll(/var\(\s*--([a-zA-Z0-9-]+)/g)].map((m) => m[1]),
  );
  for (const name of used) {
    if (!declared.has(name)) {
      problems.push(`${at}：css 用了 --${name}，但 params 里没有 —— 滑块改不到它`);
    }
  }
  for (const name of declared) {
    if (!used.has(name)) {
      problems.push(`${at}：params 声明了 --${name}，但 css 里没用到 —— 拖它没有反应`);
    }
  }
}

/* ---------- 图片与树的整体提醒 ---------- */

const imgDir = here("./site/img");
let imgFiles = [];
try {
  imgFiles = (await readdir(imgDir)).filter((f) => !f.startsWith("."));
} catch {
  /* 骨架期没有这个目录也正常 */
}
let total = 0;
for (const f of imgFiles) {
  const st = await stat(here("./site/img/" + f));
  total += st.size;
  if (!CATALOG.items.some((it) => it.ref === "img/" + f)) {
    notes.push(`site/img/${f} 没有被任何条目的 ref 引用`);
  }
}
if (total > 8 * 1024 * 1024) {
  problems.push(`site/img/ 一共 ${(total / 1024 / 1024).toFixed(1)} MB，超过 8 MB —— 发布额度要留给别的`);
}

/* 空节点只报个总数：树是先铺开再填内容的，逐个念一遍只会把真正的提醒淹掉。
   想知道是哪几个，把下面这行的注释去掉。 */
const emptyNodes = [...idOf.keys()].filter((id) => !usedTags.has(id));
if (emptyNodes.length > 0) {
  notes.push(`TREE 上还有 ${emptyNodes.length} 个节点没有内容（${emptyNodes.join("、")}）`);
}

/* ---------- 结果 ---------- */

if (problems.length > 0) fail(problems);

process.stdout.write(`自查通过：${CATALOG.items.length} 条\n`);
for (const id of idOf.keys()) {
  const chain = pathOf.get(id);
  const list = CATALOG.items.filter((it) => chain.every((t) => (it.tags ?? []).includes(t)));
  if (list.length === 0) continue;
  process.stdout.write(`  ${idOf.get(id)}（${list.length}）${list.map((it) => it.name ?? it.id).join("、")}\n`);
}
if (notes.length > 0) {
  process.stdout.write(`\n提醒 ${notes.length} 条（不拦提交）：\n`);
  for (const line of notes) process.stdout.write(`  - ${line}\n`);
}

/* ---------- 装载 ---------- */

async function loadCatalog() {
  const path = here("./site/data.js");
  const source = await readFile(path, "utf8");
  /* data.js 是给浏览器用的普通脚本（顶层 const），不是模块。放进一个新的上下文里跑，
     再把 CATALOG 拎出来 —— 顶层 const 不挂在 globalThis 上，所以末尾补一句导出。 */
  const context = vm.createContext({});
  try {
    vm.runInContext(`${source}\n;globalThis.__catalog = CATALOG;`, context, { filename: path });
  } catch (error) {
    fail([`data.js 跑不起来：${error.message}`]);
  }
  return context.__catalog;
}

/* 树在 index.html 里（与条目分家，改组织不动内容），抠 TREE:BEGIN/END 之间那一段求值。 */
async function loadTree() {
  const path = here("./site/index.html");
  const source = await readFile(path, "utf8");
  const m = source.match(/\/\*\s*TREE:BEGIN[\s\S]*?\*\/([\s\S]*?)\/\*\s*TREE:END\s*\*\//);
  if (!m) fail(["index.html 里找不到 TREE:BEGIN / TREE:END 这两行标记"]);
  try {
    return vm.runInNewContext(`${m[1]}\n;TREE;`);
  } catch (error) {
    fail([`TREE 那段跑不起来：${error.message}`]);
  }
}

function fail(list) {
  process.stderr.write(`自查没过，${list.length} 处：\n`);
  for (const line of list) process.stderr.write(`  - ${line}\n`);
  process.exit(1);
}
