/**
 * 领域层：状态机、四色推导、统计。
 *
 * 这一层不认识浏览器：不碰 `window`、不碰 IndexedDB、不读 `Date.now()`。
 * 时间一律由调用方以毫秒时间戳传进来，所以同一份逻辑在界面上拿真时钟跑、
 * 在脑子里推演时拿假时钟跑，结果一致。
 */

/** 一次记录（一场自习）走到哪一相。 */
export const PHASE = {
  /** 准备：记录已开始，还没点名。全班都是「没到」。 */
  PREPARING: 'preparing',
  /** 点名中：老师逐个点，点过的变「到了」。 */
  ROLL_CALL: 'roll_call',
  /** 自习中：点名已结束，正式进入自习时间。 */
  SELF_STUDY: 'self_study',
  /** 已结束：这一场定格，只读。 */
  ENDED: 'ended',
};

/**
 * 一个学生的当前状态。
 *
 * 颜色语义一句话说完：**蓝 = 没到，灰 = 到了**。黄与红是「到了又离开」的两个档：
 * 黄是还没超阈值，红是超过了阈值。语义不随阶段变化 —— 点名阶段剩下的蓝就是缺席，
 * 不需要第五种颜色。
 */
export const STATUS = {
  /** 蓝：没到 */
  ABSENT: 'absent',
  /** 灰：到了 */
  PRESENT: 'present',
  /** 黄：临时离开，计时中，未超阈值 */
  LEFT: 'left',
  /** 红：临时离开，已超阈值 */
  OVERTIME: 'overtime',
};

/** 默认超时阈值：10 分钟。 */
export const DEFAULT_OVERTIME_THRESHOLD_MS = 10 * 60 * 1000;
/** 默认补响间隔：60 秒。 */
export const DEFAULT_ALERT_REPEAT_MS = 60 * 1000;

/** 新班的默认备注模板。 */
export const DEFAULT_REMARK_TEMPLATES = ['上厕所', '打水', '去办公室', '身体不适', '被老师叫走'];

/** 造一个新班。`id` 与 `createdAt` 由调用方给：这一层不认识随机数与时钟。 */
export function createKlass(input) {
  const templates = input.remarkTemplates ?? DEFAULT_REMARK_TEMPLATES;
  return {
    id: input.id,
    name: input.name,
    createdAt: input.createdAt,
    theme: input.theme ?? 'middle',
    overtimeThresholdMs: input.overtimeThresholdMs ?? DEFAULT_OVERTIME_THRESHOLD_MS,
    alertSound: input.alertSound ?? true,
    alertRepeatMs: input.alertRepeatMs ?? DEFAULT_ALERT_REPEAT_MS,
    remarkTemplates: templates.map((text, index) => ({ id: `tpl-${index + 1}`, text })),
    students: input.students ?? [],
  };
}

/** 开一场新记录。 */
export function startSession(input) {
  return {
    id: input.id,
    classId: input.classId,
    phase: PHASE.PREPARING,
    startedAt: input.startedAt,
    markedIds: [],
    leaves: [],
  };
}

/** 这一相能不能迁到下一相。 */
export function canTransition(session, to) {
  switch (to) {
    case PHASE.ROLL_CALL:
      return session.phase === PHASE.PREPARING;
    case PHASE.SELF_STUDY:
      return session.phase === PHASE.ROLL_CALL;
    case PHASE.ENDED:
      return session.phase === PHASE.ROLL_CALL || session.phase === PHASE.SELF_STUDY;
    default:
      return false;
  }
}

/** 开始点名。 */
export function beginRollCall(session, at) {
  if (!canTransition(session, PHASE.ROLL_CALL)) {
    throw new Error(`当前阶段（${session.phase}）不能开始点名`);
  }
  return { ...session, phase: PHASE.ROLL_CALL, rollCallStartedAt: at };
}

/** 结束点名，正式进入自习时间。 */
export function endRollCall(session, at) {
  if (!canTransition(session, PHASE.SELF_STUDY)) {
    throw new Error(`当前阶段（${session.phase}）不能结束点名`);
  }
  return { ...session, phase: PHASE.SELF_STUDY, rollCallEndedAt: at };
}

/** 结束自习。这一场就此定格。 */
export function endSession(session, at) {
  if (!canTransition(session, PHASE.ENDED)) {
    throw new Error(`当前阶段（${session.phase}）不能结束自习`);
  }
  return { ...session, phase: PHASE.ENDED, endedAt: at };
}

/** 点到一个人：蓝 → 灰。点名阶段与自习阶段都成立（后者是迟到到场）。 */
export function markPresent(session, studentId) {
  if (session.phase !== PHASE.ROLL_CALL && session.phase !== PHASE.SELF_STUDY) {
    throw new Error(`当前阶段（${session.phase}）不能点名`);
  }
  if (session.markedIds.includes(studentId)) {
    return session;
  }
  return { ...session, markedIds: [...session.markedIds, studentId] };
}

/** 取消点到：灰 → 蓝。点错了可以退回去。 */
export function unmarkPresent(session, studentId) {
  if (session.phase !== PHASE.ROLL_CALL && session.phase !== PHASE.SELF_STUDY) {
    throw new Error(`当前阶段（${session.phase}）不能改点名结果`);
  }
  return { ...session, markedIds: session.markedIds.filter((id) => id !== studentId) };
}

