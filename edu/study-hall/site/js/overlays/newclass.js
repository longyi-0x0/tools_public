/**
 * 新建班级：选一份花名册，认到人再建班。
 */

import { h, modalFrame, uid } from '../dom.js';
import * as store from '../store.js';
import { createKlass } from '../domain.js';
import { ROSTER_ACCEPT, baseName, rosterFromSheets } from '../roster.js';
import { readSheetFile } from '../readSheets.js';
import { refreshClasses, render, showToast, state } from '../state.js';
import { closeOverlay } from './index.js';

export function renderNewClass() {
  const body = [];
  body.push(
    h('p', {
      class: 'modal__hint',
      text: '选择一份花名册，表中有一列「姓名」即可。',
    }),
  );
  const nameInput = h('input', {
    class: 'input',
    placeholder: '例如「高二（3）班」',
    value: state.newClassName ?? state.pendingNewClass?.defaultName ?? '',
  });
  // 选表会重画这一块，名字要留在状态里，不然刚打的字就没了
  nameInput.addEventListener('input', () => {
    state.newClassName = nameInput.value;
  });
  body.push(h('label', { class: 'field' }, [h('span', { class: 'field__label', text: '班级名称' }), nameInput]));

  const fileInput = h('input', { type: 'file', accept: ROSTER_ACCEPT, class: 'hidden' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    try {
      const students = rosterFromSheets(await readSheetFile(file));
      if (students.length === 0) {
        showToast('表中没有「姓名」列');
        return;
      }
      state.pendingNewClass = {
        students,
        defaultName: nameInput.value.trim() !== '' ? nameInput.value.trim() : baseName(file.name),
      };
      render();
    } catch (error) {
      showToast('无法读取该文件，请换一份 .xlsx 或 .xls');
    }
  });

  if (state.pendingNewClass === null) {
    body.push(
      h('div', { class: 'pick' }, [
        h('p', { class: 'pick__title', text: '尚未选择文件' }),
        h('button', { class: 'btn btn--primary', text: '选文件', onClick: () => fileInput.click() }),
      ]),
    );
  } else {
    const students = state.pendingNewClass.students;
    body.push(
      h('div', { class: 'pick' }, [
        h('p', { class: 'pick__title', text: `已读取 ${students.length} 人` }),
        h('p', { class: 'pick__list', text: students.slice(0, 12).map((item) => item.name).join('、') + (students.length > 12 ? ' …' : '') }),
        h('button', { class: 'btn', text: '更换文件', onClick: () => fileInput.click() }),
      ]),
    );
  }
  body.push(fileInput);

  const foot = [];
  foot.push(h('button', { class: 'btn', text: '取消', onClick: closeOverlay }));
  foot.push(
    h('button', {
      class: 'btn btn--primary',
      text: '创建班级',
      onClick: async () => {
        if (state.pendingNewClass === null) {
          showToast('请先选择花名册文件');
          return;
        }
        const name = nameInput.value.trim() !== '' ? nameInput.value.trim() : state.pendingNewClass.defaultName;
        const klass = createKlass({
          id: uid('k'),
          name,
          createdAt: Date.now(),
          students: state.pendingNewClass.students,
        });
        await store.putClass(klass);
        await refreshClasses();
        state.pendingNewClass = null;
        state.newClassName = null;
        state.overlay = null;
        render();
      },
    }),
  );
  return modalFrame('新建班级', body, foot, { onClose: closeOverlay });
}
