/**
 * 应用数据：抽奖、名单、奖品三类对象平级。
 *
 * - `rosters`：名单素材，导入一份 xlsx 得到一份，可复用。
 * - `prizeSets`：奖品素材，同上。
 * - `lotteries`：一场抽奖。建的时候从素材复制一份，之后各改各的。
 *
 * 复制而不是引用，是为了让进行中的抽奖不受之后改素材影响：
 * 活动中途有人退场、奖品加量，那些都该发生在这场活动自己的副本上。
 */

import { MODE, createState, nextId } from './engine.js';
import { DEFAULT_STAGE, isStageId, normalizeStageConfig, stageBatch, stageMode } from './stages/index.js';

export const APP_VERSION = 3;

const VIEWS = new Set(['lotteries', 'rosters', 'prizes']);

export function cleanText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text === '' ? fallback : text;
}

export function cleanPeople(people) {
  return (Array.isArray(people) ? people : [])
    .filter((person) => person && cleanText(person.name) !== '')
    .map((person, index) => ({
      id: cleanText(person.id, `p${index + 1}`),
      name: cleanText(person.name),
      dept: cleanText(person.dept),
      employeeId: cleanText(person.employeeId),
    }));
}

export function cleanPrizes(prizes) {
  return (Array.isArray(prizes) ? prizes : [])
    .filter((prize) => prize && cleanText(prize.name) !== '')
    .map((prize, index) => {
      const count = Math.floor(Number(prize.count));
      const weight = Number(prize.weight);
      return {
        id: cleanText(prize.id, `a${index + 1}`),
        name: cleanText(prize.name),
        count: Number.isFinite(count) && count > 0 ? count : 1,
        weight: Number.isFinite(weight) && weight > 0 ? weight : 1,
        level: cleanText(prize.level),
      };
    });
}

export function cleanResults(results) {
  return (Array.isArray(results) ? results : [])
    .filter((result) => result && Array.isArray(result.winners) && result.winners.length > 0)
    .map((result, index) => ({
      id: cleanText(result.id, `r${index + 1}`),
      at: Number.isFinite(Number(result.at)) ? Number(result.at) : Date.now(),
      mode: result.mode === MODE.PERSON ? MODE.PERSON : MODE.PRIZE,
      prizeId: cleanText(result.prizeId),
      prizeName: cleanText(result.prizeName),
      requested: Math.max(1, Math.floor(Number(result.requested) || 1)),
      winners: result.winners.map((winner) => ({
        personId: cleanText(winner.personId),
        name: cleanText(winner.name),
        dept: cleanText(winner.dept),
        employeeId: cleanText(winner.employeeId),
      })),
    }));
}

/** 空应用。 */
export function createApp() {
  return {
    version: APP_VERSION,
    lastView: 'lotteries',
    lastLotteryId: null,
    rosters: [],
    prizeSets: [],
    lotteries: [],
  };
}

function cleanRoster(roster, index) {
  return {
    id: cleanText(roster?.id, `n${index + 1}`),
    name: cleanText(roster?.name, `名单 ${index + 1}`),
    people: cleanPeople(roster?.people),
    updatedAt: Number.isFinite(Number(roster?.updatedAt)) ? Number(roster.updatedAt) : Date.now(),
  };
}

function cleanPrizeSet(set, index) {
  return {
    id: cleanText(set?.id, `s${index + 1}`),
    name: cleanText(set?.name, `奖品 ${index + 1}`),
    prizes: cleanPrizes(set?.prizes),
    updatedAt: Number.isFinite(Number(set?.updatedAt)) ? Number(set.updatedAt) : Date.now(),
  };
}

