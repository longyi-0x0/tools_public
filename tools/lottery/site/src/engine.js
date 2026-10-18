/**
 * 抽奖引擎：两种方向共用一份池，所有函数都是纯的 —— 收一份状态，回一份新状态。
 *
 * - `prize-person`（奖品抽人）：先选奖项，再从没中过的人里抽 N 个。
 * - `person-prize`（人抽奖品）：指定一个人，按各奖项**剩余名额 × 权重**抽一个奖。
 *
 * 名额与中奖记录不另存计数器，一律从 `results` 推：撤销就是把最后一条记录丢掉，
 * 名额与人的中奖标记自然跟着回去，不会出现两边对不上。
 */

/** 一次开奖在 `results` 里的形态。 */
export const MODE = {
  PRIZE: 'prize-person',
  PERSON: 'person-prize',
};

export const MODE_LABELS = {
  [MODE.PRIZE]: '奖品抽人',
  [MODE.PERSON]: '人抽奖品',
};

/** 抽奖失败的原因；界面按 `code` 决定怎么说，不靠解析文案。 */
export class DrawError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DrawError';
    this.code = code;
  }
}

const RESULT_PREFIX = 'r';

/** 空活动。`title` 由界面填，导入了什么就用什么。 */
export function createState(overrides = {}) {
  return {
    version: 1,
    title: '',
    mode: MODE.PRIZE,
    uniqueWinner: true,
    prizes: [],
    people: [],
    results: [],
    /** 作废过的人：抽中了但人不在，票移出池，之后不再被抽到。 */
    excluded: [],
    /** 上次停在那一屏，刷新后回到原处。 */
    lastView: 'prepare',
    ...overrides,
  };
}

/** 下一个可用的 id：同前缀里最大的编号 + 1。 */
export function nextId(items, prefix) {
  let max = 0;
  for (const item of items) {
    const matched = new RegExp(`^${prefix}(\\d+)$`).exec(String(item.id ?? ''));
    if (matched !== null) {
      max = Math.max(max, Number(matched[1]));
    }
  }
  return `${prefix}${max + 1}`;
}

/** 某个奖项已经抽出去几个。 */
export function prizeDrawn(state, prizeId) {
  let drawn = 0;
  for (const result of state.results) {
    if (result.prizeId === prizeId) {
      drawn += result.winners.length;
    }
  }
  return drawn;
}

/** 某个奖项还剩几个名额。 */
export function prizeRemaining(state, prizeId) {
  const prize = state.prizes.find((item) => item.id === prizeId);
  if (prize === undefined) {
    return 0;
  }
  return Math.max(0, Math.floor(prize.count) - prizeDrawn(state, prizeId));
}

/** 中过奖的人 id。 */
export function winnerIds(state) {
  const ids = new Set();
  for (const result of state.results) {
    for (const winner of result.winners) {
      ids.add(winner.personId);
    }
  }
  return ids;
}

/** 这个人是否已经中过。 */
export function hasWon(state, personId) {
  return winnerIds(state).has(personId);
}

/** 还能被抽中的人：作废的不算，`uniqueWinner` 关掉时中过的也算。 */
export function eligiblePeople(state) {
  const excluded = new Set(state.excluded ?? []);
  const pool = state.people.filter((person) => !excluded.has(person.id));
  if (!state.uniqueWinner) {
    return pool;
  }
  const won = winnerIds(state);
  return pool.filter((person) => !won.has(person.id));
}

/** 还有名额的奖项。 */
export function availablePrizes(state) {
  return state.prizes.filter((prize) => prizeRemaining(state, prize.id) > 0);
}

/** 人抽奖品时下一位该抽的人（按名单顺序）。 */
export function nextPerson(state) {
  const eligible = eligiblePeople(state);
  return eligible.length === 0 ? null : eligible[0];
}

/** 把 `random()` 收到 `[0, 1)`，避免 1 落在边界外。 */
function unitRandom(random) {
  const value = Number(random());
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(0.999999999, Math.max(0, value));
}

/** 洗牌抽 `count` 个，不放回；调用方已保证 `count <= items.length`。 */
function sample(items, count, random) {
  const pool = items.slice();
  const picked = [];
  for (let index = 0; index < count; index += 1) {
    const at = Math.floor(unitRandom(random) * pool.length);
    picked.push(pool.splice(at, 1)[0]);
  }
  return picked;
}

/** 每个奖项的抽中权重：剩余名额 × 单位权重（缺省 1）。 */
export function prizeWeight(state, prize) {
  const unit = Number(prize.weight);
  const perUnit = Number.isFinite(unit) && unit > 0 ? unit : 1;
  return prizeRemaining(state, prize.id) * perUnit;
}

