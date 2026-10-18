/**
 * 活动文件：读入一份 xlsx、生成模板、导出结果。
 *
 * 表的结构只有两张：
 *
 * - `奖品`：奖品名称、数量、权重（可选）、等级（可选）
 * - `名单`：姓名、部门（可选）、工号（可选）
 *
 * 表名可以先不较真：先按表名认，认不出来再看表头。列的顺序也不要求，
 * 认的是表头里的字。所有解析都在浏览器里做，文件不上传。
 */

import { date, buildWorkbook, number, parseWorkbook, text } from './xlsx.js';

const HEADERS = {
  prizeName: ['奖品名称', '奖项名称', '奖品', '奖项', '奖名', '名称'],
  prizeCount: ['数量', '名额', '个数', '份数'],
  prizeWeight: ['权重', '概率'],
  prizeLevel: ['等级', '级别', '奖级'],
  personName: ['姓名', '名字', '参与人', '员工姓名', '成员'],
  personDept: ['部门', '科室', '单位', '班级', '组别'],
  personEmployeeId: ['工号', '员工号', '编号', '学号'],
};

const PRIZE_SHEET = /奖品|奖项|奖池/;
const PEOPLE_SHEET = /名单|人员|参与|抽奖人/;

function cell(row, index) {
  const value = row?.[index];
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'number') {
    return value;
  }
  return String(value).trim();
}

function cellText(row, index) {
  const value = cell(row, index);
  return typeof value === 'number' ? String(value) : value;
}

/** 表头里找某一列的序号；认不出时 -1。 */
function findColumn(header, candidates) {
  const names = header.map((value) => String(value ?? '').replace(/\s+/g, ''));
  for (const candidate of candidates) {
    const exact = names.indexOf(candidate);
    if (exact !== -1) {
      return exact;
    }
  }
  for (let index = 0; index < names.length; index += 1) {
    if (candidates.some((candidate) => names[index].includes(candidate))) {
      return index;
    }
  }
  return -1;
}

/** 一份表像奖品表还是名单表。 */
function classifySheet(sheet) {
  if (PRIZE_SHEET.test(sheet.name) && !PEOPLE_SHEET.test(sheet.name)) {
    return 'prizes';
  }
  if (PEOPLE_SHEET.test(sheet.name) && !PRIZE_SHEET.test(sheet.name)) {
    return 'people';
  }
  const header = sheet.rows[0] ?? [];
  const hasPrize = findColumn(header, HEADERS.prizeCount) !== -1;
  const hasPerson = findColumn(header, HEADERS.personName) !== -1;
  if (hasPrize && !hasPerson) {
    return 'prizes';
  }
  if (hasPerson && !hasPrize) {
    return 'people';
  }
  if (PRIZE_SHEET.test(sheet.name)) {
    return 'prizes';
  }
  if (PEOPLE_SHEET.test(sheet.name)) {
    return 'people';
  }
  return 'unknown';
}

function parsePrizeSheet(sheet, problems) {
  const header = sheet.rows[0] ?? [];
  const nameColumn = findColumn(header, HEADERS.prizeName);
  const countColumn = findColumn(header, HEADERS.prizeCount);
  const weightColumn = findColumn(header, HEADERS.prizeWeight);
  const levelColumn = findColumn(header, HEADERS.prizeLevel);

  if (nameColumn === -1) {
    problems.push({
      sheet: sheet.name,
      row: 1,
      message: '奖品表缺少「奖品名称」列',
    });
    return [];
  }
  if (countColumn === -1) {
    problems.push({
      sheet: sheet.name,
      row: 1,
      message: '奖品表缺少「数量」列，默认每个奖项算 1 个',
    });
  }

  const prizes = [];
  const seen = new Set();
  for (let index = 1; index < sheet.rows.length; index += 1) {
    const row = sheet.rows[index];
    if (row === undefined || row.every((value) => String(value ?? '').trim() === '')) {
      continue;
    }
    const name = cellText(row, nameColumn);
    if (name === '') {
      problems.push({ sheet: sheet.name, row: index + 1, message: '这个奖项没有名称，已跳过' });
      continue;
    }
    const rawCount = countColumn === -1 ? 1 : cell(row, countColumn);
    const count = Math.floor(Number(rawCount));
    const validCount = Number.isFinite(count) && count > 0;
    if (!validCount) {
      problems.push({
        sheet: sheet.name,
        row: index + 1,
        message: `「${name}」的数量读不出正数，已按 1 算`,
      });
    }
    const weightValue = weightColumn === -1 ? 1 : Number(cell(row, weightColumn));
    const level = levelColumn === -1 ? '' : cellText(row, levelColumn);

    if (seen.has(name)) {
      problems.push({
        sheet: sheet.name,
        row: index + 1,
        message: `「${name}」出现了两次，只保留第一次`,
      });
      continue;
    }
    seen.add(name);

    prizes.push({
      name,
      count: validCount ? count : 1,
      weight: Number.isFinite(weightValue) && weightValue > 0 ? weightValue : 1,
      level,
    });
  }
  return prizes;
}

