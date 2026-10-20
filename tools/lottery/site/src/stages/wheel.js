/**
 * 大转盘：一整圈扇区，指针停在哪格就得哪个奖。
 *
 * 抽法：人抽奖品 —— 盘面是奖项，指针停下的那个奖项就是这一抽的结果。
 * 一次一个人、一个奖，适合摊位、抽奖箱、门店活动。
 *
 * 四套皮：红金（喜庆年会与门店）、墨金（正式场合）、糖果（年轻化）、青瓷（电商）。
 * 皮只换配色与描边，盘面结构一致：外圈 + 金环 + 内圈 + 扇区 + 中心按钮。
 * 外壳配色写在 wheel.css 的 `[data-skin]` 里，与这里的 canvas 配色一一对应。
 */

import { defineLuckyStage } from './lucky.js';

const SKINS = [
  {
    id: 'red-gold',
    label: '红金盘',
    decelerationTime: 2400,
    rim: ['#8e1b16', '#e8b551', '#fff6e2'],
    slots: ['#fff3d8', '#ffe1ab'],
    ink: '#96211a',
    hub: ['#c9231c', '#e8b551', '#fff6e2'],
    hubInk: '#96211a',
    plate: '#fff6e2',
  },
  {
    id: 'ink-gold',
    label: '墨金盘',
    decelerationTime: 2600,
    rim: ['#070b14', '#2b3550', '#141c2c'],
    slots: ['#1b2234', '#232d44'],
    ink: '#f0e4c8',
    hub: ['#0d1320', '#e8b551', '#f7efdc'],
    hubInk: '#14100a',
    plate: '#f0e4c8',
  },
  {
    id: 'candy',
    label: '糖果盘',
    decelerationTime: 2200,
    rim: ['#ff8fb1', '#fff6f9', '#ffe3ec'],
    slots: ['#ffd3e0', '#ffe9b8', '#c9f0d8', '#cfe4ff', '#e4d7ff', '#ffdcc7'],
    ink: '#5b3a46',
    hub: ['#ff6f9c', '#fff6f9', '#fff'],
    hubInk: '#7a2440',
    plate: '#fff6f9',
  },
  {
    id: 'mint',
    label: '青瓷盘',
    decelerationTime: 2200,
    rim: ['#0f5b52', '#d9efe8', '#f4fbf8'],
    slots: ['#eaf7f2', '#cfeae1'],
    ink: '#0f5b52',
    hub: ['#0f5b52', '#9fd8c8', '#f4fbf8'],
    hubInk: '#0f5b52',
    plate: '#f4fbf8',
  },
];

/** 字号跟着盘面走：盘越大字越大，小屏也不至于糊成一团。 */
function typeScale(w, h) {
  const base = Math.min(w, h);
  return {
    prize: Math.round(Math.max(11, Math.min(30, base * 0.052))),
    button: Math.round(Math.max(13, Math.min(34, base * 0.075))),
  };
}

function build({ labels, w, h, skin }) {
  const type = typeScale(w, h);
  const count = Math.max(2, labels.length);

  return {
    blocks: [
      { padding: '13px', background: skin.rim[0] },
      { padding: '9px', background: skin.rim[1] },
      { padding: '5px', background: skin.rim[2] },
    ],
    prizes: labels.map((text, index) => ({
      // 奖项多的时候两个颜色交替会连成一片，三个以上就按序循环
      background: skin.slots[index % skin.slots.length],
      fonts: [
        {
          text,
          // 贴着扇区中线写：太靠外，两行以上的奖项名会溢出外圈
          top: '15%',
          fontSize: `${type.prize}px`,
          fontColor: skin.ink,
          fontWeight: '700',
          lineHeight: `${Math.round(type.prize * 1.2)}px`,
          wordWrap: true,
          lengthLimit: '88%',
          lineClamp: 2,
        },
      ],
    })),
    buttons: [
      { radius: '32%', background: skin.hub[0] },
      { radius: '27%', background: skin.hub[1], pointer: true },
      {
        radius: '23%',
        background: skin.hub[2],
        fonts: [
          {
            text: '抽奖',
            top: '-16%',
            fontSize: `${type.button}px`,
            fontColor: skin.hubInk,
            fontWeight: '700',
          },
        ],
      },
    ],
    defaultStyle: {
      background: skin.plate,
      fontColor: skin.ink,
      fontSize: `${type.prize}px`,
      fontWeight: '700',
    },
    defaultConfig: {
      gutter: count > 10 ? 1 : 3,
      speed: 20,
      accelerationTime: 1800,
      decelerationTime: skin.decelerationTime,
      stopRange: 0.86,
    },
  };
}

export default defineLuckyStage({
  id: 'wheel',
  label: '大转盘',
  kind: 'wheel',
  styles: new URL('./wheel.css', import.meta.url).href,
  skins: SKINS,
  build,
  hint: '扇区等分；真正中奖概率按各奖项剩余名额加权，由抽奖引擎决定。',
});
