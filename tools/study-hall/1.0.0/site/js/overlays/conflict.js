/**
 * 同名班级：导入撞上已有班级时问一句覆盖还是另建副本。
 */

import { h, modalFrame, uid } from '../dom.js';
import * as store from '../store.js';
import { importClassFile, refreshClasses, render, state } from '../state.js';

export function renderConflict() {
  const pending = state.pendingImport;
  const body = [];
  body.push(
    h('p', {
      class: 'modal__hint',
      text: `已有同名班级「${pending.parsed.klass.name}」。`,
    }),
  );
  body.push(
    h('ul', { class: 'diff' }, [
      h('li', { text: `文件：${pending.parsed.klass.students.length} 人 · ${pending.parsed.sessions.length} 场记录` }),
      h('li', { text: `当前：${pending.existing.students.length} 人` }),
    ]),
  );
  const foot = [];
  foot.push(h('button', { class: 'btn', text: '不导入', onClick: () => {
    state.pendingImport = null;
    state.overlay = null;
    render();
  } }));
  foot.push(
    h('button', {
      class: 'btn',
      text: '另存为新班',
      onClick: async () => {
        const parsed = pending.parsed;
        const copy = { ...parsed.klass, id: uid('k'), name: `${parsed.klass.name} 副本`, createdAt: Date.now() };
        await store.putClass(copy);
        for (const session of parsed.sessions) {
          await store.putSession({ ...session, id: uid('s'), classId: copy.id });
        }
        await refreshClasses();
        state.pendingImport = null;
        state.overlay = null;
        render();
      },
    }),
  );
  foot.push(
    h('button', {
      class: 'btn btn--danger',
      text: '替换原来的班',
      onClick: () => void importClassFile(pending.file, true),
    }),
  );
  return modalFrame('同名班级', body, foot, {
    onClose: () => {
      state.pendingImport = null;
      state.overlay = null;
      render();
    },
  });
}
