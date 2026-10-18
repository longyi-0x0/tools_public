/**
 * 应用数据：名单、奖品、抽奖活动三样东西平级。
 *
 * - `rosters`：名单库。一次上传得到一份名单，可有多份。
 * - `prizeSets`：奖品库。同上。
 * - `activities`：抽奖。新建时选一份名单与一份奖品，并把两者**复制**进来。
 *
 * 复制而不是引用，是为了让进行中的抽奖不受之后改名单影响：
 * 活动中途有人退场、奖品加量，那些都该发生在这份活动的副本上。
 */

import { MODE, createState, nextId } from './engine.js';
import { DEFAULT_STAGE, isStageId } from './stages/index.js';

export const APP_VERSION = 2;

const VIEWS = new Set(['home', 'new', 'activity', 'draw', 'results', 'rosters', 'prizes']);

function cleanText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text === '' ? fallback : text;
}

function cleanPeople(people) {
  return (Array.isArray(people) ? people : [])
    .filter((person) => person && cleanText(person.name) !== '')
    .map((person, index) => ({
      id: cleanText(person.id, `p${index + 1}`),
      name: cleanText(person.name),
      dept: cleanText(person.dept),
      employeeId: cleanText(person.employeeId),
    }));
}

function cleanPrizes(prizes) {
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

function cleanResults(results) {
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
    rosters: [],
    prizeSets: [],
    activities: [],
    lastView: 'home',
    lastActivityId: null,
  };
}

function cleanActivity(activity, index) {
  const prizes = cleanPrizes(activity?.prizes);
  const people = cleanPeople(activity?.people);
  return {
    id: cleanText(activity?.id, `g${index + 1}`),
    title: cleanText(activity?.title, '未命名抽奖'),
    mode: activity?.mode === MODE.PERSON ? MODE.PERSON : MODE.PRIZE,
    stage: isStageId(activity?.stage) ? activity.stage : DEFAULT_STAGE,
    batch: Math.max(1, Math.min(50, Math.floor(Number(activity?.batch) || 1))),
    uniqueWinner: activity?.uniqueWinner !== false,
    rosterId: cleanText(activity?.rosterId),
    rosterName: cleanText(activity?.rosterName),
    prizeSetId: cleanText(activity?.prizeSetId),
    prizeSetName: cleanText(activity?.prizeSetName),
    prizes,
    people,
    results: cleanResults(activity?.results).filter((result) =>
      prizes.some((prize) => prize.id === result.prizeId),
    ),
    excluded: Array.isArray(activity?.excluded) ? activity.excluded.filter((id) => typeof id === 'string') : [],
    createdAt: Number.isFinite(Number(activity?.createdAt)) ? Number(activity.createdAt) : Date.now(),
  };
}

/**
 * 读一份存档。
 *
 * `lottery.state.v1` 那种「只有一场活动」的旧存档会被拆成一份名单 + 一份奖品 + 一个活动，
 * 结果原样保留。
 */
export function migrate(raw) {
  if (raw === null || typeof raw !== 'object') {
    return createApp();
  }

  if (Array.isArray(raw.activities)) {
    const app = createApp();
    app.rosters = (Array.isArray(raw.rosters) ? raw.rosters : []).map((roster, index) => ({
      id: cleanText(roster?.id, `n${index + 1}`),
      name: cleanText(roster?.name, `名单 ${index + 1}`),
      people: cleanPeople(roster?.people),
      updatedAt: Number.isFinite(Number(roster?.updatedAt)) ? Number(roster.updatedAt) : Date.now(),
    }));
    app.prizeSets = (Array.isArray(raw.prizeSets) ? raw.prizeSets : []).map((set, index) => ({
      id: cleanText(set?.id, `s${index + 1}`),
      name: cleanText(set?.name, `奖品 ${index + 1}`),
      prizes: cleanPrizes(set?.prizes),
      updatedAt: Number.isFinite(Number(set?.updatedAt)) ? Number(set.updatedAt) : Date.now(),
    }));
    app.activities = raw.activities.map(cleanActivity);
    app.lastActivityId = cleanText(raw.lastActivityId) || app.activities[0]?.id || null;
    app.lastView = VIEWS.has(raw.lastView) ? raw.lastView : 'home';
    return app;
  }

  // v1：单场活动
  const legacyPrizes = cleanPrizes(raw.prizes);
  const legacyPeople = cleanPeople(raw.people);
  if (legacyPrizes.length === 0 && legacyPeople.length === 0) {
    return createApp();
  }
  const app = createApp();
  const title = cleanText(raw.title, '未命名抽奖');
  const roster = {
    id: 'n1',
    name: `${title} · 名单`,
    people: legacyPeople,
    updatedAt: Date.now(),
  };
  const prizeSet = {
    id: 's1',
    name: `${title} · 奖品`,
    prizes: legacyPrizes,
    updatedAt: Date.now(),
  };
  app.rosters.push(roster);
  app.prizeSets.push(prizeSet);
  app.activities.push(
    cleanActivity(
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
    ),
  );
  app.lastActivityId = 'g1';
  app.lastView = 'home';
  return app;
}

/** 名单库里加一份，返回 `[app, roster]`。 */
export function addRoster(app, { name, people }) {
  const roster = {
    id: nextId(app.rosters, 'n'),
    name: cleanText(name, `名单 ${app.rosters.length + 1}`),
    people: cleanPeople(people),
    updatedAt: Date.now(),
  };
  return [{ ...app, rosters: [...app.rosters, roster] }, roster];
}

