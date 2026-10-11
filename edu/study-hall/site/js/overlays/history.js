/**
 * 自习记录：每场一行（开始、结束、自习时长、在座、离开人次、超时），底下一句汇总。
 */

import { h, modalFrame } from '../dom.js';
import { formatDate, formatSpan, formatStudyTime } from '../format.js';
import { overtimeCount, studyMs, summarize } from '../domain.js';
import { exportClass, state } from '../state.js';
import { closeOverlay } from './index.js';

export function renderHistory() {
  const body = [];
  const sessions = [...state.sessions].sort((left, right) => right.startedAt - left.startedAt);
  if (sessions.length === 0) {
    body.push(h('p', { class: 'modal__hint', text: '这个班还没有上过自习。' }));
  } else {
    const end = Date.now();
    const total = sessions.reduce((sum, item) => sum + studyMs(item, item.endedAt ?? end), 0);
    const leaves = sessions.reduce((sum, item) => sum + item.leaves.length, 0);
    // 有超时的场次才把这一条说出来：全班都没超时的时候提它反而扎眼
    const overtimeRuns = sessions.filter((item) => overtimeCount(state.klass, item, item.endedAt ?? end) > 0).length;
    const bits = [`共 ${sessions.length} 场`, `自习合计 ${formatSpan(total)}`, `离开 ${leaves} 人次`];
    if (overtimeRuns > 0) {
      bits.push(`有超时 ${overtimeRuns} 场`);
    }
    body.push(h('p', { class: 'modal__hint', text: bits.join(' · ') }));

    const table = h('table', { class: 'table' });
    const head = h('tr');
    for (const label of ['开始', '结束', '时长', '在座', '离开人次', '超时']) {
      head.append(h('th', { text: label }));
    }
    table.append(h('thead', {}, [head]));
    const tbody = h('tbody');
    for (const session of sessions) {
      const endAt = session.endedAt ?? Date.now();
      const summary = summarize(state.klass, session, endAt);
      const overtime = overtimeCount(state.klass, session, endAt);
      const row = h('tr');
      row.append(h('td', { text: formatDate(session.startedAt) }));
      row.append(h('td', { text: session.endedAt === undefined ? '进行中' : formatDate(session.endedAt) }));
      // 表里这份用「时:分:秒」：一列数上下对齐才好比长短，中文单位会把列撑得忽宽忽窄
      row.append(h('td', { text: formatStudyTime(studyMs(session, endAt)) }));
      row.append(h('td', { text: String(summary.present) }));
      row.append(h('td', { text: String(summary.leaveCount) }));
      row.append(h('td', { class: overtime > 0 ? 'is-overtime' : '', text: overtime > 0 ? String(overtime) : '—' }));
      tbody.append(row);
    }
    table.append(tbody);
    body.push(table);
  }
  const foot = [];
  foot.push(h('button', { class: 'btn', text: '关闭', onClick: closeOverlay }));
  foot.push(h('button', { class: 'btn btn--primary', text: '导出 xlsx', onClick: () => void exportClass(state.klass) }));
  return modalFrame('自习记录', body, foot, { onClose: closeOverlay });
}
