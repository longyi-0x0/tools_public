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
      text: '选一份花名册（.xlsx 或 .xls）。表里有一列写着「姓名」就会被认出来，学号与座位列可选。',
    }),
  );
  const nameInput = h('input', {
    class: 'input',
    placeholder: '班级名称',
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
        showToast('这张表里没读到学生，请确认有一列写着姓名');
        return;
      }
      state.pendingNewClass = {
        students,
        defaultName: nameInput.value.trim() !== '' ? nameInput.value.trim() : baseName(file.name),
      };
      render();
    } catch (error) {
      showToast(`读表失败：${error.message}`);
    }
  });

  if (state.pendingNewClass === null) {
    body.push(
      h('div', { class: 'pick' }, [
        h('p', { class: 'pick__title', text: '还没选表' }),
        h('button', { class: 'btn btn--primary', text: '选一份花名册', onClick: () => fileInput.click() }),
      ]),
    );
  } else {
    const students = state.pendingNewClass.students;
    body.push(
      h('div', { class: 'pick' }, [
        h('p', { class: 'pick__title', text: `认到 ${students.length} 位同学` }),
        h('p', { class: 'pick__list', text: students.slice(0, 12).map((item) => item.name).join('、') + (students.length > 12 ? ' …' : '') }),
        h('button', { class: 'btn', text: '换一份表', onClick: () => fileInput.click() }),
      ]),
    );
  }
  body.push(fileInput);

  const foot = [];
  foot.push(h('button', { class: 'btn', text: '取消', onClick: closeOverlay }));
  foot.push(
    h('button', {
      class: 'btn btn--primary',
      text: '建班',
      onClick: async () => {
        if (state.pendingNewClass === null) {
          showToast('先选一份花名册');
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
