/**
 * 抽卡：一桌扣着的牌，停下时按结果一张张翻开。
 *
 * 牌是画面，结果以名单为准：中奖人数多于牌数时，多出来的人只出现在揭晓牌上。
 */

import { createCleanup, createPlate, el, mount, sampleLabels } from './common.js';

const CARDS = 12;
const STAGGER = 90;

export default {
  id: 'cards',
  label: '抽卡',
  hint: '牌一张张翻开',
  styles: new URL('./cards.css', import.meta.url).href,

  create(host) {
    const root = mount(host, 'stage-cards');
    const board = el('div', 'card-board');
    const plate = createPlate();
    root.append(board, plate.node);

    const cleanup = createCleanup();
    let cards = [];

    function begin({ labels = [] } = {}) {
      cleanup.clearAll();
      root.classList.remove('stopped');
      plate.hide();
      board.replaceChildren();
      cards = [];

      for (const name of sampleLabels(labels, CARDS)) {
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

      cleanup.interval(() => {
        const card = cards[Math.floor(Math.random() * cards.length)];
        if (card !== undefined && labels.length > 0) {
          card.back.textContent = labels[Math.floor(Math.random() * labels.length)] ?? '';
        }
      }, STAGGER);
    }

    function reveal({ winners = [], prizeName = '' } = {}) {
      cleanup.clearAll();
      root.classList.add('stopped');
      cards.forEach((card, index) => {
        const winner = winners[index];
        if (winner === undefined) {
          return;
        }
        card.front.textContent = winner.name;
        cleanup.timeout(() => card.node.classList.add('flipped'), index * STAGGER);
      });
      plate.show({ winners, prizeName });
    }

    function reset() {
      cleanup.clearAll();
      root.classList.remove('stopped');
      plate.hide();
      board.replaceChildren();
      cards = [];
    }

    return {
      begin,
      reveal,
      reset,
      destroy() {
        cleanup.clearAll();
        host.replaceChildren();
      },
    };
  },
};
