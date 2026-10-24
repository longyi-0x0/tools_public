/**
 * 点名层：一块盖在自习看板上的窗。
 *
 * **看这一场点过名没有**：没点过（刚开自习）就全班都记「没到」（灰），老师照着名单往下
 * 点，点到的人才算到了（蓝）；点过了就按这一场现在的名单摆出来，接着点、改点错的都行。
 * 所以这一层是「点到谁谁到」，不是「挑出没来的那几个」。
 *
 * 这一趟点的名字先在层里攒着（`state.rollCallOpen`），**不落到自习那一场上** ——
 * 按「完成」才一次写进去。所以点错了、或者半路不想点了，直接收窗走人，自习上什么都
 * 没变过，也不会留下半截名单。
 *
 * 名字的灰蓝由走秒那条路定点改（`updateRollCall`），不重画整块：点一下只换那一个
 * 格子的脸，老师刚点着的位置与键盘焦点都留着。
 */

import { h, icon, modalFrame } from '../dom.js';
import * as speech from '../speech.js';
import { setAbsent } from '../domain.js';
import { commitSession, noteActivity, render, showToast, state } from '../state.js';
import { seatLine, tileTitle } from '../board.js';
import { closeOverlay } from './index.js';

/**
 * 每一格的壳：`学生 id → 那一格的 div`。
 *
 * 状态（到没到）挂在**壳**上而不是里头的名字钮上 —— 名字钮与角上那颗喇叭都从壳上取色。
 * 与看板上那一套同理，走定点更新：点一下只换一个格子的脸，不重画整块。
 */
const rollCells = new Map();

/** 点名层脚上那颗「完成」：人数变了要跟着改字，但不值得为它重画整块。 */
let rollFoot = null;

/**
 * 自动点名：按固定间隔把名册逐个念下去。
 *
 * 只管「念到谁」，**不动名单** —— 谁到了是老师点了名字才算。所以它只是替老师把名字
 * 一个一个喊出去，页面上那颗喇叭要一下一下点的活儿由它接手。
 *
 * `index` 是**最近念过的那一个**在名册里的位置（还没念过是 -1），`running` 是走没走，
 * `timer` 是下一个名字的定时器（暂停与收窗都要清掉，不然会接着往下念）。
 */
const auto = { running: false, index: -1, ms: 1000, timer: 0 };

/** 间隔的几档，毫秒。默认 1 秒：喊完一个名字就到下一个，不拖堂。 */
const AUTO_STEPS_MS = [1000, 2000, 3000, 5000, 8000];

/** 栏上那几个随状态变的东西（按钮的字、第几个/共几个），画一次之后定点改。 */
let autoNodes = null;

/** 只把「走没走」放下，不重画、也不动指针。 */
function toggleAutoOff() {
  window.clearTimeout(auto.timer);
  auto.timer = 0;
  auto.running = false;
}

/** 停掉自动点名：清定时器、把「走没走」放下，指针留着（再按就从下一个接着走）。 */
function stopAuto() {
  toggleAutoOff();
  paintAuto();
}

/**
 * 念名册里的第 `index` 个。
 *
 * 越界就什么都不做，返回 false —— 到头该停该重来由调用方定。
 */
function announce(index) {
  const students = state.klass?.students ?? [];
  if (index < 0 || index >= students.length) {
    return false;
  }
  auto.index = index;
  sayName(students[index].name);
  paintAuto();
  return true;
}

/**
 * 念到谁，就在那一格上描一圈边。
 *
 * 老师听名字抬头对名单，得一眼看见「现在念的是这一格」—— 光靠那行「3 / 6」得自己数。
 * 只改前后两个格子（不是重画整块）：几十号人，每念一个重画一遍会把焦点与滚位都抖掉。
 */
function paintAutoMark() {
  const students = state.klass?.students ?? [];
  const saying = auto.index >= 0 && auto.index < students.length ? students[auto.index].id : null;
  for (const [studentId, cell] of rollCells) {
    cell.classList.toggle('is-saying', studentId === saying);
  }
}

/** 排下一个。走到最后一名就停下，不绕回去 —— 再绕一圈会把刚点过的名字又喊一遍。 */
function scheduleAuto() {
  window.clearTimeout(auto.timer);
  if (!auto.running) {
    return;
  }
  auto.timer = window.setTimeout(() => {
    if (!announce(auto.index + 1)) {
      stopAuto();
      showToast('名册已念完');
      return;
    }
    scheduleAuto();
  }, auto.ms);
}

