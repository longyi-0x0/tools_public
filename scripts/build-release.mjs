/**
 * 把本仓的 tools/ 与 caps/ 组装成一个可上传的版本目录。
 *
 * 产出是 `releases/<source>/<release>/` 的内容：catalog.json + tools/<id>/… + caps/<id>/…。
 * 脚本只做构建与校验，不联网——上传与 commitRelease 在工作流里做。
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
  if (entry.name.startsWith(".")) {
    continue;
  }
  if (entry.isFile() && entry.name.endsWith(".tool.json")) {
    const id = entry.name.slice(0, -".tool.json".length);
    tools.push(await loadTool(path.join(toolsRoot, entry.name), id, false));
    continue;
  }
  if (entry.isDirectory()) {
    const manifest = path.join(toolsRoot, entry.name, "tool.json");
    if (await exists(manifest)) {
      tools.push(await loadTool(manifest, entry.name, true));
    }
  }
}

tools.sort((left, right) => left.id.localeCompare(right.id));
const seen = new Set();
for (const tool of tools) {
  if (seen.has(tool.id)) {
    fail(`工具 id 重复：${tool.id}`);
  }
  seen.add(tool.id);
}

for (const capability of await loadCaps()) {
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

async function loadTool(manifestPath, expectedId, isDirectory) {
  const raw = JSON.parse(await readFile(manifestPath, "utf8"));
  if (raw["schemaVersion"] !== 2) {
    fail(`${manifestPath}：schemaVersion 必须是 2`);
  }
  if (raw["type"] !== "tool") {
    fail(`${manifestPath}：type 必须是 tool`);
  }
  const id = requireText(raw["id"]);
  if (id !== expectedId) {
    fail(`${manifestPath}：id「${id}」与文件名/目录名「${expectedId}」不一致`);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    fail(`${manifestPath}：id 只能是小写字母、数字与连字符`);
  }
  const kind = raw["kind"];
  if (kind !== "h5" && kind !== "web") {
    fail(`${manifestPath}：kind 只能是 h5 或 web`);
  }
  const entry = requireText(raw["entry"]);
  const capabilities = stringArray(raw["capabilities"], `${manifestPath}：capabilities`);
  const tags = stringArray(raw["tags"], `${manifestPath}：tags`);

  let catalogEntry;
  if (kind === "h5") {
    if (!isDirectory) {
      fail(`${manifestPath}：h5 工具必须是目录形态`);
    }
    if (entry.startsWith("/") || entry.includes("..")) {
      fail(`${manifestPath}：entry 必须是 site/ 下的相对路径`);
    }
    const site = path.join(path.dirname(manifestPath), "site");
    const entryFile = path.join(site, entry);
    if (!(await exists(entryFile))) {
      fail(`${manifestPath}：site/${entry} 不存在`);
    }
    const target = path.join(stage, "tools", id);
    await mkdir(target, { recursive: true });
    await cp(site, target, { recursive: true });
    catalogEntry = `tools/${id}/${entry}`;
  } else {
    if (!entry.startsWith("https://")) {
      fail(`${manifestPath}：web 工具的 entry 必须是 https 地址`);
    }
    catalogEntry = entry;
  }

  return {
    id,
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
    const id = requireText(raw["id"]);
    if (id !== entry.name) {
      fail(`${manifestPath}：id「${id}」与目录名「${entry.name}」不一致`);
    }
    const version = requireText(raw["version"]);
    const capabilityEntry = requireText(raw["entry"]);
    const dist = path.join(dir, "dist");
    if (!(await exists(path.join(dist, capabilityEntry)))) {
      fail(`${manifestPath}：dist/${capabilityEntry} 不存在`);
    }
    const target = path.join(stage, "caps", id);
    await mkdir(target, { recursive: true });
    await cp(dist, target, { recursive: true });
    loaded.push({ id, version, entry: `caps/${id}/${capabilityEntry}` });
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
