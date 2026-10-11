/**
 * 班级设置：主题、出声与补响、待机那几档、常用备注、名册，最后一行是删班。
 *
 * 备注在这是「一条一行、三个字段」：文本、颜色、分钟数（留空就是不限时）。
 */

import { h, modalFrame } from '../dom.js';
import { AWAY_COLORS, DEFAULT_AWAY_COLOR } from '../domain.js';
import { THRESHOLD_DEFAULT, THRESHOLD_MAX, THRESHOLD_MIN, THRESHOLD_STEP, clampThreshold } from '../volume.js';
import { ROSTER_ACCEPT, rosterFromSheets } from '../roster.js';
import { readSheetFile } from '../readSheets.js';
import { removeClass } from '../classes.js';
import { commitClass, exportClass, showToast, state } from '../state.js';
import { closeOverlay } from './index.js';

/**
 * 设置里的一行备注模板：文本 + 颜色 + 时长。
 *
 * 行的当前颜色挂在 `data-tpl-color` 上，保存时从那里读 —— 色块只是把它改掉，
 * 不必再往每个色块上辨认哪个是选中的。
 */
function templateRow(template) {
  const row = h('div', { class: 'tpl', dataset: { tpl: '1', tplColor: template.color } });
  row.append(
    h('input', {
      class: 'input tpl__text',
      placeholder: '写着什么（比如「上厕所」）',
      value: template.text,
      dataset: { tplText: '1' },
    }),
  );
  row.append(colorSwatches(template.color, (color) => {
    row.dataset.tplColor = color;
  }));
  row.append(
    h('label', { class: 'tpl__time' }, [
      h('input', {
        class: 'input tpl__minutes',
        type: 'number',
        min: '0',
        max: '180',
        placeholder: '不限',
        value: template.timeoutMs > 0 ? String(Math.round(template.timeoutMs / 60000)) : '',
        dataset: { tplMinutes: '1' },
      }),
      h('span', { class: 'tpl__unit', text: '分钟' }),
    ]),
  );
  row.append(
    h('button', {
      class: 'btn btn--icon tpl__remove',
      text: '✕',
      'aria-label': '删掉这条',
      title: '删掉这条',
      onClick: () => row.remove(),
    }),
  );
  return row;
}

/** 一排颜色小圆点。选了哪颗由 `is-on` 标出来，颜色名同时写进 title 与 data。 */
function colorSwatches(selected, onPick) {
  const box = h('div', { class: 'swatches' });
  for (const color of AWAY_COLORS) {
    const dot = h('button', {
      type: 'button',
      class: `swatch swatch--${color}${color === selected ? ' is-on' : ''}`,
      dataset: { color },
      title: awayColorLabel(color),
      'aria-label': awayColorLabel(color),
      onClick: () => {
        for (const node of box.children) {
          node.classList.toggle('is-on', node.dataset.color === color);
        }
        onPick(color);
      },
    });
    box.append(dot);
  }
  return box;
}

/** 颜色名写成中文，悬停能认出来。 */
function awayColorLabel(color) {
  return { yellow: '黄', orange: '橙', green: '绿', violet: '紫', pink: '粉', teal: '青' }[color] ?? color;
}

