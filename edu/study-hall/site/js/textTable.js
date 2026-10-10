/**
 * 文本形式的表格：HTML 的 `<table>` 与 Excel 的 XML Spreadsheet 2003。
 *
 * 这两种东西经常被存成 `.xls`：教务系统导出花名册时尤其常见 —— 浏览器下载下来
 * 名字是 .xls，内容其实是一张 HTML 表。Excel 自己也这么干（「网页」另存）。
 * 所以按**内容**认，不按扩展名认。
 *
 * 解析用正则而不是 `DOMParser`：这类文件都是机器生成的，标签规整；用一条路径在
 * 浏览器与 Node 里跑同一份代码，验的时候不必验两遍。
 */

/** 里面有 `<table>` 就当是 HTML 表。 */
export function looksLikeHtml(text) {
  return /<table[\s>]/i.test(text) || (/<html[\s>]/i.test(text) && /<tr[\s>]/i.test(text));
}

/** Excel 的 XML Spreadsheet 2003：根元素 Workbook，带那一串 office 命名空间。 */
export function looksLikeSpreadsheetMl(text) {
  return /<Workbook[\s>]/i.test(text) && /schemas-microsoft-com:office:spreadsheet/i.test(text);
}

/** XML 与 HTML 里都要还原的实体。 */
function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_all, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_all, code) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&');
}

/** 单元格里的标签去掉，`<br>` 当空格，再把实体还原回来。 */
function cellText(inner) {
  return decodeEntities(
    inner
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]*>/g, ''),
  ).trim();
}

/** 取一个标签上某个属性的值，属性可能带引号也可能不带。 */
function attribute(tag, name) {
  const quoted = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag);
  if (quoted !== null) {
    return decodeEntities(quoted[1]);
  }
  const single = new RegExp(`${name}\\s*=\\s*'([^']*)'`, 'i').exec(tag);
  if (single !== null) {
    return decodeEntities(single[1]);
  }
  const bare = new RegExp(`${name}\\s*=\\s*([^\\s>]+)`, 'i').exec(tag);
  return bare === null ? null : decodeEntities(bare[1]);
}

/**
 * 读 HTML 里的表。
 *
 * 一张 `<table>` 一条结果。表名按这个次序取：Excel 自己在头里写的那个 XML 块里的
 * `<x:Name>`（真导出里就有，形如
 * `<!--[if gte mso 9]><xml>…<x:Name>名册</x:Name>…`），其次 `<caption>`，
 * 都没有就按顺序叫「表格 N」。
 *
 * 单元格里的 `colspan` 用空串补齐，`rowspan` 不管 —— 花名册里合并单元格只会出现在
 * 标题那一行，补位比精确还原更有用。
 */
export function parseHtmlTables(text) {
  // Excel 会给每张表记一个名字，顺序与表一致
  const declaredNames = [...text.matchAll(/<x:Name>([\s\S]*?)<\/x:Name>/gi)].map((match) =>
    cellText(match[1]),
  );

  const sheets = [];
  const tablePattern = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let match;
  let index = 0;
  while ((match = tablePattern.exec(text)) !== null) {
    const position = index;
    index += 1;
    const body = match[1];
    const caption = /<caption\b[^>]*>([\s\S]*?)<\/caption>/i.exec(body);
    const declaredName = declaredNames[position];
    const name =
      declaredName !== undefined && declaredName !== ''
        ? declaredName
        : caption !== null
          ? cellText(caption[1])
          : `表格 ${index}`;

    const rows = [];
    const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowPattern.exec(body)) !== null) {
      const row = [];
      const cellPattern = /<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi;
      let cellMatch;
      while ((cellMatch = cellPattern.exec(rowMatch[1])) !== null) {
        const span = Number(attribute(cellMatch[1], 'colspan') ?? '1');
        row.push(cellText(cellMatch[2]));
        for (let extra = 1; extra < span; extra += 1) {
          row.push('');
        }
      }
      rows.push(row);
    }
    if (rows.length > 0) {
      sheets.push({ name, rows });
    }
  }
  return sheets;
}

/**
 * 读 Excel 的 XML Spreadsheet 2003。
 *
 * 单元格的值在 `<Data>` 里，`ss:Type` 说它是数字还是文本；位置能被 `ss:Index`
 * 跳过，跳过的位置补空串。
 */
export function parseSpreadsheetMl(text) {
  const sheets = [];
  const sheetPattern = /<Worksheet\b([^>]*)>([\s\S]*?)<\/Worksheet>/gi;
  let sheetMatch;
  let index = 0;
  while ((sheetMatch = sheetPattern.exec(text)) !== null) {
    index += 1;
    const name = attribute(sheetMatch[1], 'ss:Name') ?? `工作表 ${index}`;
    const rows = [];
    const table = /<Table\b[^>]*>([\s\S]*?)<\/Table>/i.exec(sheetMatch[2]);
    if (table === null) {
      sheets.push({ name, rows: [] });
      continue;
    }
    const rowPattern = /<Row\b([^>]*)>([\s\S]*?)<\/Row>/gi;
    let rowMatch;
    while ((rowMatch = rowPattern.exec(table[1])) !== null) {
      const row = [];
      if (rowMatch[1].length === 0 || !/\/>$/.test(rowMatch[1])) {
        const cellPattern = /<Cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/Cell>)/gi;
        let cellMatch;
        while ((cellMatch = cellPattern.exec(rowMatch[2])) !== null) {
          const skip = Number(attribute(cellMatch[1], 'ss:Index') ?? '0');
          if (skip > 0) {
            while (row.length < skip - 1) {
              row.push('');
            }
          }
          const inner = cellMatch[2] ?? '';
          const data = /<Data\b([^>]*)>([\s\S]*?)<\/Data>/i.exec(inner);
          let value = '';
          if (data !== null) {
            const raw = cellText(data[2]);
            const type = attribute(data[1], 'ss:Type') ?? 'String';
            value = /Number|Boolean/i.test(type) && raw !== '' && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
          }
          row.push(value);
        }
      }
      rows.push(row);
    }
    sheets.push({ name, rows });
  }
  return sheets;
}
