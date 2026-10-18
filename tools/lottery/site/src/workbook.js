/**
 * 活动文件：读入一份 xlsx、生成模板、导出结果。
 *
 * 表有四张，后两张可选：
 *
 * - `设置`：键 / 值，记名称、抽法、形态、每次几人、形态配置
 * - `奖品`：奖品名称、数量、权重（可选）、等级（可选）
 * - `名单`：姓名、部门（可选）、工号（可选）
 * - `开奖记录`：序号、记录、奖项、姓名、部门、工号、开奖时间
 *
 * 表名可以先不较真：先按表名认，认不出来再看表头。列的顺序也不要求，
 * 认的是表头里的字。所有解析都在浏览器里做，文件不上传。
 */

import { MODE, MODE_LABELS } from './engine.js';
import { DEFAULT_STAGE, STAGES } from './stages/index.js';
import { date, buildWorkbook, number, parseWorkbook, text } from './xlsx.js';

/** 设置表与开奖记录表：名字认得出就不当奖品 / 名单处理。 */
const SETTINGS_SHEET = /^(设置|配置|参数)$/;
const RESULT_SHEET = /^(开奖记录|结果|中奖记录|获奖记录)$/;

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
  if (SETTINGS_SHEET.test(sheet.name.trim())) {
    return 'settings';
  }
  if (RESULT_SHEET.test(sheet.name.trim())) {
    return 'results';
  }
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

function parseSettingsSheet(sheet) {
  const settings = {};
  for (let index = 1; index < sheet.rows.length; index += 1) {
    const row = sheet.rows[index] ?? [];
    const key = cellText(row, 0);
    if (key === '') {
      continue;
    }
    settings[key] = cell(row, 1);
  }
  return settings;
}

function parseResultSheet(sheet) {
  const header = sheet.rows[0] ?? [];
  const groupColumn = findColumn(header, ['记录', '批次', '场次']);
  const prizeColumn = findColumn(header, ['奖项', '奖品', '奖品名称', '奖项名称']);
  const nameColumn = findColumn(header, HEADERS.personName);
  const deptColumn = findColumn(header, HEADERS.personDept);
  const employeeColumn = findColumn(header, HEADERS.personEmployeeId);
  const timeColumn = findColumn(header, ['开奖时间', '时间', '中奖时间']);

  if (prizeColumn === -1 || nameColumn === -1) {
    return [];
  }

  const rows = [];
  for (let index = 1; index < sheet.rows.length; index += 1) {
    const row = sheet.rows[index];
    if (row === undefined || row.every((value) => String(value ?? '').trim() === '')) {
      continue;
    }
    const name = cellText(row, nameColumn);
    if (name === '') {
      continue;
    }
    const time = timeColumn === -1 ? 0 : Number(cell(row, timeColumn));
    rows.push({
      group: groupColumn === -1 ? String(index) : cellText(row, groupColumn),
      prizeName: cellText(row, prizeColumn),
      name,
      dept: deptColumn === -1 ? '' : cellText(row, deptColumn),
      employeeId: employeeColumn === -1 ? '' : cellText(row, employeeColumn),
      at: Number.isFinite(time) && time > 0 ? time : Date.now(),
    });
  }
  return rows;
}

function readMode(value) {
  const raw = String(value ?? '').trim();
  if (raw === MODE.PERSON || raw === MODE_LABELS[MODE.PERSON]) {
    return MODE.PERSON;
  }
  return MODE.PRIZE;
}

function readStage(value) {
  const raw = String(value ?? '').trim();
  const byId = STAGES.find((stage) => stage.id === raw);
  if (byId !== undefined) {
    return byId.id;
  }
  return STAGES.find((stage) => stage.label === raw)?.id ?? DEFAULT_STAGE;
}

function readBoolean(value, fallback) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (['否', 'false', '0', 'no', '关'].includes(raw)) {
    return false;
  }
  if (['是', 'true', '1', 'yes', '开'].includes(raw)) {
    return true;
  }
  return fallback;
}

