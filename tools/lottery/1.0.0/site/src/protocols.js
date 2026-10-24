/**
 * 抽法：一次开奖填哪几个槽、每个槽从哪个池取、取几个。
 *
 * 抽法是抽奖自己的业务属性，存在存档里，跟着记录走；形态只声明自己能画什么
 * （见 `stages/index.js` 的 `capabilities`），由两边协商能不能配。
 * 抽法不写在形态里 —— 换个外形不该换个玩法。
 *
 * 槽的两个字段决定了引擎怎么取：
 * - `source: 'fixed'` 由人先定（先选奖项 / 先指定上台的人），引擎只校验；
 * - `source: 'draw'`  由引擎按「剩余名额 × 权重」抽，`take: 'batch'` 表示一次可以抽多个。
 *
 * 槽**不声明池的类型** —— 它只说「我要一个池」，具体哪个池填进来由人在界面上选
 * （存在 `lottery.slots`）。名单池拿去填奖项槽、奖品池拿去填人中奖槽都成立，
 * `hint` 只是给界面看的说明，不参与查找。
 */

export const PROTOCOL_PRIZE_PERSON = 'prize-person';
export const PROTOCOL_PERSON_PRIZE = 'person-prize';

export const PROTOCOLS = [
  {
    id: PROTOCOL_PRIZE_PERSON,
    label: '奖品抽人',
    hint: '先定一个奖，再从名单里抽人',
    slots: [
      { key: 'prize', source: 'fixed', label: '奖项', hint: '主持人先定' },
      { key: 'person', source: 'draw', take: 'batch', label: '中奖人' },
    ],
    /** 盘面转哪个槽的池。 */
    spin: 'person',
    /** 揭晓大字写哪个槽。 */
    focus: 'person',
    requires: { spin: 1, slots: 2, winners: 'many' },
  },
  {
    id: PROTOCOL_PERSON_PRIZE,
    label: '人抽奖品',
    hint: '指定一个人，看他抽到什么',
    slots: [
      { key: 'person', source: 'fixed', label: '参与人', hint: '上台的人先定' },
      { key: 'prize', source: 'draw', take: 1, label: '奖项' },
    ],
    spin: 'prize',
    focus: 'prize',
    requires: { spin: 1, slots: 2, winners: 1 },
  },
];

export const DEFAULT_PROTOCOL = PROTOCOL_PRIZE_PERSON;

/**
 * 旧槽的 key 到旧池类型的映射。只在两处用：迁移 v4 及更早的存档时把 role 推成
 * 绑定，以及新建/导入时没人指定绑定、需要猜一个初值。运行时查找绝不走它。
 */
export const LEGACY_ROLE = { person: 'people', prize: 'prizes' };

const BY_ID = new Map(PROTOCOLS.map((protocol) => [protocol.id, protocol]));

export function protocolInfo(id) {
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT_PROTOCOL);
}

export function protocolLabel(id) {
  return protocolInfo(id).label;
}

export function isProtocolId(id) {
  return BY_ID.has(id);
}

/** 从 id 或中文名认出抽法；都不像时返回 null。 */
export function protocolIdByText(value) {
  const raw = String(value ?? '').trim();
  if (raw === '') {
    return null;
  }
  const hit = PROTOCOLS.find((protocol) => protocol.id === raw || protocol.label === raw);
  return hit?.id ?? null;
}

/** 这一抽法有哪几个槽的 key。 */
export function slotKeys(id) {
  return protocolInfo(id).slots.map((slot) => slot.key);
}

/** 这一抽法里由人先定的槽；没有就返回 null。 */
export function fixedSlotOf(id) {
  return protocolInfo(id).slots.find((slot) => slot.source === 'fixed') ?? null;
}

/** 这一抽法里能一次抽多个的槽；没有就返回 null。 */
export function batchSlotOf(id) {
  return protocolInfo(id).slots.find((slot) => slot.take === 'batch') ?? null;
}

/** 这一抽法里负责转动的那个槽。 */
export function spinSlot(id) {
  const protocol = protocolInfo(id);
  return protocol.slots.find((slot) => slot.key === protocol.spin) ?? protocol.slots[0];
}

/** 按槽的 key 找槽；不认识时返回 null。 */
export function slotOf(id, key) {
  return protocolInfo(id).slots.find((slot) => slot.key === key) ?? null;
}
