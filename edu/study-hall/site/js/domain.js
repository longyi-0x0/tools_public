/**
 * 领域层：状态机、四色推导、统计。
 *
 * 这一层不认识浏览器：不碰 `window`、不碰 IndexedDB、不读 `Date.now()`。
 * 时间一律由调用方以毫秒时间戳传进来，所以同一份逻辑在界面上拿真时钟跑、
 * 在脑子里推演时拿假时钟跑，结果一致。
 */

/** 一次记录（一场自习）走到哪一相。 */
export const PHASE = {
  /** 自习中：按「开始自习」之后的常态。全班默认在座，计时已经在走。 */
  STUDYING: 'studying',
  /** 已结束：这一场定格，只读。 */
  ENDED: 'ended',
};

/**
 * 一个学生的当前状态。
 *
 * 颜色语义一句话说完：**蓝 = 没来，灰 = 在座**；离开中的颜色由**那条备注**决定
 * （默认黄），超过那条备注设的时长转红。
 *
 * 开始自习时全班都是灰的 —— 坐在座位上是默认事实，老师不必为此点几十下。蓝色的
 * 那几个只可能来自两处：点名时被点出来的没来，或自习中把点错的人退回没来。
 *
 * 离开中没有单独的状态常量：它的状态值**就是颜色名**（见 [`AWAY_COLORS`]），
 * 界面照着 `data-status` 上色，两处不会对不上。
 */
export const STATUS = {
  /** 蓝：没来 */
  ABSENT: 'absent',
  /** 灰：在座 */
  PRESENT: 'present',
  /** 红：临时离开，已过那条备注设的时长 */
  OVERTIME: 'overtime',
};

/**
 * 离开中能挑的颜色。黄是默认；蓝 / 灰 / 红是语义色，不在其中也不给挑 ——
 * 它们分别说「没来」「在座」「超时」，被备注借去用就说不清了。
 */
export const AWAY_COLORS = ['yellow', 'orange', 'green', 'violet', 'pink', 'teal'];
/** 没挑颜色时用的那一个。 */
export const DEFAULT_AWAY_COLOR = 'yellow';

/**
 * 三套主题：值、在界面上叫什么、一屏摆几列。
 *
 * 选项与班级卡上那句「多少人 · 什么主题」读的是同一张表 —— 两处各写一份的话，早晚
 * 一处改了另一处没跟上。`columns` 是看板的列数：人多列多、字小。
 */
export const THEMES = [
  { value: 'junior', label: '童趣（小学）', columns: 5 },
  { value: 'middle', label: '标准', columns: 6 },
  { value: 'senior', label: '简洁（高中）', columns: 8 },
];

/** 主题在界面上叫什么。认不出的值原样写出来，不猜一个替身。 */
export function themeLabel(theme) {
  return THEMES.find((item) => item.value === theme)?.label ?? theme;
}

/** 这套主题一屏摆几列。 */
export function themeColumns(theme) {
  return THEMES.find((item) => item.value === theme)?.columns ?? 6;
}

/** 这个状态是不是「离开中」（不管哪种颜色）。 */
export function isAwayStatus(status) {
  return status !== STATUS.ABSENT && status !== STATUS.PRESENT && status !== STATUS.OVERTIME;
}

/** 默认补响间隔：60 秒。 */
const DEFAULT_ALERT_REPEAT_MS = 60 * 1000;

/**
 * 默认的待机时间：自习中 30 秒没人碰屏幕，就切到待机蒙版。
 *
 * 教室前面那块屏，老师不操作时不该一直亮着密密麻麻的名字；换成一个大钟加「谁还在
 * 外面」，从最后一排也看得见。**任何操作都重新计时** —— 指针动一下也算（见 app.js
 * 的活动监听）。0 表示不切。
 */
export const DEFAULT_IDLE_MASK_MS = 30 * 1000;

/** 新班的默认备注模板。颜色与时长都交给老师自己设（默认黄、不限时）。 */
const DEFAULT_REMARK_TEMPLATES = ['上厕所', '打水', '去办公室', '身体不适', '被老师叫走'];

/**
 * 把一条备注模板补齐成当前形状：`{ id, text, color, timeoutMs }`。
 *
 * 模板是**后来才有颜色与时长**的（早先只有一句文本），库里的老班可能存的是字符串或
 * 少了字段的对象，所以读的时候都从字符串认起。颜色只认 [`AWAY_COLORS`] 里的，
 * `timeoutMs` 不是正数就是**不限时**。
 */
