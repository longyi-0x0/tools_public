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
import { cancelRollCall, renderRollCall, resetRollCallRefs } from './rollcall.js';
import { renderSettings } from './settings.js';

export function openOverlay(name) {
  state.overlay = name;
  render();
}

/**
 * 关掉当前浮层。
 *
 * 点名层是唯一的例外：它的 ✕ / Esc / 点窗外都是**撤销这一趟**，交给 `cancelRollCall`
 * 去做（它把名单退回开门那一刻，再收窗）。
 */
export function closeOverlay() {
  if (state.overlay === 'rollCall') {
    void cancelRollCall();
    return;
  }
  state.overlay = null;
  state.remarkStudentId = null;
  state.pendingNewClass = null;
  state.newClassName = null;
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