/** 开 / 停。开着的时候按就是暂停。 */
function toggleAuto() {
  if (auto.running) {
    stopAuto();
    return;
  }
  if (!(state.klass?.students ?? []).length || !speech.canSpeak()) {
    showToast('本机无法朗读名字');
    return;
  }
  // 接着上一次停下的地方往下走；已经念到最后一位了就从头再来
  if (!announce(auto.index + 1)) {
    announce(0);
  }
  auto.running = true;
  scheduleAuto();
  paintAuto();
}

/**
 * 重新来：指针退回名册头，走没走不动。
 *
 * 与「暂停」是两件事 —— 暂停是停在半路（再按接着往下走），重新来是从第一个名字重开
 * 一遍。上一趟点出来的名单一个字不动，谁到了仍由老师点。
 */
function restartAuto() {
  auto.index = -1;
  window.clearTimeout(auto.timer);
  auto.timer = 0;
  if (auto.running) {
    toggleAutoOff();
    announce(0);
    auto.running = true;
    scheduleAuto();
  }
  paintAuto();
}

/** 上一个 / 下一个：立刻念那一个，并把间隔重新起算（只在走的时候）。 */
function stepAuto(delta) {
  if (!announce(auto.index + delta)) {
    return;
  }
  if (auto.running) {
    scheduleAuto();
  }
}

/** 改间隔：下一位就按新的走。 */
function setAutoMs(ms) {
  auto.ms = ms;
  if (auto.running) {
    scheduleAuto();
  }
}

/**
 * 把自动点名那一栏按当前状态画一遍。
 *
 * 只有这一栏随状态变（按钮的字、第几个/共几个），名字格子的灰蓝由 `updateRollCall` 管 ——
 * 两边各管各的，互不重画。念到哪一格那一圈边也跟着这里走：它同样是「自动点名走到哪儿了」
 * 的一件事（见 [`paintAutoMark`]）。
 */
function paintAuto() {
  if (autoNodes === null) {
    return;
  }
  const students = state.klass?.students ?? [];
  const { toggle, restart, prev, next, position } = autoNodes;
  const canAuto = students.length > 0 && speech.canSpeak();
  toggle.textContent = auto.running ? '暂停念' : '开始念';
  toggle.classList.toggle('is-on', auto.running);
  toggle.disabled = !canAuto;
  // 还没念过、或者名册空：退无可退，「从头念」也没必要
  restart.disabled = auto.index < 0 && !auto.running;
  prev.disabled = auto.index < 0;
  next.disabled = auto.index >= students.length - 1;
  // 还没念过时不说「共 40 人」——那句话只说人数，不说下一步会念谁。
  // 「从头念」把指针退回 -1 时，这一行就是它唯一的反馈（不再弹提示条）
  position.textContent =
    auto.index < 0 ? `下一个：第 1 人` : `${auto.index + 1} / ${students.length}`;
  paintAutoMark();
}

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
  for (const [studentId, cell] of rollCells) {
    cell.classList.toggle('is-absent', absent.has(studentId));
  }
  if (rollFoot !== null) {
    rollFoot.textContent = rollDoneText(absent.size);
  }
}

/**
 * 自动点名那一栏：开/停、上一个、下一个、间隔。
 *
 * 它是**另一套动作**，所以摆在名字列表上方自己一条 —— 老师一眼能分开「这一条在替我叫名字」
 * 与「下面这些格子在记谁到了」。念不出来（浏览器没有合成接口）时整条压暗，说明原因。
 */
function renderAutoBar() {
  const bar = h('div', { class: 'rollcall__auto' });
  // 那颗钮上不带「自动」两个字：就叫「开始 / 暂停」—— 旁边那排「重新来 / 上一个 / 下一个」
  // 已经说清它在干什么了
  const toggle = h('button', {
    class: 'btn btn--auto',
    text: '开始念',
    onClick: toggleAuto,
  });
  const restart = h('button', {
    class: 'btn',
    text: '从头念',
    onClick: restartAuto,
  });
  const prev = h('button', { class: 'btn', title: '上一个', onClick: () => stepAuto(-1) }, [icon('chevron-left'), h('span', { text: '上一个' })]);
  const next = h('button', { class: 'btn', title: '下一个', onClick: () => stepAuto(1) }, [icon('chevron-right'), h('span', { text: '下一个' })]);
  const interval = h('select', {
    class: 'input input--interval',
    'aria-label': '间隔',
    onChange: (event) => setAutoMs(Number(event.target.value)),
  });
  for (const ms of AUTO_STEPS_MS) {
    interval.append(
      h('option', {
        value: String(ms),
        text: `${ms / 1000} 秒`,
        ...(ms === auto.ms ? { selected: true } : {}),
      }),
    );
  }
  const position = h('span', { class: 'rollcall__auto-pos', text: '' });
  bar.append(
    toggle,
    restart,
    prev,
    next,
    h('label', { class: 'rollcall__auto-gap' }, [h('span', { text: '间隔' }), interval]),
    position,
  );
  // 栏上这几样随状态变，画一次之后由 `paintAuto` 定点改（不重画整块）
  autoNodes = { toggle, restart, prev, next, interval, position };
  return bar;
}