/** 这个人当前是不是在外面（有没归来的离开记录）。 */
export function isAway(session, studentId) {
  return session.leaves.some((leave) => leave.studentId === studentId && leave.returnedAt === undefined);
}

/** 取这个人当前那条没归来的离开记录。 */
export function activeLeave(session, studentId) {
  return session.leaves.find((leave) => leave.studentId === studentId && leave.returnedAt === undefined);
}

/** 记一次离开：灰 → 黄，开始计时。只在自习阶段成立。 */
export function markLeft(session, input) {
  if (session.phase !== PHASE.SELF_STUDY) {
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
  if (session.phase !== PHASE.SELF_STUDY) {
    throw new Error(`当前阶段（${session.phase}）不能记归来`);
  }
  return {
    ...session,
    leaves: session.leaves.map((leave) =>
      leave.studentId === studentId && leave.returnedAt === undefined ? { ...leave, returnedAt: at } : leave,
    ),
  };
}

/** 给一条离开记录补备注。已经归来的也能补。 */
export function setRemark(session, leaveId, input) {
  return {
    ...session,
    leaves: session.leaves.map((leave) => {
      if (leave.id !== leaveId) {
        return leave;
      }
      const next = { ...leave };
      if (input.templateId !== undefined) {
        next.templateId = input.templateId;
      }
      if (input.remark !== undefined) {
        next.remark = input.remark;
      }
      return next;
    }),
  };
}

/** 记下「这一条已经响过了」，避免每个 tick 都响。 */
export function markNotified(session, leaveId, at) {
  return {
    ...session,
    leaves: session.leaves.map((leave) => (leave.id === leaveId ? { ...leave, overtimeNotifiedAt: at } : leave)),
  };
}

/** 这一场是不是还在进行中。 */
export function isActive(session) {
  return session.phase !== PHASE.ENDED;
}

/**
 * 推导一个学生的当前状态。
 *
 * 只看事实（`markedIds` 与 `leaves`）与「现在」，不落库 —— 所以刷新页面、
 * 合盖再打开，颜色与计时都能从时间戳重算回来。
 */
export function statusOf(session, studentId, now, thresholdMs) {
  if (session.phase === PHASE.PREPARING) {
    return STATUS.ABSENT;
  }
  const leave = activeLeave(session, studentId);
  if (leave !== undefined) {
    return now - leave.leftAt > thresholdMs ? STATUS.OVERTIME : STATUS.LEFT;
  }
  return session.markedIds.includes(studentId) ? STATUS.PRESENT : STATUS.ABSENT;
}

/** 当前这次离开已持续的毫秒数；不在离开中为 0。 */
export function awayMs(session, studentId, now) {
  const leave = activeLeave(session, studentId);
  return leave === undefined ? 0 : Math.max(0, now - leave.leftAt);
}

/**
 * 这一场已经自习了多久。
 *
 * 从**结束点名**那一刻算起 —— 点名一结束就是正式的自习时间。还在点名或准备时是 0；
 * 已经结束的那一场定格在结束那一刻，不再往前走。
 */
export function studyMs(session, now) {
  if (session.rollCallEndedAt === undefined) {
    return 0;
  }
  const end = session.endedAt ?? now;
  return Math.max(0, end - session.rollCallEndedAt);
}

/** 把模板与补充拼成一行备注。 */
export function remarkTextOf(klass, leave) {
  if (leave === undefined) {
    return '';
  }
  const template = klass.remarkTemplates.find((item) => item.id === leave.templateId);
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
 * 「已到」把临时离开的人算在内 —— 他们到了，只是这会儿不在座位上。「离开中」
 * 与「超时」是「已到」的子集，单独报出来给老师看。所以
 * `已到 + 没到 = 应到`，而离开的那几个人两边都出现。
 */
export function summarize(klass, session, now) {
  const threshold = klass.overtimeThresholdMs;
  let present = 0;
  let left = 0;
  let overtime = 0;
  for (const student of klass.students) {
    if (activeLeave(session, student.id) === undefined && !session.markedIds.includes(student.id)) {
      continue;
    }
    present += 1;
    switch (statusOf(session, student.id, now, threshold)) {
      case STATUS.LEFT:
        left += 1;
        break;
      case STATUS.OVERTIME:
        overtime += 1;
        break;
      default:
        break;
    }
  }
  let leaveDurationMs = 0;
  for (const leave of session.leaves) {
    const end = leave.returnedAt ?? now;
    leaveDurationMs += Math.max(0, end - leave.leftAt);
  }
  return {
    total: klass.students.length,
    present,
    absent: klass.students.length - present,
    left,
    overtime,
    leaveCount: session.leaves.length,
    leaveDurationMs,
  };
}

/**
 * 这一拍该响哪几条。
 *
 * 越过阈值且从没响过 → 响；响过之后每隔 `alertRepeatMs` 补响一次，直到老师
 * 点「归来」。返回的是**该响的离开记录**，由调用方去发声并回写 `overtimeNotifiedAt`，
 * 这一层不碰声音。
 */
export function dueAlerts(session, now, thresholdMs, repeatMs) {
  const due = [];
  for (const leave of session.leaves) {
    if (leave.returnedAt !== undefined) {
      continue;
    }
    if (now - leave.leftAt <= thresholdMs) {
      continue;
    }
    if (leave.overtimeNotifiedAt === undefined || now - leave.overtimeNotifiedAt >= repeatMs) {
      due.push(leave);
    }
  }
  return due;
}
