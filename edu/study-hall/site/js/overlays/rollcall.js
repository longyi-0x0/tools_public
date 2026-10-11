/**
 * 点名层：一块盖在自习看板上的窗。
 *
 * 它是**可选的**，不是必经的一步 —— 关掉自习一点不受影响，没点完也一样。名字的灰蓝
 * 由走秒那条路定点改，不重画整块：点一下只换那一个格子的脸，老师刚点着的位置与键盘
 * 焦点都留着。
 */

import { h, modalFrame } from '../dom.js';
import { STATUS, invertAbsent, markAbsent, markPresent, statusOf } from '../domain.js';
import { commitSession, noteActivity, render, showToast, state } from '../state.js';
import { seatLine, tileTitle } from '../board.js';

/** 点名层里那些名字的格子：`学生 id → 格子`，与看板上那一套同理，走定点更新。 */
const rollTiles = new Map();

/** 点名层脚上那颗「完成」：人数变了要跟着改字，但不值得为它重画整块。 */
let rollFoot = null;

/** 走的计时与「离开中」的亮灭。模式与格子上那一套一致。 */
/**
 * 点名层里那些名字的灰蓝，以及脚上那颗「完成」的人数。
 *
 * 与看板上的格子同理：点一下只换那一个格子的脸，不重画整块 —— 几十号人一次点不完，
 * 每次重画都会把老师刚点着的那个位置重新排一遍，键盘的焦点也会掉出去。
 */