function parsePeopleSheet(sheet, problems) {
  const header = sheet.rows[0] ?? [];
  const nameColumn = findColumn(header, HEADERS.personName);
  const deptColumn = findColumn(header, HEADERS.personDept);
  const employeeColumn = findColumn(header, HEADERS.personEmployeeId);

  if (nameColumn === -1) {
    problems.push({ sheet: sheet.name, row: 1, message: '名单缺少「姓名」列' });
    return [];
  }

  const people = [];
  for (let index = 1; index < sheet.rows.length; index += 1) {
    const row = sheet.rows[index];
    if (row === undefined || row.every((value) => String(value ?? '').trim() === '')) {
      continue;
    }
    const name = cellText(row, nameColumn);
    if (name === '') {
      problems.push({ sheet: sheet.name, row: index + 1, message: '这一行没有姓名，已跳过' });
      continue;
    }
    people.push({
      name,
      dept: deptColumn === -1 ? '' : cellText(row, deptColumn),
      employeeId: employeeColumn === -1 ? '' : cellText(row, employeeColumn),
    });
  }
  return people;
}

/**
 * 读一份活动文件。
 *
 * 返回 `{ prizes, people, problems, sheets }`；`problems` 只是提示，能读出来的
 * 照样入池，界面上把提示列出来，由人决定要不要改表重来。
 */
export async function readLotteryWorkbook(bytes) {
  const sheets = await parseWorkbook(bytes);
  const problems = [];
  let prizes = [];
  let people = [];

  for (const sheet of sheets) {
    const shape = classifySheet(sheet);
    if (shape === 'prizes') {
      prizes = prizes.concat(parsePrizeSheet(sheet, problems));
    } else if (shape === 'people') {
      people = people.concat(parsePeopleSheet(sheet, problems));
    } else if (sheet.rows.length > 0) {
      problems.push({
        sheet: sheet.name,
        row: 1,
        message: '这张表既不像奖品表也不像名单表，已跳过',
      });
    }
  }

  if (prizes.length === 0) {
    problems.push({
      sheet: '奖品',
      row: 0,
      message: '没读到奖品：需要一张含「奖品名称」「数量」两列的表',
    });
  }
  if (people.length === 0) {
    problems.push({
      sheet: '名单',
      row: 0,
      message: '没读到参与人：需要一张含「姓名」列的表（不做不重复限制时可以不传）',
    });
  }

  return { prizes, people, problems, sheets };
}

/** 生成一份可以直接填的活动模板。 */
export async function buildTemplateWorkbook() {
  return buildWorkbook([
    {
      name: '奖品',
      rows: [
        ['奖品名称', '数量', '权重', '等级'].map(text),
        [text('一等奖'), number(1), number(1), text('1')],
        [text('二等奖'), number(3), number(1), text('2')],
        [text('三等奖'), number(6), number(1), text('3')],
      ],
    },
    {
      name: '名单',
      rows: [
        ['姓名', '部门', '工号'].map(text),
        [text('张三'), text('研发部'), text('A001')],
        [text('李四'), text('市场部'), text('A002')],
        [text('王五'), text('设计部'), text('A003')],
      ],
    },
  ]);
}

/** 导出开奖结果。 */
export async function buildResultWorkbook(state) {
  const resultRows = [['序号', '奖项', '姓名', '部门', '工号', '开奖时间'].map(text)];
  let order = 1;
  for (const result of state.results) {
    for (const winner of result.winners) {
      resultRows.push([
        number(order),
        text(result.prizeName),
        text(winner.name),
        text(winner.dept),
        text(winner.employeeId),
        date(result.at),
      ]);
      order += 1;
    }
  }

  const summaryRows = [['奖项', '名额', '已抽', '剩余'].map(text)];
  for (const prize of state.prizes) {
    const drawn = state.results
      .filter((result) => result.prizeId === prize.id)
      .reduce((sum, result) => sum + result.winners.length, 0);
    summaryRows.push([
      text(prize.name),
      number(prize.count),
      number(drawn),
      number(Math.max(0, prize.count - drawn)),
    ]);
  }

  return buildWorkbook([
    { name: '结果', rows: resultRows },
    { name: '奖项统计', rows: summaryRows },
  ]);
}

/** 把一段字节存成文件。 */
export function downloadBytes(fileName, bytes, type) {
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // 立即释放会让部分浏览器来不及取数据
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
