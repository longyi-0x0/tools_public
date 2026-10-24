/**
 * 读花名册、把文件下下来。
 *
 * 读表**看内容不看扩展名**（`.xlsx` / 真的 `.xls` / 被存成 `.xls` 的网页表格与 XML
 * 表格，认法见 `readSheets.js`）：老师手上的名单来自各处，扩展名常常不作数。
 * 这里只管认列、取名学生与落盘，认不出就报错说清。
 */

import { h, uid } from './dom.js';

/**
 * 花名册认哪些扩展名。
 *
 * `.xls` 要收：老师从教务系统拿到的名单常常是这个。但**扩展名不作数** ——
 * 读的时候按内容认（见 `readSheets.js`），这里只是给文件选择框一个提示。
 */
export const ROSTER_ACCEPT = '.xlsx,.xls';

/** 从文件名取一个默认的班级名：去掉扩展名。 */
export function baseName(fileName) {
  return fileName.replace(/\.(xlsx|xls)$/i, '');
}

/**
 * 把一张表的行读成名册。
 *
 * 认表头：哪一列是姓名、哪一列是学号、哪一列是座位，靠首行文字认；没有表头时
 * 退回「第一列学号、第二列姓名」。姓名空着的行跳过。
 */
export function studentsFromRows(rows) {
  const cleaned = rows.filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''));
  if (cleaned.length === 0) {
    return [];
  }
  const header = cleaned[0].map((cell) => String(cell ?? '').trim());
  const findColumn = (...names) => header.findIndex((item) => names.some((name) => item.includes(name)));
  const nameColumn = findColumn('姓名', '名字', '学生');
  const hasHeader = nameColumn >= 0;
  const codeColumn = hasHeader ? findColumn('学号', '编号') : 0;
  const seatColumn = hasHeader ? findColumn('座位', '座号') : -1;
  const body = hasHeader ? cleaned.slice(1) : cleaned;

  const students = [];
  for (const row of body) {
    const name = String(row[hasHeader ? nameColumn : 1] ?? '').trim();
    if (name === '') {
      continue;
    }
    students.push({
      id: uid('stu'),
      name,
      code: codeColumn >= 0 ? String(row[codeColumn] ?? '').trim() : '',
      seat: seatColumn >= 0 ? String(row[seatColumn] ?? '').trim() : '',
    });
  }
  return students;
}

/**
 * 在一份文件的各张表里找名册。
 *
 * 先看有没有哪张表叫「名册」；没有就按顺序一张张试，取第一张能读出学生的。
 * 之所以要试而不是直接取第一张：教务系统的导出常把标题、说明各占一张表，
 * 名册在里面某一张上。
 */
export function rosterFromSheets(sheets) {
  const named = sheets.find((sheet) => sheet.name.includes('名册'));
  if (named !== undefined) {
    const students = studentsFromRows(named.rows);
    if (students.length > 0) {
      return students;
    }
  }
  for (const sheet of sheets) {
    const students = studentsFromRows(sheet.rows);
    if (students.length > 0) {
      return students;
    }
  }
  return [];
}

export function download(filename, bytes, type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const anchor = h('a', { href: url, download: filename });
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
