/**
 * BIFF8 的读取（Excel 97-2003 的工作簿流）。
 *
 * 复合文档里那条 `Workbook` 流是一串「记录」：每条前面两个字节说是什么、两个字节说
 * 多长。工作表在流里各占一段，谁在哪一段由 BOUNDSHEET 记着，所以要先把全局那一段
 * 读出来找到它们，再逐段读单元格。
 *
 * 只读：文本（内联与共享字符串表）、数字、RK 压缩数、日期（按 XF 的数字格式认）、
 * 布尔、公式的缓存结果。不读公式本身、不读样式、不读图表。够把一张花名册读成格子。
 *
 * 只认 BIFF8（Excel 97 起）。更老的 `Book` 流另说 —— 那种文件现在很少见，遇到时
 * 直接说清楚，不猜。
 */

import { isCompoundFile, readCompoundFile, takeStream } from './cfb.js';

const RECORD = {
  BOF: 0x0809,
  EOF: 0x000a,
  BOUNDSHEET: 0x0085,
  SST: 0x00fc,
  CONTINUE: 0x003c,
  LABELSST: 0x00fd,
  RK: 0x027e,
  MULRK: 0x00bd,
  LABEL: 0x0204,
  NUMBER: 0x0203,
  BOOLERR: 0x0205,
  FORMULA: 0x0006,
  XF: 0x00e0,
  FORMAT: 0x041e,
  DATEMODE: 0x0022,
};

/** BOF 里的 dt：5 是工作簿全局，16 是工作表。 */
const SUBSTREAM_WORKBOOK = 0x0005;

/** 1900 与 1904 两个日期基准之间的天数差。 */
const DAYS_1900_TO_1904 = 1462;

/**
 * 内建的数字格式里哪些是日期。
 *
 * 自定义格式（>=164）由该文件的 FORMAT 记录给出格式串，按串里有没有 y/m/d/h/s 认。
 */
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

/* ---------- 记录 ---------- */

/** 把一段流切成一串记录，走到 EOF 为止。`start` 是这一段的起点。 */
function readRecords(stream, start) {
  const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  const records = [];
  let offset = start;
  while (offset + 4 <= stream.length) {
    const type = view.getUint16(offset, true);
    const length = view.getUint16(offset + 2, true);
    const from = offset + 4;
    const to = Math.min(from + length, stream.length);
    records.push({ type, data: stream.subarray(from, to), at: offset });
    if (type === RECORD.EOF) {
      break;
    }
    offset = from + length;
  }
  return records;
}

/** 这条记录之后紧跟着的 CONTINUE 都归它 —— 长的东西（共享字符串表）会这么续。 */
function takeContinuations(records, index) {
  const chunks = [records[index].data];
  let next = index + 1;
  while (next < records.length && records[next].type === RECORD.CONTINUE) {
    chunks.push(records[next].data);
    next += 1;
  }
  return { chunks, next };
}

/* ---------- 跨块的读器 ---------- */

/**
 * 连着几块读，块与块之间可以跨。
 *
 * 共享字符串表被切成多条 CONTINUE 时，一个字符串的字符数组正好可能断在块边界上，
 * 而 BIFF8 规定：续块的头一个字节重新给一次「压没压」的记号。所以字符要一个块一个块
 * 地读，每换一块先吃掉那个记号字节。
 */
class ChunkReader {
  constructor(chunks) {
    this.chunks = chunks;
    this.chunk = 0;
    this.offset = 0;
    /** 刚跨过块边界还没吃记号字节。 */
    this.awaitingFlag = false;
  }

  /** 当前块读完了，换下一块。换不过去就返回 false。 */
  advance() {
    while (this.chunk < this.chunks.length && this.offset >= this.chunks[this.chunk].length) {
      this.chunk += 1;
      this.offset = 0;
      if (this.chunk < this.chunks.length) {
        this.awaitingFlag = true;
      }
    }
    return this.chunk < this.chunks.length;
  }

  readUint8() {
    if (!this.advance()) {
      throw new Error('共享字符串表读到尽头了');
    }
    return this.chunks[this.chunk][this.offset++];
  }

  readUint16() {
    const low = this.readUint8();
    const high = this.readUint8();
    return low | (high << 8);
  }

  readUint32() {
    const low = this.readUint16();
    const high = this.readUint16();
    return (low | (high << 16)) >>> 0;
  }

  skip(count) {
    for (let index = 0; index < count; index += 1) {
      this.readUint8();
    }
  }

