/**
 * 点名层：一块盖在自习看板上的窗。
 *
 * 这一趟点的名字先在层里攒着（`state.rollCallOpen`），**不落到自习那一场上** ——
 * 按「完成」才一次写进去。所以点错了、或者半路不想点了，直接收窗走人，自习上什么都
 * 没变过，也不会留下半截名单。
 *
 * 名字的灰蓝由走秒那条路定点改（`updateRollCall`），不重画整块：点一下只换那一个
 * 格子的脸，老师刚点着的位置与键盘焦点都留着。
 */

import { h, modalFrame } from '../dom.js';
import { setAbsent } from '../domain.js';
import { commitSession, noteActivity, render, showToast, state } from '../state.js';
import { seatLine, tileTitle } from '../board.js';
import { closeOverlay } from './index.js';

/** 点名层里那些名字的格子：`学生 id → 格子`，与看板上那一套同理，走定点更新。 */
const rollTiles = new Map();

/** 点名层脚上那颗「完成」：人数变了要跟着改字，但不值得为它重画整块。 */
let rollFoot = null;

/**
 * 点名层里那些名字的灰蓝，以及脚上那颗「完成」的人数。
 *
 * 与看板上的格子同理：点一下只换那一个格子的脸，不重画整块 —— 几十号人一次点不完，
 * 每次重画都会把老师刚点着的那个位置重新排一遍，键盘的焦点也会掉出去。
 *
 * 读的是这一趟攒着的那份名单，不是这一场自习的 —— 自习要等按「完成」才动。
 */
export function updateRollCall() {
  const draft = state.rollCallOpen;
  if (state.overlay !== 'rollCall' || draft === null) {
    return;
  }
  const absent = new Set(draft.absentIds);
  for (const [studentId, tile] of rollTiles) {
    tile.classList.toggle('is-absent', absent.has(studentId));
  }
  if (rollFoot !== null) {
    rollFoot.textContent = rollDoneText(absent.size);
  }
}

/**
 * 点名层：一块盖在自习上的窗。
 *
 * 它是**可选的**，不是必经的一步 —— 关掉自习一点不受影响，没点完也一样。窗里的格子
 * 按名册顺序摆：老师是照着名单点人，格子一挪就会点错。
 *
 * 栏上两个出口，说的是两件事：
 *
 * - **完成**（脚上，带「N 人没来」）：这一趟点出来的没来落到这一场上，收窗回自习。
 * - **✕ / Esc / 点窗外**：这一趟不算数，收窗回自习 —— 自习上什么都没变过。
 *
 * 两条路都得有：只给「完成」的话，点错整趟就得一个个退回去；只给「撤销」的话，
 * 点完想收工就没路。
 */
export function renderRollCall() {
  const klass = state.klass;
  const draft = state.rollCallOpen;
  const body = [];

  body.push(
    h('p', {
      class: 'modal__hint',
      text: '点一下名字就是「他没来」，他当场变蓝；点错了再点一下退回灰色。不点名也能自习，随时关掉；这一层里点的要按「完成」才落到自习上。',
    }),
  );

  const absent = new Set(draft?.absentIds ?? []);
  const list = h('div', { class: 'rollcall__list' });
  // 按名册顺序排：老师是照着名单点人，格子一挪就会点错
  for (const student of klass.students) {
    const isAbsent = absent.has(student.id);
    const tile = h('button', {
      class: `rollcall__tile${isAbsent ? ' is-absent' : ''}`,
      title: tileTitle(student),
      dataset: { rollcallId: student.id },
      onClick: () => toggleRoll(student.id),
    });
    tile.append(h('span', { class: 'rollcall__name', text: student.name }));
    const seat = seatLine(student);
    if (seat !== '') {
      tile.append(h('span', { class: 'rollcall__seat', text: seat }));
    }
    list.append(tile);
    rollTiles.set(student.id, tile);
  }
  if (klass.students.length === 0) {
    list.append(h('p', { class: 'empty__hint', text: '这个班还没有学生。' }));
  }
  body.push(list);

  const foot = [];
  // 反选收拾的是「一整轮点错了」：一班几十号人，偶尔只有少数没来，先把全班都算作
  // 没来再点回那几个更省事。它翻的是整张表，所以压一档、摆在最左，不与「关闭」同重
  foot.push(
    h('button', {
      class: 'btn btn--quiet',
      text: '反选',
      title: '把全班翻过来：没来的都算在座，在座的都算没来',
      disabled: klass.students.length === 0 ? '' : undefined,
      onClick: doInvert,
    }),
  );
  const absentCount = absent.size;
  // 主行动压在最右：点完按它就是收工。字随「这一趟点出几个人」变，由 `updateRollCall`
  // 定点改，不为它重画整块。一层里只留这一条出口 —— 曾经脚上还有一颗「关闭」、
  // 标题栏还有一颗 ✕，三颗说同一件事，老师还得猜哪个算数。
  //
  // 提示语里的人数现读那一份攒着的名单，不用上面那个 `absentCount`：这一层画出来之后
  // 老师又点了几下，闭包里的数早就旧了。
  const done = h('button', {
    class: 'btn btn--primary',
    dataset: { rollDone: '1' },
    text: rollDoneText(absentCount),
    title: '这一趟点出来的没来落到这一场上，收起这层回自习',
    onClick: () => void finishRollCall(),
  });
  rollFoot = done;
  foot.push(done);
  return modalFrame('点名', body, foot, {
    class: 'modal--rollcall',
    closeLabel: '收窗，这一趟不算数',
    closeTitle: '这一趟不算数：收窗回自习，自习上什么都没变',
    onClose: closeOverlay,
  });
}