function pickWeighted(prizes, state, random) {
  const weights = prizes.map((prize) => prizeWeight(state, prize));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) {
    return null;
  }
  let point = unitRandom(random) * total;
  for (let index = 0; index < prizes.length; index += 1) {
    point -= weights[index];
    if (point < 0) {
      return prizes[index];
    }
  }
  return prizes[prizes.length - 1];
}

function resultId(state) {
  return nextId(state.results, RESULT_PREFIX);
}

function appendResult(state, result) {
  return { ...state, results: [...state.results, result] };
}

function trimmed(value) {
  return String(value ?? '').trim();
}

/**
 * 奖品抽人：给一个奖项抽 `count` 个人。
 *
 * 名额不足或人不够时**按能抽多少抽多少** —— 现场按下去就该有结果，
 * 差几个由 `requested` 与 `winners.length` 对比着说。
 */
export function drawByPrize(state, prizeId, count = 1, random = Math.random) {
  const prize = state.prizes.find((item) => item.id === prizeId);
  if (prize === undefined) {
    throw new DrawError('prize-missing', '找不到这个奖项');
  }
  const remaining = prizeRemaining(state, prizeId);
  if (remaining <= 0) {
    throw new DrawError('prize-empty', `「${prize.name}」的名额已经抽完`);
  }
  const candidates = eligiblePeople(state);
  if (candidates.length === 0) {
    throw new DrawError('no-people', '名单里已经没有可抽的人了');
  }
  const requested = Math.max(1, Math.floor(Number(count) || 1));
  const take = Math.min(requested, remaining, candidates.length);
  const winners = sample(candidates, take, random).map((person) => ({
    personId: person.id,
    name: person.name,
    dept: person.dept ?? '',
    employeeId: person.employeeId ?? '',
  }));

  return {
    state: appendResult(state, {
      id: resultId(state),
      at: Date.now(),
      mode: MODE.PRIZE,
      prizeId: prize.id,
      prizeName: prize.name,
      requested,
      winners,
    }),
    prize,
    winners,
  };
}

/** 人抽奖品：指定的人抽一次；不给 id 就按名单顺序取第一个没中过的人。 */
export function drawByPerson(state, personId, random = Math.random) {
  const wanted = personId ?? nextPerson(state)?.id;
  const person = state.people.find((item) => item.id === wanted);
  if (person === undefined) {
    throw new DrawError('person-missing', '找不到这个人');
  }
  if (state.uniqueWinner && hasWon(state, person.id)) {
    throw new DrawError('person-won', `${person.name} 已经中过奖了`);
  }
  const prize = pickWeighted(availablePrizes(state), state, random);
  if (prize === null) {
    throw new DrawError('pool-empty', '奖品已经全部抽完');
  }

  const winners = [
    {
      personId: person.id,
      name: person.name,
      dept: person.dept ?? '',
      employeeId: person.employeeId ?? '',
    },
  ];

  return {
    state: appendResult(state, {
      id: resultId(state),
      at: Date.now(),
      mode: MODE.PERSON,
      prizeId: prize.id,
      prizeName: prize.name,
      requested: 1,
      winners,
    }),
    prize,
    winners,
  };
}

/**
 * 作废某次开奖里的一个人：他不算中奖，票移出池，名额还给奖项。
 *
 * 与撤销不同 —— 撤销是「这次开错了」，作废是「这个人不在场」。
 * 一次开奖里的人都作废掉时，这条记录一并删掉。
 */
export function voidWinner(state, resultId, personId) {
  const result = state.results.find((item) => item.id === resultId);
  if (result === undefined) {
    throw new DrawError('result-missing', '找不到这次开奖');
  }
  const winners = result.winners.filter((winner) => winner.personId !== personId);
  if (winners.length === result.winners.length) {
    throw new DrawError('winner-missing', '这次开奖里没有这个人');
  }
  const results =
    winners.length === 0
      ? state.results.filter((item) => item.id !== resultId)
      : state.results.map((item) => (item.id === resultId ? { ...item, winners } : item));
  const excluded = (state.excluded ?? []).includes(personId)
    ? state.excluded
    : [...(state.excluded ?? []), personId];
  return { ...state, results, excluded };
}

/**
 * 撤销某次开奖里的一个人：只把这一条结果去掉，人不作废、还能再抽。
 *
 * 与 `voidWinner` 的区别：作废是「这个人不在场」，会把他移出抽签池；
 * 撤销是「这次记错了」，他回到池子里。
 */
