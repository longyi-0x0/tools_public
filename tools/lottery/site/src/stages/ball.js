/**
 * 球体：名字铺在一个转动的球面上，停下时把中奖的名字点亮。
 *
 * 球面点用 Fibonacci 分布，近处的画名字，远处的画点 —— 一千多人也不至于
 * 每帧排一千段文字。真正的抽中结果仍由引擎给，球只是把它指出来。
 */

import { MODE } from '../engine.js';
import { createCleanup, createPlate, el, mount } from './common.js';

const TWO_PI = Math.PI * 2;
const MAX_NAMES = 200;
const SPEED = 0.5;
/** 结果牌那一行固定占 96px，球只吃剩下的高度。 */
const PLATE_RESERVE = 96;

function fibonacciSphere(count) {
  const points = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let index = 0; index < count; index += 1) {
    const y = 1 - (index / Math.max(1, count - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = golden * index;
    points.push({ x: Math.cos(angle) * radius, y, z: Math.sin(angle) * radius });
  }
  return points;
}

export default {
  id: 'ball',
  label: '球体',
  mode: MODE.PRIZE,
  styles: new URL('./ball.css', import.meta.url).href,
  config: [
    { key: 'names', label: '名字数量', type: 'range', min: 20, max: 200, step: 20, value: MAX_NAMES },
    { key: 'speed', label: '旋转速度', type: 'range', min: 0.1, max: 1, step: 0.1, value: SPEED },
    { key: 'batch', label: '每次抽几人', type: 'range', min: 1, max: 10, step: 1, value: 1 },
  ],

  create(host, config = {}) {
    const nameBudget = config.names ?? MAX_NAMES;
    const spin = config.speed ?? SPEED;
    const root = mount(host, 'stage-ball');
    const canvas = el('canvas', 'ball-canvas');
    const plate = createPlate();
    root.append(canvas, plate.node);

    const context = canvas.getContext('2d');
    const cleanup = createCleanup();
    let points = [];
    let names = [];
    let highlight = new Set();
    let rotation = 0;
    let speed = 0.0045 * spin;
    let mode = 'idle';
    let size = 0;
    let width = 0;
    let height = 0;

    function resize() {
      const rect = root.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      // 画布高的时候给结果牌留位置；小画布（预览、窄屏）就让它盖上去
      const reserve = rect.height >= 420 ? PLATE_RESERVE : 0;
      const availableHeight = Math.max(120, rect.height - reserve);
      width = rect.width;
      height = availableHeight;
      size = Math.max(120, Math.min(width, availableHeight) * 0.94);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(availableHeight * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${availableHeight}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    const observer = cleanup.observe(new ResizeObserver(resize));

    function draw() {
      if (width === 0) {
        return;
      }
      context.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2 - 4;
      const radius = size / 2;

      const glow = context.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius * 1.5);
      glow.addColorStop(0, 'rgba(226,184,119,.15)');
      glow.addColorStop(1, 'rgba(226,184,119,0)');
      context.fillStyle = glow;
      context.beginPath();
      context.arc(cx, cy, radius * 1.5, 0, TWO_PI);
      context.fill();

      // 经纬线，让一簇名字看得出是个球
      context.strokeStyle = 'rgba(242,238,230,.07)';
      context.lineWidth = 1;
      context.beginPath();
      context.arc(cx, cy, radius, 0, TWO_PI);
      context.stroke();
      for (const ratio of [0.33, 0.66]) {
        context.beginPath();
        context.ellipse(cx, cy, radius, radius * ratio, 0, 0, TWO_PI);
        context.stroke();
      }
      context.beginPath();
      context.ellipse(cx, cy, radius * 0.42, radius, 0, 0, TWO_PI);
      context.stroke();

      const tilt = -0.28;
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const cosTilt = Math.cos(tilt);
      const sinTilt = Math.sin(tilt);

      const projected = points.map((point) => {
        const x = point.x * cos - point.z * sin;
        const z = point.x * sin + point.z * cos;
        const y = point.y * cosTilt - z * sinTilt;
        const zz = point.y * sinTilt + z * cosTilt;
        const depth = (zz + 1) / 2;
        const scale = 0.42 + depth * 0.58;
        return { x: cx + x * radius * scale, y: cy + y * radius * scale, z: zz };
      });

      const order = projected
        .map((point, index) => ({ point, index }))
        .sort((a, b) => a.point.z - b.point.z);

      // 近处的写名字，远处的只留一个点；人数多时把写字的名额让给更靠前的
      const textBudget = Math.max(60, Math.min(190, Math.round(names.length * 0.55)));
      let written = 0;
      const lit = [];
      for (const { point, index } of order) {
        if (highlight.has(index)) {
          lit.push({ point, index });
          continue;
        }
        const name = names[index] ?? '';
        const alpha = Math.max(0.06, Math.min(0.88, (point.z + 1) / 2));
        if (name && point.z > 0.05 && written < textBudget) {
          written += 1;
          context.font = '400 13px "Songti SC", "Noto Serif SC", serif';
          context.fillStyle = `rgba(242,238,230,${alpha})`;
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(name.length > 7 ? `${name.slice(0, 6)}…` : name, point.x, point.y);
        } else {
          context.beginPath();
          context.arc(point.x, point.y, 1.4, 0, TWO_PI);
          context.fillStyle = `rgba(242,238,230,${alpha * 0.5})`;
          context.fill();
        }
      }

      // 中奖的名字最后画，压在上面
      for (const { point, index } of lit) {
        const raw = names[index] ?? '';
        const shown = raw.length > 9 ? `${raw.slice(0, 8)}…` : raw;
        context.font = '600 20px "Songti SC", "Noto Serif SC", serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        const metrics = context.measureText(shown);
        context.fillStyle = 'rgba(226,184,119,.2)';
        context.beginPath();
        context.roundRect(point.x - metrics.width / 2 - 12, point.y - 16, metrics.width + 24, 32, 16);
        context.fill();
        context.fillStyle = '#f6dfb4';
        context.fillText(shown, point.x, point.y);
      }
    }

    function tick() {
      if (mode === 'spinning') {
        rotation += speed;
        draw();
      } else if (mode === 'landing') {
        speed *= 0.94;
        rotation += speed;
        draw();
        if (speed < 0.0004) {
          mode = 'idle';
        }
      }
      cleanup.frame(tick);
    }

    function begin({ labels = [] } = {}) {
      names = labels.slice(0, nameBudget);
      points = fibonacciSphere(names.length);
      highlight = new Set();
      rotation = Math.random() * TWO_PI;
      speed = 0.02 * spin;
      mode = 'spinning';
      plate.hide();
      draw();
    }

    function reveal({ winners = [], prizeName = '', focus = 'people' } = {}) {
      highlight = new Set();
      for (const winner of winners) {
        const index = names.indexOf(focus === 'prize' ? prizeName : winner.name);
        if (index !== -1) {
          highlight.add(index);
        }
      }
      mode = 'landing';
      plate.show({ winners, prizeName, focus });
      draw();
    }

    function reset() {
      names = [];
      points = [];
      highlight = new Set();
      mode = 'idle';
      plate.hide();
      draw();
    }

    observer.observe(root);
    cleanup.frame(tick);
    resize();

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