function normaliseTemplate(raw, index) {
  const item = typeof raw === 'string' ? { text: raw } : (raw ?? {});
  const timeout = Number(item.timeoutMs);
  return {
    id: typeof item.id === 'string' && item.id !== '' ? item.id : `tpl-${index + 1}`,
    text: String(item.text ?? '').trim(),
    color: AWAY_COLORS.includes(item.color) ? item.color : DEFAULT_AWAY_COLOR,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 0,
  };
}

/** 造一个新班。`id` 与 `createdAt` 由调用方给：这一层不认识随机数与时钟。 */
export function createKlass(input) {
  const templates = input.remarkTemplates ?? DEFAULT_REMARK_TEMPLATES;
  return {
    id: input.id,
    name: input.name,
    createdAt: input.createdAt,
    theme: input.theme ?? 'middle',
    alertSound: input.alertSound ?? true,
    alertRepeatMs: input.alertRepeatMs ?? DEFAULT_ALERT_REPEAT_MS,
    idleMaskMs: input.idleMaskMs ?? DEFAULT_IDLE_MASK_MS,
    remarkTemplates: templates.map(normaliseTemplate),
    students: input.students ?? [],
  };
}

/**
 * 开一场新记录。
 *
 * 一开就是自习中：计时从这一刻起走，全班默认在座。点名是可选的加餐 —— 想点就走
 * 「点名」那一层，点出来的没来记在 `absentIds` 里，不点也不影响这一场跑下去。
 */
export function startSession(input) {
  return {
    id: input.id,
    classId: input.classId,
    phase: PHASE.STUDYING,
    startedAt: input.startedAt,
    absentIds: [],
    leaves: [],
    pauses: [],
  };
}

/** 这一相能不能迁到下一相。 */
function canTransition(session, to) {
  switch (to) {
    case PHASE.ENDED:
      return session.phase === PHASE.STUDYING;
    default:
      return false;
  }
}

/**
 * 把库里读出来的班补齐成当前形状。
 *
 * 数据只存在老师自己的浏览器里，没有服务端可以跑迁移，所以后来加的字段只能在读的时候
 * 补默认值 —— 不然老班上的 `idleMaskMs` 是 `undefined`，切换到待机那道判断会当场成立。
 * 对一个已经是完整形状的班是幂等的。
 *
 * 学生也一并补齐：学号与座位缺了就是空串。少了这一步，界面上会写出「undefined 号」——
 * 那两处判的是「是不是空串」。
 *
 * 早先的班还有一个「超时阈值（分钟）」总设置，现在**超时是每条备注自己的事**，那项不再读。
 */
export function normaliseKlass(raw) {
  const templates = Array.isArray(raw.remarkTemplates) ? raw.remarkTemplates : [];
  const students = Array.isArray(raw.students) ? raw.students : [];
  return {
    id: raw.id,
    name: raw.name,
    createdAt: raw.createdAt,
    theme: raw.theme ?? 'middle',
    alertSound: raw.alertSound ?? true,
    alertRepeatMs: raw.alertRepeatMs ?? DEFAULT_ALERT_REPEAT_MS,
    idleMaskMs: raw.idleMaskMs ?? DEFAULT_IDLE_MASK_MS,
    remarkTemplates: templates.map(normaliseTemplate),
    students: students.map((student) => ({
      id: student.id,
      name: String(student.name ?? ''),
      code: String(student.code ?? ''),
      seat: String(student.seat ?? ''),
    })),
  };
}

/**
 * 把库里读出来的一场记录补齐成当前形状。
 *
 * 与 [`normaliseKlass`] 同理。这里还收一件事：早先的版本把「准备 → 点名 → 自习」写成
 * 三个相，没走完点名的旧记录停在 `preparing` / `roll_call` —— 那两个相已经没有了，
 * 一律读成「自习中」。旧记录里点过的名字不往回翻：翻一次要点掉一个个名字，而这里
 * 拿不到名册，翻不出正确的反面，宁可让那一场的人全按在座读，也不猜。
 */
export function normaliseSession(raw) {
  return {
    ...raw,
    phase: raw.phase === PHASE.ENDED ? PHASE.ENDED : PHASE.STUDYING,
    absentIds: Array.isArray(raw.absentIds) ? raw.absentIds : [],
    leaves: Array.isArray(raw.leaves) ? raw.leaves : [],
    pauses: Array.isArray(raw.pauses) ? raw.pauses : [],
  };
}