/** 点名层那颗「完成」上的字。 */
function rollDoneText(absentCount) {
  return absentCount === 0 ? '完成' : `完成（${absentCount} 人没来）`;
}

/**
 * 层里点一个人：这一趟的名单里翻一下他（灰 ↔ 蓝），自习不动。
 *
 * 只换那一个格子，不重画整块 —— 几十号人一次点不完，重画会把老师刚点着的位置重新
 * 排一遍，键盘的焦点也会掉出去。
 */
function toggleRoll(studentId) {
  const draft = state.rollCallOpen;
  if (draft === null) {
    return;
  }
  const absent = new Set(draft.absentIds);
  draft.absentIds = absent.has(studentId)
    ? draft.absentIds.filter((id) => id !== studentId)
    : [...draft.absentIds, studentId];
  updateRollCall();
}

/**
 * 点名层的「反选」：这一趟的名单翻过来 —— 没来的都算在座，在座的都算没来。
 *
 * 翻的是这一层攒着的那份，自习同样不动；翻完按名册顺序定下来，反复翻不会越翻越乱。
 * 与逐个人点一样走定点更新：几十个格子各自换脸，浮层不重画，老师刚点到的位置与焦点
 * 都留着。
 */
function doInvert() {
  const draft = state.rollCallOpen;
  if (draft === null) {
    return;
  }
  const students = state.klass.students;
  const absent = new Set(draft.absentIds);
  const flipped = students.filter((student) => !absent.has(student.id));
  draft.absentIds = flipped.map((student) => student.id);
  updateRollCall();
  showToast(
    flipped.length === students.length
      ? '全班都算作没来了；在座的点一下他，变回灰色'
      : flipped.length === 0
        ? '全班都算作在座了'
        : `翻过来了：${students.length - flipped.length} 人在座，${flipped.length} 人没来`,
  );
}

/**
 * 开这一层。
 *
 * 把这一场现在的名单**抄一份**进来，往后只在层里改 —— 这一趟点的不该中途影响自习，
 * 也不该在刷新后留下半截名单。
 */
export function openRollCall() {
  if (state.session === null) {
    return;
  }
  noteActivity();
  state.rollCallOpen = { absentIds: [...state.session.absentIds] };
  state.overlay = 'rollCall';
  render();
}

/** 「完成」：这一趟点出来的没来一次落到这一场上，收窗回自习。 */
async function finishRollCall() {
  const draft = state.rollCallOpen;
  const session = state.session;
  if (draft === null || session === null) {
    closeOverlay();
    return;
  }
  // 按名册顺序定下来：这一层是照名单点的，导出的点名明细也按名册逐人查在不在里面
  const absent = new Set(draft.absentIds);
  const students = state.klass.students;
  const absentIds = students.filter((student) => absent.has(student.id)).map((student) => student.id);
  // 先落到这一场上、再收窗：反过来会在收窗那一帧画一遍旧名单，看着像闪了一下
  await commitSession(setAbsent(session, absentIds, Date.now()), true);
  closeOverlay();
  showToast(absentIds.length === 0 ? '全班都在座' : `已记下 ${absentIds.length} 人没来`);
}

/** 清掉上一帧点名层的索引（同样是重画之前先清）。 */
export function resetRollCallRefs() {
  rollTiles.clear();
  rollFoot = null;
}
