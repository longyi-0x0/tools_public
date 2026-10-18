/**
 * 转盘：扇区放候选人名，停下时指针落在结果上。
 *
 * 扇区只取二十来个名字当画面。揭晓前把结果换进扇区再减速 —
 * 转盘停在哪一格，那一格写的就是谁。
 */

import { el, sampleLabels } from './common.js';

const SEGMENTS = 18;
const TWO_PI = Math.PI * 2;

export function createWheelStage(host) {
  const root = el('div', 'stage-wheel');
  const canvas = el('canvas', 'wheel-canvas');
  const plate = el('div', 'stage-plate');
  root.append(canvas, plate);
  host.replaceChildren(root);

  const context = canvas.getContext('2d');
  let labels = [];
  let rotation = 0;
  let spinSpeed = 0;
  let mode = 'idle';
  let frame = 0;
  let animation = null;
  let size = 0;

  /** 结果牌那一行固定占 96px，转盘只吃剩下的高度，揭晓时不会跟着缩。 */
  const PLATE_RESERVE = 96;

  function resize() {
    const rect = root.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const availableHeight = Math.max(140, rect.height - PLATE_RESERVE);
    size = Math.max(120, Math.min(rect.width, availableHeight));
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(availableHeight * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${availableHeight}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  const observer = new ResizeObserver(resize);

  function segmentColors(index) {
    return index % 2 === 0 ? '#1b212b' : '#232b37';
  }

  function draw() {
    if (size === 0) {
      return;
    }
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const cx = width / 2;
    const cy = height / 2 - 6;
    const radius = size / 2 - 18;
    context.clearRect(0, 0, width, height);

    // 追光：转盘背后一圈暖光
    const glow = context.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 1.18);
    glow.addColorStop(0, 'rgba(233,185,110,.16)');
    glow.addColorStop(1, 'rgba(233,185,110,0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(cx, cy, radius * 1.18, 0, TWO_PI);
    context.fill();

    const segment = TWO_PI / Math.max(1, labels.length);
    labels.forEach((label, index) => {
      const start = -Math.PI / 2 + rotation + index * segment;
      context.beginPath();
      context.moveTo(cx, cy);
      context.arc(cx, cy, radius, start, start + segment);
      context.closePath();
      context.fillStyle = segmentColors(index);
      context.fill();
      context.strokeStyle = 'rgba(243,239,231,.08)';
      context.lineWidth = 1;
      context.stroke();

      context.save();
      context.translate(cx, cy);
      context.rotate(start + segment / 2);
      context.fillStyle = 'rgba(243,239,231,.82)';
      context.font = `${Math.max(11, Math.min(17, radius / 16))}px "Songti SC", "Noto Serif SC", serif`;
      context.textAlign = 'right';
      context.textBaseline = 'middle';
      const text = label.length > 9 ? `${label.slice(0, 8)}…` : label;
      context.fillText(text, radius - 18, 0);
      context.restore();
    });

    // 外圈与指针
    context.beginPath();
    context.arc(cx, cy, radius, 0, TWO_PI);
    context.strokeStyle = 'rgba(233,185,110,.55)';
    context.lineWidth = 2;
    context.stroke();

    context.beginPath();
    context.moveTo(cx, cy - radius - 8);
    context.lineTo(cx - 9, cy - radius + 12);
    context.lineTo(cx + 9, cy - radius + 12);
    context.closePath();
    context.fillStyle = '#e9b96e';
    context.fill();

    context.beginPath();
    context.arc(cx, cy, Math.max(10, radius * 0.055), 0, TWO_PI);
    context.fillStyle = '#0c0f14';
    context.fill();
    context.strokeStyle = 'rgba(233,185,110,.7)';
    context.stroke();
  }

  function tick() {
    if (mode === 'spinning') {
      rotation += spinSpeed;
      draw();
    }
    frame = window.requestAnimationFrame(tick);
  }

  function begin({ labels: source = [] } = {}) {
    cancel();
    const next = source.length === 0 ? ['—'] : sampleLabels(source, Math.min(SEGMENTS, Math.max(6, source.length)));
    labels = next;
    rotation = Math.random() * TWO_PI;
    spinSpeed = 0.42;
    mode = 'spinning';
    plate.classList.remove('on');
    plate.replaceChildren();
    draw();
  }

  function reveal({ winners = [], prizeName } = {}) {
    mode = 'landing';
    const target = winners[0]?.name;
    let index = target === undefined ? 0 : labels.indexOf(target);
    if (index === -1 && target !== undefined) {
      labels[0] = target;
      index = 0;
    }
    const segment = TWO_PI / Math.max(1, labels.length);
    const wanted = -((index + 0.5) * segment);
    const current = rotation % TWO_PI;
    let delta = (wanted - current) % TWO_PI;
    if (delta < 0) {
      delta += TWO_PI;
    }
    const from = rotation;
    const to = rotation + TWO_PI * 3 + delta;
    const startedAt = performance.now();
    const duration = 2400;

    function land(now) {
      const progress = Math.min(1, (now - startedAt) / duration);
      rotation = from + (to - from) * (1 - (1 - progress) ** 3);
      draw();
      if (progress < 1) {
        animation = window.requestAnimationFrame(land);
        return;
      }
      mode = 'idle';
      showPlate(prizeName, winners);
    }
    animation = window.requestAnimationFrame(land);
  }

  function showPlate(prizeName, winners) {
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

  function cancel() {
    if (animation !== null) {
      window.cancelAnimationFrame(animation);
      animation = null;
    }
    mode = 'idle';
  }

  function reset() {
    cancel();
    labels = [];
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
      cancel();
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      host.replaceChildren();
    },
  };
}