  /**
   * 读一串字符。`compressed` 为真时是每字一字节的单字节编码，否则是 UTF-16LE。
   * 跨块时按新块的记号字节决定后续怎么读 —— 一个字符串的两半可以是两种编码。
   */
  readChars(count, compressed) {
    let out = '';
    let remaining = count;
    let wide = !compressed;
    while (remaining > 0) {
      if (this.awaitingFlag && this.chunk > 0) {
        // 续块的开头：重新给一次编码记号
        wide = (this.readUint8() & 0x01) === 0 ? false : true;
        this.awaitingFlag = false;
      }
      if (!this.advance()) {
        break;
      }
      const chunk = this.chunks[this.chunk];
      const available = chunk.length - this.offset;
      if (wide) {
        const take = Math.min(remaining, Math.floor(available / 2));
        if (take === 0) {
          // 这一块只剩一个字节，读不动了，交给下一块重新给记号
          this.offset = chunk.length;
          continue;
        }
        const end = this.offset + take * 2;
        for (let index = this.offset; index < end; index += 2) {
          out += String.fromCharCode(chunk[index] | (chunk[index + 1] << 8));
        }
        this.offset = end;
        remaining -= take;
      } else {
        const take = Math.min(remaining, available);
        const end = this.offset + take;
        for (let index = this.offset; index < end; index += 1) {
          out += String.fromCharCode(chunk[index]);
        }
        this.offset = end;
        remaining -= take;
      }
    }
    return out;
  }

  /**
   * 读一个 BIFF8 的 Unicode 字符串。
   *
   * 布局是 `cch(2) + grbit(1) + [cRun(2)] + [cbExtRst(4)] + 字符 + [rgRun] + [ExtRst]`。
   * **`grbit` 只有一个字节** —— 按两个字节读会把第一个字符的头一个字节吃掉，
   * 整张共享字符串表从此错位。
   */
  readUnicodeString() {
    const count = this.readUint16();
    const flags = this.readUint8();
    const rich = (flags & 0x08) !== 0;
    const hasExt = (flags & 0x04) !== 0;
    const wide = (flags & 0x01) !== 0;
    const runCount = rich ? this.readUint16() : 0;
    const extSize = hasExt ? this.readUint32() : 0;
    const text = this.readChars(count, !wide);
    // 富文本的格式段与扩展段排在字符之后，用不到也要跳过，否则下一条字符串就对不齐
    for (let index = 0; index < runCount * 4; index += 1) {
      this.readUint8();
    }
    for (let index = 0; index < extSize; index += 1) {
      this.readUint8();
    }
    return text;
  }

  /** 读一个不带长度前缀的字符串（LABEL 这类记录里接着长度走）。 */
  readCharsOnly(count, wide) {
    return this.readChars(count, !wide);
  }
}

/* ---------- 共享字符串表 ---------- */

function buildSharedStrings(records, index) {
  const { chunks } = takeContinuations(records, index);
  const reader = new ChunkReader(chunks);
  const total = reader.readUint32();
  const unique = reader.readUint32();
  const strings = [];
  for (let position = 0; position < unique; position += 1) {
    try {
      strings.push(reader.readUnicodeString());
    } catch {
      break;
    }
  }
  if (strings.length < unique && total > 0) {
    // 读不满就按读到的用：多认几个字比整张表读不出来强
    return strings;
  }
  return strings;
}

/* ---------- XF 与日期 ---------- */

/**
 * 收一遍格式表，得到「哪些 XF 序号是日期」。
 *
 * XF 记录给出每个单元格样式用的 numFmtId；numFmtId 小于 164 的是内建格式（其中有
 * 一撮是日期），大于等于 164 的去 FORMAT 记录里找格式串，按串里有没有日期记号认。
 */
function collectDateStyles(records) {
  const customFormats = new Map();
  for (const record of records) {
    if (record.type !== RECORD.FORMAT) {
      continue;
    }
    const view = new DataView(record.data.buffer, record.data.byteOffset, record.data.byteLength);
    if (record.data.length < 4) {
      continue;
    }
    const id = view.getUint16(0, true);
    try {
      const reader = new ChunkReader([record.data.subarray(2)]);
      const code = reader.readUnicodeString();
      customFormats.set(id, code);
    } catch {
      /* 这条格式读不出来就当没有 */
    }
  }

  const isDateCode = (code) => {
    // 去掉中括号里的条件与颜色段、去掉引号里的字面量，再看有没有日期记号
    const cleaned = code
      .replace(/\[[^\]]*\]/g, '')
      .replace(/"[^"]*"/g, '')
      .replace(/\\./g, '');
    return /[ymdhs]/i.test(cleaned);
  };

  const dateStyles = new Set();
  let xfIndex = 0;
  for (const record of records) {
    if (record.type !== RECORD.XF) {
      continue;
    }
    const view = new DataView(record.data.buffer, record.data.byteOffset, record.data.byteLength);
    const numFmtId = record.data.length >= 4 ? view.getUint16(2, true) : 0;
    // 先看这份文件自己定义的格式串：WPS 与老 Excel 会用 50–63 这段 id 自带 FORMAT
    // 记录（例如 60 定义成 yyyy-mm-dd），只按内建表判会漏掉。
    // 文件自己定义的优先于内建表 —— 它可以把某个内建 id 覆盖成别的意思。
    if (customFormats.has(numFmtId)) {
      if (isDateCode(customFormats.get(numFmtId))) {
        dateStyles.add(xfIndex);
      }
    } else if (BUILTIN_DATE_FORMATS.has(numFmtId)) {
      dateStyles.add(xfIndex);
    }
    xfIndex += 1;
  }
  return dateStyles;
}