function cleanLottery(item, index) {
  const prizes = cleanPrizes(item?.prizes);
  const stage = isStageId(item?.stage) ? item.stage : DEFAULT_STAGE;
  const stageConfig = normalizeStageConfig(item?.stageConfig);
  return {
    id: cleanText(item?.id, `g${index + 1}`),
    title: cleanText(item?.title, '未命名抽奖'),
    // 抽法与每次几人由形态决定，读回来时以形态为准
    mode: stageMode(stage),
    stage,
    stageConfig,
    batch: stageBatch(stage, stageConfig[stage]),
    uniqueWinner: item?.uniqueWinner !== false,
    rosterId: cleanText(item?.rosterId),
    rosterName: cleanText(item?.rosterName),
    prizeSetId: cleanText(item?.prizeSetId),
    prizeSetName: cleanText(item?.prizeSetName),
    prizes,
    people: cleanPeople(item?.people),
    results: cleanResults(item?.results).filter((result) =>
      prizes.some((prize) => prize.id === result.prizeId),
    ),
    excluded: Array.isArray(item?.excluded) ? item.excluded.filter((id) => typeof id === 'string') : [],
    createdAt: Number.isFinite(Number(item?.createdAt)) ? Number(item.createdAt) : Date.now(),
    updatedAt: Number.isFinite(Number(item?.updatedAt)) ? Number(item.updatedAt) : Date.now(),
  };
}

/**
 * 读一份存档。
 *
 * v2 的 `activities` 原样转成 `lotteries`，`rosters` / `prizeSets` 保留；
 * v1 那种「只有一场活动」的存档会被拆成一份名单 + 一份奖品 + 一个抽奖。
 */
export function migrate(raw) {
  if (raw === null || typeof raw !== 'object') {
    return createApp();
  }

  const app = createApp();

  if (Array.isArray(raw.lotteries) || Array.isArray(raw.activities)) {
    app.rosters = (Array.isArray(raw.rosters) ? raw.rosters : []).map(cleanRoster);
    app.prizeSets = (Array.isArray(raw.prizeSets) ? raw.prizeSets : []).map(cleanPrizeSet);
    app.lotteries = (Array.isArray(raw.lotteries) ? raw.lotteries : raw.activities).map(cleanLottery);
    app.lastView = VIEWS.has(raw.lastView) ? raw.lastView : 'lotteries';
    app.lastLotteryId =
      cleanText(raw.lastLotteryId) ||
      app.lotteries.find((item) => item.id === raw.lastActivityId)?.id ||
      app.lotteries[0]?.id ||
      null;
    return app;
  }

  // v1：单场活动
  const legacyPrizes = cleanPrizes(raw.prizes);
  const legacyPeople = cleanPeople(raw.people);
  if (legacyPrizes.length === 0 && legacyPeople.length === 0) {
    return app;
  }
  const title = cleanText(raw.title, '未命名抽奖');
  const roster = cleanRoster({ name: `${title} · 名单`, people: legacyPeople }, 0);
  const prizeSet = cleanPrizeSet({ name: `${title} · 奖品`, prizes: legacyPrizes }, 0);
  app.rosters.push(roster);
  app.prizeSets.push(prizeSet);
  const lottery = cleanLottery(
    {
      id: 'g1',
      title,
      mode: raw.mode,
      stage: raw.stage,
      batch: 1,
      uniqueWinner: raw.uniqueWinner,
      rosterId: roster.id,
      rosterName: roster.name,
      prizeSetId: prizeSet.id,
      prizeSetName: prizeSet.name,
      prizes: legacyPrizes,
      people: legacyPeople,
      results: raw.results,
      excluded: raw.excluded,
      createdAt: Date.now(),
    },
    0,
  );
  app.lotteries.push(lottery);
  app.lastLotteryId = lottery.id;
  return app;
}

/* ---------- 命名 ---------- */

/**
 * 同名时按文件系统的习惯往后排：`名称`、`名称 (1)`、`名称 (2)`。
 * 只避让 `items` 里已有的名字。
 */
