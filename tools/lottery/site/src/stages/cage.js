/**
 * 摇奖机：玻璃球笼里装着一池号球，按下出球管滚出一颗。
 *
 * 逻辑：笼里的球就是当前池里的人；从笼子到托盘，球上写的名字始终等于揭晓的
 * 那个人。一次抽几人就连出几颗，托盘里排开。
 *
 * 静止时球按行列铺在笼底（排布是算出来的，不会叠在一起把名字糊掉）；
 * 开抽后换成受力和碰撞，停手后收回原位，再沿出球管出球。
 */

import { MODE } from '../engine.js';
import {
  createAction,
  createCleanup,
  createMetaBar,
  createPicker,
  createReveal,
  el,
  fitCanvasText,
  idleCopy,
  mount,
  shuffle,
} from './common.js';

const TWO_PI = Math.PI * 2;
const BALL_CAP = 40;
const SPEED = 1;

export default {
  id: 'ball',
  label: '摇奖机',
  mode: MODE.PRIZE,
  styles: new URL('./cage.css', import.meta.url).href,
  config: [
    { key: 'speed', label: '滚动速度', type: 'range', min: 0.4, max: 2, step: 0.2, value: SPEED },
    { key: 'batch', label: '每次抽几人', type: 'range', min: 1, max: 6, step: 1, value: 1 },
  ],

  create(host, config = {}, api = {}) {
    const speed = config.speed ?? SPEED;
    const root = mount(host, 'stage-cage');

    const scene = el('div', 'cage-scene');
    const canvas = el('canvas', 'cage-canvas');
    const reveal = createReveal();
    scene.append(canvas, reveal.node);

    const rail = el('aside', 'cage-rail');
    const title = el('div', 'cage-title');
    const picker = createPicker((id) => api.pickPrize?.(id));
    const status = el('div', 'cage-status');
    const action = createAction(() => api.toggle?.());
    rail.append(title, picker.node, status, action.node, createMetaBar(api));

    root.append(scene, rail);

    const context = canvas.getContext('2d');
    const cleanup = createCleanup();

    let width = 0;
    let height = 0;
    let drum = { x: 0, y: 0, r: 0 };
    let tray = { x: 0, y: 0, w: 0, h: 0 };
    let ballRadius = 12;
    let balls = [];
    let names = [];
    let phase = 'idle';
    let spin = 0;
    let idleKey = '';

    /* ---------- 尺寸 ---------- */

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

      const radius = Math.max(46, Math.min(width * 0.31, height * 0.34));
      drum = { x: width * 0.35, y: height * 0.42, r: radius };
      ballRadius = Math.max(5, radius * 0.083);
      tray = {
        w: Math.max(72, width * 0.25),
        h: Math.max(44, height * 0.2),
        x: width - Math.max(72, width * 0.25) - Math.max(10, width * 0.02),
        y: height - Math.max(44, height * 0.2) - Math.max(12, height * 0.05),
      };

      for (const ball of balls) {
        if (ball.state !== 'tray') {
          setBallText(ball, ballRadius);
        }
      }
      packDrum();
      layoutTray();
      draw();
    }

    const observer = cleanup.observe(new ResizeObserver(resize));
    void observer;

    /* ---------- 球 ---------- */

    function setBallText(ball, radius) {
      ball.r = radius;
      const label = String(ball.label ?? '');
      ball.text = label.length > 4 ? `${label.slice(0, 3)}…` : label;
      ball.font = fitCanvasText(context, ball.text, radius * 1.36, radius * 0.82);
    }

    function makeBall(label, x, y, vx, vy) {
      const ball = {
        label,
        x,
        y,
        vx,
        vy,
        r: ballRadius,
        text: '',
        font: 10,
        state: 'in',
        t: 0,
        tx: x,
        ty: y,
      };
      setBallText(ball, ballRadius);
      return ball;
    }

    function fill(labels) {
      const picked = shuffle(labels).slice(0, Math.min(BALL_CAP, labels.length));
      const unit = drum.r / 260;
      balls = picked.map((label) => {
        const angle = Math.random() * TWO_PI;
        const dist = Math.random() * drum.r * 0.7;
        return makeBall(
          label,
          drum.x + Math.cos(angle) * dist,
          drum.y + Math.sin(angle) * dist + drum.r * 0.1,
          (Math.random() - 0.5) * 4 * unit,
          (Math.random() - 0.5) * 4 * unit,
        );
      });
      packDrum();
    }

    /**
     * 静止时的落位：从笼底往上按行铺，每行的宽度由圆的弦长决定。
     * 排布算在前面，名字就不会互相压住。
     */
    function packDrum() {
      const inside = balls.filter((ball) => ball.state === 'in');
      if (inside.length === 0) {
        return;
      }
      const count = inside.length;
      const inner = drum.r - ballRadius * 1.15;
      const stepX = ballRadius * 2.16;
      const stepY = ballRadius * 1.94;
      const slots = [];
      for (let row = 0; row < 40 && slots.length < count; row += 1) {
        const dy = inner - row * stepY;
        const half = Math.sqrt(Math.max(0, inner * inner - dy * dy));
        const capacity = Math.max(1, Math.floor((half * 2) / stepX) + 1);
        for (let index = 0; index < capacity && slots.length < count; index += 1) {
          const offset = (index - (capacity - 1) / 2) * stepX;
          slots.push({ dx: offset, dy });
        }
      }
      // 铺不下就整体压缩行距，宁可挤一点也不要出笼
      inside.forEach((ball, index) => {
        const slot = slots[index] ?? { dx: 0, dy: 0 };
        ball.tx = drum.x + slot.dx;
        ball.ty = drum.y + slot.dy;
      });
    }

    /* ---------- 运动 ---------- */

    function step() {
      const unit = Math.max(0.3, drum.r / 260);

      if (phase === 'spin') {
        for (const ball of balls) {
          if (ball.state !== 'in') {
            continue;
          }
          ball.vy += 0.7 * unit;
          const dx = ball.x - drum.x;
          const dy = ball.y - drum.y;
          ball.vx += -dy * 0.0032 * spin * unit;
          ball.vy += dx * 0.0032 * spin * unit;
          ball.x += ball.vx;
          ball.y += ball.vy;
          ball.vx *= 0.99;
          ball.vy *= 0.99;
          bounce(ball);
        }
        separate();
        return;
      }

      // 静止与收手：往落位收，收干净就停
      for (const ball of balls) {
        if (ball.state !== 'in') {
          continue;
        }
        ball.vx = 0;
        ball.vy = 0;
        ball.x += (ball.tx - ball.x) * (phase === 'settle' ? 0.16 : 0.1);
        ball.y += (ball.ty - ball.y) * (phase === 'settle' ? 0.16 : 0.1);
      }

      for (const ball of balls) {
        if (ball.state === 'eject') {
          stepEject(ball);
        }
      }
    }

    function bounce(ball) {
      const dx = ball.x - drum.x;
      const dy = ball.y - drum.y;
      const dist = Math.hypot(dx, dy);
      const limit = drum.r - ball.r - 2;
      if (dist <= limit) {
        return;
      }
      const nx = dx / (dist || 1);
      const ny = dy / (dist || 1);
      ball.x = drum.x + nx * limit;
      ball.y = drum.y + ny * limit;
      const dot = ball.vx * nx + ball.vy * ny;
      ball.vx -= 1.6 * dot * nx;
      ball.vy -= 1.6 * dot * ny;
    }

    function separate() {
      for (let i = 0; i < balls.length; i += 1) {
        const a = balls[i];
        if (a.state !== 'in') {
          continue;
        }
        for (let j = i + 1; j < balls.length; j += 1) {
          const b = balls[j];
          if (b.state !== 'in') {
            continue;
          }
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const min = a.r + b.r;
          const square = dx * dx + dy * dy;
          if (square <= 0.0001 || square >= min * min) {
            continue;
          }
          const dist = Math.sqrt(square);
          const push = ((min - dist) / dist) * 0.5;
          a.x -= dx * push;
          a.y -= dy * push;
          b.x += dx * push;
          b.y += dy * push;
        }
      }
    }

    /* ---------- 出球 ---------- */

    function mouth() {
      const angle = Math.PI * 0.25;
      return {
        x: drum.x + Math.cos(angle) * drum.r * 0.99,
        y: drum.y + Math.sin(angle) * drum.r * 0.99,
      };
    }

    function layoutTray() {
      const settled = balls.filter((ball) => ball.state === 'tray');
      if (settled.length === 0) {
        return;
      }
      const cols = Math.min(3, settled.length);
      const rows = Math.ceil(settled.length / cols);
      const cellW = tray.w / cols;
      const cellH = tray.h / rows;
      const radius = Math.min(ballRadius * 1.6, cellW * 0.4, cellH * 0.4);
      settled.forEach((ball, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        ball.x = tray.x + cellW * (col + 0.5);
        ball.y = tray.y + cellH * (row + 0.5);
        setBallText(ball, radius);
      });
    }

    function eject(label) {
      const start = mouth();
      const ball = makeBall(label, start.x, start.y, 0, 0);
      ball.state = 'eject';
      ball.t = 0;
      ball.from = start;
      ball.to = { x: tray.x + tray.w * 0.5, y: tray.y + tray.h * 0.55 };
      balls.push(ball);
    }

    function stepEject(ball) {
      ball.t = Math.min(1, ball.t + 0.05);
      const t = ball.t;
      const gate = chuteEnd();
      if (t < 0.55) {
        const k = t / 0.55;
        ball.x = ball.from.x + (gate.x - ball.from.x) * k;
        ball.y = ball.from.y + (gate.y - ball.from.y) * k;
        return;
      }
      const k = (t - 0.55) / 0.45;
      const ease = 1 - (1 - k) ** 2;
      ball.x = gate.x + (ball.to.x - gate.x) * ease;
      ball.y = gate.y + (ball.to.y - gate.y) * ease;
      if (t >= 1) {
        ball.state = 'tray';
        packDrum();
        layoutTray();
      }
    }

    /* ---------- 画 ---------- */

    function draw() {
      if (width === 0) {
        return;
      }
      context.clearRect(0, 0, width, height);
      drawDrumGlow();
      drawDrumBack();
      drawBallsInside();
      drawGlass();
      drawRim();
      drawChute();
      drawTray();
      drawRest();
    }

    function drawDrumGlow() {
      const glow = context.createRadialGradient(
        drum.x,
        drum.y,
        drum.r * 0.5,
        drum.x,
        drum.y,
        drum.r * 1.3,
      );
      glow.addColorStop(0, 'rgba(120, 170, 205, 0.11)');
      glow.addColorStop(1, 'rgba(120, 170, 205, 0)');
      context.fillStyle = glow;
      context.beginPath();
      context.arc(drum.x, drum.y, drum.r * 1.3, 0, TWO_PI);
      context.fill();
    }

    function drawDrumBack() {
      context.beginPath();
      context.arc(drum.x, drum.y, drum.r, 0, TWO_PI);
      context.fillStyle = '#0a1016';
      context.fill();
      context.strokeStyle = 'rgba(150, 190, 215, 0.12)';
      context.lineWidth = 1;
      context.stroke();
    }

    function drawBallsInside() {
      context.save();
      context.beginPath();
      context.arc(drum.x, drum.y, drum.r - 1, 0, TWO_PI);
      context.clip();
      for (const ball of balls) {
        if (ball.state === 'in') {
          drawBall(ball, false);
        }
      }
      context.restore();
    }

    /** 外圈钢箍与铆钉：让玻璃球看起来是台机器，不是一颗气泡 */
    function drawRim() {
      const ring = drum.r + Math.max(4, drum.r * 0.03);
      context.beginPath();
      context.arc(drum.x, drum.y, ring, 0, TWO_PI);
      context.strokeStyle = '#1b2731';
      context.lineWidth = Math.max(6, drum.r * 0.055);
      context.stroke();

      context.beginPath();
      context.arc(drum.x, drum.y, ring, 0, TWO_PI);
      context.strokeStyle = 'rgba(150, 190, 215, 0.18)';
      context.lineWidth = 1;
      context.stroke();

      for (let index = 0; index < 8; index += 1) {
        const angle = (index / 8) * TWO_PI + 0.2;
        context.beginPath();
        context.arc(
          drum.x + Math.cos(angle) * ring,
          drum.y + Math.sin(angle) * ring,
          Math.max(1.6, drum.r * 0.017),
          0,
          TWO_PI,
        );
        context.fillStyle = 'rgba(170, 200, 220, 0.32)';
        context.fill();
      }
    }

    function drawGlass() {
      const glass = context.createRadialGradient(
        drum.x - drum.r * 0.36,
        drum.y - drum.r * 0.44,
        drum.r * 0.08,
        drum.x,
        drum.y,
        drum.r,
      );
      glass.addColorStop(0, 'rgba(214, 234, 245, 0.13)');
      glass.addColorStop(0.6, 'rgba(170, 200, 220, 0.02)');
      glass.addColorStop(1, 'rgba(120, 155, 180, 0.12)');
      context.beginPath();
      context.arc(drum.x, drum.y, drum.r, 0, TWO_PI);
      context.fillStyle = glass;
      context.fill();

      context.beginPath();
      context.arc(drum.x, drum.y, drum.r, 0, TWO_PI);
      context.strokeStyle = 'rgba(196, 216, 230, 0.3)';
      context.lineWidth = 2;
      context.stroke();

      context.beginPath();
      context.ellipse(
        drum.x - drum.r * 0.34,
        drum.y - drum.r * 0.58,
        drum.r * 0.26,
        drum.r * 0.07,
        -0.55,
        0,
        TWO_PI,
      );
      context.fillStyle = 'rgba(255, 255, 255, 0.1)';
      context.fill();
    }

    /** 出球管的末端：接在托盘左上沿，管子不会悬空 */
    function chuteEnd() {
      return { x: tray.x + tray.w * 0.1, y: tray.y + tray.h * 0.26 };
    }

    function drawChute() {
      const from = mouth();
      const to = chuteEnd();
      context.lineCap = 'round';
      context.strokeStyle = 'rgba(16, 26, 34, 0.96)';
      context.lineWidth = Math.max(8, ballRadius * 2.1);
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();

      context.strokeStyle = 'rgba(178, 204, 222, 0.16)';
      context.lineWidth = Math.max(1, ballRadius * 0.16);
      context.beginPath();
      context.moveTo(from.x, from.y - ballRadius * 0.7);
      context.lineTo(to.x, to.y - ballRadius * 0.7);
      context.stroke();
    }

    function drawTray() {
      const radius = Math.min(tray.h * 0.24, 16);
      context.beginPath();
      context.roundRect(tray.x, tray.y, tray.w, tray.h, radius);
      context.fillStyle = 'rgba(10, 16, 22, 0.96)';
      context.fill();
      context.strokeStyle = 'rgba(150, 190, 215, 0.28)';
      context.lineWidth = 1.5;
      context.stroke();

      context.beginPath();
      context.roundRect(tray.x + 7, tray.y + 7, tray.w - 14, tray.h - 14, radius * 0.6);
      context.strokeStyle = 'rgba(150, 190, 215, 0.1)';
      context.lineWidth = 1;
      context.stroke();
    }

    function drawRest() {
      for (const ball of balls) {
        if (ball.state !== 'in') {
          drawBall(ball, true);
        }
      }
    }

    function drawBall(ball, outside) {
      const gradient = context.createRadialGradient(
        ball.x - ball.r * 0.34,
        ball.y - ball.r * 0.4,
        ball.r * 0.12,
        ball.x,
        ball.y,
        ball.r,
      );
      if (outside) {
        gradient.addColorStop(0, '#ef7c63');
        gradient.addColorStop(1, '#ad3122');
      } else {
        gradient.addColorStop(0, '#fdf8ee');
        gradient.addColorStop(1, '#cbbfa8');
      }
      context.beginPath();
      context.arc(ball.x, ball.y, ball.r, 0, TWO_PI);
      context.fillStyle = gradient;
      context.fill();
      context.strokeStyle = outside ? 'rgba(255, 226, 208, 0.42)' : 'rgba(0, 0, 0, 0.2)';
      context.lineWidth = 1;
      context.stroke();

      if (!ball.text) {
        return;
      }
      context.font = `600 ${ball.font}px "Songti SC", "Noto Serif SC", serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = outside ? '#fff6ee' : '#241c13';
      context.fillText(ball.text, ball.x, ball.y + 0.5);
    }

    /* ---------- 循环 ---------- */

    function loop() {
      step();
      draw();
      cleanup.frame(loop);
    }

    /* ---------- 对外 ---------- */

    function begin({ labels = [] } = {}) {
      cleanup.clearTimers();
      reveal.hide();
      idleKey = '';
      phase = 'spin';
      spin = 1.1 * speed;
      names = labels.filter((label) => String(label).trim() !== '');
      fill(names);
      cleanup.frame(loop);
    }

    function showWinners({ winners = [], prizeName = '', focus = 'people' } = {}) {
      phase = 'settle';
      spin = 0;
      const gap = winners.length > 4 ? 240 : 400;
      winners.forEach((winner, index) => {
        cleanup.timeout(() => eject(winner.name), 300 + index * gap);
      });
      cleanup.timeout(() => {
        phase = 'idle';
        reveal.show({ winners, prizeName, focus });
      }, 300 + winners.length * gap + 700);
    }

    function reset() {
      cleanup.clearTimers();
      reveal.hide();
      idleKey = '';
      phase = 'idle';
      spin = 0;
      fill(names);
      cleanup.frame(loop);
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
        text: next.spinning ? '停' : next.allDrawn ? '看结果' : '开抽',
        note: next.spinning ? '再按一次' : next.allDrawn ? `${next.handed} 人已中奖` : `${next.peopleLeft} 颗球`,
        running: next.spinning,
        disabled: !next.spinning && !next.allDrawn && !next.canDraw,
      });

      if (!next.spinning && !next.revealed && phase !== 'spin') {
        const pool = next.labels.filter((label) => String(label).trim() !== '');
        const key = next.allDrawn ? 'done' : `${pool.length}:${next.prizeName}`;
        if (key !== idleKey) {
          idleKey = key;
          names = pool;
          phase = 'idle';
          fill(names);
        }
        reveal.hide();
      }
    }

    observer.observe(scene);
    resize();
    cleanup.frame(loop);

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