/**
 * 暂停 / 继续。
 *
 * 上课时什么情况都能遇到：临时集合、有人进来找、整班被叫走。暂停记的是**区间**
 * （`{ from, to }`，`to` 为空表示正暂停着），仍然只存时刻不存累加秒数 —— 跨刷新
 * 重算的结果一致。
 *
 * 暂停停的不止是自习时间：有人正离开的话，那一段也不该算到他头上。不然暂停二十分钟
 * 再回来，谁都变成超时了。
 */
export function isPaused(session) {
  const pauses = session.pauses ?? [];
  const last = pauses[pauses.length - 1];
  return last !== undefined && last.to === undefined;
}

/** 暂停区间与 `[from, to]` 的重叠时长。 */
function pausedOverlapMs(pauses, from, to) {
  if (!Array.isArray(pauses) || to <= from) {
    return 0;
  }
  let total = 0;
  for (const pause of pauses) {
    const start = Math.max(from, pause.from);
    const end = Math.min(to, pause.to === undefined ? to : pause.to);
    if (end > start) {
      total += end - start;
    }
  }
  return total;
}

/** 暂停自习。 */
export function pauseSession(session, at) {
  if (session.phase !== PHASE.STUDYING) {
    throw new Error(`当前阶段（${session.phase}）不能暂停`);
  }
  if (isPaused(session)) {
    return session;
  }
  return { ...session, pauses: [...(session.pauses ?? []), { from: at }] };
}

/** 继续自习。 */
export function resumeSession(session, at) {
  if (session.phase !== PHASE.STUDYING) {
    throw new Error(`当前阶段（${session.phase}）不能继续`);
  }
  const pauses = session.pauses ?? [];
  const last = pauses[pauses.length - 1];
  if (last === undefined || last.to !== undefined) {
    return session;
  }
  return { ...session, pauses: [...pauses.slice(0, -1), { from: last.from, to: at }] };
}

/** 结束自习。这一场就此定格。 */
export function endSession(session, at) {
  if (!canTransition(session, PHASE.ENDED)) {
    throw new Error(`当前阶段（${session.phase}）不能结束自习`);
  }
  // 正暂停着结束的话，把那段合上 —— 不然后面再算时长会一路算到「现在」
  const closed = isPaused(session) ? resumeSession(session, at) : session;
  return { ...closed, phase: PHASE.ENDED, endedAt: at };
}

/**
 * 把没来名单整份设成给的那一份。
 *
 * 点名层里点的那些人先在层里攒着，按「完成」时才由这里一次落到这一场上。
 *
 * 落在名单上的人，开着的离开**当场合上** —— 没来过的人谈不上离开。不合的话那个
 * 定时器会一直跑：格子按离开的颜色画，到了时长还会响，而人明明标着没来。
 *
 * 顺序按调用方给的来；导出与统计都只看「在不在里面」，与顺序无关。
 */
export function setAbsent(session, absentIds, at) {
  let next = { ...session, absentIds: [...absentIds] };
  for (const studentId of absentIds) {
    next = closeOpenLeave(next, studentId, at);
  }
  return next;
}

/**
 * 记一个「没来」：灰 → 蓝。
 *
 * 开始自习时全班都是灰的（在座），所以点名做的不是「标记到了的」，而是反过来
 * 挑出没来的那几个 —— 一个班几十号人，多数都在座位上，挑少数才省力气。
 *
 * 不要求处于某一相：自习里随时能把一个人退回没来（他走了、一开始就点错了）。
 */
export function markAbsent(session, studentId, at) {
  const absentIds = session.absentIds.includes(studentId)
    ? session.absentIds
    : [...session.absentIds, studentId];
  return setAbsent(session, absentIds, at);
}

/** 取消「没来」：蓝 → 灰。点错了可以退回去。 */
export function markPresent(session, studentId) {
  return { ...session, absentIds: session.absentIds.filter((id) => id !== studentId) };
}

/** 合上这个人开着的离开（`at` 没给就原样返回 —— 这一层不读时钟，得调用方给）。 */
function closeOpenLeave(session, studentId, at) {
  if (at === undefined || !isAway(session, studentId)) {
    return session;
  }
  return {
    ...session,
    leaves: session.leaves.map((leave) =>
      leave.studentId === studentId && leave.returnedAt === undefined ? { ...leave, returnedAt: at } : leave,
    ),
  };
}

/**
 * 这个人当前是不是在外面（有没归来的离开记录）。 */
function isAway(session, studentId) {
  return session.leaves.some((leave) => leave.studentId === studentId && leave.returnedAt === undefined);
}