/**
 * 点名层：一块盖在自习上的窗。
 *
 * 它是**可选的**，不是必经的一步 —— 关掉自习一点不受影响，没点完也一样。窗里的格子
 * 按名册顺序摆：老师是照着名单点人，格子一挪就会点错。
 *
 * 栏上两个出口，说的是两件事：
 *
 * - **完成**（脚上，带「N 人没来」）：这一趟**没点到**的落到这一场上（记成没来），收窗回自习。
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
      text: state.session?.rollCallAt === null
        ? '点一下名字即记为他已到。本场还没点过名，所以打开时全班都记为没来。'
        : '点一下名字即记为他已到，再点一次退回没来。',
    }),
  );

  // 自动点名那一栏：只把名字逐个念出去，谁到了仍由老师点
  if (speech.canSpeak()) {
    body.push(renderAutoBar());
  }

  const absent = new Set(draft?.absentIds ?? []);
  const list = h('div', { class: 'rollcall__list' });
  // 能念得出声才画那颗喇叭：画一堆按下去没反应的钮不如不画
  const canSay = speech.canSpeak();
  // 按名册顺序排：老师是照着名单点人，格子一挪就会点错
  for (const student of klass.students) {
    const isAbsent = absent.has(student.id);
    const cell = h('div', {
      class: `rollcall__cell${isAbsent ? ' is-absent' : ''}`,
      dataset: { rollcallCell: student.id },
    });
    const tile = h('button', {
      class: 'rollcall__tile',
      title: tileTitle(student),
      dataset: { rollcallId: student.id },
      onClick: () => toggleRoll(student.id),
    });
    tile.append(h('span', { class: 'rollcall__name', text: student.name }));
    const seat = seatLine(student);
    if (seat !== '') {
      tile.append(h('span', { class: 'rollcall__seat', text: seat }));
    }
    cell.append(tile);
    if (canSay) {
      // 不进 Tab 序列：一班几十号人，Tab 上多一倍就走不完这一趟了；鼠标与触摸直接点得到
      cell.append(
        h('button', {
          class: 'rollcall__say',
          tabindex: '-1',
          'aria-label': `念「${student.name}」`,
          title: `念「${student.name}」`,
          onClick: () => sayName(student.name),
        }, [icon('volume')]),
      );
    }
    list.append(cell);
    rollCells.set(student.id, cell);
  }
  if (klass.students.length === 0) {
    list.append(h('p', { class: 'empty__hint', text: '这个班还没有学生，请在「设置」中导入名册。' }));
  }
  body.push(list);

  const foot = [];
  // 「全部算到」/「全部算没到」收拾的是两种常见的整轮情况：班上只有少数没来（先把全班
  // 都标成没来，再点回那几位），或者一整轮点错了（反过来）。
  // 都不叫「反选」—— 老师想的是这两件事，不是「取反」。
  const invertAll = h('button', {
    class: 'btn btn--quiet',
    text: '全部算到',
    disabled: klass.students.length === 0 ? '' : undefined,
    onClick: () => doInvert(true),
  });
  const invertNone = h('button', {
    class: 'btn btn--quiet',
    text: '全部算没到',
    disabled: klass.students.length === 0 ? '' : undefined,
    onClick: () => doInvert(false),
  });
  foot.push(invertAll, invertNone);
  const absentCount = absent.size;
  // 主行动压在最右：点完按它就是收工。字上那个数是「按下去会记成没来的几位」——
  // 打开时就是全班人数（一个都还没点），点一个少一个，由 `updateRollCall` 定点改，
  // 不为它重画整块。
  const done = h('button', {
    class: 'btn btn--primary',
    dataset: { rollDone: '1' },
    text: rollDoneText(absentCount),
    onClick: () => void finishRollCall(),
  });
  rollFoot = done;
  foot.push(done);
  // 那一栏刚建出来，按当前状态写一遍（按钮的字、第几个 / 共几个）
  paintAuto();
  return modalFrame('点名', body, foot, {
    class: 'modal--rollcall',
    closeLabel: '关闭，本次点名不保存',
    onClose: closeOverlay,
  });
}

/** 点名层那颗「完成」上的字。 */
function rollDoneText(absentCount) {
  return absentCount === 0 ? '全班到齐' : `记下 ${absentCount} 人没来`;
}

