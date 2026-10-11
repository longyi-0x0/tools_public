/**
 * 备注浮层：点一个在座的人，问一句他去哪儿、多久算超时。
 *
 * 挑一条常用备注就开始计时，还能再补一句话（支持语音输入）。一条都不挑也行 ——
 * 那就是默认的黄、不限时，纯粹计个数。
 *
 * 看板上多选勾出来的是好几位：这一层照样只问一次，同一条备注、同一个起算时刻落在他们
 * 每个人身上（一起出去的人本来就该从同一秒算）。
 */

import { h, icon, modalFrame } from '../dom.js';
import * as speech from '../speech.js';
import { confirmLeave, showToast, state } from '../state.js';
import { closeOverlay } from './index.js';

export function renderRemark() {
  const klass = state.klass;
  const students = state.remarkStudentIds
    .map((studentId) => klass.students.find((item) => item.id === studentId))
    .filter((student) => student !== undefined);
  const body = [];
  // 人一多就只报前三个加个数：把十几个名字铺满一行，反而看不出「一共几位」
  const names = students.map((student) => student.name);
  const who = names.length > 3 ? `${names.slice(0, 3).join('、')} 等 ${names.length} 人` : names.join('、');
  body.push(
    h('p', {
      class: 'modal__hint',
      text:
        names.length > 1
          ? `给「${who}」记一次离开。这几位从同一刻起算。`
          : `给「${who}」记一次离开。`,
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
    // 时长写在条上：老师挑的时候就得看见「这条几分钟算超时」
    if (template.timeoutMs > 0) {
      chip.append(h('span', { class: 'chip__minutes', text: `${Math.round(template.timeoutMs / 60000)} 分钟` }));
    }
    chips.append(chip);
  }
  if (klass.remarkTemplates.length === 0) {
    chips.append(h('span', { class: 'modal__hint', text: '还没有常用备注。到「设置」里添加。' }));
  }
  body.push(h('div', { class: 'field' }, [h('span', { class: 'field__label', text: '去哪儿' }), chips]));

  const textarea = h('textarea', {
    class: 'input input--area',
    rows: 2,
    placeholder: '补充一句（可不填）',
    // 键盘老师点开备注就是要打字，焦点别落在上面那排常用备注上
    'data-autofocus': '',
  });
  const micNote = h('span', { class: 'field__note' });
  const mic = h('button', {
    class: 'btn btn--mic',
    onClick: () => {
      const status = speech.availability();
      if (!status.ok) {
        showToast('这台电脑不能用语音输入，直接打字就行');
        return;
      }
      if (listening !== null) {
        listening();
        listening = null;
        setMicIdle();
        return;
      }
      setMicOn();
      listening = speech.listen({
        onResult: (text, isFinal) => {
          textarea.value = text;
          if (isFinal) {
            micNote.textContent = '已识别，可以改';
          }
        },
        onError: (code) => {
          showToast(
            code === 'not-allowed'
              ? '没给麦克风权限'
              : code === 'network'
                ? '语音识别连不上，直接打字就行'
                : '没听清，再说一遍或直接打字',
          );
          listening = null;
          setMicIdle();
        },
        onEnd: () => {
          listening = null;
          setMicIdle();
        },
      });
    },
  }, [icon('mic'), h('span', { text: '语音输入' })]);

  function setMicIdle() {
    mic.classList.remove('is-on');
    mic.replaceChildren(icon('mic'), h('span', { text: '语音输入' }));
  }

  function setMicOn() {
    mic.classList.add('is-on');
    mic.replaceChildren(icon('mic-off'), h('span', { text: '正在听…（再点停）' }));
  }

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
      text: '记下离开',
      onClick: () => void confirmLeave(templateId, textarea.value.trim()),
    }),
  );
  const title = names.length > 1 ? `记离开 · ${names.length} 人` : '记离开';
  return modalFrame(title, body, foot, { onClose: closeOverlay });
}

let listening = null;
