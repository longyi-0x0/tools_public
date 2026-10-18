/**
 * 抽卡：一桌扣着的牌，停下时按结果一张张翻开。
 *
 * 牌是画面，结果以名单为准：中奖人数多于牌数时，多出来的人只出现在揭晓牌上。
 */

import { MODE } from '../engine.js';
import { createCleanup, createPlate, el, mount, sampleLabels } from './common.js';

const CARDS = 12;
const COLUMNS = 6;
const STAGGER = 90;

export default {
  id: 'cards',
  label: '抽卡',
  mode: MODE.PRIZE,
  styles: new URL('./cards.css', import.meta.url).href,
  config: [
    { key: 'count', label: '卡片数', type: 'range', min: 6, max: 24, step: 2, value: CARDS },
    {
      key: 'columns',
      label: '列数',
      type: 'select',
      value: COLUMNS,
      options: [
        { value: 4, label: '4 列' },
        { value: 6, label: '6 列' },
        { value: 8, label: '8 列' },
      ],
    },
    { key: 'stagger', label: '翻牌间隔', type: 'range', min: 0, max: 300, step: 10, value: STAGGER },
    { key: 'batch', label: '每次抽几人', type: 'range', min: 1, max: 10, step: 1, value: 1 },
  ],

  create(host, config = {}) {
    const count = config.count ?? CARDS;
    const columns = config.columns ?? COLUMNS;
    const stagger = config.stagger ?? STAGGER;
    const root = mount(host, 'stage-cards');
    const board = el('div', 'card-board');
    board.style.setProperty('--card-columns', String(columns));
    board.style.setProperty('--card-rows', String(Math.ceil(count / columns)));
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

      for (const name of sampleLabels(labels, count)) {
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
      }, Math.max(30, stagger));
    }

    function reveal({ winners = [], prizeName = '', focus = 'people' } = {}) {
      cleanup.clearAll();
      root.classList.add('stopped');
      cards.forEach((card, index) => {
        const winner = winners[index];
        if (winner === undefined) {
          return;
        }
        card.front.textContent = focus === 'prize' ? prizeName : winner.name;
        cleanup.timeout(() => card.node.classList.add('flipped'), index * stagger);
      });
      plate.show({ winners, prizeName, focus });
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
