/**
 * 滚动名单：一列名字向上跑，按下停止后停在结果上。
 *
 * 名字只用来造势，真正抽中谁由引擎决定；停下来以后盖一张结果牌，
 * 所以名单里没有那个人也不会有对不上的画面。
 */

import { MODE } from '../engine.js';
import { createPlate, el, mount, sampleLabels } from './common.js';

const ROWS = 26;
const SPEED = 1;

export default {
  id: 'list',
  label: '滚动名单',
  mode: MODE.PRIZE,
  styles: new URL('./list.css', import.meta.url).href,
  config: [
    { key: 'rows', label: '行数', type: 'range', min: 12, max: 40, step: 2, value: ROWS },
    { key: 'speed', label: '滚动速度', type: 'range', min: 0.5, max: 3, step: 0.5, value: SPEED },
    { key: 'batch', label: '每次抽几人', type: 'range', min: 1, max: 10, step: 1, value: 1 },
  ],

  create(host, config = {}) {
    const rows = config.rows ?? ROWS;
    const speed = config.speed ?? SPEED;
    const root = mount(host, 'stage-list');
    const reel = el('div', 'reel');
    const track = el('div', 'reel-track');
    reel.append(track);
    const plate = createPlate();
    root.append(reel, plate.node);

    function begin({ labels = [] } = {}) {
      root.classList.remove('stopped');
      plate.hide();
      const names = sampleLabels(labels, rows);
      root.style.setProperty('--reel-duration', `${(6.5 / speed).toFixed(2)}s`);
      track.replaceChildren();
      // 两段同样的内容，动画走到 -50% 正好接回开头
      for (let copy = 0; copy < 2; copy += 1) {
        const column = el('div', 'reel-col');
        for (const name of names) {
          column.append(el('div', 'reel-item', name));
        }
        track.append(column);
      }
      // 让浏览器先认出新内容，再加动画类
      void track.offsetHeight;
      root.classList.add('running');
    }

    function reveal({ winners = [], prizeName = '', focus = 'people' } = {}) {
      root.classList.remove('running');
      root.classList.add('stopped');
      const depts = winners.map((winner) => winner.dept).filter(Boolean).join(' / ');
      plate.show({ winners, prizeName, meta: depts, focus });
    }

    function reset() {
      root.classList.remove('running', 'stopped');
      plate.hide();
      track.replaceChildren();
    }

    return {
      begin,
      reveal,
      reset,
      destroy() {
        host.replaceChildren();
      },
    };
  },
};