/**
 * 念一下这个名字。
 *
 * 只出声，不动名单 —— 「他到了」是点名字那一下的事，喇叭是另一件事（叫一声让教室里
 * 听见）。念不出来（这台机器没有中文嗓音之类）就顶一句提示，不默不作声。
 */
function sayName(name) {
  const status = speech.speak(name, () => showToast('本机无法朗读中文名字'));
  if (!status.ok) {
    showToast('本机无法朗读中文名字');
  }
}

/**
 * 层里点一个人：这一趟里翻一下他 —— 灰（还没到）↔ 蓝（到了），自习不动。
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
 * 点名层里那两颗「全部算到 / 全部算没到」：把这一趟的名单整份置成一种。
 *
 * 两种常见的整轮情况：班上只有少数没来（先把全班都标成没来，再点回那几位），
 * 或者一整轮点错了（反过来）。翻的是这一层攒着的那份，自习同样不动；翻完按名册顺序
 * 定下来，反复翻不会越翻越乱。与逐个人点一样走定点更新：几十个格子各自换脸，浮层
 * 不重画，老师刚点到的位置与焦点都留着。
 */
function doInvert(allPresent) {
  const draft = state.rollCallOpen;
  if (draft === null) {
    return;
  }
  const students = state.klass.students;
  draft.absentIds = allPresent ? [] : students.map((student) => student.id);
  updateRollCall();
  showToast(allPresent ? '已全部记为在座' : '已全部记为没来，点名字可记为他已到');
}

/**
 * 开这一层。
 *
 * 名单从哪儿起算看**这一场点过名没有**：
 *
 * - 没点过（刚开自习）：**全班都算「没到」** —— 老师照着名册往下点，点到谁谁到。
 * - 点过了：按**这一场现在的名单**摆出来（到的在那儿，没到的沉在后面），接着点、改点错
 *   的那些都行。
 *
 * 「点过没有」由 `rollCallAt` 说（`setAbsent` 时记一笔）—— 不看名单内容：一班人都到齐
 * 时那份名单正好是空的，拿它当判据会把「点过且全员到齐」读成「还没点」。
 *
 * 这一趟改的是层里那一份，按「完成」才落到这一场上；不想动就收窗走人。
 */
export function openRollCall() {
  if (state.session === null) {
    return;
  }
  noteActivity();
  // 自动点名的指针归零：重开一层是从头点（或从头念），不接着上一趟
  auto.index = -1;
  const students = state.klass.students;
  state.rollCallOpen = {
    absentIds:
      state.session.rollCallAt === null
        ? students.map((student) => student.id)
        : students
            .map((student) => student.id)
            .filter((id) => state.session.absentIds.includes(id)),
  };
  state.overlay = 'rollCall';
  render();
}

/** 「完成」：这一趟没点到的一次落到这一场上（记成没来），收窗回自习。 */
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
  stopAutoRollCall();
  closeOverlay();
  showToast(absentIds.length === 0 ? '已记下：全班到齐' : `已记下 ${absentIds.length} 人没来`);
}

/**
 * 清掉上一帧点名层的索引（同样是重画之前先清）。
 *
 * **不动自动点名的定时器**：整块重画会把节点换掉（提示条、改间隔都会触发），但那一趟
 * 还在走。新节点由 `renderAutoBar` 重建，`paintAuto` 接着往上写 —— 与定时器各活各的。
 * 真的要停只在收窗时（见 [`stopAutoRollCall`]）。
 */
export function resetRollCallRefs() {
  rollCells.clear();
  rollFoot = null;
  autoNodes = null;
}

/**
 * 收窗时停掉自动点名。
 *
 * 不这样收尾的话，那一趟会接着往下念 —— 层都没了，声音还在报名字。
 */
export function stopAutoRollCall() {
  window.clearTimeout(auto.timer);
  auto.timer = 0;
  auto.running = false;
  autoNodes = null;
}
