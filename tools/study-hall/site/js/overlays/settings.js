/**
 * 班级设置：主题、出声与补响、待机那几档、常用备注、名册，最后一行是删班。
 *
 * 备注在这是「一条一行、三个字段」：文本、颜色、分钟数（留空就是不限时）。
 */

import { h, icon, modalFrame } from '../dom.js';
import { AWAY_COLORS, DEFAULT_AWAY_COLOR, THEMES } from '../domain.js';
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
      placeholder: '例如「上厕所」',
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
      'aria-label': '删除这一条',
      onClick: () => row.remove(),
    }, [icon('trash')]),
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

  /* ---------- 班级 ---------- */

  const basic = h('div', { class: 'section' });
  basic.append(h('p', { class: 'section__title', text: '班级' }));

  const nameInput = h('input', { class: 'input', value: klass.name });
  basic.append(h('label', { class: 'field' }, [h('span', { class: 'field__label', text: '班级名称' }), nameInput]));

  const themeSelect = h('select', { class: 'input' });
  for (const theme of THEMES) {
    themeSelect.append(
      h('option', {
        value: theme.value,
        text: theme.label,
        ...(klass.theme === theme.value ? { selected: true } : {}),
      }),
    );
  }
  basic.append(h('label', { class: 'field' }, [h('span', { class: 'field__label', text: '格子大小' }), themeSelect]));
  body.push(basic);

  /* ---------- 提醒与待机 ---------- */

  const alerts = h('div', { class: 'section' });
  alerts.append(h('p', { class: 'section__title', text: '提醒' }));

  const soundToggle = h('input', { type: 'checkbox', ...(klass.alertSound ? { checked: true } : {}) });
  alerts.append(
    h('label', { class: 'field field--row' }, [
      soundToggle,
      h('span', { class: 'field__label', text: '有人超时出声提醒' }),
    ]),
  );

  const repeatInput = h('input', {
    class: 'input',
    type: 'number',
    min: '15',
    max: '600',
    value: String(Math.round(klass.alertRepeatMs / 1000)),
  });
  alerts.append(
    h('label', { class: 'field' }, [
      h('span', { class: 'field__label', text: '多久再提醒一次（秒）' }),
      repeatInput,
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
  alerts.append(
    h('label', { class: 'field' }, [
      h('span', { class: 'field__label', text: '多久不动换成待机屏' }),
      idleSelect,
    ]),
  );

  // 教室响度的默认线。与上面那几项不同的是：这一项**多半要当场调**才准，
  // 所以看板上另有一颗钮能拧（只管这一场）。这里管的是这个班的默认值
  const thresholdInput = h('input', {
    class: 'input',
    type: 'number',
    min: String(THRESHOLD_MIN),
    max: String(THRESHOLD_MAX),
    step: String(THRESHOLD_STEP),
    value: String(klass.volumeThreshold),
  });
  alerts.append(
    h('label', { class: 'field' }, [
      h('span', { class: 'field__label', text: '判定为吵的响度' }),
      thresholdInput,
      h('span', { class: 'field__note', text: `开着「教室响度」当场调整最准。默认 ${THRESHOLD_DEFAULT}。` }),
    ]),
  );
  body.push(alerts);

  /* ---------- 常用备注 ---------- */

  const remarks = h('div', { class: 'section' });
  const remarkHead = h('div', { class: 'field__row' });
  remarkHead.append(h('span', { class: 'field__label', text: '常用备注' }));
  remarkHead.append(
    h('button', {
      class: 'btn btn--note',
      style: 'margin-left:auto',
      onClick: () => {
        templateList.append(templateRow({ text: '', color: DEFAULT_AWAY_COLOR, timeoutMs: 0 }));
      },
    }, [icon('plus'), h('span', { text: '添加' })]),
  );
  remarks.append(remarkHead);
  const templateList = h('div', { class: 'tpls' });
  for (const template of klass.remarkTemplates) {
    templateList.append(templateRow(template));
  }
  remarks.append(templateList);
  body.push(remarks);

  /* ---------- 名册 ---------- */

  const roster = h('div', { class: 'section' });
  roster.append(h('p', { class: 'section__title', text: `名册 · ${klass.students.length} 人` }));

  const rosterInput = h('input', { type: 'file', accept: ROSTER_ACCEPT, class: 'hidden' });
  rosterInput.addEventListener('change', async () => {
    const file = rosterInput.files?.[0];
    if (file === undefined) {
      return;
    }
    try {
      const students = rosterFromSheets(await readSheetFile(file));
      if (students.length === 0) {
        showToast('表中没有「姓名」列');
        return;
      }
      await commitClass({ ...state.klass, students });
    } catch {
      showToast('无法读取该文件，请换一份 .xlsx 或 .xls');
    }
  });
  roster.append(
    h('div', { class: 'field__row' }, [
      h('button', { class: 'btn', onClick: () => rosterInput.click() }, [icon('upload'), h('span', { text: '重新导入' })]),
      h('button', { class: 'btn', onClick: () => void exportClass(klass) }, [icon('download'), h('span', { text: '导出 xlsx' })]),
    ]),
  );
  roster.append(
    h('p', {
      class: 'field__note field__note--roster',
      text: klass.students.length === 0 ? '还没有学生。' : klass.students.map((item) => item.name).join('、'),
    }),
  );
  roster.append(rosterInput);
  body.push(roster);

  /* ---------- 删除 ---------- */

  const danger = h('button', {
    class: 'btn btn--danger',
    text: '删除这个班',
    onClick: async () => {
      if (await removeClass(klass)) {
        state.klass = null;
        state.session = null;
        state.sessions = [];
        state.overlay = null;
      }
    },
  });
  body.push(
    h('div', { class: 'field field--danger' }, [
      h('span', { class: 'field__note', text: '连同全部记录一并删除，无法撤回。' }),
      danger,
    ]),
  );

  const foot = [];
  foot.push(h('button', { class: 'btn', text: '取消', onClick: closeOverlay }));
  foot.push(
    h('button', {
      class: 'btn btn--primary',
      text: '保存设置',
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
      },
    }),
  );
  return modalFrame('班级设置', body, foot, { onClose: closeOverlay });
}