export function undoWinner(state, resultId, personId) {
  const result = state.results.find((item) => item.id === resultId);
  if (result === undefined) {
    throw new DrawError('result-missing', '找不到这次开奖');
  }
  const winners = result.winners.filter((winner) => winner.personId !== personId);
  if (winners.length === result.winners.length) {
    throw new DrawError('winner-missing', '这次开奖里没有这个人');
  }
  const results =
    winners.length === 0
      ? state.results.filter((item) => item.id !== resultId)
      : state.results.map((item) => (item.id === resultId ? { ...item, winners } : item));
  return { ...state, results };
}

/** 撤掉最后一次开奖；没有记录时原样返回。 */
export function undoLast(state) {
  if (state.results.length === 0) {
    return state;
  }
  return { ...state, results: state.results.slice(0, -1) };
}

/** 清空开奖记录，奖项与名单留着。 */
export function resetProgress(state) {
  return { ...state, results: [] };
}

/** 改一个奖项的字段；`count` 不会低于已经抽出去的数量。 */
export function updatePrize(state, prizeId, patch) {
  return {
    ...state,
    prizes: state.prizes.map((prize) => {
      if (prize.id !== prizeId) {
        return prize;
      }
      const next = { ...prize, ...patch };
      if (patch.count !== undefined) {
        const drawn = prizeDrawn(state, prizeId);
        next.count = Math.max(drawn, Math.floor(Number(patch.count) || 0));
      }
      if (patch.name !== undefined) {
        next.name = trimmed(patch.name) || prize.name;
      }
      return next;
    }),
  };
}

/** 改一个人的字段。 */
export function updatePerson(state, personId, patch) {
  return {
    ...state,
    people: state.people.map((person) => {
      if (person.id !== personId) {
        return person;
      }
      const next = { ...person, ...patch };
      if (patch.name !== undefined) {
        next.name = trimmed(patch.name) || person.name;
      }
      return next;
    }),
  };
}

/** 删一个奖项。已经抽出过结果的奖项不许删，免得记录指向不存在的奖。 */
export function removePrize(state, prizeId) {
  if (prizeDrawn(state, prizeId) > 0) {
    throw new DrawError('prize-drawn', '这个奖项已经抽出过结果，先撤销或清空记录再删');
  }
  return { ...state, prizes: state.prizes.filter((prize) => prize.id !== prizeId) };
}

/** 已经中过奖的人不许删，同 `removePrize`。 */
export function removePerson(state, personId) {
  if (state.results.some((result) => result.winners.some((w) => w.personId === personId))) {
    throw new DrawError('person-won', '这个人已经中过奖，先撤销或清空记录再删');
  }
  return { ...state, people: state.people.filter((person) => person.id !== personId) };
}

/** 加一个奖项，返回 `[新状态, 新奖项]`。 */
export function addPrize(state, fields = {}) {
  const prize = {
    id: nextId(state.prizes, 'a'),
    name: trimmed(fields.name) || '新奖项',
    count: Math.max(1, Math.floor(Number(fields.count) || 1)),
    weight: Number(fields.weight) > 0 ? Number(fields.weight) : 1,
    level: trimmed(fields.level),
  };
  return [{ ...state, prizes: [...state.prizes, prize] }, prize];
}

/** 加一个人，返回 `[新状态, 新人]`。 */
export function addPerson(state, fields = {}) {
  const person = {
    id: nextId(state.people, 'p'),
    name: trimmed(fields.name) || '新参与人',
    dept: trimmed(fields.dept),
    employeeId: trimmed(fields.employeeId),
  };
  return [{ ...state, people: [...state.people, person] }, person];
}

/** 整体换一批奖项与名单（导入用），开奖记录一并清掉。 */
export function replacePools(state, { prizes, people }) {
  return {
    ...state,
    prizes: (prizes ?? []).map((prize, index) => ({
      id: prize.id ?? `a${index + 1}`,
      name: trimmed(prize.name),
      count: Math.max(1, Math.floor(Number(prize.count) || 1)),
      weight: Number(prize.weight) > 0 ? Number(prize.weight) : 1,
      level: trimmed(prize.level),
    })),
    people: (people ?? []).map((person, index) => ({
      id: person.id ?? `p${index + 1}`,
      name: trimmed(person.name),
      dept: trimmed(person.dept),
      employeeId: trimmed(person.employeeId),
    })),
    results: [],
    excluded: [],
  };
}

/** 抽奖能不能进行；界面拿它决定按钮是否可按。 */
export function readiness(state) {
  const prizes = availablePrizes(state);
  const people = eligiblePeople(state);
  return {
    canDraw: people.length > 0 && prizes.length > 0,
    people: people.length,
    prizes: prizes.length,
    totalPrizeCount: state.prizes.reduce((sum, prize) => sum + Math.floor(prize.count), 0),
    handedOut: state.results.reduce((sum, result) => sum + result.winners.length, 0),
  };
}
