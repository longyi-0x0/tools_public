/**
 * 备注浮层：点一个在座的人，问一句他从哪儿走、多久算超时。
 *
 * 挑一条常用备注就开始计时，还能再补一句话（支持语音输入，那是可选增强）。一条都
 * 不挑也行 —— 那就是默认的黄、不限时，纯粹计个数。
 */

import { h, modalFrame } from '../dom.js';
import * as speech from '../speech.js';
import { confirmLeave, showToast, state } from '../state.js';
import { closeOverlay } from './index.js';

export function renderRemark() {
  const klass = state.klass;
  const student = klass.students.find((item) => item.id === state.remarkStudentId);
  const body = [];
  body.push(
    h('p', {
      class: 'modal__hint',
      text: `给「${student?.name ?? ''}」记一次临时离开。挑一条常用备注，他的格子就按那条的颜色走；那条填了时长的话，过了就转红并出声。不挑也行，就是默认的黄、不限时。`,
    }),
  );

  let templateId;
  const chips = h('div', { class: 'chips' });
  for (const template of klass.remarkTemplates) {
    const chip = h('button', {
      class: `chip chip--pick chip--away-${template.color}`,
      dataset: { templateId: template.id },
      onClick: () => {
        templateId = templateId === template.id ? undefined : template.id;
        for (const node of chips.children) {
          node.classList.toggle('is-on', node.dataset.templateId === templateId);
        }
      },
    });
    chip.append(h('i', { class: 'chip__dot' }));
    chip.append(h('span', { text: template.text }));
    // 时长写在条上：老师挑的时候就得看见「这条几分钟算超时」，不然得回设置里翻
    if (template.timeoutMs > 0) {
      chip.append(h('span', { class: 'chip__minutes', text: `${Math.round(template.timeoutMs / 60000)} 分钟` }));
    }
    chips.append(chip);
  }
  if (klass.remarkTemplates.length === 0) {
    chips.append(h('span', { class: 'modal__hint', text: '还没有常用备注，到「班级设置」里加。' }));
  }
  body.push(h('div', { class: 'field' }, [h('span', { class: 'field__label', text: '常用备注' }), chips]));

  const textarea = h('textarea', {
    class: 'input input--area',
    rows: 2,
    placeholder: '补充一句（可空）',
    // 键盘老师点开备注就是要打字，焦点别落在上面那排常用备注上
    'data-autofocus': '',
  });
  const micNote = h('span', { class: 'field__note' });
  const mic = h('button', {
    class: 'btn btn--mic',
    text: '🎤 语音输入',
    onClick: () => {
      const status = speech.availability();
      if (!status.ok) {
        showToast(`语音输入不可用：${status.reason}`);
        return;
      }
      if (listening !== null) {
        listening();
        listening = null;
        mic.classList.remove('is-on');
        mic.textContent = '🎤 语音输入';
        return;
      }
      mic.classList.add('is-on');
      mic.textContent = '🎤 正在听…（点一下停）';
      listening = speech.listen({
        onResult: (text, isFinal) => {
          textarea.value = text;
          if (isFinal) {
            micNote.textContent = '已识别，可以改';
          }
        },
        onError: (code) => {
          const reason =
            code === 'not-allowed'
              ? '没给麦克风权限'
              : code === 'network'
                ? '连不上识别服务（国内网络常这样）'
                : `识别失败（${code}）`;
          showToast(`语音输入：${reason}`);
          listening = null;
          mic.classList.remove('is-on');
          mic.textContent = '🎤 语音输入';
        },
        onEnd: () => {
          listening = null;
          mic.classList.remove('is-on');
          mic.textContent = '🎤 语音输入';
        },
      });
    },
  });
  body.push(h('div', { class: 'field' }, [
    h('span', { class: 'field__label', text: '补充说明' }),
    textarea,
    h('div', { class: 'field__row' }, [mic, micNote]),
  ]));

  const foot = [];
  foot.push(h('button', { class: 'btn', text: '取消', onClick: closeOverlay }));
  foot.push(
    h('button', {
      class: 'btn btn--primary',
      text: '开始计时',
      onClick: () => void confirmLeave(templateId, textarea.value.trim()),
    }),
  );
  return modalFrame('临时离开', body, foot, { onClose: closeOverlay });
}

let listening = null;
