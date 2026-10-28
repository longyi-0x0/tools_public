/**
 * 把本仓的 tools/ 与 caps/ 组装成一个可上传的版本目录。
 *
 * 产出是 `releases/<source>/<release>/` 的内容：catalog.json + tools/<id>/… + caps/<id>/…。
 * 脚本只做构建与校验，不联网——上传与 commitRelease 在工作流里做。
 *
 * `tools/` 下一层目录名就是工具 id，版本层可选：
 *
 *     tools/<id>/tool.json                 无版本
 *     tools/<id>/<version>/tool.json       有版本，可并存多个
 *
 * id 与版本都**只从目录名取**，`tool.json` 里出现 `id` 或 `version` 一律拒绝：
 * 两处都写就有了两个事实来源，改目录名时漏改会留下「目录是 A、清单说自己是 B」
 * 这种线上查不出来的状态。同一个 id 只能走其中一种形态，混用直接失败。
 *
 * 环境变量：
 *   TOOLBOX_SOURCE       tools 或 tools_public（本仓固定 tools_public）
 *   TOOLBOX_RELEASE      版本目录名，默认 `<GITHUB_SHA>-s5`
 *   TOOLBOX_TOOLS_BASE   H5 装载基址，默认 https://toolbox.longyi.cloud/
 *   RELEASE_STAGE        输出目录，默认 .release
 */

import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE = "tools_public";
const SCHEMA_VERSION = 5;
/** 与服务端 LIMITS.toolIdPattern 同一口径。 */
const CAPABILITY_ID = /^[A-Za-z0-9._-]{1,64}$/;
/** 工具 id 只来自目录名：小写字母、数字与连字符。 */
const TOOL_ID = /^[a-z0-9][a-z0-9-]*$/;
/** 版本目录名：三段数字。 */
const VERSION = /^\d+\.\d+\.\d+$/;
const repoRoot = process.cwd();
const release =
  maybeText(process.env.TOOLBOX_RELEASE) ??
  `${process.env.GITHUB_SHA ?? Date.now()}-s${SCHEMA_VERSION}`;
if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(release)) {
  fail(`TOOLBOX_RELEASE 不合法：${release}`);
}
const toolsBase = withTrailingSlash(
  process.env.TOOLBOX_TOOLS_BASE ?? "https://toolbox.longyi.cloud/",
);
if (!toolsBase.startsWith("https://")) {
  fail("TOOLBOX_TOOLS_BASE 必须以 https:// 开头");
}

const stage = path.resolve(process.env.RELEASE_STAGE ?? ".release");
const toolsRoot = path.join(repoRoot, "tools");
const capsRoot = path.join(repoRoot, "caps");

await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });

const tools = [];
const caps = {};

for (const entry of await readdir(toolsRoot, { withFileTypes: true })) {
  if (entry.name.startsWith(".") || entry.name === "README.md") {
    continue;
  }
  if (entry.isFile()) {
    // 单文件形态已废弃：它放不下版本，也承载不了 site/。
    fail(
      `tools/${entry.name}：单文件形态已废弃，改到 tools/<id>/tool.json 或 tools/<id>/<版本>/tool.json`,
    );
  }
  if (!entry.isDirectory()) {
    continue;
  }
  const id = entry.name;
  if (!TOOL_ID.test(id)) {
    fail(`tools/${id}/：目录名不是合法工具 id（只能小写字母、数字与连字符）`);
  }
  tools.push(...(await loadToolDir(id)));
}

tools.sort(
  (left, right) =>
    left.id.localeCompare(right.id) || right.version.localeCompare(left.version),
);
const seen = new Set();
for (const tool of tools) {
  const key = `${tool.id}@${tool.version}`;
  if (seen.has(key)) {
    fail(`工具重复：${tool.id}${tool.version === "" ? "" : `@${tool.version}`}`);
  }
  seen.add(key);
}

for (const capability of await loadCaps()) {
  if (capability.id in caps) {
    fail(`能力 id「${capability.id}」在两个能力包里重复`);
  }
  caps[capability.id] = { entry: capability.entry, version: capability.version };
}

const catalog = {
  schemaVersion: SCHEMA_VERSION,
  source: SOURCE,
  release,
  generatedAt: new Date().toISOString(),
  toolsBase,
  sources: [
    {
      label: process.env.GITHUB_REPOSITORY ?? "longyi-0x0/tools_public",
      ref: process.env.GITHUB_REF_NAME ?? "main",
      commit: process.env.GITHUB_SHA ?? release,
    },
  ],
  tools,
  caps,
};

