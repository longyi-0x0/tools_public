/**
 * 转盘：扇区放候选人名，停下时指针落在结果上。
 *
 * 扇区只取二十来个名字当画面。揭晓前把结果换进扇区再减速 ——
 * 转盘停在哪一格，那一格写的就是谁。
 */

import { MODE } from '../engine.js';
import { createCleanup, createPlate, el, mount, sampleLabels } from './common.js';

const SEGMENTS = 18;
const TWO_PI = Math.PI * 2;
/** 结果牌那一行固定占 96px，转盘只吃剩下的高度。 */
const PLATE_RESERVE = 96;
const LANDING_MS = 2400;

export default {
  id: 'wheel',
  label: '转盘',
  mode: MODE.PERSON,
  styles: new URL('./wheel.css', import.meta.url).href,
  config: [
    { key: 'segments', label: '扇区数', type: 'range', min: 8, max: 24, step: 2, value: SEGMENTS },
    { key: 'landingMs', label: '落定时长', type: 'range', min: 1200, max: 4000, step: 200, value: LANDING_MS },
  ],

  create(host, config = {}) {
    const segments = config.segments ?? SEGMENTS;
    const landingMs = config.landingMs ?? LANDING_MS;
    const root = mount(host, 'stage-wheel');
    const canvas = el('canvas', 'wheel-canvas');
    const plate = createPlate();
    root.append(canvas, plate.node);

    const context = canvas.getContext('2d');
    const cleanup = createCleanup();
    let labels = [];
    let rotation = 0;
    let spinSpeed = 0;
    let mode = 'idle';
    let landingFrame = null;
    let size = 0;

    function resize() {
      const rect = root.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      // 画布高的时候给结果牌留位置；小画布（预览、窄屏）就让它盖上去
      const reserve = rect.height >= 420 ? PLATE_RESERVE : 0;
      const availableHeight = Math.max(120, rect.height - reserve);
      size = Math.max(120, Math.min(rect.width, availableHeight));
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(availableHeight * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${availableHeight}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    const observer = cleanup.observe(new ResizeObserver(resize));

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

      const glow = context.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 1.18);
      glow.addColorStop(0, 'rgba(226,184,119,.16)');
      glow.addColorStop(1, 'rgba(226,184,119,0)');
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
        context.fillStyle = index % 2 === 0 ? '#14201a' : '#1a2720';
        context.fill();
        context.strokeStyle = 'rgba(242,238,230,.08)';
        context.lineWidth = 1;
        context.stroke();

        context.save();
        context.translate(cx, cy);
        context.rotate(start + segment / 2);
        context.fillStyle = 'rgba(242,238,230,.82)';
        const fontSize = Math.max(10, Math.min(17, radius / 16));
        context.font = `${fontSize}px "Songti SC", "Noto Serif SC", serif`;
        context.textAlign = 'right';
        context.textBaseline = 'middle';
        // 文字从半径外侧往圆心写，圆心附近要留出空地；小盘时按可用长度截断
        const room = Math.max(3, Math.floor((radius - 26) / fontSize));
        context.fillText(label.length > room ? `${label.slice(0, Math.max(1, room - 1))}…` : label, radius - 18, 0);
        context.restore();
      });

      context.beginPath();
      context.arc(cx, cy, radius, 0, TWO_PI);
      context.strokeStyle = 'rgba(226,184,119,.55)';
      context.lineWidth = 2;
      context.stroke();

      context.beginPath();
      context.moveTo(cx, cy - radius - 8);
      context.lineTo(cx - 9, cy - radius + 12);
      context.lineTo(cx + 9, cy - radius + 12);
      context.closePath();
      context.fillStyle = '#e2b877';
      context.fill();

      context.beginPath();
      context.arc(cx, cy, Math.max(10, radius * 0.055), 0, TWO_PI);
      context.fillStyle = '#0a0f0c';
      context.fill();
      context.strokeStyle = 'rgba(226,184,119,.7)';
      context.stroke();
    }

    function tick() {
      if (mode === 'spinning') {
        rotation += spinSpeed;
        draw();
      }
      cleanup.frame(tick);
    }

    function begin({ labels: source = [] } = {}) {
      cancel();
      labels = source.length === 0
        ? ['—']
        : sampleLabels(source, Math.min(segments, Math.max(6, source.length)));
      rotation = Math.random() * TWO_PI;
      spinSpeed = 0.42;
      mode = 'spinning';
      plate.hide();
      draw();
    }

    function reveal({ winners = [], prizeName = '', focus = 'people' } = {}) {
      mode = 'landing';
      const target = focus === 'prize' ? prizeName : winners[0]?.name;
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

      const land = (now) => {
        const progress = Math.min(1, (now - startedAt) / landingMs);
        rotation = from + (to - from) * (1 - (1 - progress) ** 3);
        draw();
        if (progress < 1) {
          landingFrame = cleanup.frame(land);
          return;
        }
        landingFrame = null;
        mode = 'idle';
        plate.show({ winners, prizeName, focus });
      };
      landingFrame = cleanup.frame(land);
    }

    function cancel() {
      if (landingFrame !== null) {
        cleanup.cancelFrame(landingFrame);
        landingFrame = null;
      }
      mode = 'idle';
    }

    function reset() {
      cancel();
      labels = [];
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
        cancel();
        cleanup.clearAll();
        host.replaceChildren();
      },
    };
  },
};
