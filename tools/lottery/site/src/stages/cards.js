/**
 * 抽卡：一桌扣着的牌，停下时按结果一张张翻开。
 *
 * 牌面数量固定，中奖人数多于牌数时多出来的人在下面单独列 —— 牌是画面，
 * 结果以名单为准。
 */

import { el, sampleLabels } from './common.js';

const CARDS = 12;

export function createCardsStage(host) {
  const root = el('div', 'stage-cards');
  const board = el('div', 'card-board');
  const plate = el('div', 'stage-plate');
  root.append(board, plate);
  host.replaceChildren(root);

  let timer = null;
  let cards = [];

  function begin({ labels = [] } = {}) {
    stopTimer();
    root.classList.remove('stopped');
    plate.classList.remove('on');
    plate.replaceChildren();
    board.replaceChildren();
    cards = [];
    const names = sampleLabels(labels, CARDS);
    for (const name of names) {
      const card = el('div', 'card');
      const inner = el('div', 'card-inner');
      const back = el('div', 'card-face card-back');
      back.append(el('span', 'card-label', name));
      const front = el('div', 'card-face card-front');
      front.append(el('span', 'card-label', ''));
      inner.append(back, front);
      card.append(inner);
      board.append(card);
      cards.push({ node: card, front: front.firstChild, back: back.firstChild });
    }
    timer = window.setInterval(() => {
      const card = cards[Math.floor(Math.random() * cards.length)];
      if (card !== undefined) {
        card.back.textContent = labels[Math.floor(Math.random() * labels.length)] ?? '';
      }
    }, 90);
  }

  function stopTimer() {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  function reveal({ winners = [], prizeName } = {}) {
    stopTimer();
    root.classList.add('stopped');
    cards.forEach((card, index) => {
      const winner = winners[index];
      if (winner === undefined) {
        return;
      }
      card.front.textContent = winner.name;
      window.setTimeout(() => card.node.classList.add('flipped'), index * 90);
    });
    plate.replaceChildren();
    if (prizeName) {
      plate.append(el('div', 'stage-plate-prize', prizeName));
    }
    const names = el('div', 'stage-winners');
    for (const winner of winners) {
      names.append(el('span', 'stage-winner', winner.name));
    }
    plate.append(names);
    plate.classList.add('on');
  }

  function reset() {
    stopTimer();
    root.classList.remove('stopped');
    plate.classList.remove('on');
    plate.replaceChildren();
    board.replaceChildren();
  }

  return {
    begin,
    reveal,
    reset,
    destroy() {
      stopTimer();
      host.replaceChildren();
    },
  };
}
