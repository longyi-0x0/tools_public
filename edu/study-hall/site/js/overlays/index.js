/**
 * 浮层的开关与分发。
 *
 * 哪一层开着由 `state.overlay` 说；这里只管开关、画哪一层、以及收窗时把该清的节点
 * 索引清掉。
 */

import { h } from '../dom.js';
import { render, state } from '../state.js';
import { renderConflict } from './conflict.js';
import { renderHistory } from './history.js';
import { renderNewClass } from './newclass.js';
import { renderRemark } from './remark.js';
import { renderRollCall, resetRollCallRefs, stopAutoRollCall } from './rollcall.js';
import { renderSettings } from './settings.js';

export function openOverlay(name) {
  state.overlay = name;
  render();
}

/**
 * 关掉当前浮层。
 *
 * 点名层攒着的那一趟一并清掉：收窗就是「这一趟不算数」，层里从没往会话上写过东西，
 * 所以不必往回退。
 */
export function closeOverlay() {
  state.overlay = null;
  state.remarkStudentIds = [];
  state.pendingNewClass = null;
  state.newClassName = null;
  // 点名层攒着的那一趟：收窗就是不算数，连同它一起清掉（层里没往会话上写过东西）。
  // 自动点名那一趟也要停 —— 层都没了还接着报名字，听着像坏了
  if (state.rollCallOpen !== null) {
    stopAutoRollCall();
  }
  state.rollCallOpen = null;
  render();
}

export function renderOverlay() {
  switch (state.overlay) {
    case 'newClass':
      return renderNewClass();
    case 'remark':
      return renderRemark();
    case 'settings':
      return renderSettings();
    case 'history':
      return renderHistory();
    case 'conflict':
      return renderConflict();
    case 'rollCall':
      return renderRollCall();
    default:
      return h('span');
  }
}

/** 清掉上一帧浮层留下的节点索引。 */
export function resetOverlayRefs() {
  resetRollCallRefs();
}
