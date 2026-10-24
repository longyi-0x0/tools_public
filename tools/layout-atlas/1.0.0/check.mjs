#!/usr/bin/env node
/**
 * data.js 自查。不开浏览器、不联网，只看数据本身对不对。
 *
 *     node check.mjs
 *
 * 查的是那些「错了也不会报错，只会在页面上悄悄失真」的地方：params 与 css 里的
 * var(--…) 对不上、group 写了个不存在的、id 重了、默认值越界。有问题逐条列出并
 * 以 1 退出；没问题就把每条的名字打出来。
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const dataPath = fileURLToPath(new URL("./site/data.js", import.meta.url));
const source = await readFile(dataPath, "utf8");

/* data.js 是给浏览器用的普通脚本（顶层 const），不是模块。放进一个新的上下文里跑，
   再把 CATALOG 拎出来 —— 顶层 const 不挂在 globalThis 上，所以末尾补一句导出。 */
const context = vm.createContext({});
try {
  vm.runInContext(`${source}\n;globalThis.__catalog = CATALOG;`, context, {
    filename: dataPath,
  });
} catch (error) {
  fail([`data.js 跑不起来：${error.message}`]);
}

const CATALOG = context.__catalog;
if (CATALOG === undefined || !Array.isArray(CATALOG.items)) {
  fail(["data.js 里没有 CATALOG.items 数组"]);
}

const problems = [];
const ID = /^[a-z0-9][a-z0-9-]*$/;
const groupIds = new Set((CATALOG.groups ?? []).map((g) => g.id));
const seen = new Set();

for (const [index, item] of CATALOG.items.entries()) {
  const at = `第 ${index + 1} 条（${item?.id ?? "无 id"}）`;

  if (typeof item?.id !== "string" || !ID.test(item.id)) {
    problems.push(`${at}：id 要是小写字母、数字或连字符，且以字母或数字开头`);
  } else if (seen.has(item.id)) {
    problems.push(`${at}：id 重复`);
  } else {
    seen.add(item.id);
  }

  if (typeof item?.name !== "string" || item.name.trim() === "") {
    problems.push(`${at}：缺 name`);
  }
  if (!groupIds.has(item?.group)) {
    problems.push(`${at}：group「${item?.group}」不在 CATALOG.groups 里`);
  }
  if (typeof item?.summary !== "string" || item.summary.trim() === "") {
    problems.push(`${at}：缺 summary`);
  }
  if (typeof item?.html !== "string" || item.html.trim() === "") {
    problems.push(`${at}：缺 html`);
  }
  if (typeof item?.css !== "string" || item.css.trim() === "") {
    problems.push(`${at}：缺 css`);
  }
  if (item?.previewVw !== undefined && !(Number.isFinite(item.previewVw) && item.previewVw > 0)) {
    problems.push(`${at}：previewVw 要是正数`);
  }
  if (item?.tags !== undefined) {
    if (!Array.isArray(item.tags) || item.tags.some((t) => typeof t !== "string" || t.trim() === "")) {
      problems.push(`${at}：tags 要是非空字符串组成的数组`);
    }
  }

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
    if (declared.has(p.name)) {
      problems.push(`${at}：params 里 --${p.name} 重复`);
    }
    declared.add(p.name);
    if (typeof p.label !== "string" || p.label.trim() === "") {
      problems.push(`${at}：--${p.name} 缺 label`);
    }
    for (const key of ["min", "max", "step", "value"]) {
      if (!Number.isFinite(p[key])) {
        problems.push(`${at}：--${p.name} 的 ${key} 不是数字`);
      }
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

  /* 硬规矩：params 与 css 里的 var(--…) 必须严格一一对应。两边都查，防的是
     「滑块改不动预览」和「预览里有个值找不到滑块」这两种悄悄失真。 */
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

if (problems.length > 0) {
  fail(problems);
}

const byGroup = new Map((CATALOG.groups ?? []).map((g) => [g.id, []]));
for (const item of CATALOG.items) {
  byGroup.get(item.group).push(item.name ?? item.id);
}
process.stdout.write(`自查通过：${CATALOG.items.length} 条\n`);
for (const group of CATALOG.groups ?? []) {
  const list = byGroup.get(group.id);
  process.stdout.write(`  ${group.name}（${list.length}）${list.length ? "：" + list.join("、") : ""}\n`);
}

function fail(list) {
  process.stderr.write(`自查没过，${list.length} 处：\n`);
  for (const line of list) {
    process.stderr.write(`  - ${line}\n`);
  }
  process.exit(1);
}