export function updateRollCall(session) {
  if (state.overlay !== 'rollCall' || session === null) {
    return;
  }
  const absent = new Set(session.absentIds);
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
 * 它是**可选的**，不是必经的一步 —— 关掉自习一点不受影响，没点完也一样。点过的人当场
 * 变蓝并沉到看板后面，所以中途随时能收。
 *
 * 栏上有两个出口，说的是两件事：
 *
 * - **✕**（右上）当作**撤销**：名单退回开门那一刻，这一趟点的全不算。课上常常是点着
 *   点着发现点错了人、或者班长说名单不对，整趟作废比逐个撤回快。
 * - **完成**（脚上，带「N 人没来」）：点过的留下，收窗回自习。
 *
 * 两条路都得有：只给「完成」的话，点错整趟就得一个个退回去；只给「撤销」的话，
 * 点完想收工就没路。Esc 与点窗外跟 ✕ 同义（没保存就退出去，退的是这一趟）。
 */
export function renderRollCall() {
  const klass = state.klass;
  const session = state.session;
  const body = [];

  body.push(
    h('p', {
      class: 'modal__hint',
      text: '点一下名字就是「他没来」——他变蓝并沉到后面去；点错了再点一下退回灰色。不点名也能自习，随时关掉。',
    }),
  );

  const absent = new Set(session?.absentIds ?? []);
  const list = h('div', { class: 'rollcall__list' });
  // 按名册顺序排：老师是照着名单点人，格子一挪就会点错
  for (const student of klass.students) {
    const isAbsent = absent.has(student.id);
    const tile = h('button', {
      class: `rollcall__tile${isAbsent ? ' is-absent' : ''}`,
      title: tileTitle(student),
      dataset: { rollcallId: student.id },
      onClick: () => void doMarkPresentOrAbsent(student.id),
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
      onClick: () => void doInvert(),
    }),
  );
  const absentCount = absent.size;
  // 主行动压在最右：点完按它就是收工。字随「记下几个人」变，由 `updateRollCall`
  // 定点改，不为它重画整块。一层里只留这一条出口 —— 曾经脚上还有一颗「关闭」、
  // 标题栏还有一颗 ✕，三颗说同一件事，老师还得猜哪个算数。
  //
  // 提示语里的数现读 `state.session`，不用上面那个 `absentCount`：这一层画出来之后
  // 老师又点了几下，闭包里的数早就旧了。
  const done = h('button', {
    class: 'btn btn--primary',
    dataset: { rollDone: '1' },
    text: rollDoneText(absentCount),
    title: '点过的留下，收起这层回自习',
    onClick: finishRollCall,
  });
  rollFoot = done;
  foot.push(done);
  return modalFrame('点名', body, foot, {
    class: 'modal--rollcall',
    closeLabel: '撤销这一趟点名',
    closeTitle: '撤销这一趟：把刚才点出来的没来退回开门那一刻',
    onClose: () => void cancelRollCall(),
  });
}

/** 点名层那颗「完成」上的字。 */
function rollDoneText(absentCount) {
  return absentCount === 0 ? '完成' : `完成（${absentCount} 人没来）`;
}

/**
 * 点名层的「反选」：全班翻过来 —— 没来的都算在座，在座的都算没来。
 *
 * 与逐个人点一样，这一下也走定点更新：几十个格子各自换脸，浮层不重画，老师刚点到的
 * 位置与焦点都留着。
 */
async function doInvert() {
  const ids = state.klass.students.map((item) => item.id);
  const next = invertAbsent(state.session, ids, state.now);
  await commitSession(next);
  const absent = next.absentIds.length;
  const total = ids.length;
  showToast(
    absent === total
      ? '全班都算作没来了；在座的点一下他，变回灰色'
      : absent === 0
        ? '全班都算作在座了'
        : `翻过来了：${total - absent} 人在座，${absent} 人没来`,
  );
}

/**
 * 点名层里点一个人：蓝的退回灰，灰的记成没来。
 *
 * 只换那一个格子，不重画整块 —— 几十号人一次点不完，重画会把老师刚点着的位置重新
 * 排一遍，键盘的焦点也会掉出去。所以这里不传 `forceRender`，由 `updateDynamic`
 * 里的 `updateRollCall` 定点改。
 */
async function doMarkPresentOrAbsent(studentId) {
  const status = statusOf(state.session, studentId, state.now, state.klass);
  const at = state.now;
  await commitSession(
    status === STATUS.ABSENT
      ? markPresent(state.session, studentId)
      : markAbsent(state.session, studentId, at),
  );
}

/**
 * 点名层的开关。两种收工，各说各的意思：
 *
 * - **完成**（脚上的主钮）：点过的照旧留着，收窗回自习 —— 这一趟点出来的没来就是这一场的账。
 * - **✕ / Esc / 点窗外**：撤销这一趟 —— 回到**开门那一刻**的名单，中间点过的一概不留。
 *
 * 课上常常是点着点着发现点错了人、或者班长说名单不对，整趟作废比逐个撤回快；
 * 当然也可能相反（点了一大半不想走回头路），那就按「完成」。所以出口是两个，不是一个。
 */
export function openRollCall() {
  if (state.session === null) {
    return;
  }
  noteActivity();
  // 记下开门那一刻的名单：✕ 撤销时回到这里。撤销不落盘之外的痕迹 —— 只写一次会话
  state.rollCallOpen = { absentIds: [...state.session.absentIds] };
  state.overlay = 'rollCall';
  render();
}

/** 「完成」：这一趟点出来的没来留下，收窗回自习。 */
function finishRollCall() {
  const count = state.session?.absentIds.length ?? 0;
  closeRollCall();
  showToast(count === 0 ? '全班都在座' : `已记下 ${count} 人没来`);
}

/** ✕：这一趟作废，名单退回开门那一刻，收窗回自习。 */
export async function cancelRollCall() {
  const opened = state.rollCallOpen;
  // 先收窗（层与看板都整块重画，见下），再往回退
  state.rollCallOpen = null;
  state.overlay = null;
  state.remarkStudentId = null;
  if (opened === null || state.session === null) {
    render();
    return;
  }
  await commitSession({ ...state.session, absentIds: [...opened.absentIds] }, true);
  showToast('已撤销这一趟点名');
}

/** 收窗。名单已经改好了（或已撤销），这里只把层拿掉、把格子归位。 */
function closeRollCall() {
  state.rollCallOpen = null;
  state.overlay = null;
  state.remarkStudentId = null;
  // 关掉之后「没来的人」才归位到最后那一块，所以这一下要整块重画
  render();
}

/** 清掉上一帧点名层的索引（同样是重画之前先清）。 */
export function resetRollCallRefs() {
  rollTiles.clear();
  rollFoot = null;
}
