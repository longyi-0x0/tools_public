#!/usr/bin/env node
/**
 * 把组装好的版本目录上传到静态托管。
 *
 * 不直接用 `tcb hosting deploy`：CI 跑在海外 runner 上，往国内对象存储传的吞吐只有
 * 二三十 KB/s，几个大文件会把连接一直扛到被判「User network is too slow」。实测
 * `hello` 级别的 21 KB 能过，带一个 1.2 MB vendor 包的 2.3 MB 就已经贴着超时边缘。
 *
 * 这里改成把产物 gzip 切小片，发到 `toolbox_service` 的 `/ops/shell`，由函数在
 * 腾讯云内网写桶。网关单次请求约 64 KB，所以每片压到 32 KB。
 *
 * `catalog.json` 由服务端最后写：中途失败时线上仍是上一份完整版本。
 *
 * 环境变量：
 *   TOOLBOX_SERVICE_URL   必填，`toolbox_service` 的 HTTP 地址
 *   TOOLBOX_RELEASE_TOKEN 必填，本源专用发布令牌
 *   TOOLBOX_SOURCE        必填，tools 或 tools_public
 *   TOOLBOX_RELEASE       必填，版本目录名，形如 v0.1.0-s5
 *   RELEASE_STAGE         可选，默认 `.release`
 */

import { randomUUID } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

/** 每片压完的上限。网关单次请求约 64 KB，留足 base64 与 JSON 的开销。 */
const PART_BYTES = 32 * 1024;
/** 一批最多带多少字节的 base64，稳在网关上限以内。 */
const BATCH_BYTES = 48 * 1024;

const serviceUrl = required("TOOLBOX_SERVICE_URL").replace(/\/+$/, "");
const token = required("TOOLBOX_RELEASE_TOKEN");
const source = required("TOOLBOX_SOURCE");
const release = required("TOOLBOX_RELEASE");
const stage = path.resolve(process.env.RELEASE_STAGE ?? ".release");
const prefix = `releases/${source}/${release}/`;
const upload = randomUUID().replace(/-/g, "");

const files = await collect(stage);
if (files.length === 0) {
  fail(`${stage} 下没有文件，先跑 scripts/build-release.mjs`);
}
if (!files.some((file) => file.relative === "catalog.json")) {
  fail(`${stage} 下没有 catalog.json，这不是一份完整版本目录`);
}

process.stdout.write(
  `上传 ${files.length} 个文件到 ${serviceUrl} → ${prefix}\n`,
);

// 1. 分片暂存。攒够一批再发，减少往返。
let batch = [];
let sent = 0;
const plans = [];

for (const file of files) {
  const gzip = gzipSync(await readFile(file.absolute), { level: 9 });
  const chunks = [];
  for (let offset = 0, index = 0; offset < gzip.byteLength; offset += PART_BYTES, index += 1) {
    chunks.push({
      path: file.relative,
      index,
      data: gzip.subarray(offset, offset + PART_BYTES).toString("base64"),
    });
  }
  plans.push({ path: file.relative, parts: chunks.length });

  for (const chunk of chunks) {
    if (batch.length > 0 && sizeOf(batch) + chunk.data.length > BATCH_BYTES) {
      await post("/ops/shell", { upload, parts: batch, prefix });
      sent += batch.length;
      batch = [];
    }
    batch.push(chunk);
  }
}
if (batch.length > 0) {
  await post("/ops/shell", { upload, parts: batch, prefix });
  sent += batch.length;
}

process.stdout.write(`暂存 ${sent} 片，开始提交\n`);

// 2. 提交拼装。catalog.json 在这之后才会被换掉。
const result = await post("/ops/shell/commit", { upload, files: plans, prefix });
process.stdout.write(
  `完成：写入 ${result.written} 个文件，共 ${Math.round(result.bytes / 1024)} KB\n`,
);

async function collect(root) {
  const out = [];
  await walk(root, "");
  return out;

  async function walk(directory, relative) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      const absolute = path.join(directory, entry.name);
      const next = relative === "" ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        await walk(absolute, next);
        continue;
      }
      const info = await stat(absolute);
      if (!info.isFile() || info.size === 0) {
        continue;
      }
      out.push({ absolute, relative: next });
    }
  }
}

function sizeOf(items) {
  let total = 0;
  for (const item of items) {
    total += item.data.length + item.path.length + 40;
  }
  return total;
}

async function post(route, body) {
  const response = await fetch(`${serviceUrl}${route}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-token": token,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail(`${route} 返回了非 JSON：${text.slice(0, 200)}`);
  }
  if (!response.ok || parsed.ok !== true) {
    const error = parsed?.error ?? {};
    fail(`${route} 失败：${error.code ?? response.status} ${error.message ?? ""}`);
  }
  return parsed.data;
}

function required(name) {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    fail(`缺少环境变量 ${name}`);
  }
  return value.trim();
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
