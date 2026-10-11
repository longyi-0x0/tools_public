/**
 * 听教室：这一场用麦克风读教室的响度。
 *
 * 这一层只管三件事 —— 开不开、阈值拧到哪儿、现在读出来是多少。读数怎么用（待机页染色、
 * 吵得停不下来提醒）在别处：这一层是老师当场看着数拧那一颗旋钮的地方。
 *
 * 阈值分两处是有意的：**班级设置里那个是这个班的默认**（换台机器、换间教室就该回去改
 * 它），这里拧的是**本场** —— 那会儿老师正听着教室，拧完接着上课，不该为此进设置里翻
 * 一层。所以这里拧过之后底下会写一句「本场临时」，并给一颗「跟班级一样」能拧回去。
 */

import { h, modalFrame } from '../dom.js';
import * as mic from '../mic.js';
import {
  resetVolumeThreshold,
  setVolumeThreshold,
  state,
  toggleListening,
  volumeThresholdInUse,
} from '../state.js';
import { THRESHOLD_MAX, THRESHOLD_MIN, THRESHOLD_STEP } from '../volume.js';
import { closeOverlay } from './index.js';

/** 随读数变的那些节点。整块重画之前由 [`resetListenRefs`] 清掉。 */
let levelNode = null;
let statusNode = null;
let thresholdNode = null;
let noteNode = null;
let resetNode = null;
let rangeNode = null;
let fillNode = null;
let markNode = null;

export function renderListen() {
  const available = mic.availability();
  const on = state.listening;
  const body = [];

  body.push(
    h('p', {
      class: 'modal__hint',
      text: available.ok
        ? '仅读取教室响度，不录音、不保存。'
        : `无法听教室：${available.reason}`,
    }),
  );

  const bar = h('div', { class: 'listen__bar', 'aria-hidden': 'true' });
  fillNode = h('span', { class: 'listen__fill' });
  markNode = h('span', { class: 'listen__mark' });
  bar.append(fillNode, markNode);

  levelNode = h('span', { class: 'listen__level', text: '—' });
  thresholdNode = h('span', { class: 'listen__threshold' });
  statusNode = h('span', { class: 'listen__status' });
  body.push(
    h('div', { class: 'field' }, [
      h('span', { class: 'field__label', text: '当前响度' }),
      bar,
      h('div', { class: 'listen__readout' }, [levelNode, thresholdNode, statusNode]),
    ]),
  );

  rangeNode = h('input', {
    class: 'input input--range',
    type: 'range',
    min: String(THRESHOLD_MIN),
    max: String(THRESHOLD_MAX),
    step: String(THRESHOLD_STEP),
    value: String(volumeThresholdInUse()),
    'aria-label': '响度阈值',
    onInput: () => setVolumeThreshold(Number(rangeNode.value)),
  });
  noteNode = h('span', { class: 'field__note' });
  resetNode = h('button', {
    class: 'btn btn--note',
    text: '用班级默认值',
    onClick: () => resetVolumeThreshold(),
  });
  body.push(
    h('div', { class: 'field' }, [
      h('span', { class: 'field__label', text: '判定为吵的阈值' }),
      rangeNode,
      h('div', { class: 'field__row' }, [noteNode, resetNode]),
    ]),
  );

  body.push(
    h('p', {
      class: 'modal__hint',
      text: '安静时读数略低于阈值、正常说话时接近阈值，即可。',
    }),
  );

  const foot = [];
  // 这一层没有「关闭」那一颗：它只是一扇窗，看一眼、拧一下就完事 —— 收窗由右上角那个 ✕
  // 与 Esc、点窗外管。脚上只留这一层唯一的那一手：开听 / 停听
  foot.push(
    h('button', {
      // 停听永远能按（哪怕是这台机器后来不让听了，或者权限被撤了），不然老师就关不掉了
      class: on ? 'btn btn--danger' : 'btn btn--primary',
      text: on ? '停止听' : '开始听',
      disabled: on || available.ok ? undefined : '',
      onClick: () => void toggleListening(),
    }),
  );
  const frame = modalFrame('听教室', body, foot, { onClose: closeOverlay });
  // 建好先自己画一遍：读数是每一拍才来的，不先画一遍的话，开着听也显示「—」——
  // 得等第一拍（100 毫秒）过去才有数，看着像没开成
  paintListenPanel();
  return frame;
}

/** 清掉上一帧留下的节点索引（整块重画之前）。 */
export function resetListenRefs() {
  levelNode = null;
  statusNode = null;
  thresholdNode = null;
  noteNode = null;
  resetNode = null;
  rangeNode = null;
  fillNode = null;
  markNode = null;
}

/**
 * 读数一到就改这一层里的那几个数。
 *
 * 与看板上那些定点更新同理：这一层**不重画** —— 尺子正被拖着的时候重画，手指底下那根
 * 就跳走了。所以只改读数、色、以及两句提示；尺子的位置只在老师没拖它的时候跟一下。
 */
export function paintListenPanel() {
  if (levelNode === null) {
    return;
  }
  const threshold = volumeThresholdInUse();
  const level = state.listening ? state.volumeLevel : null;
  const over = state.listening && state.volumeOver;

  levelNode.textContent = level === null ? '—' : String(level);
  levelNode.classList.toggle('is-over', over);
  thresholdNode.textContent = `阈值 ${threshold}`;
  statusNode.textContent = state.listening ? (over ? '吵' : '安静') : '没在听';
  statusNode.classList.toggle('is-over', over);

  fillNode.style.width = `${level === null ? 0 : Math.min(100, Math.max(0, level))}%`;
  fillNode.classList.toggle('is-over', over);
  markNode.style.left = `${threshold}%`;

  const fromClass = state.klass?.volumeThreshold ?? threshold;
  if (state.volumeThreshold === null) {
    noteNode.textContent = `班级默认值：${fromClass}`;
  } else {
    noteNode.textContent = `本场使用 ${threshold}（班级默认值 ${fromClass}）`;
  }
  resetNode.disabled = state.volumeThreshold === null;

  // 老师正拖着的时候不能动尺子 —— 一动，手指底下那根就跳走了
  if (document.activeElement !== rangeNode) {
    rangeNode.value = String(threshold);
  }
}