/* ---------- 数字 ---------- */

/** 1900 日期系统的序列号 → 本地墙上时间的毫秒。 */
function serialToMs(serial, date1904) {
  const days = date1904 ? serial + DAYS_1900_TO_1904 : serial;
  const utcMs = Math.round((days - 25569) * 86400000);
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

/** RK：把被压过的数还原出来。 */
function decodeRk(raw, wide) {
  let value;
  if ((raw & 0x02) !== 0) {
    // 中间 30 位是有符号整数
    value = raw >> 2;
  } else {
    // 高 30 位是双精度数的高 30 位，低 34 位补零
    const buffer = new DataView(new ArrayBuffer(8));
    buffer.setUint32(4, (raw & 0xfffffffc) >>> 0, true);
    value = buffer.getFloat64(0, true);
  }
  if ((raw & 0x01) !== 0) {
    value /= 100;
  }
  return wide ? serialToMs(value, false) : value;
}

/* ---------- 工作簿 ---------- */

/** 一行一行的格子。行与列的下标直接到位，中间空着的补空串。 */
class Grid {
  constructor() {
    this.rows = [];
  }

  set(row, column, value) {
    let target = this.rows[row];
    if (target === undefined) {
      target = [];
      this.rows[row] = target;
    }
    target[column] = value;
  }

  finish() {
    for (let index = 0; index < this.rows.length; index += 1) {
      const row = this.rows[index];
      if (row === undefined) {
        this.rows[index] = [];
        continue;
      }
      for (let column = 0; column < row.length; column += 1) {
        if (row[column] === undefined) {
          row[column] = '';
        }
      }
    }
    return this.rows;
  }
}

/**
 * 读一份 `.xls`（Excel 97-2003），返回 `[{ name, rows }]`，与 xlsx 那条路的形状一致。
 */
export function parseBiffWorkbook(bytes) {
  if (!isCompoundFile(bytes)) {
    throw new Error('这不是 .xls（OLE2 复合文档）');
  }
  const streams = readCompoundFile(bytes);
  const workbookStream = takeStream(streams, 'Workbook');
  if (workbookStream === null) {
    if (takeStream(streams, 'Book') !== null) {
      throw new Error('这是 Excel 5.0/95 的老格式，请用 Excel 或 WPS 另存为 .xlsx 再导入');
    }
    throw new Error('这份 .xls 里没有 Workbook 流，可能不是表格文件');
  }

  const globals = readRecords(workbookStream, 0);
  if (globals.length === 0 || globals[0].type !== RECORD.BOF) {
    throw new Error('这份 .xls 的工作簿流不对');
  }
  const globalsView = new DataView(
    globals[0].data.buffer,
    globals[0].data.byteOffset,
    globals[0].data.byteLength,
  );
  if (globals[0].data.length >= 4 && globalsView.getUint16(2, true) !== SUBSTREAM_WORKBOOK) {
    throw new Error('这份 .xls 的工作簿流起点不对');
  }

  let sharedStrings = [];
  let date1904 = false;
  const sheetRefs = [];
  for (let index = 0; index < globals.length; index += 1) {
    const record = globals[index];
    if (record.type === RECORD.SST) {
      sharedStrings = buildSharedStrings(globals, index);
      continue;
    }
    if (record.type === RECORD.DATEMODE) {
      const view = new DataView(record.data.buffer, record.data.byteOffset, record.data.byteLength);
      date1904 = record.data.length >= 2 && view.getUint16(0, true) === 1;
      continue;
    }
    if (record.type === RECORD.BOUNDSHEET) {
      const view = new DataView(record.data.buffer, record.data.byteOffset, record.data.byteLength);
      if (record.data.length < 8) {
        continue;
      }
      const offset = view.getUint32(0, true);
      const nameLength = record.data[6];
      const flags = record.data[7];
      const wide = (flags & 0x01) !== 0;
      let name = '';
      if (wide) {
        for (let slot = 0; slot < nameLength; slot += 1) {
          name += String.fromCharCode(view.getUint16(8 + slot * 2, true));
        }
      } else {
        for (let slot = 0; slot < nameLength; slot += 1) {
          name += String.fromCharCode(record.data[8 + slot]);
        }
      }
      sheetRefs.push({ name, offset });
    }
  }

  const dateStyles = collectDateStyles(globals);

  const sheets = [];
  for (const sheetRef of sheetRefs) {
    if (sheetRef.offset <= 0 || sheetRef.offset >= workbookStream.length) {
      sheets.push({ name: sheetRef.name, rows: [] });
      continue;
    }
    sheets.push({
      name: sheetRef.name,
      rows: readSheet(workbookStream, sheetRef.offset, {
        sharedStrings,
        dateStyles,
        date1904,
      }),
    });
  }
  return sheets;
}

function readSheet(stream, start, context) {
  const records = readRecords(stream, start);
  const grid = new Grid();
  const { sharedStrings, dateStyles, date1904 } = context;

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const view = new DataView(record.data.buffer, record.data.byteOffset, record.data.byteLength);

    switch (record.type) {
      case RECORD.LABELSST: {
        if (record.data.length < 10) {
          break;
        }
        const row = view.getUint16(0, true);
        const column = view.getUint16(2, true);
        const stringIndex = view.getUint32(6, true);
        grid.set(row, column, sharedStrings[stringIndex] ?? '');
        break;
      }
      case RECORD.RK: {
        if (record.data.length < 10) {
          break;
        }
        const row = view.getUint16(0, true);
        const column = view.getUint16(2, true);
        const styleIndex = view.getUint16(4, true);
        const raw = view.getInt32(6, true);
        grid.set(row, column, decodeRkValue(raw, styleIndex, dateStyles, date1904));
        break;
      }
      case RECORD.MULRK: {
        if (record.data.length < 6) {
          break;
        }
        const row = view.getUint16(0, true);
        const firstColumn = view.getUint16(2, true);
        // 每条 6 字节（XF 2 + RK 4），末尾还有一个 2 字节的末列号
        const count = Math.floor((record.data.length - 6) / 6);
        for (let slot = 0; slot < count; slot += 1) {
          const base = 4 + slot * 6;
          const styleIndex = view.getUint16(base, true);
          const raw = view.getInt32(base + 2, true);
          grid.set(row, firstColumn + slot, decodeRkValue(raw, styleIndex, dateStyles, date1904));
        }
        break;
      }
      case RECORD.NUMBER: {
        if (record.data.length < 14) {
          break;
        }
        const row = view.getUint16(0, true);
        const column = view.getUint16(2, true);
        const styleIndex = view.getUint16(4, true);
        const value = view.getFloat64(6, true);
        grid.set(row, column, dateStyles.has(styleIndex) ? serialToMs(value, date1904) : value);
        break;
      }
      case RECORD.BOOLERR: {
        if (record.data.length < 8) {
          break;
        }
        const row = view.getUint16(0, true);
        const column = view.getUint16(2, true);
        const value = record.data[6];
        const isError = record.data[7];
        grid.set(row, column, isError === 0 ? value !== 0 : '');
        break;
      }
      case RECORD.LABEL: {
        if (record.data.length < 8) {
          break;
        }
        const row = view.getUint16(0, true);
        const column = view.getUint16(2, true);
        const { chunks } = takeContinuations(records, index);
        try {
          const reader = new ChunkReader(chunks);
          reader.skip(6);
          const count = reader.readUint16();
          const flags = reader.readUint8();
          grid.set(row, column, reader.readCharsOnly(count, (flags & 0x01) !== 0));
        } catch {
          /* 这条读不出来就留空 */
        }
        break;
      }
      case RECORD.FORMULA: {
        if (record.data.length < 14) {
          break;
        }
        const row = view.getUint16(0, true);
        const column = view.getUint16(2, true);
        const styleIndex = view.getUint16(4, true);
        const marker = record.data[12];
        const kind = record.data[13];
        if (marker === 0xff && kind === 0xff) {
          const special = record.data[6];
          if (special === 1) {
            grid.set(row, column, record.data[8] !== 0);
          } else if (special === 0) {
            // 字符串结果在紧随其后的 STRING 记录里
            const { chunks } = takeContinuations(records, index + 1);
            try {
              const reader = new ChunkReader(chunks);
              const count = reader.readUint16();
              const flags = reader.readUint8();
              grid.set(row, column, reader.readCharsOnly(count, (flags & 0x01) !== 0));
            } catch {
              grid.set(row, column, '');
            }
          }
          break;
        }
        const value = view.getFloat64(6, true);
        grid.set(row, column, dateStyles.has(styleIndex) ? serialToMs(value, date1904) : value);
        break;
      }
      default:
        break;
    }
  }
  return grid.finish();
}

/** RK 与 NUMBER 共有的一步：按样式决定是不是日期。 */
function decodeRkValue(raw, styleIndex, dateStyles, date1904) {
  const value = decodeRk(raw, false);
  return dateStyles.has(styleIndex) ? serialToMs(value, date1904) : value;
}
