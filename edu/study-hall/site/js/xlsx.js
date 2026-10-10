/**
 * 最小 xlsx 读写。
 *
 * 工具页是静态页，不经打包器，所以拿不到 npm 上的表格库。这里自己写一层：
 * 一支最小 ZIP 读写（`CompressionStream('deflate-raw')`，不支持时就退回不压缩的
 * stored），加一份只够用的 OOXML —— 工作表、内联字符串、数字、日期、共享字符串
 * 的读回。够一个班的量级，不做公式、样式表、合并单元格。
 *
 * 时间在表里写成 Excel 序列号（配 `yyyy-mm-dd hh:mm:ss` 的数字格式），不是文本：
 * 老师拿到文件能直接排序与筛选。
 */

/* ---------- XML ---------- */

/** XML 文本里必须转义的字符。 */
export function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Excel 不接受 XML 1.0 范围外的控制字符，直接丢掉
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}

/** 0 → A、25 → Z、26 → AA。 */
export function columnName(index) {
  let name = '';
  let rest = index;
  while (rest >= 0) {
    name = String.fromCharCode(65 + (rest % 26)) + name;
    rest = Math.floor(rest / 26) - 1;
  }
  return name;
}

/** A1 → { column: 0, row: 0 }。 */
export function parseRef(ref) {
  const matched = /^([A-Z]+)(\d+)$/.exec(ref);
  if (matched === null) {
    return null;
  }
  const letters = matched[1];
  let column = 0;
  for (const ch of letters) {
    column = column * 26 + (ch.charCodeAt(0) - 64);
  }
  return { column: column - 1, row: Number(matched[2]) - 1 };
}

/* ---------- 日期序列号 ---------- */

/** Excel 的 1900 日期系统：1899-12-30 是 0，含那个不存在的 1900-02-29。 */
function localMsToSerial(ms) {
  const date = new Date(ms);
  const utc = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  );
  return utc / 86400000 + 25569;
}

function serialToLocalMs(serial) {
  const utcMs = Math.round((serial - 25569) * 86400000);
  const shifted = new Date(utcMs);
  return new Date(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    shifted.getUTCHours(),
    shifted.getUTCMinutes(),
    shifted.getUTCSeconds(),
    shifted.getUTCMilliseconds(),
  ).getTime();
}

/** 单元格可以放的东西。`{ date: true }` 的数值按时间序列号写。 */
export function text(value) {
  return { kind: 'text', value: value === undefined || value === null ? '' : String(value) };
}

export function number(value) {
  return { kind: 'number', value };
}

export function date(ms) {
  return { kind: 'date', value: ms };
}

/* ---------- ZIP 写 ---------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** 有没有原生的 deflate。没有就整份用 stored，文件大但一定打得开。 */
const canDeflate = typeof CompressionStream === 'function';

async function deflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * 打一个 ZIP。
 *
 * Excel 只认 1900 年以后的时间，这里给所有条目盖同一个当前时刻的 DOS 时间戳 ——
 * 文件在归档里的时间不重要，内容是。
 */
