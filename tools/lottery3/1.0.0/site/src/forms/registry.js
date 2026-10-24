/**
 * 形式注册表。
 *
 * 形式只在这里登记：type → { mapPlan, mount }。加一种形式只改这个文件和
 * 新加一个文件，domain 层不动。
 */

import * as wheel from './wheel.js';
import * as grid from './grid.js';
import * as slot from './slot.js';

export const FORMS = { wheel, grid, slot };

/** 把已定的结果算成各形式的停位计划。纯函数，不碰 canvas。 */
export function planOf(round, view) {
  const form = FORMS[round.form];
  if (!form) throw new Error(`未登记的形式：${round.form}`);
  return form.mapPlan(round, view);
}

/** 按计划装盘并跑动画。 */
export function mountForm(root, plan, options = {}) {
  const form = FORMS[plan.type];
  if (!form) throw new Error(`未登记的形式：${plan.type}`);
  return form.mount(root, plan, options);
}
