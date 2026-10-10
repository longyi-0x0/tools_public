/**
 * 按**内容**读一份表格文件，不管它叫什么名字。
 *
 * 老师从教务系统、从别的老师那里拿到的文件，扩展名常常不作数：叫 `.xls` 的可能是
 * 真 BIFF8 二进制、可能是 HTML 表、也可能是 Excel 的 XML 表格。所以这里不看扩展名，
 * 只看开头几个字节与文本长相：
 *
 * - `D0 CF 11 E0` 起头 → OLE2 复合文档，真 `.xls`
 * - `PK` 起头 → ZIP，`.xlsx`
 * - 文本里有 `<table>` → HTML 表
 * - 文本里有 office:spreadsheet 的 `<Workbook>` → XML Spreadsheet 2003
 *
 * 返回值与 xlsx 那条路同一个形状：`[{ name, rows }]`。
 */

import { parseBiffWorkbook } from './biff.js';
import { isCompoundFile } from './cfb.js';
import {
  looksLikeHtml,
  looksLikeSpreadsheetMl,
  parseHtmlTables,
  parseSpreadsheetMl,
} from './textTable.js';
import { parseWorkbook } from './xlsx.js';

function startsWith(bytes, signature) {
  if (bytes.length < signature.length) {
    return false;
  }
  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[index] !== signature[index]) {
      return false;
    }
  }
  return true;
}

/** 把声明里的编码名归一成 TextDecoder 认的标签。 */
function normaliseLabel(label) {
  const lower = label.toLowerCase();
  if (/^utf-?8$/.test(lower)) {
    return 'utf-8';
  }
  // GB2312 与 GBK 都是 GB18030 的子集，用它一个就够
  if (/^gb2312$|^gbk$|^x-gbk$|^gb_2312|^gb18030$|^cp936$/.test(lower)) {
    return 'gb18030';
  }
  if (/^big5|^cp950/.test(lower)) {
    return 'big5';
  }
  return lower;
}

function decodeLoose(bytes, label) {
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    /* 这个环境不认这个编码名，往下退 */
  }
  try {
    return new TextDecoder('gb18030').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/**
 * 文本用哪种字符编码。
 *
 * 教务系统的导出常常是 GBK 系（老系统尤其），而这类文件会在头里自己声明。
 * 声明通常是对的，就按它解；但**声明也可能是错的** —— 明明存成 UTF-8 却写着
 * gb2312 的导出并不罕见。所以留一条退路：按声明解出来一堆替换字符（U+FFFD），
 * 而严格按 UTF-8 又解得通时，改用 UTF-8。
 *
 * 反过来不担心：真正的中文 GBK 文本几乎不可能同时是一串合法的 UTF-8 字节序，
 * 所以「严格 UTF-8 解得通」是相当可靠的判据。
 */
function decodeText(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes);
  }

  let strictUtf8 = null;
  try {
    strictUtf8 = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    strictUtf8 = null;
  }

  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4096));
  const declared = /(?:charset|encoding)\s*=\s*["']?\s*([\w-]+)/i.exec(head);
  if (declared === null) {
    return strictUtf8 ?? decodeLoose(bytes, 'gb18030');
  }

  const honoured = decodeLoose(bytes, normaliseLabel(declared[1]));
  if (honoured.includes('\ufffd') && strictUtf8 !== null) {
    return strictUtf8;
  }
  return honoured;
}

/** 读一份表格文件的内容，返回工作表。认不出来时把话说清楚。 */
export async function readSheetBytes(bytes) {
  if (startsWith(bytes, [0x50, 0x4b])) {
    return parseWorkbook(bytes);
  }
  if (isCompoundFile(bytes)) {
    return parseBiffWorkbook(bytes);
  }

  // 走到这里只可能是文本形式；先当文本解，解出来不像表再报错
  const text = decodeText(bytes);
  if (looksLikeSpreadsheetMl(text)) {
    return parseSpreadsheetMl(text);
  }
  if (looksLikeHtml(text)) {
    return parseHtmlTables(text);
  }
  throw new Error('认不出这是什么表格文件。支持 .xlsx、.xls，以及被存成 .xls 的网页表格');
}

/** 读一个 `File`。 */
export async function readSheetFile(file) {
  return readSheetBytes(new Uint8Array(await file.arrayBuffer()));
}