export function uniqueName(items, base, read = (item) => item.name) {
  const taken = new Set(items.map(read));
  const name = cleanText(base, '未命名');
  if (!taken.has(name)) {
    return name;
  }
  for (let index = 1; index < 10000; index += 1) {
    const candidate = `${name} (${index})`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
  return `${name} (${Date.now()})`;
}

/* ---------- 名单 ---------- */

export function addRoster(app, { name, people }) {
  const roster = {
    id: nextId(app.rosters, 'n'),
    name: uniqueName(app.rosters, name ?? `名单 ${app.rosters.length + 1}`),
    people: cleanPeople(people),
    updatedAt: Date.now(),
  };
  return [{ ...app, rosters: [...app.rosters, roster] }, roster];
}

export function updateRoster(app, rosterId, patch) {
  return {
    ...app,
    rosters: app.rosters.map((roster) =>
      roster.id === rosterId
        ? {
            ...roster,
            ...patch,
            name: patch.name === undefined ? roster.name : cleanText(patch.name, roster.name),
            people: patch.people === undefined ? roster.people : cleanPeople(patch.people),
            updatedAt: Date.now(),
          }
        : roster,
    ),
  };
}

export function removeRoster(app, rosterId) {
  return {
    ...app,
    rosters: app.rosters.filter((roster) => roster.id !== rosterId),
  };
}

/* ---------- 奖品 ---------- */

export function addPrizeSet(app, { name, prizes }) {
  const set = {
    id: nextId(app.prizeSets, 's'),
    name: uniqueName(app.prizeSets, name ?? `奖品 ${app.prizeSets.length + 1}`),
    prizes: cleanPrizes(prizes),
    updatedAt: Date.now(),
  };
  return [{ ...app, prizeSets: [...app.prizeSets, set] }, set];
}

export function updatePrizeSet(app, setId, patch) {
  return {
    ...app,
    prizeSets: app.prizeSets.map((set) =>
      set.id === setId
        ? {
            ...set,
            ...patch,
            name: patch.name === undefined ? set.name : cleanText(patch.name, set.name),
            prizes: patch.prizes === undefined ? set.prizes : cleanPrizes(patch.prizes),
            updatedAt: Date.now(),
          }
        : set,
    ),
  };
}

export function removePrizeSet(app, setId) {
  return {
    ...app,
    prizeSets: app.prizeSets.filter((set) => set.id !== setId),
  };
}

/* ---------- 抽奖 ---------- */

/**
 * 新建一场抽奖：把选中的名单与奖品复制进来。
 *
 * `rosterId` / `prizeSetId` 给空就是「现场手动加」—— 建一个空副本，进去再填。
 * 也可以直接给 `prizes` / `people`，用于从 xlsx 新建。
 */
export function createLottery(
  app,
  {
    title,
    mode,
    stage,
    batch,
    uniqueWinner,
    rosterId,
    prizeSetId,
    prizes,
    people,
    results,
    stageConfig,
  } = {},
) {
  const roster = app.rosters.find((item) => item.id === rosterId);
  const prizeSet = app.prizeSets.find((item) => item.id === prizeSetId);
  const lottery = cleanLottery({
    id: nextId(app.lotteries, 'g'),
    title: cleanText(title, `抽奖 ${app.lotteries.length + 1}`),
    mode,
    stage,
    stageConfig,
    batch,
    uniqueWinner,
    rosterId: roster?.id ?? (rosterId || ''),
    rosterName: roster?.name ?? '',
    prizeSetId: prizeSet?.id ?? (prizeSetId || ''),
    prizeSetName: prizeSet?.name ?? '',
    prizes: prizes ?? prizeSet?.prizes ?? [],
    people: people ?? roster?.people ?? [],
    results: results ?? [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return [
    { ...app, lotteries: [...app.lotteries, lottery], lastLotteryId: lottery.id },
    lottery,
  ];
}

/** 改这场抽奖的开关与来源。 */
export function updateLottery(app, lotteryId, patch) {
  return {
    ...app,
    lotteries: app.lotteries.map((lottery) => {
      if (lottery.id !== lotteryId) {
        return lottery;
      }
      const next = { ...lottery };
      if (patch.title !== undefined) {
        next.title = cleanText(patch.title, lottery.title);
      }
      if (patch.uniqueWinner !== undefined) {
        next.uniqueWinner = patch.uniqueWinner !== false;
      }
      if (patch.stageConfig !== undefined) {
        const merged = { ...lottery.stageConfig };
        for (const [stageId, value] of Object.entries(patch.stageConfig)) {
          merged[stageId] = { ...(merged[stageId] ?? {}), ...value };
        }
        next.stageConfig = normalizeStageConfig(merged);
      }
      if (patch.stage !== undefined && isStageId(patch.stage)) {
        next.stage = patch.stage;
      }
      next.mode = stageMode(next.stage);
      next.batch = stageBatch(next.stage, next.stageConfig[next.stage]);
      next.updatedAt = Date.now();
      return next;
    }),
  };
}

/** 改这场抽奖的奖品副本或名单副本。 */
export function patchLotteryPools(app, lotteryId, { prizes, people }) {
  return {
    ...app,
    lotteries: app.lotteries.map((lottery) =>
      lottery.id === lotteryId
        ? {
            ...lottery,
            prizes: prizes === undefined ? lottery.prizes : cleanPrizes(prizes),
            people: people === undefined ? lottery.people : cleanPeople(people),
            updatedAt: Date.now(),
          }
        : lottery,
    ),
  };
}

/** 用一份导入的数据整体替换这场抽奖（名字不变）。 */
export function replaceLotteryData(app, lotteryId, data) {
  return {
    ...app,
    lotteries: app.lotteries.map((lottery) =>
      lottery.id === lotteryId
        ? cleanLottery({
            ...lottery,
            ...data,
            id: lottery.id,
            title: data.title === undefined || data.title === '' ? lottery.title : data.title,
            stage: data.stage ?? lottery.stage,
            stageConfig: data.stageConfig ?? lottery.stageConfig,
            updatedAt: Date.now(),
          })
        : lottery,
    ),
  };
}

/** 重新抽奖：清空记录，名单、奖品、名额都留着。 */
export function resetLottery(app, lotteryId) {
  return {
    ...app,
    lotteries: app.lotteries.map((lottery) =>
      lottery.id === lotteryId
        ? { ...lottery, results: [], excluded: [], updatedAt: Date.now() }
        : lottery,
    ),
  };
}

export function removeLottery(app, lotteryId) {
  const lotteries = app.lotteries.filter((lottery) => lottery.id !== lotteryId);
  return {
    ...app,
    lotteries,
    lastLotteryId:
      app.lastLotteryId === lotteryId ? (lotteries[0]?.id ?? null) : app.lastLotteryId,
  };
}

export function lotteryById(app, lotteryId) {
  return app.lotteries.find((lottery) => lottery.id === lotteryId) ?? null;
}

/** 抽奖换成引擎认的那份状态。 */
export function runState(lottery) {
  return createState({
    title: lottery.title,
    mode: lottery.mode,
    uniqueWinner: lottery.uniqueWinner,
    prizes: lottery.prizes,
    people: lottery.people,
    results: lottery.results,
    excluded: lottery.excluded,
  });
}

/** 引擎跑完写回抽奖：只写会变的那些。 */
export function writeRunState(app, lotteryId, next) {
  return {
    ...app,
    lotteries: app.lotteries.map((lottery) =>
      lottery.id === lotteryId
        ? {
            ...lottery,
            mode: next.mode,
            uniqueWinner: next.uniqueWinner,
            prizes: next.prizes,
            people: next.people,
            results: next.results,
            excluded: next.excluded ?? [],
            updatedAt: Date.now(),
          }
        : lottery,
    ),
  };
}

/** 一场抽奖的进度摘要。 */
export function lotterySummary(lottery) {
  const total = lottery.prizes.reduce((sum, prize) => sum + prize.count, 0);
  const handed = lottery.results.reduce((sum, result) => sum + result.winners.length, 0);
  return { total, handed, people: lottery.people.length, prizes: lottery.prizes.length };
}

/**
 * 状态由数据推出来：没记录 = 没开始，抽完 = 已完成，其余 = 进行中。
 * 人抽奖品时，人抽完了也算完成。
 */
export function lotteryStatus(lottery) {
  const { total, handed, people } = lotterySummary(lottery);
  if (handed <= 0) {
    return 'idle';
  }
  if (total > 0 && handed >= total) {
    return 'done';
  }
  if (lottery.mode === MODE.PERSON && lottery.uniqueWinner && people > 0 && handed >= people) {
    return 'done';
  }
  return 'running';
}