function readStageConfig(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed !== null && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * 读一份 xlsx。
 *
 * 认三类表：`奖品` / `名单` 是数据，`设置` 与 `开奖记录` 可选。
 * 返回 `{ prizes, people, problems, sheets, meta, results }`；`problems` 只是提示，
 * 能读出来的照样入池，界面上把提示列出来，由人决定要不要改表重来。
 */
export async function readLotteryWorkbook(bytes) {
  const sheets = await parseWorkbook(bytes);
  const problems = [];
  let prizes = [];
  let people = [];
  let settings = {};
  let resultRows = [];

  for (const sheet of sheets) {
    const shape = classifySheet(sheet);
    if (shape === 'settings') {
      settings = { ...settings, ...parseSettingsSheet(sheet) };
    } else if (shape === 'results') {
      resultRows = resultRows.concat(parseResultSheet(sheet));
    } else if (shape === 'prizes') {
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

  prizes = prizes.map((prize, index) => ({ ...prize, id: `a${index + 1}` }));
  people = people.map((person, index) => ({ ...person, id: `p${index + 1}` }));

  const meta = {
    title: cellText([settings['名称'], settings['抽奖名称']], 0),
    mode: readMode(settings['抽法'] ?? settings['模式']),
    stage: readStage(settings['形态']),
    batch: Math.max(1, Math.min(50, Math.floor(Number(settings['每次抽几人'] ?? settings['每次']) || 1))),
    uniqueWinner: readBoolean(settings['不重复中奖'] ?? settings['已中奖的人不再进池'], true),
    rosterName: cellText([settings['关联名单'], settings['名单']], 0),
    prizeSetName: cellText([settings['关联奖品'], settings['奖品']], 0),
    stageConfig: readStageConfig(settings['形态配置']),
  };

  const results = [];
  const groups = new Map();
  for (const row of resultRows) {
    const prize = prizes.find((item) => item.name === row.prizeName);
    if (prize === undefined) {
      problems.push({
        sheet: '开奖记录',
        row: 0,
        message: `「${row.prizeName}」不在奖品表里，这条记录已跳过`,
      });
      continue;
    }
    let result = groups.get(row.group);
    if (result === undefined) {
      result = {
        id: `r${results.length + 1}`,
        at: row.at,
        mode: meta.mode,
        prizeId: prize.id,
        prizeName: prize.name,
        requested: 1,
        winners: [],
      };
      groups.set(row.group, result);
      results.push(result);
    }
    const person = people.find(
      (item) => item.name === row.name && (row.employeeId === '' || item.employeeId === row.employeeId),
    );
    result.winners.push({
      personId: person?.id ?? '',
      name: row.name,
      dept: row.dept,
      employeeId: row.employeeId,
    });
    result.requested = Math.max(result.requested, result.winners.length);
  }

  return { prizes, people, problems, sheets, meta, results };
}

/* ---------- 写 ---------- */

const SHEET_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function prizeRows(prizes) {
  const rows = [['奖品名称', '数量', '权重', '等级'].map(text)];
  for (const prize of prizes) {
    rows.push([
      text(prize.name),
      number(prize.count),
      number(prize.weight ?? 1),
      text(prize.level ?? ''),
    ]);
  }
  return rows;
}

function peopleRows(people) {
  const rows = [['姓名', '部门', '工号'].map(text)];
  for (const person of people) {
    rows.push([
      text(person.name),
      text(person.dept ?? ''),
      text(person.employeeId ?? ''),
    ]);
  }
  return rows;
}

function resultRows(results) {
  const rows = [['序号', '记录', '奖项', '姓名', '部门', '工号', '开奖时间'].map(text)];
  let order = 1;
  results.forEach((result, index) => {
    for (const winner of result.winners) {
      rows.push([
        number(order),
        number(index + 1),
        text(result.prizeName),
        text(winner.name),
        text(winner.dept ?? ''),
        text(winner.employeeId ?? ''),
        date(result.at),
      ]);
      order += 1;
    }
  });
  return rows;
}

/** 导出一场抽奖：设置、奖品、名单、开奖记录四张表，导回来就是同一场。 */
export async function buildLotteryWorkbook(lottery) {
  const settings = [['键', '值'].map(text)];
  const put = (key, value, numeric = false) => {
    settings.push([text(key), numeric ? number(value) : text(value)]);
  };
  put('名称', lottery.title);
  put('抽法', MODE_LABELS[lottery.mode] ?? MODE_LABELS[MODE.PRIZE]);
  put('形态', lottery.stage);
  put('每次抽几人', lottery.batch, true);
  put('不重复中奖', lottery.uniqueWinner ? '是' : '否');
  put('关联名单', lottery.rosterName ?? '');
  put('关联奖品', lottery.prizeSetName ?? '');
  put('形态配置', JSON.stringify(lottery.stageConfig ?? {}));

  return buildWorkbook([
    { name: '设置', rows: settings },
    { name: '奖品', rows: prizeRows(lottery.prizes) },
    { name: '名单', rows: peopleRows(lottery.people) },
    { name: '开奖记录', rows: resultRows(lottery.results) },
  ]);
}

/** 导出名单素材。 */
export async function buildRosterWorkbook(roster) {
  return buildWorkbook([{ name: '名单', rows: peopleRows(roster.people) }]);
}

/** 导出奖品素材。 */
export async function buildPrizeSetWorkbook(set) {
  return buildWorkbook([{ name: '奖品', rows: prizeRows(set.prizes) }]);
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
    { name: '结果', rows: resultRows(state.results) },
    { name: '奖项统计', rows: summaryRows },
  ]);
}

/** 把一段字节存成文件。 */
export function downloadBytes(fileName, bytes, type = SHEET_TYPE) {
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => link.remove(), 0);
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
