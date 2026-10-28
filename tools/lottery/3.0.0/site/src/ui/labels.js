/**
 * 界面词典：模型说的话 → 用户说的话。
 *
 * 界面上出现的每一个领域词都要从这里过一道。组件里直接写「槽位」「作用域」「放回」
 * 「权重」「种子」算违规——模型归模型，界面归界面，中间就靠这个文件。
 */

/** 清单的用处 → 界面叫法。装人的叫名单，装奖品的叫奖品清单。 */
const POOL_KIND_LABELS = { people: '名单', prize: '奖品清单', generic: '清单' };

/** 去重范围 → 一句话选择。默认落在「本场活动」，因为年会是一个环节接一个环节抽。 */
const SCOPE_LABELS = {
  group: '整场活动都不重复',
  draw: '只在当前环节里不重复',
  always: '以后任何活动都不重复',
};

const SCOPE_NOTES = {
  group: '中过三等奖的人不会再进二等奖的候选——年会默认这样。',
  draw: '同一个人可以在别的环节再中一次。',
  always: '只要中过一次，以后任何时候都不再进候选。',
};

/** 表演形式 → 界面叫法与一句适合什么。 */
const FORM_LABELS = { wheel: '大转盘', grid: '九宫格', slot: '老虎机' };

const FORM_NOTES = {
  wheel: '一个清单一个盘，转起来最像抽奖，人多的场合气氛最好。',
  grid: '八个格子绕一圈跑，单清单，节奏比转盘快。',
  slot: '三列同一个才算中奖，适合带「谢谢参与」的场合。',
};

const ROUND_STATUS_LABELS = {
  decided: '已开出',
  performing: '演出中',
  settled: '已入账',
  undone: '已撤销',
  discarded: '已丢弃',
};

export function labelOf(pools, pick) {
  const entry = pools[pick.poolId]?.entries.find((item) => item.id === pick.entryId);
  return entry?.label || '（已删除）';
}

export function resultTextOf(round, pools) {
  if (!round.win || round.picks.length === 0) return '未中奖';
  return round.picks.map((pick) => labelOf(pools, pick)).join(' · ');
}

export function timeOf(timestamp) {
  const date = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/* ---------- 名词 ---------- */

export function poolKindLabel(kind) {
  return POOL_KIND_LABELS[kind] ?? POOL_KIND_LABELS.generic;
}

/** 出奖位的名字：自己起了名字就用它，没起就按这张清单装的是什么来叫。 */
export function slotTitleOf(slot, index = 0, kind = 'generic') {
  if (slot?.label) return slot.label;
  if (kind === 'people') return '中奖人';
  if (kind === 'prize') return '奖项';
  return `出奖位 ${index + 1}`;
}

export function formLabelOf(type) {
  return FORM_LABELS[type] ?? type;
}

export function formNoteOf(type) {
  return FORM_NOTES[type] ?? '';
}

export function scopeLabelOf(scope) {
  return SCOPE_LABELS[scope] ?? SCOPE_LABELS.draw;
}

export function scopeNoteOf(scope) {
  return SCOPE_NOTES[scope] ?? '';
}

export function scopeOptions() {
  return ['group', 'draw', 'always'].map((value) => ({ value, label: scopeLabelOf(value) }));
}

export function roundStatusLabel(status) {
  return ROUND_STATUS_LABELS[status] ?? status;
}

/** 撤不掉的理由。界面要说出是哪一条，而不是把按钮灰掉就算完（R-15）。 */
const UNDO_REASONS = {
  missing: '这一轮不在账本里。',
  'not-settled': '只有已入账的轮次能撤销。',
  'not-top': '只能撤最近一次结算的那一轮，先把后面的按倒序撤掉。',
};

export function undoReasonText(reason) {
  return UNDO_REASONS[reason] ?? '这一轮撤不了。';
}

/** 环节状态的四种说法，全部从账本派生，不存第二份。 */
export function stageLabelOf({ used = 0, quota = Infinity, closed = false }) {
  if (closed) return '已结束';
  if (used === 0) return '还没开始';
  if (Number.isFinite(quota) && used >= quota) return '已抽完';
  return '进行中';
}

/* ---------- 数量 ---------- */

/** 名额：整场累计，不按轮重置。写成「已抽 3 / 共 5」，不限量就不给分母。 */
export function quotaTextOf(used, quota) {
  if (Number.isFinite(quota)) return `已抽 ${used} / 共 ${quota}`;
  return used > 0 ? `已抽 ${used} 个 · 不限量` : '不限量';
}

export function remainTextOf(remain, quota) {
  if (!Number.isFinite(quota)) return '不限量';
  return remain > 0 ? `还剩 ${remain} 个` : '已抽完';
}

/**
 * 一个环节的进度，一句话说完：已抽多少 · 还剩多少 · 还能抽几个。
 *
 * 名额不限量时，「已抽 0」「不限量」「还剩不限量」说的是同一件事，只说一遍。
 * 三处界面都用这一句，免得各拼各的、拼出两遍「不限量」。
 */
export function progressTextOf(stat, { candidates = true } = {}) {
  const parts = [];
  if (Number.isFinite(stat.quota)) {
    parts.push(`已抽 ${stat.used} / 共 ${stat.quota}`);
    parts.push(stat.done ? '已抽完' : `还剩 ${stat.remain} 个`);
  } else {
    parts.push(`已抽 ${stat.used} 个`);
    parts.push('不限量');
  }
  if (candidates && !stat.done) parts.push(`还能抽 ${stat.candidates} 个`);
  return parts.join(' · ');
}

/** 一份东西能被抽中几次。人默认一次，奖品按份数。 */
export function stockTextOf(stock) {
  return Number.isFinite(stock) ? `能中 ${stock} 次` : '不限';
}

export function stockValueOf(stock) {
  return stock === Infinity ? '' : String(stock);
}

/* ---------- 场景模板 ---------- */

export const SCENARIOS = [
  {
    key: 'people',
    title: '从名单抽人',
    note: '年会最常用：一屋子人，抽几个出来领奖。',
    slot: { label: '中奖人', scope: 'group' },
    kind: 'people',
  },
  {
    key: 'prize',
    title: '抽奖品',
    note: '按奖品清单抽，可以带「谢谢参与」。',
    slot: { label: '奖项', scope: 'draw' },
    kind: 'prize',
  },
  {
    key: 'prize-then-people',
    title: '先定奖项再抽人',
    note: '主持人在台上先点一个奖项，再从名单里抽出谁拿。',
    slot: { label: '中奖人', scope: 'group' },
    kind: 'people',
    manual: { label: '奖项', kind: 'prize' },
  },
];

export function scenarioOf(key) {
  return SCENARIOS.find((item) => item.key === key) ?? SCENARIOS[0];
}
