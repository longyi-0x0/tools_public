/**
 * 观众屏：投给全场看的那一块。
 *
 * 它是纯渲染端——不持有状态、不抽奖、不写账本。控制台推什么它画什么，
 * 指令驱动，两块屏各跑各的动画，不做时钟同步（同步时钟只会让两边互相等）。
 * 屏幕上不出现种子、撤销按钮和任何实现细节：台下的人只需要知道在抽什么、谁中了。
 */

import { mountForm } from './forms/registry.js';

const titleEl = document.getElementById('aud-title');
const subEl = document.getElementById('aud-sub');
const boardsEl = document.getElementById('aud-boards');
const revealEl = document.getElementById('aud-reveal');
const leadEl = document.getElementById('aud-lead');
const namesEl = document.getElementById('aud-names');

let form = null;
/** 待机盘面的指纹：同一份名单重画一次没有意义，只在换了环节或名单才重装。 */
let previewKey = '';

/* 打招呼：控制台可能还没挂上监听，多喊两声。 */
for (const delay of [0, 200, 800, 2000]) {
  setTimeout(() => {
    try {
      window.opener?.postMessage({ source: 'lottery3-audience', type: 'hello' }, '*');
    } catch (error) {
      // 没有 opener 就说明不是从控制台打开的，自己安静待着。
    }
  }, delay);
}

window.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.source !== 'lottery3-console') return;
  handle(data);
});

async function handle(message) {
  if (message.type === 'ready') {
    titleEl.textContent = message.payload.drawName || '等着开始';
    subEl.textContent = remainText(message.payload);
    // clear 为假的 ready 是「刚抽完」那一次：名单还该留在屏上，不能抹掉。
    if (message.payload?.clear !== false) {
      hideReveal();
      showPreview(message.payload?.preview);
    }
    return;
  }

  if (message.type === 'spin') {
    hideReveal();
    boardsEl.replaceChildren();
    form?.dispose();
    previewKey = '';
    const plan = withBlankTitles(message.payload?.plan);
    if (!plan || plan.boards.length === 0) return;
    try {
      form = await mountForm(boardsEl, plan, { size: boardSize() });
      await form.run();
    } catch (error) {
      // 画不出盘面也不能让大屏变白板：控制台那边的结果照常会推过来。
    }
    return;
  }

  if (message.type === 'reveal') {
    form?.dispose();
    form = null;
    boardsEl.replaceChildren();
    previewKey = '';
    showNames(message.payload?.names ?? [], message.payload?.drawName);
    if (message.payload?.drawName) titleEl.textContent = message.payload.drawName;
    subEl.textContent = remainText(message.payload ?? {});
    return;
  }

  if (message.type === 'rest') {
    hideReveal();
    boardsEl.replaceChildren();
    previewKey = '';
    subEl.textContent = remainText(message.payload ?? {});
    return;
  }

  if (message.type === 'close') {
    titleEl.textContent = '本场结束';
    subEl.textContent = '';
    boardsEl.replaceChildren();
    hideReveal();
  }
}

/** 清单名是内部信息，观众不需要看见「全员名单」这种东西。 */
function withBlankTitles(plan) {
  if (!plan) return null;
  return { ...plan, boards: (plan.boards ?? []).map((board) => ({ ...board, title: '' })) };
}

/**
 * 待机盘面：还没开抽时把转盘先摆出来。
 *
 * 空着的一块黑屏对台下毫无信息，摆个盘面至少说明「这轮有这些人、马上要抽了」，
 * 而且第一下转动接着上一帧，不会突然从黑里蹦出来。只画不转——结果不在这里定。
 */
async function showPreview(plan) {
  const key = plan
    ? `${plan.type}:${(plan.boards ?? []).map((board) => `${board.slotKey}/${board.entries.length}`).join('|')}`
    : '';
  if (key === previewKey) return;
  previewKey = key;

  form?.dispose();
  form = null;
  boardsEl.replaceChildren();
  if (!plan) return;

  try {
    form = await mountForm(boardsEl, withBlankTitles(plan), { size: boardSize() });
  } catch (error) {
    // 画不出来就让屏空着，等真正开抽时再画。
  }
}

/** 和 CSS 里 .aud .board 的上限保持一致，免得画得比显示的大、白缩一圈。 */
function boardSize() {
  const width = Math.min(window.innerWidth * 0.64, window.innerHeight * 0.62);
  return Math.round(Math.max(320, Math.min(760, width)));
}

function remainText(payload) {
  const { remain, quota } = payload;
  if (quota === undefined || remain === undefined) return '';
  if (!Number.isFinite(quota)) return '不限量';
  return remain > 0 ? `还剩 ${remain} 个` : '已抽完';
}

/**
 * 亮名字。上面留一行环节名——台下得知道中的是哪个奖，不然只有三个名字飘在黑里。
 */
function showNames(list, leadText = '') {
  revealEl.classList.add('on');
  if (leadEl) leadEl.textContent = leadText ?? '';
  namesEl.replaceChildren();
  if (list.length === 0) {
    namesEl.append(span('这一轮没中'));
    return;
  }
  namesEl.dataset.count = String(Math.min(list.length, 4));
  for (const name of list) namesEl.append(span(name));
}

function span(text) {
  const node = document.createElement('div');
  node.className = 'aud-name';
  node.textContent = text;
  return node;
}

function hideReveal() {
  revealEl.classList.remove('on');
  if (leadEl) leadEl.textContent = '';
  namesEl.replaceChildren();
}
