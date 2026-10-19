/**
 * 翻牌：给聚会、门店活动这类场合用。绿绒桌面、暗红牌背、烫金细线。
 *
 * 一屏就是全部：顶部是场次名与奖项筹码，中间一桌扣着的牌，右下角是一张牌形的
 * 按钮。没有侧栏。
 *
 * 逻辑：牌背不写名字；牌数自动抬到"一次抽几人"以上，翻开几张就代表几个人。
 */

import { MODE } from '../engine.js';
import {
  createAction,
  createCleanup,
  createPicker,
  createReveal,
  el,
  idleCopy,
  mount,
  shuffle,
} from './common.js';

const COUNT = 12;
const COLUMNS = 6;
const STAGGER = 110;
const MAX_CARDS = 24;

export default {
  id: 'cards',
  label: '翻牌',
  mode: MODE.PRIZE,
  styles: new URL('./cards.css', import.meta.url).href,
  config: [
    { key: 'count', label: '牌数', type: 'range', min: 6, max: MAX_CARDS, step: 2, value: COUNT },
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
    { key: 'stagger', label: '翻牌间隔', type: 'range', min: 0, max: 320, step: 10, value: STAGGER },
    { key: 'batch', label: '每次抽几人', type: 'range', min: 1, max: 10, step: 1, value: 1 },
  ],

  create(host, config = {}, api = {}) {
    const count = config.count ?? COUNT;
    const columns = config.columns ?? COLUMNS;
    const stagger = config.stagger ?? STAGGER;
    const root = mount(host, 'stage-cards');

    const head = el('header', 'cards-head');
    const title = el('div', 'cards-title');
    const picker = createPicker((id) => api.pickPrize?.(id));
    head.append(title, picker.node);

    const board = el('div', 'card-board');

    const foot = el('footer', 'cards-foot');
    const status = el('div', 'cards-status');
    const reveal = createReveal();
    const action = createAction(() => api.toggle?.());
    foot.append(status, reveal.node, action.node);

    root.append(head, board, foot);

    const cleanup = createCleanup();
    let cards = [];
    let dealt = 0;

    function addCard() {
      const card = el('div', 'card');
      card.style.setProperty('--i', String(cards.length));
      const inner = el('div', 'card-inner');
      const back = el('div', 'card-face card-back');
      const front = el('div', 'card-face card-front');
      inner.append(back, front);
      card.append(inner);
      board.append(card);
      cards.push({ node: card, front });
    }

    function build(total) {
      if (total === dealt && cards.length === total && total > 0) {
        return;
      }
      dealt = total;
      board.style.setProperty('--cols', String(columns));
      board.style.setProperty('--rows', String(Math.max(1, Math.ceil(total / columns))));
      board.replaceChildren();
      cards = [];
      for (let index = 0; index < total; index += 1) {
        addCard();
      }
    }

    function begin({ batch = 1 } = {}) {
      cleanup.clearTimers();
      reveal.hide();
      status.classList.remove('hide');
      // 牌数不少于这一次可能抽中的人数，否则翻开时会缺牌
      build(Math.min(MAX_CARDS, Math.max(count, batch)));
      board.classList.remove('settled');
      for (const card of cards) {
        card.node.classList.remove('flipped', 'out');
        card.front.textContent = '';
      }
    }

    function showWinners({ winners = [], prizeName = '' } = {}) {
      while (cards.length < winners.length) {
        addCard();
        dealt = cards.length;
      }
      board.style.setProperty('--rows', String(Math.ceil(cards.length / columns)));

      const order = shuffle(cards.map((_, index) => index)).slice(0, winners.length);
      const flipped = new Set();

      order.forEach((at, index) => {
        const card = cards[at];
        const winner = winners[index];
        if (card === undefined || winner === undefined) {
          return;
        }
        flipped.add(at);
        card.front.textContent = winner.name;
        cleanup.timeout(() => card.node.classList.add('flipped'), index * stagger);
      });

      cleanup.timeout(() => {
        cards.forEach((card, index) => {
          if (!flipped.has(index)) {
            card.node.classList.add('out');
          }
        });
        status.classList.add('hide');
        board.classList.add('settled');
        reveal.show({ winners, prizeName, compact: true });
      }, winners.length * stagger + 520);
    }

    function reset() {
      cleanup.clearTimers();
      reveal.hide();
      status.classList.remove('hide');
      board.classList.remove('settled');
      for (const card of cards) {
        card.node.classList.remove('flipped', 'out');
        card.front.textContent = '';
      }
    }

    function update(next) {
      title.textContent = next.title;

      if (next.mode === MODE.PRIZE) {
        picker.update(
          next.prizes.map((prize) => ({
            id: prize.id,
            label: prize.name,
            sub: `${prize.drawn}/${prize.count}`,
            note: prize.remaining > 0 ? `剩 ${prize.remaining}` : '已抽完',
            active: prize.active,
            done: prize.remaining === 0,
          })),
        );
      }

      const copy = idleCopy({
        mode: next.mode,
        allDrawn: next.allDrawn,
        handed: next.handed,
        prizeName: next.prizeName,
        remaining: next.prizeRemaining,
        batch: next.batch,
        personName: next.personName,
        personDept: next.personDept,
        prizeCount: next.prizeCount,
      });
      status.replaceChildren(
        el('span', 'status-eyebrow', copy.eyebrow),
        el('span', 'status-main', copy.main),
        el('span', 'status-note', copy.note),
      );

      action.set({
        text: next.spinning ? '停' : next.allDrawn ? '看结果' : next.batch > 1 ? `翻 ${next.batch} 张` : '翻一张',
        note: next.spinning ? '再按一次' : next.allDrawn ? `${next.handed} 人已中奖` : `${next.peopleLeft} 人在池`,
        running: next.spinning,
        disabled: !next.spinning && !next.allDrawn && !next.canDraw,
      });

      if (!next.spinning && !next.revealed) {
        build(Math.min(MAX_CARDS, Math.max(count, next.batch)));
        board.classList.remove('settled');
        for (const card of cards) {
          card.node.classList.remove('flipped', 'out');
          card.front.textContent = '';
        }
        status.classList.remove('hide');
        reveal.hide();
      }
    }

    return {
      begin,
      reveal: showWinners,
      reset,
      update,
      destroy() {
        cleanup.clearAll();
        host.replaceChildren();
      },
    };
  },
};
