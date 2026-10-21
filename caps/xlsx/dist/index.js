/**
 * `xlsx`：读一份 .xlsx，交出「表名 + 行」。
 *
 * 不引第三方库：.xlsx 就是一个 ZIP，里面是几份 XML。浏览器自带
 * `DecompressionStream("deflate-raw")`，解压这一步不必自己实现，于是整个读取器
 * 只剩「找条目、解压、取单元格」三件事。
 *
 * 范围写清楚，别假装全支持：
 *
 * - **只读**，不写。写要自己编 ZIP，本轮不做。
 * - 单元格取「显示出来的值」：共享字符串、内联字符串、数字、布尔。日期**不转换**
 *   —— Excel 存的是序列号，转成日期需要样式表里的数字格式，那是另一件事。
 * - 公式取缓存值（`<v>`），不求值。
 * - 合并单元格不展开：只出现在左上角那一格。
 *
 * 这些边界都是「读名单、读表格」够用的那部分；要更完整就得换一个真正的解析库。
 */

export function create() {
  const api = {
    /**
     * 读一份工作簿。
     *
     * @param {ArrayBuffer | Uint8Array | Blob} input
     * @returns {Promise<{ sheets: Array<{ name: string, rows: string[][] }> }>}
     */
    async read(input) {
      const bytes = await toBytes(input);
      const zip = await readZip(bytes);
      const shared = await readSharedStrings(zip);
      const sheets = await readSheets(zip, shared);
      return { sheets };
    },

    /** 只取第一张表，多数场景只关心这个。没有表时返回 `null`。 */
    async readFirstSheet(input) {
      const { sheets } = await api.read(input);
      return sheets[0] ?? null;
    },
  };

  return { xlsx: api };
}

/** 统一成 Uint8Array：三种输入都是常见形态。 */
async function toBytes(input) {
  if (input instanceof Uint8Array) {
    return input;
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  if (typeof Blob !== "undefined" && input instanceof Blob) {
    return new Uint8Array(await input.arrayBuffer());
  }
  throw new TypeError("xlsx.read 只收 ArrayBuffer、Uint8Array 或 Blob");
}

// ---------------------------------------------------------------- ZIP

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

/** 只解开需要的条目：整本解压会把大表的内存翻几倍。 */
async function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(view);
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);

  const entries = new Map();
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      throw new Error("不是合法的 .xlsx：中央目录损坏");
    }
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(
      bytes.subarray(offset + 46, offset + 46 + nameLength),
    );
    entries.set(name, { method, compressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return {
    names: () => [...entries.keys()],
    has: (name) => entries.has(name),
    async text(name) {
      const entry = entries.get(name);
      if (entry === undefined) {
        return null;
      }
      return new TextDecoder().decode(await inflate(bytes, view, entry));
    },
  };
}

function findEocd(view) {
  // EOCD 在最末尾，最多带 65535 字节注释。
  const stop = Math.max(0, view.byteLength - 65557);
  for (let at = view.byteLength - 22; at >= stop; at -= 1) {
    if (view.getUint32(at, true) === EOCD_SIGNATURE) {
      return at;
    }
  }
  throw new Error("不是合法的 .xlsx：找不到 ZIP 目录");
}

async function inflate(bytes, view, entry) {
  const local = entry.localOffset;
  if (view.getUint32(local, true) !== LOCAL_SIGNATURE) {
    throw new Error("不是合法的 .xlsx：文件头损坏");
  }
  const nameLength = view.getUint16(local + 26, true);
  const extraLength = view.getUint16(local + 28, true);
  const start = local + 30 + nameLength + extraLength;
  const raw = bytes.subarray(start, start + entry.compressedSize);

  if (entry.method === 0) {
    return raw;
  }
  if (entry.method !== 8) {
    throw new Error(`不支持的压缩方式：${entry.method}`);
  }
  if (typeof DecompressionStream === "undefined") {
    throw new Error("当前浏览器不支持 DecompressionStream，读不了 .xlsx");
  }
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ---------------------------------------------------------------- XML

function parseXml(text) {
  const document = new DOMParser().parseFromString(text, "application/xml");
  if (document.getElementsByTagName("parsererror").length > 0) {
    throw new Error("不是合法的 .xlsx：内部 XML 坏了");
  }
  return document;
}

async function readSharedStrings(zip) {
  const text = await zip.text("xl/sharedStrings.xml");
  if (text === null) {
    return [];
  }
  const document = parseXml(text);
  return [...document.getElementsByTagName("si")].map((item) =>
    [...item.getElementsByTagName("t")].map((node) => node.textContent ?? "").join(""),
  );
}

async function readSheets(zip, shared) {
  const workbookText = await zip.text("xl/workbook.xml");
  if (workbookText === null) {
    throw new Error("不是合法的 .xlsx：没有 xl/workbook.xml");
  }
  const names = [...parseXml(workbookText).getElementsByTagName("sheet")].map(
    (node) => node.getAttribute("name") ?? "",
  );

  // 表顺序与 xl/worksheets/sheetN.xml 的编号一致，这是 Excel 一贯的写法。
  const sheets = [];
  for (let index = 0; index < names.length; index += 1) {
    const path = `xl/worksheets/sheet${index + 1}.xml`;
    const text = await zip.text(path);
    if (text === null) {
      continue;
    }
    sheets.push({ name: names[index] ?? `Sheet${index + 1}`, rows: readRows(parseXml(text), shared) });
  }
  return sheets;
}

function readRows(document, shared) {
  const rows = [];
  for (const rowNode of document.getElementsByTagName("row")) {
    const values = [];
    for (const cell of rowNode.getElementsByTagName("c")) {
      const column = columnIndex(cell.getAttribute("r") ?? "");
      while (values.length < column) {
        values.push("");
      }
      values[column - 1] = readCell(cell, shared);
    }
    rows.push(values);
  }
  return rows;
}

/** `C12` → 3。 */
function columnIndex(reference) {
  let index = 0;
  for (const char of reference) {
    const code = char.charCodeAt(0);
    if (code < 65 || code > 90) {
      break;
    }
    index = index * 26 + (code - 64);
  }
  return index === 0 ? 1 : index;
}

function readCell(cell, shared) {
  const type = cell.getAttribute("t");
  if (type === "inlineStr") {
    return [...cell.getElementsByTagName("t")].map((node) => node.textContent ?? "").join("");
  }
  const valueNode = cell.getElementsByTagName("v")[0];
  const raw = valueNode?.textContent ?? "";
  if (type === "s") {
    const index = Number(raw);
    return Number.isInteger(index) ? (shared[index] ?? "") : "";
  }
  if (type === "b") {
    return raw === "1" ? "TRUE" : "FALSE";
  }
  return raw;
}
