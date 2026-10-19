/**
 * 签筒：人抽奖品。竹签筒里插着一把签，摇过之后升起一支，签上写着抽中的奖。
 *
 * 逻辑：签数按各奖项的「剩余名额 × 权重」分，名额多的奖项签多；升起来的那支
 * 签上写的就是引擎给的奖项，不是另抽一次。
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

const MAX_STICKS = 16;

export default {
  id: 'sticks',
  label: '签筒',
  mode: MODE.PERSON,
  styles: new URL('./sticks.css', import.meta.url).href,
  config: [
    { key: 'shakeMs', label: '摇筒时长', type: 'range', min: 600, max: 2600, step: 200, value: 1400 },
  ],

  create(host, config = {}, api = {}) {
    const shakeMs = config.shakeMs ?? 1400;
    const root = mount(host, 'stage-sticks');

    const head = el('header', 'sticks-head');
    const title = el('div', 'sticks-title');
    const picker = createPicker((id) => api.pickPerson?.(id));
    head.append(title, picker.node);

    const scene = el('div', 'stick-stage');
    const sticksEl = el('div', 'sticks');
    const tube = el('div', 'tube');
    const rim = el('div', 'tube-rim');
    const reveal = createReveal();
    scene.append(sticksEl, tube, rim);

    const foot = el('footer', 'sticks-foot');
    const status = el('div', 'sticks-status');
    const action = createAction(() => api.toggle?.());
    foot.append(status, reveal.node, action.node, createMetaBar(api));

    root.append(head, scene, foot);

    const cleanup = createCleanup();
    let sticks = [];
    let idleKey = '';

    /** 签数按权重分配：每个奖项至少一支，其余按比例补。 */
    function plan(labels, weights) {
      const list = labels.map((name, index) => ({
        name,
        weight: Math.max(1, Number(weights[index] ?? 1)),
      }));
      if (list.length === 0) {
        return [];
      }
      const total = list.reduce((sum, item) => sum + item.weight, 0);
      const slots = Math.min(MAX_STICKS, Math.max(list.length, 8));
      const planned = [];
      for (const item of list) {
        const share = Math.max(1, Math.round((item.weight / total) * slots));
        for (let copy = 0; copy < share; copy += 1) {
          planned.push(item.name);
        }
      }
      return planned.slice(0, MAX_STICKS);
    }

    function build(names) {
      sticksEl.replaceChildren();
      sticks = [];
      const total = names.length;
      names.forEach((name, index) => {
        const stick = el('div', 'stick');
        const spread = total <= 1 ? 0 : index / (total - 1) - 0.5;
        const jitter = (Math.random() - 0.5) * 1.6;
        stick.style.setProperty('--x', `${(spread * 22).toFixed(2)}cqh`);
        stick.style.setProperty('--tilt', `${(spread * 9 + jitter).toFixed(2)}deg`);
        stick.style.setProperty('--h', `${(92 + Math.random() * 8).toFixed(1)}%`);
        stick.style.setProperty('--z', String(10 + Math.round(Math.abs(spread) * 12)));
        stick.dataset.name = name;
        stick.append(el('span', 'stick-label', name.length > 4 ? `${name.slice(0, 4)}…` : name));
        sticksEl.append(stick);
        sticks.push(stick);
      });
    }

    function begin({ labels = [], weights = [] } = {}) {
      cleanup.clearTimers();
      reveal.hide();
      idleKey = '';
      build(plan(labels, weights));
      root.classList.remove('settled');
      root.classList.add('shaking');
    }

    function showWinners({ winners = [], prizeName = '', focus = 'prize' } = {}) {
      let chosen = sticks.find((stick) => stick.dataset.name === prizeName);
      if (chosen === undefined && sticks.length > 0) {
        chosen = sticks[Math.floor(Math.random() * sticks.length)];
        chosen.dataset.name = prizeName;
        const label = chosen.querySelector('.stick-label');
        if (label !== null) {
          label.textContent = prizeName.length > 4 ? `${prizeName.slice(0, 4)}…` : prizeName;
        }
      }

      // 停手后筒还要摇一会儿，摇够了那支签才升起来
      cleanup.timeout(() => {
        root.classList.remove('shaking');
        root.classList.add('settled');
        if (chosen !== undefined) {
          chosen.classList.add('chosen');
        }
        for (const stick of sticks) {
          if (stick !== chosen) {
            stick.classList.add('faded');
          }
        }
      }, shakeMs);

      cleanup.timeout(() => {
        status.classList.add('hide');
        reveal.show({ winners, prizeName, focus });
      }, shakeMs + 560);
    }

    function reset() {
      cleanup.clearTimers();
      root.classList.remove('shaking', 'settled');
      reveal.hide();
      status.classList.remove('hide');
      idleKey = '';
      for (const stick of sticks) {
        stick.classList.remove('chosen', 'faded');
      }
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
        text: next.spinning ? '停' : next.allDrawn ? '看结果' : '摇一摇',
        note: next.spinning ? '再按一次' : next.allDrawn ? `${next.handed} 人已中奖` : `${next.prizeCount} 个奖项`,
        running: next.spinning,
        disabled: !next.spinning && !next.allDrawn && !next.canDraw,
      });

      const labels = next.labels.filter((label) => String(label).trim() !== '');
      const weights = Array.isArray(next.weights) ? next.weights : [];
      const key = next.allDrawn ? 'done' : `${labels.join('|')}#${weights.join(',')}`;
      if (!next.spinning && !next.revealed) {
        status.classList.remove('hide');
        reveal.hide();
      }
      if (!next.spinning && !next.revealed && key !== idleKey) {
        idleKey = key;
        if (!next.allDrawn) {
          build(plan(labels, weights));
          root.classList.remove('shaking', 'settled');
        }
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