await writeFile(path.join(stage, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);

process.stdout.write(
  `${JSON.stringify({ source: SOURCE, release, stage, tools: tools.length, caps: Object.keys(caps).length })}\n`,
);

/**
 * 一个工具目录：可能走无版本形态，也可能带若干版本目录。
 *
 * 判定只看 `tools/<id>/tool.json` 在不在——在了就是无版本，不在就找版本目录。
 * 两种信号同时出现说明有人把迁移做了一半，直接失败而不是挑一个。
 */
async function loadToolDir(id) {
  const toolDir = path.join(toolsRoot, id);
  const flatManifest = path.join(toolDir, "tool.json");
  const children = (await readdir(toolDir, { withFileTypes: true })).filter(
    (child) => child.isDirectory() && !child.name.startsWith("."),
  );
  const versioned = children.filter((child) => VERSION.test(child.name));
  const others = children.filter((child) => !VERSION.test(child.name));

  if (await exists(flatManifest)) {
    if (versioned.length > 0) {
      fail(
        `tools/${id}/：同时有 tool.json 与版本目录（${versioned.map((c) => c.name).join("、")}），两种形态只能选一种`,
      );
    }
    return [await loadTool(flatManifest, { id, version: "", dir: toolDir })];
  }

  if (versioned.length === 0) {
    fail(`tools/${id}/：既没有 tool.json，也没有版本目录`);
  }
  if (others.length > 0) {
    // 有版本形态下，id 目录只该有版本目录；混进别的目录会被误读成版本。
    fail(
      `tools/${id}/：有版本形态下只允许版本目录，不能有 ${others.map((c) => c.name).join("、")}`,
    );
  }

  const loaded = [];
  for (const child of versioned) {
    const dir = path.join(toolDir, child.name);
    const manifest = path.join(dir, "tool.json");
    if (!(await exists(manifest))) {
      fail(`tools/${id}/${child.name}/：缺 tool.json`);
    }
    loaded.push(await loadTool(manifest, { id, version: child.name, dir }));
  }
  return loaded;
}

async function loadTool(manifestPath, { id, version, dir }) {
  const raw = JSON.parse(await readFile(manifestPath, "utf8"));
  const 位置 = version === "" ? `tools/${id}/` : `tools/${id}/${version}/`;

  if (raw["schemaVersion"] !== 2) {
    fail(`${位置}tool.json：schemaVersion 必须是 2`);
  }
  if (raw["type"] !== "tool") {
    fail(`${位置}tool.json：type 必须是 tool`);
  }
  if (raw["id"] !== undefined) {
    fail(`${位置}tool.json：不要再写 id，id 只从目录名取`);
  }
  if (raw["version"] !== undefined) {
    fail(`${位置}tool.json：不要再写 version，版本只从目录名取`);
  }
  const kind = raw["kind"];
  if (kind !== "h5" && kind !== "web") {
    fail(`${位置}tool.json：kind 只能是 h5 或 web`);
  }
  const entry = requireText(raw["entry"]);
  const capabilities = stringArray(raw["capabilities"], `${位置}tool.json：capabilities`);
  const tags = stringArray(raw["tags"], `${位置}tool.json：tags`);

  let catalogEntry;
  if (kind === "h5") {
    if (entry.startsWith("/") || entry.includes("..")) {
      fail(`${位置}tool.json：entry 必须是 site/ 下的相对路径`);
    }
    const site = path.join(dir, "site");
    if (!(await exists(site))) {
      fail(`${位置}：h5 工具缺 site/ 目录`);
    }
    if (!(await exists(path.join(site, entry)))) {
      fail(`${位置}：site/${entry} 不存在`);
    }
    const target = version === "" ? path.join(stage, "tools", id) : path.join(stage, "tools", id, version);
    await mkdir(target, { recursive: true });
    await cp(site, target, { recursive: true });
    catalogEntry = `tools/${id}/${version === "" ? "" : `${version}/`}${entry}`;
  } else {
    if (!entry.startsWith("https://")) {
      fail(`${位置}tool.json：web 工具的 entry 必须是 https 地址`);
    }
    catalogEntry = entry;
  }

  return {
    id,
    version,
    name: requireText(raw["name"]),
    description: typeof raw["description"] === "string" ? raw["description"] : "",
    tags,
    kind,
    entry: catalogEntry,
    capabilities,
  };
}

async function loadCaps() {
  if (!(await exists(capsRoot))) {
    return [];
  }
  const loaded = [];
  for (const entry of await readdir(capsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) {
      continue;
    }
    const dir = path.join(capsRoot, entry.name);
    const manifestPath = path.join(dir, "cap.json");
    if (!(await exists(manifestPath))) {
      fail(`${manifestPath} 不存在`);
    }
    const raw = JSON.parse(await readFile(manifestPath, "utf8"));
    const bundle = requireText(raw["id"]);
    if (bundle !== entry.name) {
      fail(`${manifestPath}：id「${bundle}」与目录名「${entry.name}」不一致`);
    }
    const version = requireText(raw["version"]);
    const dist = path.join(dir, "dist");

    // 两种写法：单能力用 entry；一个包提供多个能力用 provides。
    // 后者是常态——store.kv 与 store.docs 共用一份握手与请求封装。
    const provides = {};
    if (raw["provides"] !== undefined) {
      if (raw["entry"] !== undefined) {
        fail(`${manifestPath}：entry 与 provides 只能二选一`);
      }
      const map = raw["provides"];
      if (map === null || typeof map !== "object" || Array.isArray(map)) {
        fail(`${manifestPath}：provides 必须是 { "<能力 id>": "<dist 内相对路径>" }`);
      }
      for (const [id, target] of Object.entries(map)) {
        if (!CAPABILITY_ID.test(id)) {
          fail(`${manifestPath}：能力 id「${id}」格式不合法`);
        }
        provides[id] = requireText(target);
      }
      if (Object.keys(provides).length === 0) {
        fail(`${manifestPath}：provides 不能为空`);
      }
    } else {
      provides[bundle] = requireText(raw["entry"]);
    }

    for (const [id, capabilityEntry] of Object.entries(provides)) {
      if (!(await exists(path.join(dist, capabilityEntry)))) {
        fail(`${manifestPath}：dist/${capabilityEntry}（能力 ${id}）不存在`);
      }
    }

    const target = path.join(stage, "caps", bundle);
    await mkdir(target, { recursive: true });
    await cp(dist, target, { recursive: true });
    for (const [id, capabilityEntry] of Object.entries(provides)) {
      loaded.push({ id, version, entry: `caps/${bundle}/${capabilityEntry}` });
    }
  }
  return loaded;
}

function stringArray(value, where) {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    fail(`${where} 必须是非空字符串数组`);
  }
  return value;
}

function maybeText(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  return value.trim();
}

function requireText(value) {
  const text = maybeText(value);
  if (text === null) {
    fail("缺少必填字符串");
  }
  return text;
}

function withTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

function fail(message) {
  throw new Error(message);
}
