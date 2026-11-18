/**
 * 编码对拍：同一段源码编出来的地址，官方服务器要解得开。
 *
 * 只验「服务端解得出来」：HTTP 200 + `image/svg+xml` + 正文里没有
 * "This URL does not look like DEFLATE data"。**不逐字符比编码串**——
 * DEFLATE 允许不同实现产出不同字节（方案 V4），只打出来供对照。
 *
 * 跑（需要联网，官方不带浏览器 UA 会 403，所以请求带 UA）：
 *
 *     node tools/plantuml-viewer/test/encoding.test.mjs
 *
 * 这个文件与 `package.json` 一样不在 `site/` 里，不发布。
 */
import assert from "node:assert/strict";

import { DEFAULT_EXAMPLE, EXAMPLES } from "../site/examples.js";
import { MAX_URL_LENGTH, SERVER, compressionAvailable, renderPlan } from "../site/encoding.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

let failures = 0;

function pass(message) {
  process.stdout.write(`PASS ${message}\n`);
}

function fail(message) {
  failures += 1;
  process.stderr.write(`FAIL ${message}\n`);
}

async function fetchSvg(url) {
  const response = await fetch(url, {
    headers: { "user-agent": UA, accept: "image/svg+xml,*/*" },
  });
  const body = await response.text();
  return { status: response.status, contentType: response.headers.get("content-type") ?? "", body };
}

/** 一次完整对拍：编码 → 地址 → 拿响应 → 判「解开了」。 */
async function checkRenders(label, source) {
  const plan = await renderPlan(source);
  assert.equal(plan.tooLong, false, `${label}：地址不该超长`);
  assert.match(plan.encoded, /^[0-9A-Za-z_-]+$/, `${label}：编码字符表只能是 PlantUML 那 64 个字符`);

  const { status, contentType, body } = await fetchSvg(plan.url);
  assert.equal(status, 200, `${label}：期望 200，实际 ${status}`);
  assert.match(contentType, /image\/svg\+xml/i, `${label}：期望 image/svg+xml，实际 ${contentType}`);
  assert.ok(
    !/does not look like DEFLATE data/i.test(body),
    `${label}：服务端说这不是 DEFLATE 数据，编码错了`,
  );
  assert.ok(/<svg/i.test(body), `${label}：200 但正文不是 SVG`);
  pass(`${label}：200 image/svg+xml，编码 ${plan.encoded.length} 字符`);
  return plan;
}

async function main() {
  assert.equal(MAX_URL_LENGTH, 7000, "地址上限应为 7000");
  assert.ok(compressionAvailable(), "node 里没有 CompressionStream：这个 node 版本太旧");

  // 1. 方案 §14.2 用的基准源码。只当参考：CompressionStream 与 zlib 不保证同字节。
  const baseline = "@startuml\nAlice -> Bob: hello\n@enduml\n";
  const baselinePlan = await checkRenders("基准源码", baseline);
  process.stdout.write(
    `INFO 编码串 ${baselinePlan.encoded}` +
      (baselinePlan.encoded === "SoWkIImgAStDuNBCoKnELT2rKt3AJx9Io4ZDoSddSaZDIm790G00"
        ? "（与方案 §14.2 的 zlib 基准逐字符相同）\n"
        : "（与方案 §14.2 的 zlib 基准不同，服务端能解开即可）\n"),
  );

  // 2. 内置三个示例都要能出图；第一个同时是首次进入的预填内容。
  assert.ok(EXAMPLES.length === 3, "示例应为 3 个");
  for (const example of EXAMPLES) {
    await checkRenders(`示例「${example.label}」`, example.source);
  }
  assert.equal(DEFAULT_EXAMPLE, EXAMPLES[0], "预填内容应是第一个示例");

  // 3. 没写 @startuml 时自动补齐，补完仍能出图。
  const bare = await renderPlan("Alice -> Bob: hi");
  assert.equal(bare.autofilled, true, "没写 @startuml 时应标记已补");
  assert.equal(bare.note, "auto", "补齐后界面要显示「已自动补」那行");
  assert.ok(bare.text.startsWith("@startuml\n"), "补齐后应以 @startuml 开头");
  assert.ok(bare.text.endsWith("\n@enduml"), "补齐后应以 @enduml 结尾");
  const bareResponse = await fetchSvg(bare.url);
  assert.equal(bareResponse.status, 200);
  assert.ok(!/does not look like DEFLATE data/i.test(bareResponse.body));
  pass("自动补 @startuml/@enduml 后：200 image/svg+xml");

  // 4. 已有 @startuml 时不再补，避免两层 @startuml。
  const already = await renderPlan("@startuml\nA -> B\n@enduml");
  assert.equal(already.autofilled, false, "已有 @startuml 时不应再补");
  assert.equal(already.note, "", "首行就是 @startuml：不该出那行小字");
  assert.equal((already.text.match(/@startuml/g) ?? []).length, 1, "@startuml 只能出现一次");

  // 4b. @startuml 前面只有空行：服务器认，照样不出提示。
  const blankFirst = await renderPlan("\n\n@startuml\nA -> B\n@enduml");
  assert.equal(blankFirst.note, "", "首个非空行是 @startuml：不该出那行小字");

  // 4c. @startuml 前还有别的行：不改源码，但要提醒服务器会把前面的行当图内容。
  const misplacedSource = "// 头部注释\n@startuml\nA -> B\n@enduml";
  const misplaced = await renderPlan(misplacedSource);
  assert.equal(misplaced.autofilled, false, "不该在没有补的情况下标成已补");
  assert.equal(misplaced.note, "misplaced", "应提示 @startuml 不在首行");
  assert.equal(misplaced.text, misplacedSource, "提醒归提醒，不能改用户源码");

  // 5. 超长源码（> 20 万字符）：前端算出来就拦，不发请求。内容要够杂，压不动才会真超长。
  const lines = [];
  for (let i = 0; i < 5000; i += 1) {
    lines.push(`用户${i} -> 服务${i * 7 % 997}: 第 ${i} 次调用，带上一点长度免得压得太狠`);
  }
  const huge = `@startuml\n${lines.join("\n")}\n@enduml\n`;
  assert.ok(huge.length > 200000, `超长用例的源码应超过 20 万字符，实际 ${huge.length}`);
  const hugePlan = await renderPlan(huge);
  assert.equal(hugePlan.tooLong, true, `超过 ${MAX_URL_LENGTH} 字符的地址应判定超长`);
  assert.ok(hugePlan.url.length > MAX_URL_LENGTH);
  pass(`超长拦截：源码 ${huge.length} 字符 → 地址 ${hugePlan.url.length} 字符，未发请求`);

  process.stdout.write(`INFO 服务器 ${SERVER}；失败 ${failures} 条\n`);
  if (failures > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`FAIL ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
