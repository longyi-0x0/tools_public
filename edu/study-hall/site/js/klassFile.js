/**
 * 一个班 → 一份 xlsx，一份 xlsx → 一个班。
 *
 * 一个班就是一个文件，导出的是**这个班的全部**：班级设置（含出声开关与补响间隔，
 * 它们按班为单位）、备注模板（含各自的颜色与时长）、名册、每一场记录、每一场的
 * 点名明细与离开明细。
 * 读回来时按同样的表重建，所以「导出再导入」得到的是同一份数据。
 *
 * 表里时间写成 Excel 日期（不是文本），老师拿到文件能直接排序与筛。
 */

import {
  DEFAULT_IDLE_MASK_MS,
  PHASE,
  awayMsOf,
  isLeaveOvertime,
  normaliseKlass,
  pausedMs,
  remarkOf,
  summarize,
} from './domain.js';
import { buildWorkbook, date, number, parseWorkbook, text } from './xlsx.js';

const SHEET = {
  KLASS: '班级',
  TEMPLATES: '备注模板',
  ROSTER: '名册',
  SESSIONS: '会话',
  MARKS: '点名明细',
  LEAVES: '离开明细',
  PAUSES: '暂停明细',
};

/** 会话的落点时间：结束过就用结束时间，还在进行就用「现在」。 */
function sessionEnd(session, now) {
  return session.endedAt ?? now;
}

/**
 * 攒出一份整班工作簿。
 *
 * `sessions` 要按时间正序传进来 —— 明细表里靠「会话开始时间」把行归组，正序读起来
 * 才是从早到晚。
 */
export async function exportClassWorkbook(klass, sessions, now = Date.now()) {
  const studentOf = new Map(klass.students.map((student) => [student.id, student]));

  const klassRows = [
    [text('班级名称'), text(klass.name)],
    [text('主题'), text(klass.theme)],
    [text('超时出声提醒'), text(klass.alertSound ? '是' : '否')],
    [text('补响间隔（秒）'), number(klass.alertRepeatMs / 1000)],
    [text('待机蒙版（秒）'), number(klass.idleMaskMs / 1000)],
    [text('导出于'), date(now)],
  ];

  // 「时长（分钟）」空着就是不限时 —— 超时是每条备注自己的事，不是全班一个数
  const templateRows = [[text('序号'), text('文本'), text('颜色'), text('时长（分钟）')]];
  klass.remarkTemplates.forEach((template, index) => {
    templateRows.push([
      number(index + 1),
      text(template.text),
      text(template.color),
      template.timeoutMs > 0 ? number(template.timeoutMs / 60000) : text(''),
    ]);
  });

  const rosterRows = [[text('学号'), text('姓名'), text('座位')]];
  for (const student of klass.students) {
    rosterRows.push([text(student.code), text(student.name), text(student.seat)]);
  }

  const sessionRows = [[
    text('开始时间'),
    text('结束时间'),
    text('应到'),
    text('在座'),
    text('没来'),
    text('离开人次'),
    text('累计离开（分钟）'),
    text('暂停次数'),
    text('暂停（分钟）'),
    text('点名时刻'),
  ]];
  const markRows = [[text('会话开始时间'), text('学号'), text('姓名'), text('是否点到')]];
  const pauseRows = [[text('会话开始时间'), text('暂停时间'), text('继续时间'), text('时长（分钟）')]];
  const leaveRows = [[
    text('会话开始时间'),
    text('学号'),
    text('姓名'),
    text('离开时间'),
    text('归来时间'),
    text('时长（分钟）'),
    text('是否超时'),
    text('备注模板'),
    text('补充说明'),
  ]];

  for (const session of sessions) {
    const end = sessionEnd(session, now);
    const summary = summarize(klass, session, end);
    sessionRows.push([
      date(session.startedAt),
      session.endedAt === undefined ? text('进行中') : date(session.endedAt),
      number(summary.total),
      number(summary.present),
      number(summary.absent),
      number(summary.leaveCount),
      number(Math.round(summary.leaveDurationMs / 60000)),
      number((session.pauses ?? []).length),
      number(Math.round(pausedMs(session, end) / 60000)),
      // 这一场点过名没有：空着就是没点过（下次打开点名层从「全班没到」起算）
      session.rollCallAt === null || session.rollCallAt === undefined
        ? text('')
        : date(session.rollCallAt),
    ]);

    for (const student of klass.students) {
      markRows.push([
        date(session.startedAt),
        text(student.code),
        text(student.name),
        // 「是否点到」问的是「他算到了吗」—— 没被点成没来的就是在座
        text(session.absentIds.includes(student.id) ? '否' : '是'),
      ]);
    }

    for (const leave of session.leaves) {
      const student = studentOf.get(leave.studentId);
      const effectiveMs = awayMsOf(session, leave, end);
      leaveRows.push([
        date(session.startedAt),
        text(student?.code ?? ''),
        text(student?.name ?? ''),
        date(leave.leftAt),
        leave.returnedAt === undefined ? text('未归') : date(leave.returnedAt),
        number(Math.round(effectiveMs / 60000)),
        text(isLeaveOvertime(klass, leave, effectiveMs) ? '是' : '否'),
        // 备注拆两列：模板那一列是老师认得出的那种说法，回来时靠它把颜色与时长接上
        text(remarkOf(klass, leave)?.text ?? ''),
        text(leave.remark ?? ''),
      ]);
    }

    for (const pause of session.pauses ?? []) {
      const closed = pause.to ?? end;
      pauseRows.push([
        date(session.startedAt),
        date(pause.from),
        pause.to === undefined ? text('未继续') : date(pause.to),
        number(Math.round(Math.max(0, closed - pause.from) / 60000)),
      ]);
    }
  }
  return buildWorkbook([
    { name: SHEET.KLASS, rows: klassRows },
    { name: SHEET.TEMPLATES, rows: templateRows },
    { name: SHEET.ROSTER, rows: rosterRows },
    { name: SHEET.SESSIONS, rows: sessionRows },
    { name: SHEET.MARKS, rows: markRows },
    { name: SHEET.LEAVES, rows: leaveRows },
    { name: SHEET.PAUSES, rows: pauseRows },
  ]);
}

