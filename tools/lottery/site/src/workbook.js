/**
 * 活动文件：读入一份 xlsx、生成模板、导出结果。
 *
 * 一张表就是一个池。表名决定池的类型，认不出来时看表头：
 *
 * - `设置`：键 / 值，记名称、抽法、形态、不重复中奖、形态配置
 * - `奖品`：奖品名称、数量、权重（可选）、等级（可选）
 * - `名单`：姓名、部门（可选）、工号（可选）
 * - `条目`：名称、权重（可选）、上限（可选）—— 既能抽人也能抽奖的通用池
 * - `开奖记录`：序号、记录、奖项、姓名、部门、工号、开奖时间
 *
 * 表名可以先不较真：先按表名认，认不出来再看表头。列的顺序也不要求，
 * 认的是表头里的字。所有解析都在浏览器里做，文件不上传。
 */

import { capacityOf, cleanEntries, cleanText, kindOf } from './pools.js';
import { DEFAULT_PROTOCOL, protocolIdByText, protocolInfo } from './protocols.js';
import { DEFAULT_STAGE, STAGES, defaultStageFor, stageInfo } from './stages/index.js';
import { date, buildWorkbook, number, parseWorkbook, safeSheetName, text } from './xlsx.js';

/** 设置表与开奖记录表：名字认得出就不当池处理。 */
const SETTINGS_SHEET = /^(设置|配置|参数)$/;
const RESULT_SHEET = /^(开奖记录|结果|中奖记录|获奖记录)$/;

const HEADERS = {
  name: ['奖品名称', '奖项名称', '奖品', '奖项', '奖名', '姓名', '名字', '参与人', '员工姓名', '成员', '名称', '条目'],
  capacity: ['数量', '名额', '个数', '份数', '上限'],
  weight: ['权重', '概率'],
  level: ['等级', '级别', '奖级'],
  personName: ['姓名', '名字', '参与人', '员工姓名', '成员'],
  personDept: ['部门', '科室', '单位', '班级', '组别'],
  personEmployeeId: ['工号', '员工号', '编号', '学号'],
  poolName: ['池', '池名', '池子'],
  poolKind: ['类型', '种类'],
};

const PRIZE_SHEET = /奖品|奖项|奖池/;
const PEOPLE_SHEET = /名单|人员|参与|抽奖人/;
const ITEM_SHEET = /条目|选项|菜单|任务|惩罚|盲盒/;

const SHEET_OF_KIND = { people: '名单', prizes: '奖品', items: '条目' };

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

/** 一份表是设置、结果，还是某一类型的池。 */
function classifySheet(sheet) {
  const name = String(sheet.name ?? '').trim();
  if (SETTINGS_SHEET.test(name)) {
    return 'settings';
  }
  if (RESULT_SHEET.test(name)) {
    return 'results';
  }
  const prizeName = PRIZE_SHEET.test(name);
  const peopleName = PEOPLE_SHEET.test(name);
  const itemName = ITEM_SHEET.test(name);
  if (prizeName && !peopleName && !itemName) {
    return 'prizes';
  }
  if (peopleName && !prizeName && !itemName) {
    return 'people';
  }
  if (itemName && !prizeName && !peopleName) {
    return 'items';
  }

  const header = sheet.rows[0] ?? [];
  const hasCapacity = findColumn(header, HEADERS.capacity) !== -1;
  const hasDept = findColumn(header, HEADERS.personDept) !== -1;
  const hasEmployee = findColumn(header, HEADERS.personEmployeeId) !== -1;
  const hasLevel = findColumn(header, HEADERS.level) !== -1;
  if (hasDept || hasEmployee) {
    return 'people';
  }
  if (hasCapacity || hasLevel) {
    return 'prizes';
  }
  if (prizeName) {
    return 'prizes';
  }
  if (peopleName) {
    return 'people';
  }
  if (itemName) {
    return 'items';
  }
  return 'unknown';
}

/** 名额列里认这些写法是不限量。 */
const UNLIMITED = ['不限', '不限量', '无限', '无穷', '∞'];

/** 读「数量 / 上限」列：不限量、正整数、其余按 1 并记一条提示。 */
function readCapacityCell(value, name, sheetName, rowNumber, problems) {
  const raw = String(value ?? '').trim();
  if (UNLIMITED.includes(raw)) {
    return null;
  }
  const count = Math.floor(Number(raw));
  if (Number.isFinite(count) && count > 0) {
    return count;
  }
  problems.push({
    sheet: sheetName,
    row: rowNumber,
    message: `「${name}」的数量读不出正数，已按 1 算（不限量请写「不限」）`,
  });
  return 1;
}

