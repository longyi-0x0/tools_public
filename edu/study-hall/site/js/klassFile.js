/**
 * 一个班 → 一份 xlsx，一份 xlsx → 一个班。
 *
 * 一个班就是一个文件，导出的是**这个班的全部**：班级设置（含超时阈值与补响间隔，
 * 它们按班为单位）、备注模板、名册、每一场记录、每一场的点名明细与离开明细。
 * 读回来时按同样的表重建，所以「导出再导入」得到的是同一份数据。
 *
 * 表里时间写成 Excel 日期（不是文本），老师拿到文件能直接排序与筛。
 */

import { PHASE, remarkTextOf, summarize } from './domain.js';
import { buildWorkbook, date, number, parseWorkbook, text } from './xlsx.js';

export const SHEET = {
  KLASS: '班级',
  TEMPLATES: '备注模板',
  ROSTER: '名册',
  SESSIONS: '会话',
  MARKS: '点名明细',
  LEAVES: '离开明细',
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
    [text('超时阈值（分钟）'), number(klass.overtimeThresholdMs / 60000)],
    [text('超时出声提醒'), text(klass.alertSound ? '是' : '否')],
    [text('补响间隔（秒）'), number(klass.alertRepeatMs / 1000)],
    [text('导出于'), date(now)],
  ];

  const templateRows = [[text('序号'), text('文本')]];
  klass.remarkTemplates.forEach((template, index) => {
    templateRows.push([number(index + 1), text(template.text)]);
  });

  const rosterRows = [[text('学号'), text('姓名'), text('座位')]];
  for (const student of klass.students) {
    rosterRows.push([text(student.code), text(student.name), text(student.seat)]);
  }

  const sessionRows = [[
    text('开始时间'),
    text('点名开始'),
    text('点名结束'),
    text('结束时间'),
    text('应到'),
    text('已到'),
    text('没到'),
    text('离开人次'),
    text('累计离开（分钟）'),
  ]];
  const markRows = [[text('会话开始时间'), text('学号'), text('姓名'), text('是否点到')]];
  const leaveRows = [[
    text('会话开始时间'),
    text('学号'),
    text('姓名'),
    text('离开时间'),
    text('归来时间'),
    text('时长（分钟）'),
    text('是否超时'),
    text('备注'),
  ]];

  for (const session of sessions) {
    const end = sessionEnd(session, now);
    const summary = summarize(klass, session, end);
    sessionRows.push([
      date(session.startedAt),
      session.rollCallStartedAt === undefined ? text('') : date(session.rollCallStartedAt),
      session.rollCallEndedAt === undefined ? text('') : date(session.rollCallEndedAt),
      session.endedAt === undefined ? text('进行中') : date(session.endedAt),
      number(summary.total),
      number(summary.present),
      number(summary.absent),
      number(summary.leaveCount),
      number(Math.round(summary.leaveDurationMs / 60000)),
    ]);

    for (const student of klass.students) {
      markRows.push([
        date(session.startedAt),
        text(student.code),
        text(student.name),
        text(session.markedIds.includes(student.id) ? '是' : '否'),
      ]);
    }

    for (const leave of session.leaves) {
      const student = studentOf.get(leave.studentId);
      const endAt = leave.returnedAt ?? end;
      leaveRows.push([
        date(session.startedAt),
        text(student?.code ?? ''),
        text(student?.name ?? ''),
        date(leave.leftAt),
        leave.returnedAt === undefined ? text('未归') : date(leave.returnedAt),
        number(Math.round(Math.max(0, endAt - leave.leftAt) / 60000)),
        text(
          leave.returnedAt !== undefined && leave.returnedAt - leave.leftAt > klass.overtimeThresholdMs
            ? '是'
            : '否',
        ),
        text(remarkLine(klass, leave)),
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
  ]);
}

/** 模板加上补充，拼成一行。 */
function remarkLine(klass, leave) {
  return remarkTextOf(klass, leave);
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
        templates.push(value);
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

  const thresholdMs = Number(settings.get('超时阈值（分钟）') ?? 10) * 60000;
  const alertSound = (settings.get('超时出声提醒') ?? '是') !== '否';
  const alertRepeatMs = Number(settings.get('补响间隔（秒）') ?? 60) * 1000;

  const klass = {
    id: newId('k'),
    name,
    createdAt: Date.now(),
    theme: settings.get('主题') ?? 'middle',
    overtimeThresholdMs: Number.isFinite(thresholdMs) && thresholdMs > 0 ? thresholdMs : 600000,
    alertSound,
    alertRepeatMs: Number.isFinite(alertRepeatMs) && alertRepeatMs > 0 ? alertRepeatMs : 60000,
    remarkTemplates: templates.map((value, index) => ({ id: `tpl-${index + 1}`, text: value })),
    students,
  };

  const sessionSheet = findSheet(sheets, SHEET.SESSIONS);
  const sessions = [];
  const sessionByStart = new Map();
  if (sessionSheet !== undefined) {
    for (const row of sessionSheet.rows.slice(1)) {
      const startedAt = Number(row?.[0]);
      if (!Number.isFinite(startedAt)) {
        continue;
      }
      const rollCallStartedAt = Number(row?.[1]);
      const rollCallEndedAt = Number(row?.[2]);
      const endedRaw = row?.[3];
      const endedAt = Number(endedRaw);
      const session = {
        id: newId('s'),
        classId: klass.id,
        phase: Number.isFinite(endedAt) ? PHASE.ENDED : PHASE.SELF_STUDY,
        startedAt,
        markedIds: [],
        leaves: [],
      };
      if (Number.isFinite(rollCallStartedAt)) {
        session.rollCallStartedAt = rollCallStartedAt;
      }
      if (Number.isFinite(rollCallEndedAt)) {
        session.rollCallEndedAt = rollCallEndedAt;
      }
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
      if (studentId === undefined || marked !== '是') {
        continue;
      }
      session.markedIds.push(studentId);
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
      const [, code, studentName, leftAt, returnedAt, , , remark] = row ?? [];
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
      const note = String(remark ?? '').trim();
      if (note !== '') {
        leave.remark = note;
      }
      session.leaves.push(leave);
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