function cellsToText(row) {
  return (row ?? []).map((cell) => String(cell ?? '').trim());
}

function findSheet(sheets, name) {
  return sheets.find((sheet) => sheet.name.trim() === name);
}

/** 学生在这一份文件里的识别键：学号与姓名一起认，重名时靠学号分开。 */
function studentKey(code, name) {
  return `${code}\u0000${name}`;
}

/**
 * 读一份整班文件。
 *
 * 返回 `{ klass, sessions }`，两边的 `id` 都是新生成的 —— 导入是**造一份新数据**，
 * 不沿用文件里的 id，免得与库里已有的撞上。谁跟谁对得上靠学号与姓名认。
 */
export async function parseClassWorkbook(bytes) {
  const sheets = await parseWorkbook(bytes);
  const klassSheet = findSheet(sheets, SHEET.KLASS);
  if (klassSheet === undefined) {
    throw new Error('这份文件里没有「班级」表，不像是本工具导出的班');
  }

  const settings = new Map();
  for (const row of klassSheet.rows) {
    const [key, value] = cellsToText(row);
    if (key !== undefined && key !== '') {
      settings.set(key, value ?? '');
    }
  }
  const name = settings.get('班级名称') ?? '';
  if (name === '') {
    throw new Error('「班级」表里没有班级名称');
  }

  const templateSheet = findSheet(sheets, SHEET.TEMPLATES);
  const templates = [];
  if (templateSheet !== undefined) {
    for (const row of templateSheet.rows.slice(1)) {
      const value = String(row?.[1] ?? '').trim();
      if (value !== '') {
        // 颜色与时长交给 `normaliseKlass` 收口：老文件只有前两列，读出来就是默认黄、不限时
        templates.push({ text: value, color: String(row?.[2] ?? '').trim(), timeoutMs: Number(row?.[3]) * 60000 });
      }
    }
  }

  const rosterSheet = findSheet(sheets, SHEET.ROSTER);
  if (rosterSheet === undefined) {
    throw new Error('这份文件里没有「名册」表');
  }
  const students = [];
  const byKey = new Map();
  for (const row of rosterSheet.rows.slice(1)) {
    const [code, studentName, seat] = cellsToText(row);
    if (studentName === undefined || studentName === '') {
      continue;
    }
    const student = {
      id: newId('stu'),
      name: studentName,
      code: code ?? '',
      seat: seat ?? '',
    };
    students.push(student);
    byKey.set(studentKey(student.code, student.name), student.id);
  }

  const alertSound = (settings.get('超时出声提醒') ?? '是') !== '否';
  const alertRepeatMs = Number(settings.get('补响间隔（秒）') ?? 60) * 1000;
  // 待机蒙版可以是 0（不切），所以这里不能像补响间隔那样把 0 当成缺省
  const idleRaw = settings.get('待机蒙版（秒）');
  const idleMaskMs = idleRaw === undefined ? DEFAULT_IDLE_MASK_MS : Number(idleRaw) * 1000;

  // 备注模板过一遍 `normaliseKlass`：颜色与时长在两处都有默认，这里不重复那套判断
  const klass = normaliseKlass({
    id: newId('k'),
    name,
    createdAt: Date.now(),
    theme: settings.get('主题') ?? 'middle',
    alertSound,
    alertRepeatMs: Number.isFinite(alertRepeatMs) && alertRepeatMs > 0 ? alertRepeatMs : 60000,
    idleMaskMs: Number.isFinite(idleMaskMs) && idleMaskMs >= 0 ? idleMaskMs : DEFAULT_IDLE_MASK_MS,
    remarkTemplates: templates,
    students,
  });

  const sessionSheet = findSheet(sheets, SHEET.SESSIONS);
  const sessions = [];
  const sessionByStart = new Map();
  if (sessionSheet !== undefined) {
    for (const row of sessionSheet.rows.slice(1)) {
      const startedAt = Number(row?.[0]);
      if (!Number.isFinite(startedAt)) {
        continue;
      }
      const endedRaw = row?.[1];
      const endedAt = Number(endedRaw);
      // 末尾那列「点名时刻」：空着就是这一场没点过名（老文件没有这一列，也读成没点过）
      const rollCallRaw = Number(row?.[9]);
      const session = {
        id: newId('s'),
        classId: klass.id,
        phase: Number.isFinite(endedAt) ? PHASE.ENDED : PHASE.STUDYING,
        startedAt,
        absentIds: [],
        rollCallAt: Number.isFinite(rollCallRaw) && rollCallRaw > 0 ? rollCallRaw : null,
        leaves: [],
        pauses: [],
      };
      if (Number.isFinite(endedAt)) {
        session.endedAt = endedAt;
      }
      sessions.push(session);
      sessionByStart.set(startedAt, session);
    }
  }

  const markSheet = findSheet(sheets, SHEET.MARKS);
  if (markSheet !== undefined) {
    for (const row of markSheet.rows.slice(1)) {
      const startedAt = Number(row?.[0]);
      const session = sessionByStart.get(startedAt);
      if (session === undefined) {
        continue;
      }
      const [, code, studentName, marked] = cellsToText(row);
      const studentId = byKey.get(studentKey(code ?? '', studentName ?? ''));
      // 表里的「是」是「他到了」，存的是它的反面
      if (studentId === undefined || marked === '是') {
        continue;
      }
      session.absentIds.push(studentId);
    }
  }

  const leaveSheet = findSheet(sheets, SHEET.LEAVES);
  if (leaveSheet !== undefined) {
    for (const row of leaveSheet.rows.slice(1)) {
      const startedAt = Number(row?.[0]);
      const session = sessionByStart.get(startedAt);
      if (session === undefined) {
        continue;
      }
      const [, code, studentName, leftAt, returnedAt, , , templateText, note] = row ?? [];
      const studentId = byKey.get(studentKey(String(code ?? '').trim(), String(studentName ?? '').trim()));
      if (studentId === undefined || !Number.isFinite(Number(leftAt))) {
        continue;
      }
      const leave = {
        id: newId('l'),
        studentId,
        leftAt: Number(leftAt),
      };
      const returned = Number(returnedAt);
      if (Number.isFinite(returned)) {
        leave.returnedAt = returned;
      }
      // 按文本把模板接回来：颜色与时长都挂在它身上。老师改过模板名或删过模板的话
      // 接不上，这条离开就按默认算（黄、不限时）—— 比丢整条记录强
      const wanted = String(templateText ?? '').trim();
      const template = klass.remarkTemplates.find((item) => item.text === wanted);
      if (template !== undefined) {
        leave.templateId = template.id;
      }
      const text = String(note ?? '').trim();
      if (text !== '') {
        leave.remark = text;
      }
      session.leaves.push(leave);
    }
  }

  const pauseSheet = findSheet(sheets, SHEET.PAUSES);
  if (pauseSheet !== undefined) {
    for (const row of pauseSheet.rows.slice(1)) {
      const startedAt = Number(row?.[0]);
      const session = sessionByStart.get(startedAt);
      if (session === undefined) {
        continue;
      }
      const from = Number(row?.[1]);
      if (!Number.isFinite(from)) {
        continue;
      }
      const to = Number(row?.[2]);
      session.pauses.push(Number.isFinite(to) ? { from, to } : { from });
    }
  }

  for (const session of sessions) {
    session.leaves.sort((left, right) => left.leftAt - right.leftAt);
  }

  return { klass, sessions: sessions.sort((left, right) => left.startedAt - right.startedAt) };
}

/** 导入时生成新 id。文件里的 id 是上一次导出的产物，不当成身份用。 */
function newId(prefix) {
  const random = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}