/** 一张池表读成条目；`kind` 决定哪几列算数，`池名` 列可以覆盖表名。 */
function parsePoolSheet(sheet, kind, problems) {
  const header = sheet.rows[0] ?? [];
  const first = sheet.rows[1] ?? [];
  const kindColumn = findColumn(header, HEADERS.poolKind);
  const declaredKind = kindColumn === -1 ? null : readKindCell(cell(first, kindColumn));
  const actual = declaredKind ?? kind;
  const nameColumn = findColumn(header, actual === 'people' ? HEADERS.personName : HEADERS.name);
  const capacityColumn = actual === 'people' ? -1 : findColumn(header, HEADERS.capacity);
  const weightColumn = findColumn(header, HEADERS.weight);
  const levelColumn = actual === 'prizes' ? findColumn(header, HEADERS.level) : -1;
  const deptColumn = actual === 'people' ? findColumn(header, HEADERS.personDept) : -1;
  const employeeColumn = actual === 'people' ? findColumn(header, HEADERS.personEmployeeId) : -1;
  const poolNameColumn = findColumn(header, HEADERS.poolName);

  if (nameColumn === -1) {
    problems.push({
      sheet: sheet.name,
      row: 1,
      message: `这张表缺少「${actual === 'people' ? '姓名' : '名称'}」列`,
    });
    return { entries: [], name: '', kind: actual };
  }

  const rows = [];
  const seen = new Set();
  for (let index = 1; index < sheet.rows.length; index += 1) {
    const row = sheet.rows[index];
    if (row === undefined || row.every((value) => String(value ?? '').trim() === '')) {
      continue;
    }
    const name = cellText(row, nameColumn);
    if (name === '') {
      problems.push({ sheet: sheet.name, row: index + 1, message: '这一行没有名字，已跳过' });
      continue;
    }
    if (seen.has(name)) {
      problems.push({
        sheet: sheet.name,
        row: index + 1,
        message: `「${name}」出现了两次，只保留第一次`,
      });
      continue;
    }
    seen.add(name);

    const capacity =
      capacityColumn === -1
        ? 1
        : readCapacityCell(cell(row, capacityColumn), name, sheet.name, index + 1, problems);
    const weightValue = weightColumn === -1 ? 1 : Number(cell(row, weightColumn));
    const meta =
      actual === 'people'
        ? {
            dept: deptColumn === -1 ? '' : cellText(row, deptColumn),
            employeeId: employeeColumn === -1 ? '' : cellText(row, employeeColumn),
          }
        : actual === 'prizes'
          ? { level: levelColumn === -1 ? '' : cellText(row, levelColumn) }
          : {};

    rows.push({
      name,
      weight: Number.isFinite(weightValue) && weightValue > 0 ? weightValue : 1,
      capacity,
      meta,
    });
  }

  return {
    entries: cleanEntries(rows, actual),
    // 表名会被 31 字截断、禁用字符被替换，"池名" 这一列才是还原得回来的那一份
    name: poolNameColumn === -1 ? '' : cellText(first, poolNameColumn),
    kind: actual,
  };
}

/** 「类型」列的写法 → kind。 */
function readKindCell(value) {
  const raw = String(value ?? '').trim();
  if (raw === '') {
    return null;
  }
  if (/名单|人员|员工|人/.test(raw)) {
    return 'people';
  }
  if (/奖/.test(raw)) {
    return 'prizes';
  }
  if (/条目|选项/.test(raw)) {
    return 'items';
  }
  return null;
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

  if (nameColumn === -1) {
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
      prizeName: prizeColumn === -1 ? '' : cellText(row, prizeColumn),
      name,
      dept: deptColumn === -1 ? '' : cellText(row, deptColumn),
      employeeId: employeeColumn === -1 ? '' : cellText(row, employeeColumn),
      at: Number.isFinite(time) && time > 0 ? time : Date.now(),
    });
  }
  return rows;
}

function readProtocol(value) {
  return protocolIdByText(value) ?? DEFAULT_PROTOCOL;
}

