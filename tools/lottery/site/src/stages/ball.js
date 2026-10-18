/**
 * 球体：名字铺在一个转动的球面上，停下时把中奖的名字点亮。
 *
 * 球面点用 Fibonacci 分布，近处的画名字，远处的画点 —— 一千多人也不至于
 * 每帧排一千段文字。真正的抽中结果仍由引擎给，球只是把它指出来。
 */

import { el } from './common.js';

const TWO_PI = Math.PI * 2;

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

export function createBallStage(host) {
  const root = el('div', 'stage-ball');
  const canvas = el('canvas', 'ball-canvas');
  const plate = el('div', 'stage-plate');
  root.append(canvas, plate);
  host.replaceChildren(root);

  const context = canvas.getContext('2d');
  let points = [];
  let names = [];
  let highlight = new Set();
  let rotation = 0;
  let speed = 0.0045;
  let mode = 'idle';
  let size = 0;
  let frame = 0;
  let width = 0;
  let height = 0;

  /** 结果牌那一行固定占 96px，球只吃剩下的高度。 */
  const PLATE_RESERVE = 96;

  function resize() {
    const rect = root.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const availableHeight = Math.max(140, rect.height - PLATE_RESERVE);
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

  const observer = new ResizeObserver(resize);

  function draw() {
    if (width === 0) {
      return;
    }
    context.clearRect(0, 0, width, height);
    const cx = width / 2;
    const cy = height / 2 - 4;
    const radius = size / 2;

    const glow = context.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius * 1.5);
    glow.addColorStop(0, 'rgba(233,185,110,.15)');
    glow.addColorStop(1, 'rgba(233,185,110,0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(cx, cy, radius * 1.5, 0, TWO_PI);
    context.fill();

    // 球体的经纬线，让一簇名字看得出是个球
    context.strokeStyle = 'rgba(243,239,231,.07)';
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
      const isLit = highlight.has(index);
      if (isLit) {
        lit.push({ point, index });
        continue;
      }
      const name = names[index] ?? '';
      const alpha = Math.max(0.06, Math.min(0.88, (point.z + 1) / 2));
      if (name && point.z > 0.05 && written < textBudget) {
        written += 1;
        context.font = '400 13px "Songti SC", "Noto Serif SC", serif';
        context.fillStyle = `rgba(243,239,231,${alpha})`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        const shown = name.length > 7 ? `${name.slice(0, 6)}…` : name;
        context.fillText(shown, point.x, point.y);
      } else {
        context.beginPath();
        context.arc(point.x, point.y, 1.4, 0, TWO_PI);
        context.fillStyle = `rgba(243,239,231,${alpha * 0.5})`;
        context.fill();
      }
    }

    // 中奖的名字最后画，压在上面
    for (const { point, index } of lit) {
      const shown = (names[index] ?? '').length > 9 ? `${names[index].slice(0, 8)}…` : names[index] ?? '';
      context.font = '600 20px "Songti SC", "Noto Serif SC", serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      const metrics = context.measureText(shown);
      context.fillStyle = 'rgba(233,185,110,.2)';
      context.beginPath();
      context.roundRect(
        point.x - metrics.width / 2 - 12,
        point.y - 16,
        metrics.width + 24,
        32,
        16,
      );
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
    frame = window.requestAnimationFrame(tick);
  }

  function begin({ labels = [] } = {}) {
    names = labels.slice(0, 2400);
    points = fibonacciSphere(names.length);
    highlight = new Set();
    rotation = Math.random() * TWO_PI;
    speed = 0.02;
    mode = 'spinning';
    plate.classList.remove('on');
    plate.replaceChildren();
    draw();
  }

  function reveal({ winners = [], prizeName } = {}) {
    highlight = new Set();
    for (const winner of winners) {
      const index = names.indexOf(winner.name);
      if (index !== -1) {
        highlight.add(index);
      }
    }
    mode = 'landing';
    plate.replaceChildren();
    if (prizeName) {
      plate.append(el('div', 'stage-plate-prize', prizeName));
    }
    const list = el('div', 'stage-winners');
    for (const winner of winners) {
      list.append(el('span', 'stage-winner', winner.name));
    }
    plate.append(list);
    plate.classList.add('on');
    draw();
  }

  function reset() {
    names = [];
    points = [];
    highlight = new Set();
    mode = 'idle';
    plate.classList.remove('on');
    plate.replaceChildren();
    draw();
  }

  observer.observe(root);
  frame = window.requestAnimationFrame(tick);
  resize();

  return {
    begin,
    reveal,
    reset,
    destroy() {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      host.replaceChildren();
    },
  };
}
