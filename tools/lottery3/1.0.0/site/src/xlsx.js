/**
 * 最小 xlsx 读写。
 *
 * 工具页是静态页，不经打包器，拿不到 npm 上的表格库，这里自己写一层：
 * 一支最小 ZIP（读用 DecompressionStream 解 deflate-raw，写一律用 stored
 * 不压缩，Excel 照样打得开），加一份只够用的 OOXML —— 工作表、共享字符串、
 * 内联字符串、数字。不做公式、样式表、合并单元格。
 */

/** 读第一张工作表，返回二维数组，单元格都是字符串。 */
export async function readXlsx(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const files = unzip(bytes);
  const decoder = new TextDecoder('utf-8');

  const shared = files.has('xl/sharedStrings.xml')
    ? parseSharedStrings(decoder.decode(await inflate(files, 'xl/sharedStrings.xml')))
    : [];

  const sheetName = firstSheetName(files);
  if (!sheetName) throw new Error('这个文件里没有工作表');
  const sheetXml = decoder.decode(await inflate(files, sheetName));
  return parseSheet(sheetXml, shared);
}

/** 把二维数组写成 xlsx，返回可直接下载的 Blob。 */
export async function writeXlsx(rows, sheetName = 'Sheet1') {
  const files = [
    ['[Content_Types].xml', contentTypes()],
    ['_rels/.rels', rootRels()],
    ['xl/workbook.xml', workbook(sheetName)],
    ['xl/_rels/workbook.xml.rels', workbookRels()],
    ['xl/worksheets/sheet1.xml', sheet(rows)],
  ];
  return zipStored(files);
}

/* ---------------- 读 ---------------- */

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;

function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let eocd = -1;
  const from = Math.max(0, bytes.length - 65558);
  for (let i = bytes.length - 22; i >= from; i -= 1) {
    if (view.getUint32(i, true) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('不是有效的 xlsx 文件');

  const count = view.getUint16(eocd + 10, true);
  const files = new Map();
  let offset = view.getUint32(eocd + 16, true);

  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(offset, true) !== SIG_CENTRAL) break;
    const method = view.getUint16(offset + 10, true);
    const packedSize = view.getUint32(offset + 20, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);

    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLen));
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLen + localExtraLen;

    files.set(name, { method, data: bytes.subarray(start, start + packedSize) });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

async function inflate(files, name) {
  const entry = files.get(name);
  if (!entry) throw new Error(`文件里缺少 ${name}`);
  if (entry.method === 0) return entry.data;
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('这个浏览器解不了压缩的 xlsx，请另存为不压缩的文件再试');
  }
  const stream = new Blob([entry.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function firstSheetName(files) {
  for (const name of files.keys()) {
    if (/^xl\/worksheets\/sheet\d*\.xml$/.test(name)) return name;
  }
  return null;
}

function parseSharedStrings(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return [...doc.getElementsByTagName('si')].map((node) => textOfNode(node));
}

function parseSheet(xml, shared) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const rows = [];

  for (const row of doc.getElementsByTagName('row')) {
    const cells = [];
    for (const cell of row.getElementsByTagName('c')) {
      const type = cell.getAttribute('t');
      const value = cell.getElementsByTagName('v')[0]?.textContent ?? '';
      if (type === 's') cells.push(shared[Number(value)] ?? '');
      else if (type === 'inlineStr') cells.push(cell.getElementsByTagName('t')[0]?.textContent ?? '');
      else cells.push(value);
    }
    rows.push(cells);
  }
  return rows;
}

function textOfNode(node) {
  return [...node.getElementsByTagName('t')].map((t) => t.textContent ?? '').join('');
}

/* ---------------- 写 ---------------- */

function sheet(rows) {
  const body = rows
    .map((cells, rowIndex) => {
      const line = cells
        .map((value, colIndex) => {
          const ref = `${columnName(colIndex)}${rowIndex + 1}`;
          const text = escapeXml(String(value ?? ''));
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowIndex + 1}">${line}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function workbook(name) {
  return `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(name)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
}

function workbookRels() {
  return `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
}

function rootRels() {
  return `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
}

function contentTypes() {
  return `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
}

/** 全用 stored：不压缩，省掉一份压缩实现，Excel 照样读。 */
function zipStored(files) {
  const encoder = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;

  for (const [name, content] of files) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0x2821, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    parts.push(local);

    const dir = new Uint8Array(46 + nameBytes.length);
    const dv = new DataView(dir.buffer);
    dv.setUint32(0, SIG_CENTRAL, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 20, true);
    dv.setUint16(8, 0, true);
    dv.setUint16(10, 0, true);
    dv.setUint16(12, 0, true);
    dv.setUint16(14, 0x2821, true);
    dv.setUint32(16, crc, true);
    dv.setUint32(20, data.length, true);
    dv.setUint32(24, data.length, true);
    dv.setUint16(28, nameBytes.length, true);
    dv.setUint32(42, offset, true);
    dir.set(nameBytes, 46);
    central.push(dir);

    offset += local.length;
  }

  const dirSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, SIG_EOCD, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, dirSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...parts, ...central, end], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function columnName(index) {
  let name = '';
  let n = index;
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

function escapeXml(text) {
  return text.replace(/[<>&"']/g, (ch) => `&${{ '<': 'lt', '>': 'gt', '&': 'amp', '"': 'quot', "'": 'apos' }[ch]};`);
}
