/**
 * 滚动名单：一列名字向上跑，按下停止后停在结果上。
 *
 * 名字只用来造势，真正抽中谁由引擎决定；停下来以后盖一张结果牌，
 * 所以名单里没有那个人也不会有对不上的画面。
 */

import { el, sampleLabels } from './common.js';

const ROWS = 26;

export function createListStage(host) {
  const root = el('div', 'stage-list');
  const reel = el('div', 'reel');
  const track = el('div', 'reel-track');
  reel.append(track);
  const plate = el('div', 'stage-plate');
  root.append(reel, plate);
  host.replaceChildren(root);

  function begin({ labels = [] } = {}) {
    root.classList.remove('stopped');
    plate.classList.remove('on');
    plate.replaceChildren();
    const names = sampleLabels(labels, ROWS);
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

  function reveal({ winners, prizeName } = {}) {
    root.classList.remove('running');
    root.classList.add('stopped');
    plate.replaceChildren();
    if (prizeName) {
      plate.append(el('div', 'stage-plate-prize', prizeName));
    }
    const names = el('div', 'stage-winners');
    for (const winner of winners ?? []) {
      names.append(el('span', 'stage-winner', winner.name));
    }
    plate.append(names);
    if (winners?.[0]?.dept) {
      plate.append(el('div', 'stage-plate-meta', winners.map((winner) => winner.dept).filter(Boolean).join(' / ')));
    }
    plate.classList.add('on');
  }

  function reset() {
    root.classList.remove('running', 'stopped');
    plate.classList.remove('on');
    plate.replaceChildren();
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
}