/** 取这个人当前那条没归来的离开记录。 */
export function activeLeave(session, studentId) {
  return session.leaves.find((leave) => leave.studentId === studentId && leave.returnedAt === undefined);
}

/** 记一次离开：灰 → 黄，开始计时。 */
export function markLeft(session, input) {
  if (session.phase !== PHASE.STUDYING) {
    throw new Error(`当前阶段（${session.phase}）不能记离开`);
  }
  if (isAway(session, input.studentId)) {
    return session;
  }
  const leave = { id: input.id, studentId: input.studentId, leftAt: input.at };
  if (input.templateId !== undefined) {
    leave.templateId = input.templateId;
  }
  if (input.remark !== undefined && input.remark !== '') {
    leave.remark = input.remark;
  }
  return { ...session, leaves: [...session.leaves, leave] };
}

/** 记一次归来：黄 / 红 → 灰，停表。 */
export function markReturned(session, studentId, at) {
  if (session.phase !== PHASE.STUDYING) {
    throw new Error(`当前阶段（${session.phase}）不能记归来`);
  }
  return {
    ...session,
    leaves: session.leaves.map((leave) =>
      leave.studentId === studentId && leave.returnedAt === undefined ? { ...leave, returnedAt: at } : leave,
    ),
  };
}

/** 记下「这一条已经响过了」，避免每个 tick 都响。 */
export function markNotified(session, leaveId, at) {
  return {
    ...session,
    leaves: session.leaves.map((leave) => (leave.id === leaveId ? { ...leave, overtimeNotifiedAt: at } : leave)),
  };
}

/**
 * 推导一个学生的当前状态。
 *
 * 只看事实（`absentIds` 与 `leaves`）与「现在」，不落库 —— 所以刷新页面、
 * 合盖再打开，颜色与计时都能从时间戳重算回来。
 *
 * 灰度是默认：没被点成没来、也没在离开中的，就是在座。离开中的颜色跟着**那条备注**
 * 走（默认黄）；备注设了时长且已经过了，就是红。
 */
export function statusOf(session, studentId, now, klass) {
  const leave = activeLeave(session, studentId);
  if (leave !== undefined) {
    const timeoutMs = awayTimeoutMsOf(klass, leave);
    // 用有效时长判，不是「现在 − 离开时刻」：暂停的那几段不算他的
    if (timeoutMs > 0 && awayMsOf(session, leave, now) > timeoutMs) {
      return STATUS.OVERTIME;
    }
    return awayColorOf(klass, leave);
  }
  return session.absentIds.includes(studentId) ? STATUS.ABSENT : STATUS.PRESENT;
}

/** 一条离开记录用的是哪条备注模板（没挑就是没有）。 */
export function remarkOf(klass, leave) {
  return klass.remarkTemplates.find((item) => item.id === leave?.templateId);
}

/** 这条离开该刷什么颜色：备注没挑颜色时是默认黄。 */
function awayColorOf(klass, leave) {
  return remarkOf(klass, leave)?.color ?? DEFAULT_AWAY_COLOR;
}

/**
 * 这条离开多久算超时。**0 表示不限时** —— 老师没给这条备注设时长，它就只是计个数。
 *
 * 超时不是全班一个数，而是每条备注自己的事：「去办公室」可能要 10 分钟，「上厕所」
 * 3 分钟就够。同一个班里谁也别拿别人的尺子量。
 */
function awayTimeoutMsOf(klass, leave) {
  return remarkOf(klass, leave)?.timeoutMs ?? 0;
}

/** 一条离开记录是不是已经过了它自己的时长。 */
export function isLeaveOvertime(klass, leave, awayMs) {
  const timeoutMs = awayTimeoutMsOf(klass, leave);
  return timeoutMs > 0 && awayMs > timeoutMs;
}

/** 当前这次离开已持续的毫秒数（扣掉暂停段）；不在离开中为 0。 */
export function awayMs(session, studentId, now) {
  const leave = activeLeave(session, studentId);
  return leave === undefined ? 0 : awayMsOf(session, leave, now);
}

/**
 * 一条离开记录到 `now` 为止的实际时长。
 *
 * 扣掉与暂停区间重叠的部分 —— 暂停期间人还在外面，但那段时间不算他的。
 */
export function awayMsOf(session, leave, now) {
  const end = leave.returnedAt === undefined ? now : leave.returnedAt;
  return Math.max(0, end - leave.leftAt - pausedOverlapMs(session.pauses, leave.leftAt, end));
}

