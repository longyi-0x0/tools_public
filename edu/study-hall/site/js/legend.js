/**
 * 四色图例。
 *
 * 灰 / 蓝 / 黄 / 红是这一屏的语言，但界面上原本一个字都没解释 —— 第一次用的老师
 * 看到一片蓝，得有人告诉他那是在座。这一行就是那本小字典，平时压得很暗。
 *
 * 「离开中」画黄 —— 那是默认色；老师给某条备注挑了别的颜色，格子跟着走，图例不追。
 * 这里说的是颜色的**意思**，不是某一格的颜色。
 */

import { DEFAULT_AWAY_COLOR, STATUS } from './domain.js';
import { h } from './dom.js';

export function renderLegend() {
  const legend = h('div', { class: 'legend' });
  for (const [status, label] of [
    [STATUS.ABSENT, '没来'],
    [STATUS.PRESENT, '在座'],
    [DEFAULT_AWAY_COLOR, '离开中'],
    [STATUS.OVERTIME, '超时'],
  ]) {
    const item = h('span', { class: 'legend__item' });
    item.append(h('i', { class: 'legend__dot', dataset: { status } }));
    item.append(h('span', { text: label }));
    legend.append(item);
  }
  return legend;
}