async function zip(entries) {
  const encoder = new TextEncoder();
  const now = new Date();
  const dosTime =
    (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const raw = entry.bytes;
    const method = canDeflate ? 8 : 0;
    const body = canDeflate ? await deflateRaw(raw) : raw;
    const checksum = crc32(raw);

    const local = new Uint8Array(30 + nameBytes.length + body.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    // 第 11 位：文件名是 UTF-8
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, method, true);
    localView.setUint16(10, dosTime, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, body.length, true);
    localView.setUint32(22, raw.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(body, 30 + nameBytes.length);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, method, true);
    centralView.setUint16(12, dosTime, true);
    centralView.setUint16(14, dosDate, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, body.length, true);
    centralView.setUint32(24, raw.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);

    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  const parts = [...locals, ...centrals, end];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

/* ---------- ZIP 读 ---------- */

function findEndOfCentralDirectory(view) {
  for (let index = view.byteLength - 22; index >= 0; index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) {
      return index;
    }
  }
  return -1;
}

/** 把 ZIP 解开成 `名字 → 字节`。大小以中央目录为准，兼容带数据描述符的写法。 */
async function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = findEndOfCentralDirectory(view);
  if (endOffset < 0) {
    throw new Error('这个文件不是 xlsx（找不到 ZIP 结尾）');
  }
  const count = view.getUint16(endOffset + 10, true);
  let cursor = view.getUint32(endOffset + 16, true);
  const decoder = new TextDecoder();

  const files = new Map();
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error('xlsx 的中央目录坏了');
    }
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));

    if (view.getUint32(localOffset, true) !== 0x04034b50) {
      throw new Error(`xlsx 里「${name}」的局部头坏了`);
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = bytes.subarray(dataStart, dataStart + compressedSize);

    if (method === 0) {
      files.set(name, raw);
    } else if (method === 8) {
      if (typeof DecompressionStream !== 'function') {
        throw new Error('这个浏览器不能解压 xlsx，请换 Chrome、Edge 或 Safari 16.4 以上');
      }
      files.set(name, await inflateRaw(raw));
    } else {
      throw new Error(`xlsx 里「${name}」用了不支持的压缩方式（${method}）`);
    }

    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

/* ---------- 写工作簿 ---------- */

function sheetXml(rows) {
  const body = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((cell, columnIndex) => {
          if (cell === undefined || cell === null) {
            return '';
          }
          const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
          if (cell.kind === 'text') {
            if (cell.value === '') {
              return '';
            }
            return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell.value)}</t></is></c>`;
          }
          if (cell.kind === 'date') {
            return `<c r="${ref}" s="1"><v>${localMsToSerial(cell.value)}</v></c>`;
          }
          return `<c r="${ref}"><v>${cell.value}</v></c>`;
        })
        .join('');
      return cells === '' ? '' : `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm:ss"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

/** 工作表名的禁用字符：Excel 不允许这几个，也不允许超过 31 字。 */
export function safeSheetName(name) {
  return name.replace(/[\\/?*[\]:]/g, '·').slice(0, 31);
}

/**
 * 攒一个工作簿。`sheets` 是 `[{ name, rows }]`，`rows` 是二维数组，格子用
 * [`text`] / [`number`] / [`date`] 包。
 */
export async function buildWorkbook(sheets) {
  const encoder = new TextEncoder();
  const files = [];

  const overrides = sheets
    .map(
      (_sheet, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join('');

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;

  const sheetTags = sheets
    .map(
      (sheet, index) =>
        `<sheet name="${escapeXml(safeSheetName(sheet.name))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join('');
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetTags}</sheets></workbook>`;

  const sheetRels = sheets
    .map(
      (_sheet, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join('');
  const stylesRel = `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRels}${stylesRel}</Relationships>`;

  files.push({ name: '[Content_Types].xml', bytes: encoder.encode(contentTypes) });
  files.push({ name: '_rels/.rels', bytes: encoder.encode(RELS_XML) });
  files.push({ name: 'xl/workbook.xml', bytes: encoder.encode(workbook) });
  files.push({ name: 'xl/_rels/workbook.xml.rels', bytes: encoder.encode(workbookRels) });
  files.push({ name: 'xl/styles.xml', bytes: encoder.encode(STYLES_XML) });
  sheets.forEach((sheet, index) => {
    files.push({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      bytes: encoder.encode(sheetXml(sheet.rows)),
    });
  });

  return zip(files);
}

/* ---------- 读工作簿 ---------- */

function decodeText(bytes) {
  return new TextDecoder().decode(bytes);
}

/** 从 `<si>` 块里取文本：可能是 `<t>`，也可能是若干个 `<r><t>`。 */
function sharedStringText(block) {
  const runs = [...block.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => unescapeXml(match[1]));
  return runs.join('');
}

function unescapeXml(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_all, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_all, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&');
}

/** 哪些内建 numFmtId 算日期。自定义的（≥164）看格式串里有没有 y/m/d/h。 */
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function readDateStyles(stylesXml) {
  const custom = new Map();
  for (const match of stylesXml.matchAll(/<numFmt[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
    const code = unescapeXml(match[2]);
    if (/[ymdhs]/i.test(code) && !/[#0]/.test(code.replace(/\[[^\]]*\]/g, ''))) {
      custom.set(Number(match[1]), true);
    }
  }
  const dateStyleIndexes = new Set();
  const cellXfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml);
  if (cellXfs !== null) {
    const xfs = [...cellXfs[1].matchAll(/<xf\b[^>]*>/g)].map((match) => match[0]);
    xfs.forEach((xf, index) => {
      const numFmt = /numFmtId="(\d+)"/.exec(xf);
      const id = numFmt === null ? 0 : Number(numFmt[1]);
      if (BUILTIN_DATE_FORMATS.has(id) || custom.has(id)) {
        dateStyleIndexes.add(index);
      }
    });
  }
  return dateStyleIndexes;
}

/**
 * 解一个工作簿。
 *
 * 返回 `[{ name, rows }]`，`rows` 是二维数组，日期解成毫秒时间戳，其余保持
 * 字符串或数字，没有公式求值 —— 读进来的表当作数据，不当作计算。
 */
export async function parseWorkbook(bytes) {
  const files = await unzip(bytes);

  const sharedStrings = [];
  const sharedBytes = files.get('xl/sharedStrings.xml');
  if (sharedBytes !== undefined) {
    const xml = decodeText(sharedBytes);
    for (const match of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      sharedStrings.push(sharedStringText(match[1]));
    }
  }

  const stylesBytes = files.get('xl/styles.xml');
  const dateStyles =
    stylesBytes === undefined ? new Set() : readDateStyles(decodeText(stylesBytes));

  const workbookBytes = files.get('xl/workbook.xml');
  if (workbookBytes === undefined) {
    throw new Error('这个 xlsx 里没有 workbook.xml');
  }
  const workbookXml = decodeText(workbookBytes);
  const relIdToTarget = new Map();
  const relsBytes = files.get('xl/_rels/workbook.xml.rels');
  if (relsBytes !== undefined) {
    for (const match of decodeText(relsBytes).matchAll(/<Relationship\b[^>]*\/>/g)) {
      const tag = match[0];
      const id = /Id="([^"]+)"/.exec(tag);
      const target = /Target="([^"]+)"/.exec(tag);
      if (id !== null && target !== null) {
        relIdToTarget.set(id[1], target[1].replace(/^\/?xl\//, ''));
      }
    }
  }

  const sheets = [];
  for (const match of workbookXml.matchAll(/<sheet\b[^>]*\/>/g)) {
    const tag = match[0];
    const name = /name="([^"]*)"/.exec(tag);
    const relId = /r:id="([^"]+)"/.exec(tag);
    if (name === null || relId === null) {
      continue;
    }
    const target = relIdToTarget.get(relId[1]) ?? `worksheets/sheet${sheets.length + 1}.xml`;
    const sheetBytes = files.get(`xl/${target}`) ?? files.get(target);
    if (sheetBytes === undefined) {
      continue;
    }
    sheets.push({
      name: unescapeXml(name[1]),
      rows: readSheet(decodeText(sheetBytes), sharedStrings, dateStyles),
    });
  }
  return sheets;
}

function readSheet(xml, sharedStrings, dateStyles) {
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowTag = /<row\b[^>]*>/.exec(rowMatch[0]);
    const rowIndex = Number(/\br="(\d+)"/.exec(rowTag[0])?.[1] ?? rows.length + 1) - 1;
    const row = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1];
      const inner = cellMatch[2] ?? '';
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs);
      const parsed = ref === null ? null : parseRef(ref[1]);
      const column = parsed === null ? row.length : parsed.column;
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? 'n';
      const styleIndex = Number(/\bs="(\d+)"/.exec(attrs)?.[1] ?? '-1');

      let value = '';
      if (type === 'inlineStr') {
        value = sharedStringText(inner);
      } else if (type === 's') {
        const index = Number(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '-1');
        value = sharedStrings[index] ?? '';
      } else if (type === 'b') {
        value = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] === '1';
      } else if (type === 'str') {
        value = unescapeXml(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '');
      } else {
        const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        if (raw === undefined) {
          value = '';
        } else {
          const numeric = Number(raw);
          value = dateStyles.has(styleIndex) ? serialToLocalMs(numeric) : numeric;
        }
      }
      row[column] = value;
    }
    for (let index = 0; index < row.length; index += 1) {
      if (row[index] === undefined) {
        row[index] = '';
      }
    }
    rows[rowIndex] = row;
  }
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index] === undefined) {
      rows[index] = [];
    }
  }
  return rows;
}