/** 奖品库里加一份，返回 `[app, set]`。 */
export function addPrizeSet(app, { name, prizes }) {
  const set = {
    id: nextId(app.prizeSets, 's'),
    name: cleanText(name, `奖品 ${app.prizeSets.length + 1}`),
    prizes: cleanPrizes(prizes),
    updatedAt: Date.now(),
  };
  return [{ ...app, prizeSets: [...app.prizeSets, set] }, set];
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

export function removeRoster(app, rosterId) {
  return {
    ...app,
    rosters: app.rosters.filter((roster) => roster.id !== rosterId),
    // 活动里已经复制了一份，删名单不动进行中的活动
  };
}

export function removePrizeSet(app, setId) {
  return {
    ...app,
    prizeSets: app.prizeSets.filter((set) => set.id !== setId),
  };
}

/**
 * 新建一场抽奖：把选中的名单与奖品复制进来。
 *
 * `rosterId` / `prizeSetId` 给空就是「现场手动加」—— 建一个空副本，进去再填。
 */
export function createActivity(app, { title, mode, stage, batch, uniqueWinner, rosterId, prizeSetId }) {
  const roster = app.rosters.find((item) => item.id === rosterId);
  const prizeSet = app.prizeSets.find((item) => item.id === prizeSetId);
  const activity = {
    id: nextId(app.activities, 'g'),
    title: cleanText(title, `抽奖 ${app.activities.length + 1}`),
    mode: mode === MODE.PERSON ? MODE.PERSON : MODE.PRIZE,
    stage: isStageId(stage) ? stage : DEFAULT_STAGE,
    batch: Math.max(1, Math.min(50, Math.floor(Number(batch) || 1))),
    uniqueWinner: uniqueWinner !== false,
    rosterId: roster?.id ?? '',
    rosterName: roster?.name ?? '现场名单',
    prizeSetId: prizeSet?.id ?? '',
    prizeSetName: prizeSet?.name ?? '现场奖品',
    prizes: (prizeSet?.prizes ?? []).map((prize) => ({ ...prize })),
    people: (roster?.people ?? []).map((person) => ({ ...person })),
    results: [],
    excluded: [],
    createdAt: Date.now(),
  };
  return [{ ...app, activities: [...app.activities, activity], lastActivityId: activity.id }, activity];
}

/** 活动换成引擎认的那份状态。 */
export function runState(activity) {
  return createState({
    title: activity.title,
    mode: activity.mode,
    uniqueWinner: activity.uniqueWinner,
    prizes: activity.prizes,
    people: activity.people,
    results: activity.results,
    excluded: activity.excluded,
  });
}

/** 引擎跑完写回活动：只写会变的那些。 */
export function writeRunState(app, activityId, next) {
  return {
    ...app,
    activities: app.activities.map((activity) =>
      activity.id === activityId
        ? {
            ...activity,
            mode: next.mode,
            uniqueWinner: next.uniqueWinner,
            prizes: next.prizes,
            people: next.people,
            results: next.results,
            excluded: next.excluded ?? [],
          }
        : activity,
    ),
  };
}

/** 改活动的几个开关（名称、抽法、形态、每次几人、是否唯一中奖）。 */
export function updateActivity(app, activityId, patch) {
  return {
    ...app,
    activities: app.activities.map((activity) => {
      if (activity.id !== activityId) {
        return activity;
      }
      const next = { ...activity };
      if (patch.title !== undefined) {
        next.title = cleanText(patch.title, activity.title);
      }
      if (patch.mode !== undefined) {
        next.mode = patch.mode === MODE.PERSON ? MODE.PERSON : MODE.PRIZE;
      }
      if (patch.stage !== undefined && isStageId(patch.stage)) {
        next.stage = patch.stage;
      }
      if (patch.batch !== undefined) {
        next.batch = Math.max(1, Math.min(50, Math.floor(Number(patch.batch) || 1)));
      }
      if (patch.uniqueWinner !== undefined) {
        next.uniqueWinner = patch.uniqueWinner !== false;
      }
      return next;
    }),
  };
}

/** 改这一场的奖品副本或名单副本。 */
export function patchActivityPools(app, activityId, { prizes, people }) {
  return {
    ...app,
    activities: app.activities.map((activity) =>
      activity.id === activityId
        ? {
            ...activity,
            prizes: prizes === undefined ? activity.prizes : cleanPrizes(prizes),
            people: people === undefined ? activity.people : cleanPeople(people),
          }
        : activity,
    ),
  };
}

export function removeActivity(app, activityId) {
  const activities = app.activities.filter((activity) => activity.id !== activityId);
  return {
    ...app,
    activities,
    lastActivityId: app.lastActivityId === activityId ? (activities[0]?.id ?? null) : app.lastActivityId,
  };
}

export function activityById(app, activityId) {
  return app.activities.find((activity) => activity.id === activityId) ?? null;
}

/** 活动的进度摘要。 */
export function activitySummary(activity) {
  const total = activity.prizes.reduce((sum, prize) => sum + prize.count, 0);
  const handed = activity.results.reduce((sum, result) => sum + result.winners.length, 0);
  return { total, handed, people: activity.people.length };
}
