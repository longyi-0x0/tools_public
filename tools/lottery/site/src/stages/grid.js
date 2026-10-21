/**
 * 九宫格：一圈格子 + 中间一颗按钮，跑马灯绕着走，最后停在哪格就中哪个奖。
 *
 * 抽法：人抽奖品 —— 格子里写的是奖项。一次一个人、一个奖。
 *
 * 格数跟着奖项数走：3×3 摆 8 个，不够就升到 4×4、5×5，一直到 8×8（28 格）。
 * 多出来的格子留空并置灰，跑马灯不会停在上面 —— 盘面永远是真实奖项，
 * 不会出现「盘上写着谢谢参与、其实另有概率」这种两套说法。
 *
 * 六套皮：金格、粉蓝街机、糖果、霓虹、薄荷、墨金。外壳配色在 grid.css。
 */

import { defineLuckyStage } from './lucky.js';

const SKINS = [
  {
    id: 'gold',
    label: '金格',
    decelerationTime: 2400,
    board: '#8e1b16',
    cells: ['#fff3d8', '#ffe1ab'],
    ink: '#96211a',
    active: '#ffd35c',
    activeInk: '#7a1810',
    button: '#e8b551',
    buttonInk: '#5a140f',
  },
  {
    id: 'arcade',
    label: '粉蓝街机',
    decelerationTime: 2200,
    board: '#fb7299',
    cells: ['#ffffff', '#ffeef4'],
    ink: '#3b3b4f',
    active: '#00aeec',
    activeInk: '#ffffff',
    button: '#00aeec',
    buttonInk: '#ffffff',
  },
  {
    id: 'candy',
    label: '糖果格',
    decelerationTime: 2000,
    board: '#ffd6e6',
    cells: ['#fff6f9', '#ffe9b8', '#c9f0d8', '#cfe4ff', '#e4d7ff', '#ffdcc7'],
    ink: '#5b3a46',
    active: '#ff6f9c',
    activeInk: '#ffffff',
    button: '#ff6f9c',
    buttonInk: '#ffffff',
  },
  {
    id: 'neon',
    label: '霓虹格',
    decelerationTime: 2600,
    board: '#10082a',
    cells: ['#1d1440', '#241a4d'],
    ink: '#cfc6ff',
    active: '#7cf6ff',
    activeInk: '#0b0620',
    button: '#7cf6ff',
    buttonInk: '#0b0620',
  },
  {
    id: 'mint',
    label: '薄荷格',
    decelerationTime: 2000,
    board: '#d9efe8',
    cells: ['#ffffff', '#f4fbf8'],
    ink: '#0f5b52',
    active: '#0f5b52',
    activeInk: '#f4fbf8',
    button: '#0f5b52',
    buttonInk: '#f4fbf8',
  },
  {
    id: 'ink',
    label: '墨金格',
    decelerationTime: 2600,
    board: '#070b14',
    cells: ['#1b2234', '#232d44'],
    ink: '#f0e4c8',
    active: '#e8b551',
    activeInk: '#14100a',
    button: '#e8b551',
    buttonInk: '#14100a',
  },
];

/** 外圈一圈的坐标（顺时针，从左上角起）。n×n 的外圈是 4n-4 格。 */
function ring(n) {
  const cells = [];
  for (let x = 0; x < n; x += 1) {
    cells.push([x, 0]);
  }
  for (let y = 1; y < n; y += 1) {
    cells.push([n - 1, y]);
  }
  for (let x = n - 2; x >= 0; x -= 1) {
    cells.push([x, n - 1]);
  }
  for (let y = n - 2; y >= 1; y -= 1) {
    cells.push([0, y]);
  }
  return cells;
}

const MIN_SIDE = 3;
const MAX_SIDE = 8;

/** 奖项数决定用几乘几：够摆下的最小方阵。 */
function sideFor(count) {
  for (let n = MIN_SIDE; n <= MAX_SIDE; n += 1) {
    if (4 * n - 4 >= count) {
      return n;
    }
  }
  return MAX_SIDE;
}

function build({ labels, w, h, skin }) {
  const side = sideFor(labels.length);
  const cells = ring(side);
  const span = Math.max(1, side - 2);
  const padding = 14;
  const gutter = 8;
  const inner = Math.min(w, h) - padding * 2;
  const cellSize = inner / side - gutter;
  const type = Math.round(Math.max(10, Math.min(30, cellSize * 0.2)));
  const radius = Math.round(cellSize * 0.14);

  return {
    rows: side,
    cols: side,
    blocks: [{ padding: `${padding}px`, background: skin.board, borderRadius: radius }],
    prizes: cells.map(([x, y], index) => {
      const filled = index < labels.length;
      return {
        x,
        y,
        background: skin.cells[index % skin.cells.length],
        borderRadius: radius,
        disabled: !filled,
        fonts: filled
          ? [
              {
                text: labels[index],
                fontSize: `${type}px`,
                fontColor: skin.ink,
                fontWeight: '700',
                wordWrap: true,
                lengthLimit: '86%',
                lineClamp: 2,
              },
            ]
          : [],
      };
    }),
    buttons: [
      {
        x: 1,
        y: 1,
        col: span,
        row: span,
        background: skin.button,
        borderRadius: radius,
        fonts: [
          {
            text: '抽奖',
            fontSize: `${Math.round(type * 1.5)}px`,
            fontColor: skin.buttonInk,
            fontWeight: '700',
          },
        ],
      },
    ],
    defaultStyle: {
      background: skin.cells[0],
      fontColor: skin.ink,
      fontSize: `${type}px`,
      fontWeight: '700',
      borderRadius: radius,
    },
    activeStyle: {
      background: skin.active,
      fontColor: skin.activeInk,
    },
    defaultConfig: {
      gutter,
      speed: 18,
      accelerationTime: 1800,
      decelerationTime: skin.decelerationTime,
    },
  };
}

export default defineLuckyStage({
  id: 'grid',
  label: '九宫格',
  kind: 'grid',
  styles: new URL('./grid.css', import.meta.url).href,
  skins: SKINS,
  build,
  hint: '点中间开抽，转动中点盘面停下。格数跟着奖项数走，最多 28 个奖项；中奖概率按剩余名额加权。',
});
