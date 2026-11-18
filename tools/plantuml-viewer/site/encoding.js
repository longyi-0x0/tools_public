/**
 * PlantUML 文本编码：UTF-8 → raw DEFLATE → PlantUML 自定义 base64。
 *
 * 纯函数，不碰 DOM：页面 `import` 它，`test/encoding.test.mjs` 也在 node 里直接跑同一份。
 * 压缩走浏览器原生 `CompressionStream("deflate-raw")`（产品决定：不 vendor 第三方库）；
 * 老环境没有这个构造器时，页面显示「浏览器太旧」，而不是拿一张英文报错图充数。
 */

/** PlantUML 自己的 base64 表：标准表的 `+/` 换成 `-_`，字符顺序不变。 */
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";

/** 官方服务器根地址。只有这一个：页面不提供「自定义服务器」这个入口。 */
export const SERVER = "https://www.plantuml.com/plantuml";

/** 地址长度的前端上限：超过就不发请求。实测 7318 字符即 400，故取 7000 留余量（不是官方保证）。 */
export const MAX_URL_LENGTH = 7000;

/** 当前环境有没有原生 raw DEFLATE（Chrome/Edge 103+、Safari 16.4+、Firefox 113+）。 */
export function compressionAvailable() {
  return typeof CompressionStream === "function";
}

/** UTF-8 字节 → raw DEFLATE 字节（RFC 1951，无 zlib 头、无校验尾）。 */
export async function deflateRaw(bytes) {
  const compressed = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}

/**
 * 压缩字节 → PlantUML 自定义 base64：每 3 字节出 4 个字符，末组不足 3 字节补 0。
 * 注意这是 PlantUML 的表，不是标准 base64——用错表服务端只会回一张报错图。
 */
export function toPlantUmlBase64(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b3 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out +=
      ALPHABET[b1 >> 2] +
      ALPHABET[((b1 & 0x03) << 4) | (b2 >> 4)] +
      ALPHABET[((b2 & 0x0f) << 2) | (b3 >> 6)] +
      ALPHABET[b3 & 0x3f];
  }
  return out;
}

/**
 * 补上 `@startuml`/`@enduml`：源码里一条 `@startuml` 都没有时才补。
 *
 * 只补「没有」这一种：源码里已有 `@startuml`（哪怕前面还有别的行）时再补一遍
 * 会变成两层 `@startuml`，反而多一张报错图。返回的 `note` 是给界面那行小字用的：
 *
 *   "auto"      真的补了头尾；
 *   "misplaced" 有 `@startuml`，但不在首个非空行——服务器会把前面的行当图内容，
 *               多半报错，界面据此提醒一句（这里不改用户的源码）；
 *   ""          首行就是 `@startuml`（前面只有空行也算），什么都不用说。
 */
export function withBoundaries(source) {
  const text = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  const first = lines.findIndex((line) => line.trim() !== "");
  const firstLine = first === -1 ? "" : lines[first].trim();
  const hasStart = lines.some((line) => /^\s*@startuml\b/i.test(line));
  if (!hasStart) {
    const body = text.replace(/^\s+|\s+$/g, "");
    return { text: `@startuml\n${body}\n@enduml`, autofilled: true, note: "auto" };
  }
  return { text, autofilled: false, note: /^@startuml\b/i.test(firstLine) ? "" : "misplaced" };
}

/**
 * 一次渲染要用的全部东西：补齐后的源码、编码串、图片地址、是否超长。
 *
 * 地址超长由前端先算出来（> 7000），页面据此不发请求——`<img>` 拿不到状态码，
 * 让它自己撞 400 只会给用户一张白卡片。
 */
export async function renderPlan(source) {
  const { text, autofilled, note } = withBoundaries(source);
  const encoded = toPlantUmlBase64(await deflateRaw(new TextEncoder().encode(text)));
  const url = `${SERVER}/svg/${encoded}`;
  return { text, autofilled, note, encoded, url, tooLong: url.length > MAX_URL_LENGTH };
}