/**
 * 这一场已经自习了多久。
 *
 * 从**开始自习**那一刻算起 —— 点不点名都一样，一按下去计时就在走；暂停的那几段
 * 不算。已经结束的那一场定格在结束那一刻，不再往前走。
 */
export function studyMs(session, now) {
  const end = session.endedAt ?? now;
  return Math.max(0, end - session.startedAt - pausedOverlapMs(session.pauses, session.startedAt, end));
}

/** 这一场暂停了多少（毫秒）。 */
export function pausedMs(session, now) {
  const end = session.endedAt ?? now;
  return pausedOverlapMs(session.pauses, session.startedAt, end);
}

/**
 * 本场的离开账：按人汇总，出去得最久的排前面。
 *
 * 下课那一刻老师要交代的是「谁出去过、多久、超时没有」。一次离开一条记录，同一个人
 * 出去两次就在这儿并成一行；时长用有效时长（扣掉暂停段），与格子上的算法一致。
 */
function leaveReport(klass, session, now) {
  const rows = new Map();
  for (const leave of session.leaves) {
    const ms = awayMsOf(session, leave, now);
    const row = rows.get(leave.studentId) ?? {
      studentId: leave.studentId,
      count: 0,
      totalMs: 0,
      overtime: false,
      remark: '',
    };
    row.count += 1;
    row.totalMs += ms;
    if (isLeaveOvertime(klass, leave, ms)) {
      row.overtime = true;
    }
    // 只留第一条有内容的备注：一行里放不下这个人出去过的每一次
    const text = remarkTextOf(klass, leave);
    if (text !== '' && row.remark === '') {
      row.remark = text;
    }
    rows.set(leave.studentId, row);
  }
  return [...rows.values()].sort((left, right) => right.totalMs - left.totalMs);
}

/** 本场有多少人至少超时过一次。 */
export function overtimeCount(klass, session, now) {
  return leaveReport(klass, session, now).filter((row) => row.overtime).length;
}

/** 把模板与补充拼成一行备注。 */
export function remarkTextOf(klass, leave) {
  if (leave === undefined) {
    return '';
  }
  const template = remarkOf(klass, leave);
  const parts = [];
  if (template !== undefined) {
    parts.push(template.text);
  }
  if (leave.remark !== undefined && leave.remark !== '') {
    parts.push(leave.remark);
  }
  return parts.join(' · ');
}

/**
 * 顶部统计条上的一组数。
 *
 * 「在座」把临时离开的人算在内 —— 他们到了，只是这会儿不在座位上。「离开中」
 * 与「超时」是「在座」的子集，单独报出来给老师看。所以
 * `在座 + 没来 = 应到`，而离开的那几个人两边都出现。
 */
export function summarize(klass, session, now) {
  let present = 0;
  let left = 0;
  let overtime = 0;
  for (const student of klass.students) {
    const status = statusOf(session, student.id, now, klass);
    if (status === STATUS.ABSENT) {
      continue;
    }
    present += 1;
    if (status === STATUS.OVERTIME) {
      overtime += 1;
    } else if (isAwayStatus(status)) {
      left += 1;
    }
  }
  let leaveDurationMs = 0;
  for (const leave of session.leaves) {
    leaveDurationMs += awayMsOf(session, leave, now);
  }
  return {
    total: klass.students.length,
    present,
    absent: klass.students.length - present,
    left,
    overtime,
    leaveCount: session.leaves.length,
    leaveDurationMs,
    pausedMs: pausedMs(session, now),
  };
}

/**
 * 这一拍该响哪几条。
 *
 * 过了**那条备注自己设的时长**且从没响过 → 响；响过之后每隔 `alertRepeatMs` 补响一次，
 * 直到老师点「归来」。没设时长（`timeoutMs` 为 0）的备注不响 —— 那种只是计个数。
 * 返回的是**该响的离开记录**，由调用方去发声并回写 `overtimeNotifiedAt`，这一层不碰声音。
 */
export function dueAlerts(klass, session, now, repeatMs) {
  const due = [];
  for (const leave of session.leaves) {
    if (leave.returnedAt !== undefined) {
      continue;
    }
    // 按有效时长判：暂停期间不算，暂停时也不该响（调用方会跳过）
    if (!isLeaveOvertime(klass, leave, awayMsOf(session, leave, now))) {
      continue;
    }
    if (leave.overtimeNotifiedAt === undefined || now - leave.overtimeNotifiedAt >= repeatMs) {
      due.push(leave);
    }
  }
  return due;
}