function readStage(value, protocolId) {
  const raw = String(value ?? '').trim();
  const byId = STAGES.find((stage) => stage.id === raw);
  if (byId !== undefined) {
    return byId.id;
  }
  const byLabel = STAGES.find((stage) => stage.label === raw);
  return byLabel?.id ?? defaultStageFor(protocolInfo(protocolId)) ?? DEFAULT_STAGE;
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
 * 每张池表读成一个池；`设置` 与 `开奖记录` 可选。返回
 * `{ pools, problems, sheets, meta, results }`，`problems` 只是提示，
 * 能读出来的照样入池，界面上把提示列出来，由人决定要不要改表重来。
 */
export async function readLotteryWorkbook(bytes) {
  const sheets = await parseWorkbook(bytes);
  const problems = [];
  const pools = [];
  let settings = {};
  let resultRows = [];

  for (const sheet of sheets) {
    const shape = classifySheet(sheet);
    if (shape === 'settings') {
      settings = { ...settings, ...parseSettingsSheet(sheet) };
      continue;
    }
    if (shape === 'results') {
      resultRows = resultRows.concat(parseResultSheet(sheet));
      continue;
    }
    if (shape === 'unknown') {
      if (sheet.rows.length > 0) {
        problems.push({
          sheet: sheet.name,
          row: 1,
          message: '这张表认不出是名单、奖品还是条目，已跳过',
        });
      }
      continue;
    }
    const parsed = parsePoolSheet(sheet, shape, problems);
    if (parsed.entries.length === 0) {
      continue;
    }
    pools.push({
      // 池名有专门一列就用它；没有就退回表名
      name: cleanText(parsed.name, cleanText(sheet.name)),
      kind: parsed.kind,
      entries: parsed.entries,
    });
  }

  if (pools.length === 0) {
    problems.push({
      sheet: '池',
      row: 0,
      message: '没读到任何池：需要一张含「姓名」或「奖品名称」列的表',
    });
  }

  const protocol = readProtocol(settings['抽法'] ?? settings['模式']);
  const batchSize = readBatchSize(settings['一次抽几人'] ?? settings['一次抽']);

  // 池与条目的 id 在这里定下来，开奖记录才能指回条目。
  //
  // 编号按 kind 各自连续 —— 用「全池下标」会让两个名单池得到 p-1 和 p-3，
  // 而条目 id 又会跨池从 1 重排撞车（两条 p1 分属两个池，记录就对不上）。
  const counters = { people: 0, prizes: 0, items: 0 };
  const entryCounters = { people: 0, prizes: 0, items: 0 };
  const withIds = pools.map((pool) => {
    const kind = kindOf(pool.kind);
    const prefix = kind === 'people' ? 'p' : kind === 'prizes' ? 'a' : 'i';
    counters[kind] += 1;
    return {
      ...pool,
      kind,
      id: `${prefix}-${counters[kind]}`,
      entries: cleanEntries(
        pool.entries.map((entry) => {
          entryCounters[kind] += 1;
          return { ...entry, id: `${prefix}${entryCounters[kind]}` };
        }),
        kind,
      ),
    };
  });

  // 「绑定」写的是池名：导出时池 id 是 `k1` 这种，导入会重新编号，只有名字稳
  const byName = new Map(withIds.map((pool) => [pool.name, pool.id]));
  const rawSlots = readJsonCell(settings['绑定']);
  const slots =
    rawSlots === null
      ? null
      : Object.fromEntries(
          Object.entries(rawSlots).map(([key, value]) => [
            key,
            typeof value === 'string' ? byName.get(value) ?? null : null,
          ]),
        );

  const meta = {
    title: cellText([settings['名称'], settings['抽奖名称']], 0),
    protocol,
    stage: readStage(settings['形态'], protocol),
    uniqueWinner: readBoolean(settings['不重复中奖'] ?? settings['已中奖的人不再进池'], true),
    stageConfig: readStageConfig(settings['形态配置']),
    slots,
    batchSize,
  };

  return {
    pools: withIds,
    problems,
    sheets,
    meta,
    results: buildResults(resultRows, withIds, protocol, problems, slots),
  };
}

/** 一次抽几个：没写或读不出就不设，交给形态的缺省值。 */
function readBatchSize(value) {
  const count = Math.floor(Number(String(value ?? '').trim()));
  return Number.isFinite(count) && count > 0 ? count : null;
}

/** 设置表里的一段 JSON（绑定这么存）；读不出返回 null。 */
function readJsonCell(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * 把「记录 / 奖项 / 姓名」的行拼回一次一次开奖。
 *
 * 一场里可能有多个同 kind 的池（导入两张名单表就是），所以查找按
 * 「绑定的那个池优先，其次所有同 kind 的池」走，不只看第一个。
 */
function buildResults(rows, pools, protocol, problems, slots = null) {
  const pickPool = (key, kind) => {
    const id = slots?.[key];
    return (id ? pools.find((pool) => pool.id === id) : null) ??
      pools.find((pool) => pool.kind === kind) ??
      null;
  };
  const people = pickPool('person', 'people');
  const prizes = pickPool('prize', 'prizes');
  const peoplePools = pools.filter((pool) => pool.kind === 'people');
  const prizePools = pools.filter((pool) => pool.kind === 'prizes');
  const results = [];
  const groups = new Map();

  const findEntry = (candidates, match) => {
    for (const pool of candidates) {
      const entry = pool.entries.find(match);
      if (entry !== undefined) {
        return { pool, entry };
      }
    }
    return null;
  };

  for (const row of rows) {
    let prize = null;
    if (row.prizeName !== '') {
      const hit = findEntry(prizePools.length > 0 ? prizePools : [prizes].filter(Boolean), (entry) => entry.name === row.prizeName);
      if (hit === null) {
        problems.push({
          sheet: '开奖记录',
          row: 0,
          message: `「${row.prizeName}」不在奖品表里，这条记录已跳过`,
        });
        continue;
      }
      prize = hit;
    }
    const person =
      peoplePools.length === 0
        ? null
        : findEntry(
            peoplePools,
            (entry) =>
              entry.name === row.name &&
              (row.employeeId === '' || entry.meta?.employeeId === row.employeeId),
          ) ?? findEntry(peoplePools, (entry) => entry.name === row.name);

    let result = groups.get(row.group);
    if (result === undefined) {
      result = { id: `r${results.length + 1}`, at: row.at, protocol, picks: [] };
      groups.set(row.group, result);
      results.push(result);
    }
    if (prize !== null && !result.picks.some((pick) => pick.slot === 'prize')) {
      result.picks.push({
        slot: 'prize',
        poolId: prize.pool.id,
        entryId: prize.entry.id,
        name: prize.entry.name,
        meta: prize.entry.meta ?? {},
      });
    }
    if (people !== null) {
      result.picks.push({
        slot: 'person',
        poolId: person?.pool.id ?? people.id,
        entryId: person?.entry.id ?? '',
        name: row.name,
        meta: { dept: row.dept, employeeId: row.employeeId },
      });
    }
  }

  return results.filter((result) => result.picks.length > 0);
}

/* ---------- 写 ---------- */

const SHEET_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * 一个池写成一张表。
 *
 * 末尾都带一列「池名」—— 表名会被 31 字截断、禁用字符被替换，只有这一列能
 * 把池名原样带回来。一场里有两个名单池时，靠它才分得清哪张是哪张。
 */
function poolRows(pool) {
  if (pool.kind === 'people') {
    const rows = [['姓名', '部门', '工号', '池名'].map(text)];
    for (const entry of pool.entries) {
      rows.push([
        text(entry.name),
        text(entry.meta?.dept ?? ''),
        text(entry.meta?.employeeId ?? ''),
        text(pool.name),
      ]);
    }
    return rows;
  }
  if (pool.kind === 'prizes') {
    const rows = [['奖品名称', '数量', '权重', '等级', '池名'].map(text)];
    for (const entry of pool.entries) {
      rows.push([
        text(entry.name),
        capacityCell(entry),
        number(entry.weight ?? 1),
        text(entry.meta?.level ?? ''),
        text(pool.name),
      ]);
    }
    return rows;
  }
  const rows = [['名称', '权重', '上限', '池名'].map(text)];
  for (const entry of pool.entries) {
    rows.push([
      text(entry.name),
      number(entry.weight ?? 1),
      capacityCell(entry),
      text(pool.name),
    ]);
  }
  return rows;
}

/** 不限量在表里写「不限」：写 0 会被读成「读不出正数」，往返就失真了。 */
function capacityCell(entry) {
  const capacity = capacityOf(entry);
  return capacity === Infinity ? text('不限') : number(capacity);
}

function resultRows(results) {
  const rows = [['序号', '记录', '奖项', '姓名', '部门', '工号', '开奖时间'].map(text)];
  let order = 1;
  results.forEach((result, index) => {
    const prize = result.picks.find((pick) => pick.slot === 'prize') ?? null;
    const people = result.picks.filter((pick) => pick.slot === 'person');
    const rowsOfResult = people.length > 0 ? people : [prize];
    for (const pick of rowsOfResult) {
      if (pick === null) {
        continue;
      }
      rows.push([
        number(order),
        number(index + 1),
        text(prize?.name ?? ''),
        text(pick.name),
        text(pick.meta?.dept ?? ''),
        text(pick.meta?.employeeId ?? ''),
        date(result.at),
      ]);
      order += 1;
    }
  });
  return rows;
}

/**
 * 工作表名去重。
 *
 * Excel 不许两张表同名，而 `SHEET_OF_KIND` 是固定映射 —— 一场里有两个名单池
 * 就会导出两张「名单」，Excel 要么拒绝要么丢一张。这里在 `safeSheetName` 之后
 * 加「 2」「 3」后缀，后缀算进 31 字上限里。
 */
export function uniqueSheetNames(sheets, reserved = []) {
  const taken = new Set(reserved);
  const out = [];
  for (const sheet of sheets) {
    const base = safeSheetName(String(sheet.name ?? '').trim() || '表');
    let name = base;
    if (taken.has(name)) {
      name = '';
      for (let n = 2; n < 1000; n += 1) {
        const suffix = ` ${n}`;
        const candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
        if (!taken.has(candidate)) {
          name = candidate;
          break;
        }
      }
      if (name === '') {
        name = base;
      }
    }
    taken.add(name);
    out.push({ ...sheet, name });
  }
  return out;
}

/** 池表叫什么：带上类型前缀，导入时靠它认出这是哪一类池。 */
function poolSheetName(pool) {
  const kindName = SHEET_OF_KIND[pool.kind] ?? '条目';
  const name = String(pool.name ?? '').trim();
  if (name === '') {
    return kindName;
  }
  return name.startsWith(kindName) ? name : `${kindName}·${name}`;
}

/** 绑定写成 `{ 槽: 池名 }`：池 id 导入后会重编，名字才带得回去。 */
function bindingsOf(lottery) {
  const slots = lottery.slots ?? {};
  const out = {};
  for (const key of Object.keys(slots)) {
    const pool = lottery.pools.find((item) => item.id === slots[key]) ?? null;
    out[key] = pool?.name ?? null;
  }
  return out;
}

/** 导出一场抽奖：设置 + 每个池一张表 + 开奖记录，导回来就是同一场。 */
export async function buildLotteryWorkbook(lottery) {
  const settings = [['键', '值'].map(text)];
  const put = (key, value) => {
    settings.push([text(key), text(value)]);
  };
  put('名称', lottery.title);
  put('抽法', protocolInfo(lottery.protocol).label);
  put('形态', lottery.stage);
  put('不重复中奖', isUnique(lottery) ? '是' : '否');
  put('一次抽几人', String(lottery.batch ?? 1));
  put('绑定', JSON.stringify(bindingsOf(lottery)));
  put('形态配置', JSON.stringify(lottery.stageConfig ?? {}));

  const poolSheets = uniqueSheetNames(
    lottery.pools.map((pool) => ({ name: poolSheetName(pool), rows: poolRows(pool) })),
    ['设置', '开奖记录'],
  );

  return buildWorkbook([
    { name: '设置', rows: settings },
    ...poolSheets,
    { name: '开奖记录', rows: resultRows(lottery.results) },
  ]);
}

/** 「不重复中奖」落在数据上是把人池的容量设成 1；只看绑到 person 槽的那个池。 */
function isUnique(lottery) {
  const boundId = lottery.slots?.person;
  const people =
    (boundId ? lottery.pools.find((pool) => pool.id === boundId) : null) ??
    lottery.pools.find((pool) => pool.kind === 'people');
  return people === undefined || people.entries.every((entry) => capacityOf(entry) === 1);
}

/** 导出一份池素材。 */
export async function buildPoolWorkbook(pool) {
  return buildWorkbook([{ name: SHEET_OF_KIND[pool.kind] ?? '条目', rows: poolRows(pool) }]);
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

/** 导出开奖结果与奖项统计。 */
export async function buildResultWorkbook(lottery) {
  const boundId = lottery.slots?.prize;
  const prizes =
    (boundId ? lottery.pools.find((pool) => pool.id === boundId) : null) ??
    lottery.pools.find((pool) => pool.kind === 'prizes') ??
    null;
  const summaryRows = [['奖项', '名额', '已抽', '剩余'].map(text)];
  for (const entry of prizes?.entries ?? []) {
    const drawn = lottery.results.reduce(
      (sum, result) =>
        sum + result.picks.filter((pick) => pick.slot === 'prize' && pick.entryId === entry.id).length,
      0,
    );
    const capacity = capacityOf(entry);
    summaryRows.push([
      text(entry.name),
      text(capacity === Infinity ? '不限' : String(capacity)),
      number(drawn),
      text(capacity === Infinity ? '不限' : String(Math.max(0, capacity - drawn))),
    ]);
  }

  return buildWorkbook([
    { name: '结果', rows: resultRows(lottery.results) },
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
