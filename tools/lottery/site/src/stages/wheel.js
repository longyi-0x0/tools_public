/**
 * 转盘：人抽奖品。扇区上写的是奖项，指针停在哪一格，就抽中哪个奖。
 *
 * 逻辑：扇区角度按「剩余名额 × 权重」分，也就是引擎掷骰子用的那份概率；
 * 指针停的位置由引擎给的结果反推，不会出现指针停在 A 却报 B。
 */

import { MODE } from '../engine.js';
import {
  createAction,
  createCleanup,
  createMetaBar,
  createPicker,
  createReveal,
  el,
  idleCopy,
  mount,
} from './common.js';

const TWO_PI = Math.PI * 2;
const LANDING_MS = 2400;
const TURNS = 4;
/** 窄扇区下限：低于这个角度字排不下，只留一道刻度。 */
const MIN_DEG = 9;

export default {
  id: 'wheel',
  label: '转盘',
  mode: MODE.PERSON,
  styles: new URL('./wheel.css', import.meta.url).href,
  config: [
    { key: 'landingMs', label: '落定时长', type: 'range', min: 1200, max: 4000, step: 200, value: LANDING_MS },
    { key: 'turns', label: '落定圈数', type: 'range', min: 1, max: 7, step: 1, value: TURNS },
  ],

  create(host, config = {}, api = {}) {
    const landingMs = config.landingMs ?? LANDING_MS;
    const turns = config.turns ?? TURNS;
    const root = mount(host, 'stage-wheel');

    const scene = el('div', 'wheel-scene');
    const canvas = el('canvas', 'wheel-canvas');
    const reveal = createReveal();
    scene.append(canvas, reveal.node);

    const rail = el('aside', 'wheel-rail');
    const title = el('div', 'wheel-title');
    const picker = createPicker((id) => api.pickPerson?.(id));
    const status = el('div', 'wheel-status');
    const action = createAction(() => api.toggle?.());
    rail.append(title, picker.node, status, action.node, createMetaBar(api));

    root.append(rail, scene);

    const context = canvas.getContext('2d');
    const cleanup = createCleanup();

    let width = 0;
    let height = 0;
    let radius = 0;
    let center = { x: 0, y: 0 };
    let entries = [];
    let angles = [];
    let rotation = 0;
    let spinRate = 0;
    let mode = 'idle';
    let landed = -1;
    let landingFrame = null;
    let idleKey = '';

    function resize() {
      const rect = scene.getBoundingClientRect();
      width = Math.max(200, rect.width);
      height = Math.max(150, rect.height);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      // 底部留出字幕位，转盘只吃剩下的高度
      const available = Math.max(120, height * 0.8);
      radius = Math.max(58, Math.min(width * 0.42, available * 0.46));
      center = { x: width / 2, y: Math.max(radius + 12, height * 0.4) };
      draw();
    }

    const observer = cleanup.observe(new ResizeObserver(resize));

    /** 按权重分角度，窄扇区抬到下限，多出来的从宽扇区里按比例扣。 */
    function layout(list) {
      const total = list.reduce((sum, entry) => sum + Math.max(0.0001, entry.weight), 0);
      const floor = Math.min(MIN_DEG, 360 / Math.max(1, list.length));
      const scale = (360 - floor * list.length) / (total || 1);
      angles = list.map((entry) => ((floor + Math.max(0.0001, entry.weight) * scale) * Math.PI) / 180);
    }

    function draw() {
      if (width === 0) {
        return;
      }
      context.clearRect(0, 0, width, height);
      const { x: cx, y: cy } = center;

      // 外圈柔光
      const glow = context.createRadialGradient(cx, cy, radius * 0.55, cx, cy, radius * 1.2);
      glow.addColorStop(0, 'rgba(198, 74, 54, 0.10)');
      glow.addColorStop(1, 'rgba(198, 74, 54, 0)');
      context.fillStyle = glow;
      context.beginPath();
      context.arc(cx, cy, radius * 1.2, 0, TWO_PI);
      context.fill();

      // 扇区
      let cursor = -Math.PI / 2 + rotation;
      entries.forEach((entry, index) => {
        const sweep = angles[index] ?? 0;
        context.beginPath();
        context.moveTo(cx, cy);
        context.arc(cx, cy, radius, cursor, cursor + sweep);
        context.closePath();
        if (index === landed) {
          context.fillStyle = '#b5352a';
        } else {
          context.fillStyle = index % 2 === 0 ? '#1c0f11' : '#2a1417';
        }
        context.fill();
        context.strokeStyle = 'rgba(200, 162, 101, 0.22)';
        context.lineWidth = 1;
        context.stroke();
        cursor += sweep;
      });

      // 扇区文字
      cursor = -Math.PI / 2 + rotation;
      entries.forEach((entry, index) => {
        const sweep = angles[index] ?? 0;
        const mid = cursor + sweep / 2;
        cursor += sweep;
        if (sweep < (14 * Math.PI) / 180) {
          return;
        }
        const font = Math.max(9, Math.min(radius * 0.082, 30));
        context.save();
        context.translate(cx, cy);
        context.rotate(mid);
        // 左半圈把字翻过来，始终从里往外读，不会倒着写
        const back = Math.cos(mid) < 0;
        if (back) {
          context.rotate(Math.PI);
        }
        context.textAlign = back ? 'left' : 'right';
        context.textBaseline = 'middle';
        context.font = `${index === landed ? 600 : 400} ${font}px "Songti SC", "Noto Serif SC", serif`;
        context.fillStyle = index === landed ? '#fff4e6' : 'rgba(246, 238, 228, 0.8)';
        const room = radius * 0.68;
        let text = entry.name;
        if (context.measureText(text).width > room) {
          let cut = text.length;
          while (cut > 1 && context.measureText(`${text.slice(0, cut)}…`).width > room) {
            cut -= 1;
          }
          text = `${text.slice(0, cut)}…`;
        }
        const edge = radius - radius * 0.1;
        context.fillText(text, back ? -edge : edge, 0);
        context.restore();
      });

      // 外圈金线与指针
      context.beginPath();
      context.arc(cx, cy, radius, 0, TWO_PI);
      context.strokeStyle = 'rgba(200, 162, 101, 0.62)';
      context.lineWidth = 2;
      context.stroke();

      context.beginPath();
      context.arc(cx, cy, radius * 0.86, 0, TWO_PI);
      context.strokeStyle = 'rgba(200, 162, 101, 0.12)';
      context.lineWidth = 1;
      context.stroke();

      const pointer = Math.max(10, radius * 0.075);
      context.beginPath();
      context.moveTo(cx, cy - radius + pointer * 1.5);
      context.lineTo(cx - pointer * 0.62, cy - radius - pointer * 0.5);
      context.lineTo(cx + pointer * 0.62, cy - radius - pointer * 0.5);
      context.closePath();
      context.fillStyle = '#c8a265';
      context.fill();
      context.strokeStyle = 'rgba(0, 0, 0, 0.45)';
      context.lineWidth = 1;
      context.stroke();

      // 轴心
      context.beginPath();
      context.arc(cx, cy, radius * 0.14, 0, TWO_PI);
      context.fillStyle = '#120a0c';
      context.fill();
      context.strokeStyle = 'rgba(200, 162, 101, 0.55)';
      context.lineWidth = 1.5;
      context.stroke();

      context.beginPath();
      context.arc(cx, cy, radius * 0.035, 0, TWO_PI);
      context.fillStyle = 'rgba(200, 162, 101, 0.8)';
      context.fill();
    }

    function tick() {
      if (mode === 'spin') {
        rotation += spinRate;
        draw();
      }
      cleanup.frame(tick);
    }

    function cancel() {
      if (landingFrame !== null) {
        cleanup.cancelFrame(landingFrame);
        landingFrame = null;
      }
      mode = 'idle';
    }

    function begin({ labels = [], weights = [] } = {}) {
      cancel();
      reveal.hide();
      landed = -1;
      const list = labels.filter((label) => String(label).trim() !== '');
      entries = (list.length > 0 ? list : ['—']).map((name, index) => ({
        name,
        weight: Math.max(1, Number(weights[index] ?? 1)),
      }));
      layout(entries);
      rotation = Math.random() * TWO_PI;
      spinRate = 0.28;
      mode = 'spin';
      draw();
    }

    function showWinners({ winners = [], prizeName = '', focus = 'prize' } = {}) {
      let index = entries.findIndex((entry) => entry.name === prizeName);
      if (index === -1) {
        // 结果里的奖项理论上一定在扇区里；真遇上了就把它补进第一格
        if (entries.length === 0) {
          entries = [{ name: prizeName || '—', weight: 1 }];
          layout(entries);
        } else {
          entries[0] = { ...entries[0], name: prizeName || entries[0].name };
        }
        index = 0;
      }
      landed = index;

      // 扇区中线要对上 12 点的指针
      let before = 0;
      for (let step = 0; step < index; step += 1) {
        before += angles[step] ?? 0;
      }
      const wanted = -(before + (angles[index] ?? 0) / 2);
      const from = rotation;
      const current = ((from % TWO_PI) + TWO_PI) % TWO_PI;
      let delta = ((wanted % TWO_PI) + TWO_PI) % TWO_PI - current;
      if (delta < 0) {
        delta += TWO_PI;
      }
      const to = from + TWO_PI * Math.max(1, turns) + delta;
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
        draw();
        reveal.show({ winners, prizeName, focus });
      };
      landingFrame = cleanup.frame(land);
    }

    function reset() {
      cancel();
      landed = -1;
      reveal.hide();
      idleKey = '';
      draw();
    }

    function update(next) {
      title.textContent = next.title;

      if (next.mode === MODE.PERSON) {
        picker.update(
          next.people.map((person) => ({
            id: person.id,
            label: person.name,
            sub: person.dept,
            note: person.employeeId,
            active: person.picked,
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
        text: next.spinning ? '停' : next.allDrawn ? '看结果' : '转',
        note: next.spinning ? '再按一次' : next.allDrawn ? `${next.handed} 人已中奖` : `${next.prizeCount} 个奖项`,
        running: next.spinning,
        disabled: !next.spinning && !next.allDrawn && !next.canDraw,
      });

      const labels = next.labels.filter((label) => String(label).trim() !== '');
      const weights = Array.isArray(next.weights) ? next.weights : [];
      const key = next.allDrawn ? 'done' : `${labels.join('|')}#${weights.join(',')}`;
      if (!next.spinning && !next.revealed && key !== idleKey) {
        idleKey = key;
        if (!next.allDrawn) {
          // 待机也按真实的权重分扇区，免得开抽前后角度忽然变一遍
          entries = (labels.length > 0 ? labels : ['—']).map((name, index) => ({
            name,
            weight: Math.max(1, Number(weights[index] ?? 1)),
          }));
          layout(entries);
          landed = -1;
          draw();
        }
      }
    }

    observer.observe(scene);
    cleanup.frame(tick);
    resize();

    return {
      begin,
      reveal: showWinners,
      reset,
      update,
      destroy() {
        cancel();
        cleanup.clearAll();
        host.replaceChildren();
      },
    };
  },
};
