/**
 * 老虎机：三列滚轮各转各的，停下时三列对齐同一个奖项。
 *
 * 抽法：人抽奖品 —— 轮上写的是奖项，三列同时停在结果上。一次一个人、一个奖。
 *
 * 三列当然可以对不齐（真实老虎机也是），但这里是抽奖不是赌博：结果由引擎先定，
 * 三列只是表演「转到它」，所以永远对齐 —— 观众读到的是一个明确的奖项，
 * 而不是三个符号让人自己去猜中了没有。
 *
 * 三套皮：红包机、霓虹机、盲盒机。外壳配色在 slot.css。
 */

import { defineLuckyStage } from './lucky.js';

const SKINS = [
  {
    id: 'red',
    label: '红包机',
    decelerationTime: 2600,
    cabinet: '#8e1b16',
    reel: '#fff3d8',
    ink: '#96211a',
    highlight: '#ffd35c',
  },
  {
    id: 'neon',
    label: '霓虹机',
    decelerationTime: 2800,
    cabinet: '#10082a',
    reel: '#1d1440',
    ink: '#cfc6ff',
    highlight: '#7cf6ff',
  },
  {
    id: 'candy',
    label: '盲盒机',
    decelerationTime: 2400,
    cabinet: '#ff8a3d',
    reel: '#fff6f9',
    ink: '#6b3410',
    highlight: '#ffd166',
  },
];

const COLS = 3;

/** 每列的奖品顺序错开一位：三列看着是各自在转，不是复制粘贴的三份。 */
function orders(count) {
  return Array.from({ length: COLS }, (_, col) =>
    Array.from({ length: count }, (_, index) => (index + col) % count),
  );
}

function build({ labels, w, h, skin }) {
  const padding = 14;
  const colSpacing = Math.round(Math.min(w, h) * 0.02) + 4;
  const cellWidth = (Math.min(w, h * 1.6) - padding * 2 - colSpacing * (COLS - 1)) / COLS;
  const type = Math.round(Math.max(12, Math.min(32, cellWidth * 0.2)));
  const radius = Math.round(cellWidth * 0.12);
  // 库画字从格子顶部起算（格子高 ≈ 窗口高 - 上下边距），文字写在格子正中
  const textTop = Math.round(h / 2 - padding * 0.6 - type * 0.66);

  return {
    blocks: Array.from({ length: COLS }, (_, col) => ({
      x: col,
      y: 0,
      padding: `${padding * 0.6}px`,
      background: skin.cabinet,
      borderRadius: radius,
    })),
    // 三列滚轮是同色的：交替底色会让人以为哪一格是特殊的，其实没有
    prizes: labels.map((text) => ({
      background: skin.reel,
      borderRadius: radius,
      fonts: [
        {
          text,
          top: `${textTop}px`,
          fontSize: `${type}px`,
          fontColor: skin.ink,
          fontWeight: '700',
          wordWrap: true,
          lengthLimit: '84%',
          lineClamp: 2,
        },
      ],
    })),
    slots: orders(Math.max(1, labels.length)).map((order, col) => ({
      order,
      speed: 30 + col * 4,
      direction: col === 1 ? -1 : 1,
    })),
    defaultStyle: {
      background: skin.reel,
      fontColor: skin.ink,
      fontSize: `${type}px`,
      fontWeight: '700',
      borderRadius: radius,
    },
    defaultConfig: {
      mode: 'vertical',
      direction: 1,
      rowSpacing: Math.round(type * 0.5),
      colSpacing,
      speed: 30,
      accelerationTime: 1800,
      decelerationTime: skin.decelerationTime,
    },
  };
}

export default defineLuckyStage({
  id: 'slot',
  label: '老虎机',
  kind: 'slot',
  styles: new URL('./slot.css', import.meta.url).href,
  skins: SKINS,
  build,
  hint: '点下方按钮开抽、再点停下。三列停下时对齐同一个奖项；中奖概率按剩余名额加权。',
});