export function renderSettings() {
  const klass = state.klass;
  const body = [];

  const nameInput = h('input', { class: 'input', value: klass.name });
  body.push(h('label', { class: 'field' }, [h('span', { class: 'field__label', text: '班级名称' }), nameInput]));

  const themeSelect = h('select', { class: 'input' });
  for (const [value, label] of [['junior', '童趣（小学）'], ['middle', '标准'], ['senior', '简洁（高中）']]) {
    themeSelect.append(h('option', { value, text: label, ...(klass.theme === value ? { selected: true } : {}) }));
  }
  body.push(h('label', { class: 'field' }, [h('span', { class: 'field__label', text: '主题' }), themeSelect]));

  const soundToggle = h('input', { type: 'checkbox', ...(klass.alertSound ? { checked: true } : {}) });
  body.push(
    h('label', { class: 'field field--row' }, [
      soundToggle,
      h('span', { class: 'field__label', text: '超时出声提醒' }),
    ]),
  );

  const repeatInput = h('input', {
    class: 'input',
    type: 'number',
    min: '15',
    max: '600',
    value: String(Math.round(klass.alertRepeatMs / 1000)),
  });
  body.push(
    h('label', { class: 'field' }, [
      h('span', { class: 'field__label', text: '隔多久再提醒一次（秒）' }),
      repeatInput,
      h('span', { class: 'field__note', text: '还没回来就每隔这么久再响一次。' }),
    ]),
  );

  const idleSelect = h('select', { class: 'input' });
  for (const [value, label] of [
    ['15', '15 秒'],
    ['30', '30 秒'],
    ['60', '1 分钟'],
    ['120', '2 分钟'],
    ['300', '5 分钟'],
    ['0', '不切（一直显示看板）'],
  ]) {
    idleSelect.append(
      h('option', {
        value,
        text: label,
        ...(String(Math.round(klass.idleMaskMs / 1000)) === value ? { selected: true } : {}),
      }),
    );
  }
  body.push(
    h('label', { class: 'field' }, [
      h('span', { class: 'field__label', text: '多久不动就换成大时钟' }),
      idleSelect,
      h('span', {
        class: 'field__note',
        text: '自习中这么久没人碰屏幕，就换成一个大钟加「谁还在外面」。点一下、动一下鼠标、敲一下键都算，都会重新计时。',
      }),
    ]),
  );

  // 「听教室」的默认线。与上面那几项不同的是：这一项**多半要当场调**才准，
  // 所以看板上另有一颗钮能拧（本场有效）。这里管的是这个班的默认值
  const thresholdInput = h('input', {
    class: 'input',
    type: 'number',
    min: String(THRESHOLD_MIN),
    max: String(THRESHOLD_MAX),
    step: String(THRESHOLD_STEP),
    value: String(klass.volumeThreshold),
  });
  body.push(
    h('label', { class: 'field' }, [
      h('span', { class: 'field__label', text: '教室多响算「吵」（听教室）' }),
      thresholdInput,
      h('span', {
        class: 'field__note',
        text:
          `0 到 100 不是分贝，是这台机器读出来的相对刻度（默认 ${THRESHOLD_DEFAULT}）—— 换个麦克风，` +
          '同一个教室就是另一个数。所以这一项多半要开着「听教室」当场调：安静时读数落在线的下面一点、' +
          '正常说话时贴着线，就差不多。自习看板上那颗钮能当场拧（只管那一场，不改这里）。',
      }),
    ]),
  );

  // 每条备注自带颜色与时长。原来这里是「一行一条」的输入框 —— 现在一条有三个字段，
  // 就得一行一行摆：文本、颜色、分钟数，右边一个删。
  const templateList = h('div', { class: 'tpls' });
  for (const template of klass.remarkTemplates) {
    templateList.append(templateRow(template));
  }
  body.push(
    h('div', { class: 'field' }, [
      h('span', { class: 'field__label', text: '常用备注' }),
      h('span', {
        class: 'field__note',
        text: '点一个人记离开时可以挑一条。颜色是他的格子在他离开期间的颜色；填了分钟数就按这条算超时，过了转红并出声，空着就是不限时。',
      }),
      templateList,
      h('button', {
        class: 'btn',
        text: '加一条',
        onClick: () => {
          templateList.append(templateRow({ text: '', color: DEFAULT_AWAY_COLOR, timeoutMs: 0 }));
        },
      }),
    ]),
  );

  const rosterInput = h('input', { type: 'file', accept: ROSTER_ACCEPT, class: 'hidden' });
  rosterInput.addEventListener('change', async () => {
    const file = rosterInput.files?.[0];
    if (file === undefined) {
      return;
    }
    try {
      const students = rosterFromSheets(await readSheetFile(file));
      if (students.length === 0) {
        showToast('这张表里没读到学生');
        return;
      }
      await commitClass({ ...state.klass, students });
      showToast(`名册已换成 ${students.length} 人`);
    } catch (error) {
      showToast(`读表失败：${error.message}`);
    }
  });
  body.push(
    h('div', { class: 'field' }, [
      h('span', { class: 'field__label', text: `名册（现在 ${klass.students.length} 人）` }),
      h('div', { class: 'field__row' }, [
        h('button', { class: 'btn', text: '导回名册（换成表里的）', onClick: () => rosterInput.click() }),
        h('button', { class: 'btn', text: '导出全班 xlsx', onClick: () => void exportClass(klass) }),
      ]),
      // 没有单独的花名册页了，名字就在这里看
      h('p', {
        class: 'field__note field__note--roster',
        text: klass.students.length === 0 ? '还没有学生。' : klass.students.map((item) => item.name).join('、'),
      }),
      rosterInput,
    ]),
  );

  // 删班是「平时的资料动作」，放在设置的最后一行 —— 不跟保存挤在底栏里
  const danger = h('button', {
    class: 'btn btn--danger',
    text: '删除这个班',
    onClick: async () => {
      if (await removeClass(klass)) {
        state.klass = null;
        state.session = null;
        state.sessions = [];
        state.overlay = null;
        showToast(`「${klass.name}」已删除`);
      }
    },
  });
  body.push(
    h('div', { class: 'field field--danger' }, [
      h('span', { class: 'field__label', text: '删除' }),
      h('span', { class: 'field__note', text: '连同这个班的全部记录一起删掉，不能撤回。' }),
      danger,
    ]),
  );

  const foot = [];
  foot.push(h('button', { class: 'btn', text: '取消', onClick: closeOverlay }));
  foot.push(
    h('button', {
      class: 'btn btn--primary',
      text: '保存',
      onClick: async () => {
        const templates = [...templateList.querySelectorAll('[data-tpl]')]
          .map((row) => ({
            text: row.querySelector('[data-tpl-text]').value.trim(),
            color: row.dataset.tplColor,
            timeoutMs: Math.max(0, Number(row.querySelector('[data-tpl-minutes]').value) || 0) * 60000,
          }))
          // 文本空着的那一行不算一条：老师加了一条又没写，不该在挑的时候冒出来
          .filter((item) => item.text !== '')
          .map((item, index) => ({ id: `tpl-${index + 1}`, ...item }));
        state.overlay = null;
        await commitClass({
          ...state.klass,
          name: nameInput.value.trim() === '' ? state.klass.name : nameInput.value.trim(),
          theme: themeSelect.value,
          alertSound: soundToggle.checked,
          alertRepeatMs: Math.max(15, Number(repeatInput.value) || 60) * 1000,
          idleMaskMs: Math.max(0, Number(idleSelect.value) || 0) * 1000,
          volumeThreshold: clampThreshold(thresholdInput.value),
          remarkTemplates: templates,
        });
        showToast('设置已保存');
      },
    }),
  );
  return modalFrame('班级设置', body, foot, { onClose: closeOverlay });
}
